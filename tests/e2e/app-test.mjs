import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8081/';
const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOT_DIR = process.env.SHOT_DIR || '';
const shot = name => SHOT_DIR ? SHOT_DIR + '/' + name : undefined;

const errors = [];
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) errors.push(name + (detail ? ' :: ' + JSON.stringify(detail) : ''));
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''));
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

// 模拟定位在诸暨火车站附近
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(ok) {
        ok({ coords: { latitude: 29.7101, longitude: 120.2492, accuracy: 20 }, timestamp: Date.now() });
      }
    }
  });
});

await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));

// ===== 1. 基础数据回归 =====
const base = await page.evaluate(() => ({
  lines: SEED_LINES.length,
  stations: SNAP.names.length,
  dirs: SIDX.dirs.length,
  tabs: [...document.querySelectorAll('.tab')].map(b => b.textContent.trim()),
  title: document.querySelector('#topTitle').textContent
}));
check('静态基础数据完整', base.lines === 395 && base.stations > 3000 && base.dirs > 700, base);
check('底部四Tab结构', JSON.stringify(base.tabs) === JSON.stringify(['首页', '去哪', '公告', '我的']), base.tabs);
check('需求外入口不存在', await page.evaluate(() =>
  !/乘车码|订阅|提醒|意见反馈|消息推送|到站订阅/.test(document.body.innerText)));

// ===== 2. 首页：定位 / 附近站点 / 地图 =====
const home = await page.evaluate(() => ({
  loc: document.querySelector('#locText').textContent,
  near: document.querySelectorAll('#nearList .row').length,
  mapVisible: !document.querySelector('#mapFallback').hidden,
  mapCanvas: document.querySelectorAll('#map canvas').length
}));
check('定位成功并展示附近站点', home.loc.includes('已定位') && home.near > 0, home);
check('地图可用或正确降级', home.mapCanvas > 0 || await page.evaluate(() =>
  /地图暂不可用/.test(document.querySelector('#mapFallbackText').textContent)), home);
if (SHOT_DIR) await page.screenshot({ path: shot('01-home.png') });

// ===== 3. 线路查询 =====
await page.click('#quickLine');
await page.type('#lineQuery', '1路');
await new Promise(r => setTimeout(r, 600));
const lineRows = await page.evaluate(() => document.querySelectorAll('#lineResult .row').length);
check('线路查询返回结果', lineRows > 0, { lineRows });
await page.click('#lineResult .row');
await new Promise(r => setTimeout(r, 800));
const lineDetail = await page.evaluate(() => ({
  on: document.querySelector('#detailPage').classList.contains('on'),
  stations: document.querySelectorAll('#detailBody .detail-station').length,
  title: document.querySelector('#detailTitle').textContent
}));
check('线路详情展示站点', lineDetail.on && lineDetail.stations > 5, lineDetail);
if (SHOT_DIR) await page.screenshot({ path: shot('02-line-detail.png') });
// 收藏线路
await page.click('#detailFav');
await new Promise(r => setTimeout(r, 200));
check('线路收藏生效', await page.evaluate(() => Store.favLines().length > 0));
await page.click('#detailBack');

// ===== 4. 站点收藏（首页附近站点） =====
await page.click('#homeSeg .seg-btn[data-seg="near"]');
await new Promise(r => setTimeout(r, 300));
await page.click('#nearList .fav-btn');
await new Promise(r => setTimeout(r, 200));
check('站点收藏生效', await page.evaluate(() => Store.favStations().length > 0));

// ===== 5. 去哪：站点选择（搜索） =====
await page.click('.tab[data-tab="go"]');
await new Promise(r => setTimeout(r, 300));
await page.click('[data-pick="from"]');
await new Promise(r => setTimeout(r, 300));
await page.type('#pickerQuery', '火车站');
await new Promise(r => setTimeout(r, 700));
const searchHits = await page.evaluate(() => document.querySelectorAll('#pickerSearchResult [data-act="pick-station"]').length);
check('站点搜索（中文模糊）有结果', searchHits > 0, { searchHits });
await page.click('#pickerSearchResult [data-act="pick-station"]');
await new Promise(r => setTimeout(r, 200));

// 终点：线路树展开选择
await page.click('[data-pick="to"]');
await new Promise(r => setTimeout(r, 300));
await page.click('.picker-tabs [data-ptab="tree"]');
await page.type('#pickerLineQuery', '1路');
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.querySelector('#pickerTreeResult .tree-head').click());
await new Promise(r => setTimeout(r, 300));
const treeStations = await page.evaluate(() => document.querySelectorAll('#pickerTreeResult .tree-station').length);
check('线路树展开展示站点', treeStations > 5, { treeStations });
const treeList = await page.evaluate(() => [...document.querySelectorAll('#pickerTreeResult .tree-station')].map(e => e.dataset.name));
const targetTo = treeList.find(n => n !== '火车站') || treeList[treeList.length - 1];
await page.evaluate(name => {
  const el = [...document.querySelectorAll('#pickerTreeResult .tree-station')].find(e => e.dataset.name === name);
  if (el) el.click();
}, targetTo);
await new Promise(r => setTimeout(r, 200));
const picked = await page.evaluate(() => ({ from: App.route.from, to: App.route.to }));
check('起终点站点选择完成', !!picked.from && !!picked.to, picked);

// ===== 6. 换乘规划 + 历史 =====
await page.click('#planBtn');
await new Promise(r => setTimeout(r, 800));
const plan = await page.evaluate(() => ({
  plans: App.route.plans.length,
  tabs: document.querySelectorAll('.plan-tab').length,
  timeline: document.querySelectorAll('#goContent .tnode').length,
  summary: (document.querySelector('.plan-sum') || {}).textContent || '',
  history: Store.history().length
}));
check('换乘方案计算与展示', plan.plans > 0 && plan.timeline >= 3, plan);
check('查询历史自动保存', plan.history > 0, { history: plan.history });
if (SHOT_DIR) await page.screenshot({ path: shot('03-route.png') });

