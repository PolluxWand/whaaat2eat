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
    forbiddenTerms: ['冒菜', '麻辣烫', '麻辣香锅', '酸辣粉', '油炸', '炸鸡', '鸡排', '薯条', '油条', '炸串'],
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
    input: '不吃冷的',
    tabId: 'dessert',
    mustExcludeTags: ['冰品', '生冷', '冰淇淋'],
    forbiddenTerms: ['冰淇淋', '哈根达斯', 'DQ', '刨冰', '冰粉', '雪糕', '冷饮'],
  },
  {
    input: '不吃冰淇淋',
    tabId: 'dessert',
    mustExcludeTags: ['冰品', '生冷', '冰淇淋'],
    forbiddenTerms: ['冰淇淋', '哈根达斯', 'DQ', '刨冰', '冰粉', '雪糕', '冷饮'],
  },
  {
    input: '不要雪糕',
    tabId: 'dessert',
    mustExcludeTags: ['冰品', '生冷', '冰淇淋'],
    forbiddenTerms: ['冰淇淋', '哈根达斯', 'DQ', '刨冰', '冰粉', '雪糕', '冷饮'],
  },
  {
    input: '不要凉的',
    tabId: 'drink',
    mustExcludeTags: ['冰品', '生冷', '冰淇淋'],
    forbiddenTerms: ['冰淇淋', '刨冰', '冰粉', '雪糕', '冷饮'],
  },
  {
    input: '不想喝冰的',
    tabId: 'drink',
    mustExcludeTags: ['冰品', '生冷', '冰淇淋'],
    forbiddenTerms: ['冰淇淋', '刨冰', '冰粉', '雪糕', '冷饮'],
  },
  {
    input: '别来冷饮',
    tabId: 'drink',
    mustExcludeTags: ['冰品', '生冷', '冰淇淋'],
    forbiddenTerms: ['冰淇淋', '刨冰', '冰粉', '雪糕', '冷饮'],
  },
  {
    input: '想喝冰的',
    expectedTab: 'drink',
    requiredAnyTags: ['冰品'],
    forbiddenTerms: ['热饮', '霸王茶姬', '沪上阿姨', '益禾堂', '茶颜悦色'],
  },
  {
    input: '不吃油的',
    tabId: 'meal',
    mustExcludeTags: ['油炸', '重口', '辣'],
    forbiddenTerms: ['油炸', '炸鸡', '鸡排', '薯条', '油条', '炸串', '冒菜', '麻辣香锅'],
  },
  {
    input: '少油一点',
    tabId: 'meal',
    mustExcludeTags: ['油炸', '重口', '辣'],
    requiredAnyTags: ['清淡'],
    forbiddenTerms: ['油炸', '炸鸡', '鸡排', '薯条', '油条', '炸串', '冒菜', '麻辣香锅'],
  },
  {
    input: '想吃不油腻的',
    tabId: 'meal',
    mustExcludeTags: ['油炸', '重口', '辣'],
    forbiddenTerms: ['油炸', '炸鸡', '鸡排', '薯条', '油条', '炸串', '冒菜', '麻辣香锅'],
  },
  {
    input: '别太油腻',
    tabId: 'meal',
    mustExcludeTags: ['油炸', '重口', '辣'],
    forbiddenTerms: ['油炸', '炸鸡', '鸡排', '薯条', '油条', '炸串', '冒菜', '麻辣香锅'],
  },
  {
    input: '不要太油',
    tabId: 'night',
    mustExcludeTags: ['油炸', '重口', '辣'],
    forbiddenTerms: ['油炸', '炸鸡', '鸡排', '薯条', '油条', '炸串', '冒菜', '麻辣香锅'],
  },
  {
    input: '不喝甜的',
    tabId: 'drink',
    mustExcludeTags: ['甜'],
    forbiddenTerms: ['甜', '糖水', '酸甜', '香甜', '奶茶', '甜啦啦', '7分甜', '蜜雪'],
  },
  {
    input: '不喝酸的',
    tabId: 'drink',
    mustExcludeTags: ['酸'],
    mustNotIncludeTags: ['酸'],
    forbiddenTerms: ['酸', '酸梅汤', '柠檬', '百香果', '酸甜', '酸爽'],
    requiredIntent: [{ type: 'avoid', label: '酸味' }],
  },
  {
    input: '酸的别来',
    tabId: 'drink',
    mustExcludeTags: ['酸'],
    mustNotIncludeTags: ['酸'],
    forbiddenTerms: ['酸', '酸梅汤', '柠檬', '百香果', '酸甜', '酸爽'],
    requiredIntent: [{ type: 'avoid', label: '酸味' }],
  },
  {
    input: '柠檬就算了',
    tabId: 'drink',
    mustExcludeTags: ['酸'],
    mustNotIncludeTags: ['酸'],
    forbiddenTerms: ['酸', '酸梅汤', '柠檬', '百香果', '酸甜', '酸爽'],
    requiredIntent: [{ type: 'avoid', label: '酸味' }],
  },
  {
    input: '不吃酸的',
    tabId: 'meal',
    mustExcludeTags: ['酸'],
    mustNotIncludeTags: ['酸'],
    forbiddenTerms: ['酸辣粉', '酸菜鱼', '螺蛳粉', '凉皮', '酸'],
    requiredIntent: [{ type: 'avoid', label: '酸味' }],
  },
  {
    input: '不喝苦的',
    tabId: 'drink',
    mustExcludeTags: ['苦', '咖啡'],
    mustNotIncludeTags: ['苦', '咖啡'],
    forbiddenTerms: ['苦', '咖啡', '拿铁', '美式', '瑞幸', '星巴克', 'Manner', 'Tims'],
    requiredIntent: [{ type: 'avoid', label: '苦味' }],
  },
  {
    input: '不吃咸的',
    tabId: 'meal',
    mustExcludeTags: ['咸香'],
    mustNotIncludeTags: ['咸香'],
    forbiddenTerms: ['咸', '咸香', '酱香', '卤味', '泡面'],
    requiredIntent: [{ type: 'avoid', label: '咸口' }],
  },
  {
    input: '想喝酸的',
    expectedTab: 'drink',
    requiredAnyTags: ['酸'],
    requiredIntent: [{ type: 'prefer', label: '酸味' }],
  },
  {
    input: '想喝苦的',
    expectedTab: 'drink',
    requiredAnyTags: ['苦', '咖啡'],
    requiredIntent: [{ type: 'prefer', label: '苦味' }],
  },
  {
    input: '少糖一点',
    tabId: 'drink',
    mustExcludeTags: ['甜'],
    forbiddenTerms: ['甜', '糖水', '酸甜', '香甜', '奶茶', '甜啦啦', '7分甜', '蜜雪'],
  },
  {
    input: '无糖的',
    tabId: 'drink',
    mustExcludeTags: ['甜'],
    forbiddenTerms: ['甜', '糖水', '酸甜', '香甜', '奶茶', '甜啦啦', '7分甜', '蜜雪'],
  },
  {
    input: '三分糖',
    tabId: 'drink',
    mustExcludeTags: ['甜'],
    forbiddenTerms: ['甜', '糖水', '酸甜', '香甜', '奶茶', '甜啦啦', '7分甜', '蜜雪'],
    requiredIntent: [{ type: 'avoid', label: '甜口' }],
  },
  {
    input: '半糖就行',
    tabId: 'drink',
    mustExcludeTags: ['甜'],
    forbiddenTerms: ['甜', '糖水', '酸甜', '香甜', '奶茶', '甜啦啦', '7分甜', '蜜雪'],
    requiredIntent: [{ type: 'avoid', label: '甜口' }],
  },
  {
    input: '不想喝咖啡',
    tabId: 'drink',
    mustExcludeTags: ['咖啡'],
    requiredAnyTags: ['饮品', '奶茶', '果茶'],
    forbiddenTerms: ['咖啡', '拿铁', '美式', '瑞幸', '星巴克', 'Manner', 'Tims', '幸运咖', '库迪', '挪瓦'],
  },
  {
    input: '咖啡别来',
    tabId: 'drink',
    mustExcludeTags: ['苦', '咖啡'],
    mustNotIncludeTags: ['苦', '咖啡'],
    requiredAnyTags: ['饮品', '奶茶', '果茶'],
    forbiddenTerms: ['咖啡', '拿铁', '美式', '瑞幸', '星巴克', 'Manner', 'Tims', '幸运咖', '库迪', '挪瓦'],
    requiredIntent: [{ type: 'avoid', label: '苦味' }],
  },
  {
    input: '别喝拿铁',
    tabId: 'drink',
    mustExcludeTags: ['咖啡'],
    requiredAnyTags: ['饮品', '奶茶', '果茶'],
    forbiddenTerms: ['咖啡', '拿铁', '美式', '瑞幸', '星巴克', 'Manner', 'Tims', '幸运咖', '库迪', '挪瓦'],
  },
  {
    input: '不要没味的',
    tabId: 'meal',
    mustExcludeTags: ['清淡'],
    requiredAnyTags: ['辣', '重口'],
    forbiddenTerms: ['清淡', '清汤', '汤清', '豆浆', '阳春面', '真功夫'],
  },
  {
    input: '想吃清淡点',
    tabId: 'meal',
    requiredAnyTags: ['清淡'],
    forbiddenTerms: ['冒菜', '麻辣香锅', '酸辣粉', '麻辣烫', '油炸', '炸鸡'],
  },
  {
    input: '辣的别来',
    tabId: 'meal',
    mustExcludeTags: ['辣', '重口'],
    forbiddenTerms: ['酸辣粉', '酸菜鱼', '麻辣', '辣'],
    requiredIntent: [{ type: 'avoid', label: '辣味' }],
  },
  {
    input: '油腻就算了',
    tabId: 'meal',
    mustExcludeTags: ['油炸', '重口', '辣'],
    forbiddenTerms: ['油炸', '炸鸡', '鸡排', '薯条', '油条', '炸串', '冒菜', '麻辣香锅'],
    requiredIntent: [{ type: 'avoid', label: '油腻' }],
  },
  {
    input: '清淡免了',
    tabId: 'meal',
    mustExcludeTags: ['清淡'],
    requiredAnyTags: ['辣', '重口'],
    forbiddenTerms: ['清淡', '清汤', '汤清', '豆浆', '阳春面', '真功夫'],
    requiredIntent: [{ type: 'avoid', label: '清淡' }],
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

  for (const tag of testCase.mustNotIncludeTags || []) {
    if (result.tags.includeTags.includes(tag)) {
      failures.push(`${testCase.input}: 不应正向包含标签 ${tag}`);
    }
  }

  for (const intent of testCase.requiredIntent || []) {
    const matched = (result.tags.intentSummary || []).some((item) => item.type === intent.type && item.label === intent.label);
    if (!matched) {
      failures.push(`${testCase.input}: 缺少意图 ${intent.type}:${intent.label}`);
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
    intentSummary: result.tags.intentSummary,
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
