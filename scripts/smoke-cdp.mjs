import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!chromePath) {
  throw new Error('No Chrome or Edge executable found. Set CHROME_PATH to run smoke tests.');
}

const port = 9300 + Math.floor(Math.random() * 500);
const userDataDir = await mkdtemp(join(tmpdir(), 'whaaat2eat-cdp-'));
const targetUrl = process.env.SMOKE_URL || 'http://localhost:8081/index.html?cdp_smoke=1';

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  targetUrl,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getWsUrl() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = list.find((item) => item.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome may still be starting.
    }
    await sleep(100);
  }
  throw new Error('Chrome debug port did not become ready.');
}

async function runSmoke() {
  const ws = new WebSocket(await getWsUrl());
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const runtimeErrors = [];

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      runtimeErrors.push(
        msg.params?.exceptionDetails?.exception?.description
        || msg.params?.exceptionDetails?.text
        || 'Runtime exception',
      );
    }
  });

  function send(method, params = {}) {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
  }

  async function evalValue(expression, timeout = 30000) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || 'Runtime.evaluate failed',
      );
    }
    return result.result?.value;
  }

  async function waitForPageReady() {
    await evalValue(`
      new Promise((resolve) => {
        if (document.readyState === 'complete') resolve(true);
        else window.addEventListener('load', () => resolve(true), { once: true });
      })
    `);
    await evalValue(`
      new Promise((resolve) => {
        const start = Date.now();
        const tick = () => document.querySelector('.app-shell')
          ? resolve(true)
          : Date.now() - start > 10000
            ? resolve(false)
            : setTimeout(tick, 50);
        tick();
      })
    `);
  }

  async function runMobileLayoutAudit() {
    const viewportChecks = [];
    const auditSpecs = [
      { width: 390, height: 844, mode: 'wheel', style: 'glass' },
      { width: 390, height: 844, mode: 'slot', style: 'glass' },
      { width: 390, height: 844, mode: 'wheel', style: 'pixel' },
      { width: 390, height: 844, mode: 'slot', style: 'pixel' },
      { width: 375, height: 667, mode: 'wheel', style: 'glass' },
      { width: 375, height: 667, mode: 'slot', style: 'pixel' },
      { width: 360, height: 640, mode: 'wheel', style: 'pixel' },
      { width: 360, height: 640, mode: 'slot', style: 'glass' },
    ];

    for (const spec of auditSpecs) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: spec.width,
        height: spec.height,
        deviceScaleFactor: 2,
        mobile: true,
      });
      const separator = targetUrl.includes('?') ? '&' : '?';
      await send('Page.navigate', {
        url: `${targetUrl}${separator}mobile_audit=${spec.width}x${spec.height}_${spec.mode}_${spec.style}_${Date.now()}`,
      });
      await waitForPageReady();
      const data = await evalValue(`(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const byText = (text) => [...document.querySelectorAll('button')].find((button) => button.innerText.trim() === text);
        if (${JSON.stringify(spec.style)} === 'pixel') byText('\\u50cf\\u7d20')?.click();
        if (${JSON.stringify(spec.mode)} === 'slot') byText('\\u6447\\u6447\\u673a')?.click();
        await wait(160);
        const box = (selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return {
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        };
        const target = ${JSON.stringify(spec.mode)} === 'slot' ? box('.slot-machine-frame') : box('.wheel-frame');
        const footer = box('.compact-footer');
        const nav = box('.compact-nav');
        const root = document.documentElement;
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          scrollHeight: root.scrollHeight,
          clientHeight: root.clientHeight,
          target,
          footer,
          nav,
          hasHorizontalOverflow: root.scrollWidth > root.clientWidth + 1,
          hasSevereVerticalOverflow: root.scrollHeight > root.clientHeight + 28,
          targetInViewport: !!target && target.top >= -1 && target.bottom <= window.innerHeight + 1,
          footerVisible: !footer || footer.bottom <= window.innerHeight + 1,
          navGap: target && nav ? Math.round(target.top - nav.bottom) : null,
          footerGap: target && footer ? Math.round(footer.top - target.bottom) : null,
          mode: document.querySelector('.slot-machine-frame') ? 'slot' : 'wheel',
          style: document.querySelector('.app-shell')?.className || '',
        };
      })()`);
      const ok = !data.hasHorizontalOverflow
        && !data.hasSevereVerticalOverflow
        && data.targetInViewport
        && data.footerVisible
        && data.mode === spec.mode
        && data.style.includes(`visual-${spec.style}`);
      viewportChecks.push({
        name: `mobile layout ${spec.width}x${spec.height} ${spec.style} ${spec.mode}`,
        ok,
        ...data,
      });
    }

    await send('Emulation.clearDeviceMetricsOverride');
    return viewportChecks;
  }

  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await waitForPageReady();

    const smoke = await evalValue(`(async () => {
      const out = { checks: [] };
      const fail = (name, extra = {}) => out.checks.push({ name, ok: false, ...extra });
      const pass = (name, extra = {}) => out.checks.push({ name, ok: true, ...extra });
      const S = {
        more: '\\u66f4\\u591a\\u64cd\\u4f5c',
        wheel: '\\u8f6c\\u76d8',
        slot: '\\u6447\\u6447\\u673a',
        glass: '\\u73bb\\u7483',
        pixel: '\\u50cf\\u7d20',
        all: '\\u5168\\u90e8',
        meal: '\\u6b63\\u9910',
        dessert: '\\u751c\\u54c1',
        drink: '\\u996e\\u6599',
        night: '\\u5bb5\\u591c',
        catButton: '\\u7ba1\\u7406\\u5206\\u7c7b',
        catTitle: '\\u5206\\u7c7b\\u7ba1\\u7406',
        shuffle: '\\u6362\\u4e00\\u6279\\u5019\\u9009',
        history: '\\u5386\\u53f2\\u8bb0\\u5f55',
        spin: '\\u5f00\\u59cb\\u65cb\\u8f6c',
        black: '\\u6697\\u591c\\u9ed1',
        red: '\\u9526\\u9ca4\\u7ea2',
        close: '\\u5173\\u95ed',
        add: '\\u6dfb\\u52a0\\u7f8e\\u98df',
        addTitle: '\\u6dfb\\u52a0\\u7f8e\\u98df',
        library: '\\u7f8e\\u98df\\u56fe\\u9274',
        settings: '\\u504f\\u597d\\u8bbe\\u7f6e'
      };
      const byText = (text) => [...document.querySelectorAll('button')].find((button) => button.innerText.trim() === text);
      const byLabel = (label) => [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === label);
      const byPlaceholder = (text) => [...document.querySelectorAll('input')].find((input) => input.getAttribute('placeholder') === text);
      const h2 = (text) => [...document.querySelectorAll('h2')].some((heading) => heading.innerText.trim() === text);
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (fn, ms = 6000) => {
        const start = Date.now();
        while (Date.now() - start < ms) {
          const value = fn();
          if (value) return value;
          await wait(50);
        }
        return null;
      };
      const click = async (element, name) => {
        if (!element) throw new Error('missing ' + name);
        element.click();
        await wait(100);
      };
      const typeSearch = async (value) => {
        const input = byPlaceholder('\\u4e0d\\u559d\\u5496\\u5561') || document.querySelector('.compact-search-input');
        if (!input) throw new Error('missing search input');
        input.focus();
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(180);
      };
      const clearSearch = async () => {
        const input = document.querySelector('.compact-search-input');
        if (!input) return;
        input.focus();
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(160);
      };
      const visibleWheelFoodNames = () => [...document.querySelectorAll('[data-food-name]')].map((node) => node.getAttribute('data-food-name') || '');
      const visibleSlotNames = () => [...document.querySelectorAll('.slot-name')].map((node) => node.textContent.trim()).filter(Boolean);
      const visibleIntentChips = () => [...document.querySelectorAll('span')]
        .map((node) => node.textContent.replace(/\\s+/g, ' ').trim())
        .filter((text) => text.startsWith('+ ') || text.startsWith('- '));
      const hasAnyTerm = (names, terms) => names.some((name) => terms.some((term) => name.includes(term)));
      const closeModal = async () => {
        const close = document.querySelector('.modal-panel .modal-close') || byLabel(S.close);
        if (close) close.click();
        await wait(140);
      };

      try {
        const labels = [...document.querySelectorAll('button')]
          .map((button) => button.innerText.trim() || button.getAttribute('aria-label'))
          .filter(Boolean);
        const required = [S.more, S.wheel, S.slot, S.glass, S.pixel, S.all, S.meal, S.dessert, S.drink, S.night, S.catButton, S.shuffle, S.history, S.spin];
        const missing = required.filter((label) => !labels.includes(label));
        missing.length ? fail('initial controls present', { missing }) : pass('initial controls present');

        await click(byText(S.drink), 'drink tab');
        const drinkClass = byText(S.drink)?.className || '';
        await click(byText(S.night), 'night tab');
        const nightClass = byText(S.night)?.className || '';
        await click(byText(S.all), 'all tab');
        pass('category nav clickable', { drinkClass, nightClass });

        await click(byText(S.drink), 'drink tab for coffee exclusion');
        await typeSearch('\\u4e0d\\u60f3\\u559d\\u5496\\u5561');
        const coffeeIntent = {
          chips: visibleIntentChips(),
          wheelNames: visibleWheelFoodNames(),
        };
        coffeeIntent.chips.includes('- \\u5496\\u5561')
          && !coffeeIntent.chips.includes('+ \\u5496\\u5561')
          && coffeeIntent.wheelNames.length > 0
          && !hasAnyTerm(coffeeIntent.wheelNames, ['\\u5496\\u5561', '\\u745e\\u5e78', '\\u661f\\u5df4\\u514b', 'Manner', 'Tims'])
          ? pass('drink negative coffee intent', coffeeIntent)
          : fail('drink negative coffee intent', coffeeIntent);
        await clearSearch();
        await click(byText(S.night), 'night tab after coffee exclusion');
        await wait(160);
        const nightWheelNames = visibleWheelFoodNames();
        nightWheelNames.length > 0 && !hasAnyTerm(nightWheelNames, ['\\u5496\\u5561', '\\u5976\\u8336', '\\u679c\\u8336', '\\u559c\\u8336', '\\u5948\\u96ea'])
          ? pass('night tab excludes drinks', { nightWheelNames })
          : fail('night tab excludes drinks', { nightWheelNames });
        await click(byText(S.all), 'all tab after category checks');

        const firstLabels = [...document.querySelectorAll('.wheel-rotor text')].slice(0, 6).map((node) => node.textContent).join('|');
        await click(byLabel(S.shuffle), 'shuffle');
        await wait(120);
        const secondLabels = [...document.querySelectorAll('.wheel-rotor text')].slice(0, 6).map((node) => node.textContent).join('|');
        firstLabels !== secondLabels ? pass('shuffle refreshes candidates', { before: firstLabels, after: secondLabels }) : pass('shuffle button clickable', { note: 'random batch may repeat' });

        await click(byText(S.pixel), 'pixel');
        document.querySelector('.app-shell')?.className.includes('visual-pixel') ? pass('pixel theme switch') : fail('pixel theme switch');
        const pixelText = {
          searchColor: getComputedStyle(document.querySelector('.compact-search-input')).color,
          spinColor: getComputedStyle(byText(S.spin)).color,
          rotorSvgMarginTop: getComputedStyle(document.querySelector('.wheel-rotor svg')).marginTop,
          rotorTransformOrigin: getComputedStyle(document.querySelector('.wheel-rotor')).transformOrigin,
        };
        pixelText.searchColor !== 'rgb(255, 255, 255)' && pixelText.spinColor !== 'rgb(255, 255, 255)' && pixelText.rotorSvgMarginTop === '0px'
          ? pass('pixel dark text and wheel center prep', pixelText)
          : fail('pixel dark text and wheel center prep', pixelText);

        const pixelWheelLayout = (() => {
          const frame = document.querySelector('.wheel-frame')?.getBoundingClientRect();
          const rotor = document.querySelector('.wheel-rotor')?.getBoundingClientRect();
          const nav = document.querySelector('.compact-nav')?.getBoundingClientRect();
          const footer = document.querySelector('.compact-footer')?.getBoundingClientRect();
          if (!frame || !rotor || !nav || !footer) return null;
          return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            navGap: Math.round(frame.top - nav.bottom),
            footerGap: Math.round(footer.top - frame.bottom),
            frameWidth: Math.round(frame.width),
            rotorWidth: Math.round(rotor.width),
            frameHeight: Math.round(frame.height),
          };
        })();
        pixelWheelLayout
          && pixelWheelLayout.navGap >= 4
          && pixelWheelLayout.footerGap >= -2
          && pixelWheelLayout.frameWidth - pixelWheelLayout.rotorWidth <= 20
          ? pass('pixel wheel frame not covered', pixelWheelLayout)
          : fail('pixel wheel frame not covered', pixelWheelLayout || {});

        await click(byText(S.spin), 'spin');
        const readWheelMotion = () => {
          const el = document.querySelector('.wheel-rotor');
          const style = getComputedStyle(el);
          const inline = el?.style.transform || '';
          const inlineMatch = inline.match(/rotate\\(([-0-9.]+)deg\\)/);
          let angle = inlineMatch ? Number(inlineMatch[1]) : 0;
          if (!inlineMatch) {
            const matrixMatch = style.transform.match(/matrix\\(([^)]+)\\)/);
            if (matrixMatch) {
              const parts = matrixMatch[1].split(',').map(Number);
              angle = Math.atan2(parts[1], parts[0]) * 180 / Math.PI;
            }
          }
          return {
            angle,
            inline,
            computed: style.transform,
            transitionDuration: style.transitionDuration,
            resultVisible: !!document.querySelector('.result-panel'),
          };
        };
        const motionSamples = [readWheelMotion()];
        await wait(160);
        motionSamples.push(readWheelMotion());
        await wait(640);
        motionSamples.push(readWheelMotion());
        await wait(700);
        motionSamples.push(readWheelMotion());
        const frameInline = document.querySelector('.wheel-frame')?.style.transform || '';
        const frameComputed = getComputedStyle(document.querySelector('.wheel-frame')).transform;
        const rotorInline = document.querySelector('.wheel-rotor')?.style.transform || '';
        const rotorBox = document.querySelector('.wheel-rotor').getBoundingClientRect();
        const svgBox = document.querySelector('.wheel-rotor svg').getBoundingClientRect();
        const frameBox = document.querySelector('.wheel-frame').getBoundingClientRect();
        const centerDelta = {
          x: Math.abs((rotorBox.left + rotorBox.width / 2) - (svgBox.left + svgBox.width / 2)),
          y: Math.abs((rotorBox.top + rotorBox.height / 2) - (svgBox.top + svgBox.height / 2)),
        };
        const frameCenterDelta = {
          x: Math.abs((frameBox.left + frameBox.width / 2) - (rotorBox.left + rotorBox.width / 2)),
          y: Math.abs((frameBox.top + frameBox.height / 2) - (rotorBox.top + rotorBox.height / 2)),
        };
        const motionDeltas = [
          motionSamples[1].angle - motionSamples[0].angle,
          motionSamples[2].angle - motionSamples[1].angle,
          motionSamples[3].angle - motionSamples[2].angle,
        ];
        const motionRates = [
          motionDeltas[0] / 160,
          motionDeltas[1] / 640,
          motionDeltas[2] / 700,
        ];
        !frameInline && frameComputed === 'none' && /rotate\\(/.test(rotorInline) && centerDelta.x < 0.5 && centerDelta.y < 0.5 && frameCenterDelta.x < 0.5 && frameCenterDelta.y < 0.5
          ? pass('pixel wheel rotor only', { frameInline, frameComputed, rotorInline, centerDelta, frameCenterDelta })
          : fail('pixel wheel rotor only', { frameInline, frameComputed, rotorInline, centerDelta, frameCenterDelta });
        motionDeltas[0] > 220
          && motionDeltas[1] > 1100
          && motionDeltas[2] > 10
          && motionRates[1] > 2
          && motionRates[2] < motionRates[1]
          && motionSamples.every((sample) => !sample.resultVisible)
          ? pass('wheel keeps rotating before result', { motionSamples, motionDeltas, motionRates })
          : fail('wheel keeps rotating before result', { motionSamples, motionDeltas, motionRates });
        await waitFor(() => document.querySelector('.result-panel'), 2600);
        document.querySelector('.result-panel') ? pass('wheel result modal') : fail('wheel result modal');
        const wheelLanding = (() => {
          const rotor = document.querySelector('.wheel-rotor');
          const inline = rotor?.style.transform || '';
          const inlineMatch = inline.match(/rotate\\(([-0-9.]+)deg\\)/);
          const finalAngle = inlineMatch ? Number(inlineMatch[1]) : 0;
          const slices = [...document.querySelectorAll('[data-wheel-index]')]
            .map((node) => ({
              index: Number(node.getAttribute('data-wheel-index')),
              name: node.getAttribute('data-food-name'),
            }))
            .sort((a, b) => a.index - b.index);
          const count = slices.length || 1;
          const sliceAngle = 360 / count;
          const normalized = ((finalAngle % 360) + 360) % 360;
          const pointerAngle = ((360 - normalized) % 360 + 360) % 360;
          const landedIndex = Math.floor((pointerAngle % 360) / sliceAngle);
          const landedName = slices[landedIndex]?.name || '';
          const resultName = document.querySelector('.result-title')?.textContent?.trim() || '';
          return { finalAngle, normalized, pointerAngle, landedIndex, landedName, resultName };
        })();
        wheelLanding.landedName && wheelLanding.resultName && wheelLanding.landedName === wheelLanding.resultName
          ? pass('wheel pointer matches result', wheelLanding)
          : fail('wheel pointer matches result', wheelLanding);
        const resultColors = {
          title: getComputedStyle(document.querySelector('.result-title')).color,
          description: getComputedStyle(document.querySelector('.result-description')).color,
          label: getComputedStyle(document.querySelector('.result-panel span')).color,
          poster: getComputedStyle(document.querySelector('.poster-preview')).color,
          shareButton: getComputedStyle(document.querySelector('.result-panel .grid button')).color,
        };
        Object.values(resultColors).every((color) => color !== 'rgb(255, 255, 255)' && color !== 'rgba(255, 255, 255, 0)')
          ? pass('pixel result modal text contrast', resultColors)
          : fail('pixel result modal text contrast', resultColors);
        await click(byLabel(S.black), 'black poster');
        const blackClass = document.querySelector('.poster-preview')?.className || '';
        await click(byLabel(S.red), 'red poster');
        const redClass = document.querySelector('.poster-preview')?.className || '';
        blackClass.includes('poster-preview-black') && redClass.includes('poster-preview-red')
          ? pass('poster theme switch')
          : fail('poster theme switch', { blackClass, redClass });
        await click(byLabel(S.close), 'close result');

        await click(byText(S.slot), 'slot');
        const slotBefore = {
          hasSlot: !!document.querySelector('.slot-machine-frame'),
          hasWheel: !!document.querySelector('.wheel-frame'),
          hasFooterSpin: !!byText(S.spin),
        };
        slotBefore.hasSlot && !slotBefore.hasWheel && !slotBefore.hasFooterSpin
          ? pass('slot mode switch', slotBefore)
          : fail('slot mode switch', slotBefore);

        await click(byText(S.drink), 'slot drink tab');
        await wait(180);
        const slotDrinkNames = visibleSlotNames();
        await click(byText(S.meal), 'slot meal tab');
        await wait(220);
        const slotMealNames = visibleSlotNames();
        await click(byText(S.night), 'slot night tab');
        await wait(220);
        const slotNightNames = visibleSlotNames();
        const slotCategoryState = { slotDrinkNames, slotMealNames, slotNightNames };
        slotDrinkNames.length > 0
          && slotMealNames.length > 0
          && slotNightNames.length > 0
          && hasAnyTerm(slotDrinkNames, ['\\u5496\\u5561', '\\u5976\\u8336', '\\u8336', '\\u679c'])
          && !hasAnyTerm(slotMealNames, ['\\u5496\\u5561', '\\u5976\\u8336', '\\u679c\\u8336', '\\u559c\\u8336', '\\u5948\\u96ea'])
          && !hasAnyTerm(slotNightNames, ['\\u5496\\u5561', '\\u5976\\u8336', '\\u679c\\u8336', '\\u559c\\u8336', '\\u5948\\u96ea'])
          ? pass('slot category display updates', slotCategoryState)
          : fail('slot category display updates', slotCategoryState);

        const darkPixelSlotPalette = (() => {
          const frame = document.querySelector('.slot-machine-frame');
          const windowEl = document.querySelector('.slot-window');
          const item = document.querySelector('.slot-item');
          const name = document.querySelector('.slot-name');
          if (!frame || !windowEl || !item || !name) return null;
          return {
            frameBg: getComputedStyle(frame).backgroundImage,
            windowBg: getComputedStyle(windowEl).backgroundImage,
            itemBg: getComputedStyle(item).backgroundImage,
            nameColor: getComputedStyle(name).color,
          };
        })();
        darkPixelSlotPalette
          && darkPixelSlotPalette.frameBg.includes('245, 247, 251')
          && darkPixelSlotPalette.windowBg.includes('238, 243, 250')
          && darkPixelSlotPalette.nameColor !== 'rgb(255, 255, 255)'
          ? pass('dark pixel slot palette contrast', darkPixelSlotPalette)
          : fail('dark pixel slot palette contrast', darkPixelSlotPalette || {});

        await click(document.querySelector('.slot-lever'), 'slot lever');
        await wait(260);
        const slotDuring = {
          leverPulled: document.querySelector('.slot-machine-frame')?.className.includes('is-lever-pulled'),
          spinningReels: document.querySelectorAll('.slot-strip.is-spinning').length,
        };
        slotDuring.leverPulled && slotDuring.spinningReels === 3
          ? pass('slot lever animation starts', slotDuring)
          : fail('slot lever animation starts', slotDuring);
        await waitFor(() => document.querySelector('.result-panel'), 3500);
        const slotAfter = {
          resultVisible: !!document.querySelector('.result-panel'),
          settledReels: document.querySelectorAll('.slot-strip.is-settled').length,
        };
        slotAfter.resultVisible && slotAfter.settledReels === 3
          ? pass('slot result modal')
          : fail('slot result modal', slotAfter);
        await click(byLabel(S.close), 'close slot result');

        await click(byLabel(S.more), 'more menu');
        const menuEntries = {
          add: !!byLabel(S.add),
          library: !!byLabel(S.library),
          settings: !!byLabel(S.settings),
        };
        menuEntries.add && menuEntries.library && menuEntries.settings ? pass('top menu entries') : fail('top menu entries', menuEntries);
        await click(byLabel(S.add), 'add food');
        h2(S.addTitle) ? pass('add modal') : fail('add modal');
        await closeModal();
        await click(byLabel(S.more), 'more menu 2');
        await click(byLabel(S.library), 'library');
        h2(S.library) ? pass('library modal') : fail('library modal');
        await closeModal();
        await click(byLabel(S.more), 'more menu 3');
        await click(byLabel(S.settings), 'settings');
        h2(S.settings) ? pass('settings modal') : fail('settings modal');
        await closeModal();

        await click(byLabel(S.catButton), 'category manager');
        h2(S.catTitle) ? pass('category modal') : fail('category modal');
        await closeModal();
        await click(byLabel(S.history), 'history');
        h2(S.history) ? pass('history modal') : fail('history modal');
      } catch (error) {
        fail('smoke script exception', { message: String(error && error.message || error) });
      }
      out.failed = out.checks.filter((check) => !check.ok);
      return out;
    })()`, 70000);

    const mobileLayoutChecks = await runMobileLayoutAudit();
    smoke.checks.push(...mobileLayoutChecks);
    smoke.failed = smoke.checks.filter((check) => !check.ok);

    return { smoke, runtimeErrors };
  } finally {
    try {
      ws.close();
    } catch {
      // Ignore close failures.
    }
  }
}

try {
  const result = await runSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.smoke.failed.length || result.runtimeErrors.length) process.exitCode = 1;
} finally {
  try {
    chrome.kill('SIGTERM');
  } catch {
    // Ignore process cleanup failures.
  }
  await sleep(1000);
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}
