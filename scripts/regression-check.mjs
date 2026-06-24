import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('index.html.source', 'utf8');

function extractBlock(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`无法抽取源码片段: ${startMarker}`);
  }
  return source.slice(start, end);
}

const dataAndUtils = [
  extractBlock('const GEO_OPTIONS', '// --- 3. COMPONENTS ---'),
  `
    globalThis.DEFAULT_NAV_TABS = DEFAULT_NAV_TABS;
    globalThis.FOOD_DATABASE = FOOD_DATABASE;
    globalThis.parseFuzzySearch = parseFuzzySearch;
    globalThis.inferSearchTabId = inferSearchTabId;
    globalThis.getCandidatePool = getCandidatePool;
    globalThis.getRandomBatch = getRandomBatch;
  `,
].join('\n');

const context = { console };
vm.createContext(context);
vm.runInContext(dataAndUtils, context, { filename: 'index.html.source.vm' });

const defaultPrefs = {
  excludedCategories: [],
  excludedTags: [],
  favoriteItemIds: [],
  prioritizeFavorites: true,
  ignoredFavoriteIds: [],
  sessionBannedIds: [],
};

function searchAll(input) {
  const tags = context.parseFuzzySearch(input);
  const suggestedTabId = context.inferSearchTabId(input, tags);
  const tab = context.DEFAULT_NAV_TABS.find((item) => item.id === (suggestedTabId || 'all')) || context.DEFAULT_NAV_TABS[0];
  const pool = context.getCandidatePool(defaultPrefs, tab, context.FOOD_DATABASE, tags);

  return { input, tags, suggestedTabId, pool };
}

function searchInTab(input, tabId) {
  const tags = context.parseFuzzySearch(input);
  const tab = context.DEFAULT_NAV_TABS.find((item) => item.id === tabId) || context.DEFAULT_NAV_TABS[0];
  const pool = context.getCandidatePool(defaultPrefs, tab, context.FOOD_DATABASE, tags);
  return { input, tags, tabId, pool };
}

function itemHasAny(item, terms) {
  const text = `${item.name} ${item.description || ''} ${item.tags.join(' ')}`;
  return terms.some((term) => text.includes(term));
}

const cases = [
  {
    input: '不要辣的',
    mustExcludeTags: ['辣', '重口'],
    forbiddenTerms: ['酸辣粉', '酸菜鱼', '麻辣', '辣'],
  },
  {
    input: '吃点辣的',
    expectedTab: 'meal',
    requiredAnyTags: ['辣', '重口'],
    forbiddenTerms: ['清淡', '豆浆', '阳春面', '真功夫', '霸王茶姬', '茶百道', '书亦烧仙草', '茶颜悦色'],
  },
  {
    input: '来点麻辣的',
    expectedTab: 'meal',
    requiredAnyTags: ['辣', '重口'],
    forbiddenTerms: ['清淡', '豆浆', '阳春面', '真功夫', '霸王茶姬', '茶百道', '书亦烧仙草', '茶颜悦色'],
  },
  {
    input: '想吃重口的',
    expectedTab: 'meal',
    requiredAnyTags: ['辣', '重口'],
    forbiddenTerms: ['清淡', '豆浆', '阳春面', '真功夫', '霸王茶姬', '茶百道', '书亦烧仙草', '茶颜悦色'],
  },
  {
    input: '不吃清淡的',
    expectedTab: 'meal',
    mustExcludeTags: ['清淡'],
    requiredAnyTags: ['辣', '重口'],
    forbiddenTerms: ['清淡', '清汤', '汤清', '豆浆', '阳春面', '真功夫'],
  },
  {
    input: '别太清淡',
    expectedTab: 'meal',
    mustExcludeTags: ['清淡'],
    requiredAnyTags: ['辣', '重口'],
    forbiddenTerms: ['清淡', '清汤', '汤清', '豆浆', '阳春面', '真功夫'],
  },
  {
    input: '不要太淡',
    expectedTab: 'meal',
    mustExcludeTags: ['清淡'],
    requiredAnyTags: ['辣', '重口'],
    forbiddenTerms: ['清淡', '清汤', '汤清', '豆浆', '阳春面', '真功夫'],
  },
  {
    input: '不吃鱼',
    mustExcludeTags: ['海鲜', '鱼'],
    forbiddenTerms: ['鱼', '海鲜', '虾', '蟹', '生蚝', '寿司'],
  },
  {
    input: '不要油腻的',
    mustExcludeTags: ['油炸', '重口', '辣'],
    forbiddenTerms: ['冒菜', '麻辣烫', '麻辣香锅', '酸辣粉'],
  },
  {
    input: '想吃甜的',
    expectedTab: 'dessert',
    requiredAnyTags: ['甜品', '蛋糕', '冰淇淋', '烘焙', '糕点'],
    forbiddenTerms: ['火锅', '炒饭', '米饭', '冒菜', '酸辣粉'],
  },
  {
    input: '想吃面',
    expectedTab: 'meal',
    requiredAnyTags: ['面食', '汤面'],
    forbiddenTerms: ['汉堡', '炸鸡', '蛋糕', '甜品'],
  },
  {
    input: '不要冰的',
    mustExcludeTags: ['冰品', '生冷'],
    forbiddenTerms: ['冰淇淋', '刨冰', '冰品'],
  },
  {
    input: '不想喝咖啡',
    tabId: 'drink',
    mustExcludeTags: ['咖啡'],
    requiredAnyTags: ['饮品', '奶茶', '果茶'],
    forbiddenTerms: ['咖啡', '拿铁', '美式', '瑞幸', '星巴克', 'Manner', 'Tims', '幸运咖', '库迪', '挪瓦'],
  },
];

