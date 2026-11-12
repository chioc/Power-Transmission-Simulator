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
// include 以外のテンプレート（<?!= 関数名(); ?>）は、src/Summary.js を読み込んで実行した結果に置き換える
const vm = require('node:vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(src, 'Summary.js'), 'utf8'), ctx);
html = html.replace(/<\?!=\s*(\w+)\(\);?\s*\?>/g, (_, fn) => {
  if (typeof ctx[fn] !== 'function') throw new Error(fn + ' が src/Summary.js にありません');
  return ctx[fn]();
});
if (/<\?/.test(html)) throw new Error('展開されていないテンプレートタグがあります');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'preview.html'), html);
console.log('dist/preview.html を作成しました');
