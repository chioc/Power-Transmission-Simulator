// Web アプリの入口：画面（index.html）を返す
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('動力伝達・運動変換シミュレーター')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 別ファイル（CSS・JS を書いた .html）の中身を読み込んで返す
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