const failures = [];
const summaries = [];

const staticChecks = [
  {
    name: '像素转盘外框不能套在旋转 SVG 上',
    failed: /\.visual-pixel\s+\.wheel-frame\s+svg/.test(source),
  },
  {
    name: '转盘旋转层必须单独使用 wheel-rotor',
    failed: !/className="wheel-rotor[^"]*"/.test(source) || !/\.visual-pixel\s+\.wheel-rotor\s+svg\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;[\s\S]*?box-shadow:\s*none;/.test(source),
  },
  {
    name: '已废弃的主题和老虎机按钮文案不能残留',
    failed: /开始开摇|slot-lever-hint|visual-hyrule|海拉鲁|HYRULE/.test(source),
  },
];

for (const check of staticChecks) {
  if (check.failed) failures.push(check.name);
}

for (const testCase of cases) {
  const result = testCase.tabId ? searchInTab(testCase.input, testCase.tabId) : searchAll(testCase.input);
  const sampleNames = result.pool.slice(0, 12).map((item) => item.name);

  if (result.pool.length === 0) {
    failures.push(`${testCase.input}: 候选池为空`);
  }

  for (const tag of testCase.mustExcludeTags || []) {
    if (!result.tags.excludeTags.includes(tag)) {
      failures.push(`${testCase.input}: 缺少排除标签 ${tag}`);
    }
  }

  if (testCase.expectedTab && result.suggestedTabId !== testCase.expectedTab) {
    failures.push(`${testCase.input}: 预期切到 ${testCase.expectedTab}，实际 ${result.suggestedTabId || '无'}`);
  }

  if (testCase.requiredAnyTags) {
    const wrongItems = result.pool.filter((item) => !testCase.requiredAnyTags.some((tag) => item.tags.includes(tag)));
    if (wrongItems.length > 0) {
      failures.push(`${testCase.input}: 出现不符合目标标签的候选 ${wrongItems.slice(0, 8).map((item) => item.name).join('、')}`);
    }
  }

  if (testCase.forbiddenTerms) {
    const blocked = result.pool.filter((item) => itemHasAny(item, testCase.forbiddenTerms));
    if (blocked.length > 0) {
      failures.push(`${testCase.input}: 出现禁忌候选 ${blocked.slice(0, 8).map((item) => item.name).join('、')}`);
    }
  }

  summaries.push({
    input: testCase.input,
    tab: testCase.tabId || result.suggestedTabId || 'all',
    includeTags: result.tags.includeTags,
    excludeTags: result.tags.excludeTags,
    excludeKeywords: result.tags.excludeKeywords,
    poolSize: result.pool.length,
    sampleNames,
  });
}

const categoryCases = [
  { tabId: 'meal', requiredAnyTags: ['正餐', '快餐', '面食', '火锅菜'] },
  { tabId: 'drink', requiredAnyTags: ['饮品', '奶茶', '咖啡', '果茶'] },
  { tabId: 'night', requiredAnyTags: ['宵夜', '烧烤', '冷串', '卤味'], forbiddenTerms: ['奶茶', '咖啡', '果茶', '饮品'] },
];

for (const testCase of categoryCases) {
  const tab = context.DEFAULT_NAV_TABS.find((item) => item.id === testCase.tabId);
  const pool = context.getCandidatePool(defaultPrefs, tab, context.FOOD_DATABASE, null);
  if (pool.length === 0) {
    failures.push(`${testCase.tabId}: 分类候选池为空`);
    continue;
  }
  const wrongItems = pool.filter((item) => !testCase.requiredAnyTags.some((tag) => item.tags.includes(tag)));
  if (wrongItems.length > 0) {
    failures.push(`${testCase.tabId}: 出现跨分类候选 ${wrongItems.slice(0, 8).map((item) => item.name).join('、')}`);
  }
  if (testCase.forbiddenTerms) {
    const blocked = pool.filter((item) => itemHasAny(item, testCase.forbiddenTerms));
    if (blocked.length > 0) {
      failures.push(`${testCase.tabId}: 出现不该属于该分类的候选 ${blocked.slice(0, 8).map((item) => item.name).join('、')}`);
    }
  }
  summaries.push({
    input: `分类:${testCase.tabId}`,
    tab: testCase.tabId,
    includeTags: [],
    excludeTags: [],
    excludeKeywords: [],
    poolSize: pool.length,
    sampleNames: pool.slice(0, 12).map((item) => item.name),
  });
}

console.log(JSON.stringify({ ok: failures.length === 0, summaries, failures }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