// 多方案切换
if (plan.tabs > 1) {
  await page.click('.plan-tab:nth-child(2)');
  await new Promise(r => setTimeout(r, 200));
  check('多方案切换', await page.evaluate(() => App.route.idx === 1));
}

// 历史再次查询
await page.click('#historyList .row');
await new Promise(r => setTimeout(r, 600));
check('历史记录可再次查询', await page.evaluate(() => document.querySelectorAll('.plan-tab').length > 0));
// 删除历史
const beforeDel = await page.evaluate(() => Store.history().length);
if (beforeDel > 0) {
  await page.evaluate(() => document.querySelector('#historyList .fav-btn').click());
  await new Promise(r => setTimeout(r, 200));
  check('历史记录可删除', await page.evaluate(b => Store.history().length === b - 1, beforeDel));
} else check('历史记录可删除', false, '无历史记录可删除');

// ===== 7. 公告列表 + 详情 =====
await page.click('.tab[data-tab="notice"]');
await new Promise(r => setTimeout(r, 1500));
const notice = await page.evaluate(() => ({
  count: App.notices.length,
  cards: document.querySelectorAll('.notice-card').length,
  title: (document.querySelector('.notice-card h3') || {}).textContent || ''
}));
check('真实公告列表加载', notice.count > 0 && notice.cards > 0, notice);
if (SHOT_DIR) await page.screenshot({ path: shot('04-notice.png') });
await page.click('.notice-card');
await new Promise(r => setTimeout(r, 400));
const noticeDetail = await page.evaluate(() => ({
  on: document.querySelector('#detailPage').classList.contains('on'),
  len: (document.querySelector('.notice-content') || {}).textContent?.length || 0
}));
check('公告详情展示', noticeDetail.on && noticeDetail.len > 10, noticeDetail);
await page.click('#detailBack');
await page.click('#readAllBtn');
await new Promise(r => setTimeout(r, 300));
check('公告全部已读', await page.evaluate(() =>
  [...document.querySelectorAll('.notice-card .reddot')].length === 0));

// ===== 8. 我的：收藏管理 =====
await page.click('.tab[data-tab="mine"]');
await new Promise(r => setTimeout(r, 300));
const mine1 = await page.evaluate(() => ({
  stations: document.querySelectorAll('#mineContent .row').length,
  label: document.querySelector('#mineSeg .active').textContent
}));
check('我的-收藏站点列表', mine1.stations > 0 && mine1.label === '收藏站点', mine1);
await page.click('#mineSeg .seg-btn[data-seg="lines"]');
await new Promise(r => setTimeout(r, 200));
const mine2 = await page.evaluate(() => document.querySelectorAll('#mineContent .row').length);
check('我的-收藏线路列表', mine2 > 0, { lines: mine2 });
await page.click('#mineContent .fav-btn');
await new Promise(r => setTimeout(r, 200));
check('我的-可取消收藏', await page.evaluate(() => document.querySelectorAll('#mineContent .row').length === 0));
if (SHOT_DIR) await page.screenshot({ path: shot('05-mine.png') });

// ===== 9. 边界场景 =====
// 站点搜索无结果
await page.click('.tab[data-tab="go"]');
await page.click('[data-pick="from"]');
await page.type('#pickerQuery', '这个站点绝对不存在XYZ987');
await new Promise(r => setTimeout(r, 700));
check('搜索无结果提示', await page.evaluate(() =>
  /没有找到相关站点/.test(document.querySelector('#pickerSearchResult').textContent)));
await page.click('#pickerClose');
// 无直达线路（使用真实站点对，算法应给出换乘方案或空提示）
const noDirect = await page.evaluate(() => {
  const plans = planRoute('西施殿公交首末站', '徐里（竹蓬）');
  return { count: plans.length, transfers: plans[0] ? plans[0].transfers : -1 };
});
check('无直达时给出换乘方案', noDirect.count === 0 || noDirect.transfers >= 1, noDirect);
// 网络异常提示（模拟 fetch 失败）
const netErr = await page.evaluate(async () => {
  const orig = window.fetch;
  window.fetch = () => Promise.reject(new Error('offline'));
  const box = document.querySelector('#noticeList');
  const ds = DataSource;
  let failed = false;
  try { await ds.notices(1, 10); } catch (e) { failed = true; }
  window.fetch = orig;
  return { failed, box: !!box };
});
check('网络异常可捕获', netErr.failed, netErr);

// ===== 10. 移动端适配 =====
const layout = await page.evaluate(() => ({
  bodyWidth: document.body.scrollWidth,
  viewport: window.innerWidth,
  tabFixed: getComputedStyle(document.querySelector('.tabbar')).position === 'fixed',
  tabBottom: Math.round(document.querySelector('.tabbar').getBoundingClientRect().bottom),
  innerHeight: window.innerHeight
}));
check('移动端无横向溢出', layout.bodyWidth <= layout.viewport + 1, layout);
check('底部Tab固定可见', layout.tabFixed && Math.abs(layout.tabBottom - layout.innerHeight) < 2, layout);
check('页面控制台无错误', errors.filter(e => e.startsWith('console:') || e.startsWith('pageerror:')).length === 0,
  errors.filter(e => e.startsWith('console:') || e.startsWith('pageerror:')));

console.log('\n===== 测试结果 =====');
console.log('通过 ' + results.filter(r => r.ok).length + ' / ' + results.length + '，错误 ' + errors.length);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
process.exit(errors.length ? 1 : 0);
