/**
 * 从原项目 byazlle/zhuji-bus-live 的页面中提取静态公交数据，生成 www/js/data.js
 * 用法：node scripts/generate-data.js <原项目 web/index.html 路径>
 */
const fs = require('fs');
const path = require('path');

const src = process.argv[2] || 'C:/work/bus/zhuji-bus-live/web/index.html';
const out = path.join(__dirname, '..', 'www', 'js', 'data.js');
const html = fs.readFileSync(src, 'utf8');

const seedMatch = html.match(/^const SEED_LINES=(\[.*?\]);$/m);
const snapMatch = html.match(/^const STATION_SNAPSHOT = (\{.*\});$/m);
if (!seedMatch || !snapMatch) {
  console.error('未找到 SEED_LINES / STATION_SNAPSHOT，请确认源文件路径');
  process.exit(1);
}
const seed = JSON.parse(seedMatch[1]);
const snap = JSON.parse(snapMatch[1]);
const content =
  '/* 静态公交数据：由 scripts/generate-data.js 从原项目生成，请勿手工修改 */\n' +
  'const SEED_LINES = ' + JSON.stringify(seed) + ';\n' +
  'const SNAP = ' + JSON.stringify(snap) + ';\n';
fs.writeFileSync(out, content, 'utf8');
console.log(`生成 ${out}：${seed.length} 条线路 / ${snap.names.length} 个站点 / ${(content.length / 1024).toFixed(0)} KB`);
