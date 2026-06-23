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
  const hasFuzzy = tags.includeTags.length > 0 || tags.excludeTags.length > 0 || tags.excludeKeywords.length > 0;
  const base = hasFuzzy
    ? [...context.FOOD_DATABASE]
    : context.FOOD_DATABASE.filter((item) => !tab.filterTags.length || tab.filterTags.some((tag) => item.tags.includes(tag)));

  const pool = base.filter((item) => {
    if (tags.includeTags.length > 0 && !tags.includeTags.some((tag) => item.tags.includes(tag))) return false;
    if (tags.excludeTags.length > 0 && tags.excludeTags.some((tag) => item.tags.includes(tag))) return false;
    const searchableText = `${item.name} ${item.description || ''} ${item.tags.join(' ')}`;
    if (tags.excludeKeywords.some((keyword) => searchableText.includes(keyword))) return false;
    if (defaultPrefs.excludedCategories.includes(item.category)) return false;
    if (item.tags.some((tag) => defaultPrefs.excludedTags.includes(tag))) return false;
    return true;
  });

  return { input, tags, suggestedTabId, pool };
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
];

const failures = [];
const summaries = [];

for (const testCase of cases) {
  const result = searchAll(testCase.input);
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
    tab: result.suggestedTabId || 'all',
    includeTags: result.tags.includeTags,
    excludeTags: result.tags.excludeTags,
    excludeKeywords: result.tags.excludeKeywords,
    poolSize: result.pool.length,
    sampleNames,
  });
}

console.log(JSON.stringify({ ok: failures.length === 0, summaries, failures }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
