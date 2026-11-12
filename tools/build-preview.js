// 手元確認用：src/index.html の include を展開し、1つの HTML（dist/preview.html）にまとめる
// GAS の doGet() と include() と同じ結果になるようにしている。実行：npm run preview
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const src = path.join(__dirname, '..', 'src');
const out = path.join(__dirname, '..', 'dist');
let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
html = html.replace(/<\?!=\s*include\('([\w-]+)'\);?\s*\?>/g, (_, name) =>
  fs.readFileSync(path.join(src, name + '.html'), 'utf8'));
if (/<\?/.test(html)) throw new Error('展開されていないテンプレートタグがあります');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'preview.html'), html);
console.log('dist/preview.html を作成しました');
