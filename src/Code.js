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

// 提出先のスプレッドシートを開く（ID はスクリプトプロパティ SPREADSHEET_ID から読む）。開けなければ null
function openSubmitSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) return null;
  try {
    return SpreadsheetApp.openById(String(id).trim());
  } catch (e) {
    return null;
  }
}

// 失敗の結果を作る
function submitFail_(code) {
  return { ok: false, code: code, message: SUBMIT_MESSAGES[code] };
}

// ⑦まとめ課題の提出を受け付ける（画面から google.script.run で呼ばれる）
// メールアドレスはサーバーで取得した値だけを使い、得点はサーバーで採点する
function submitSummary(payload) {
  var email = normalizeEmail(Session.getActiveUser().getEmail());
  if (!email) return submitFail_('NO_EMAIL');

  var v = validateSubmission(payload);
  if (!v.ok) return { ok: false, code: 'INVALID', message: '入力を確認してください。', errors: v.errors };

  var ss = openSubmitSpreadsheet_();
  if (!ss) return submitFail_('CONFIG');
  var rosterSheet = ss.getSheetByName(SHEETS.roster.name);
  var submitSheet = ss.getSheetByName(SHEETS.submit.name);
  if (!rosterSheet || !submitSheet) return submitFail_('CONFIG');

  // 同じ人の提出が同時に届いても1行に保つため、照合から書き込みまでを順番に1件ずつ行う
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return submitFail_('BUSY');
  try {
    var m = matchRoster(rosterSheet.getDataRange().getValues(), v.value.classCode, v.value.number, email);
    if (!m.ok) return submitFail_(m.reason === 'config' ? 'CONFIG' : 'ROSTER');

    var range = submitSheet.getDataRange();
    var values = range.getValues();
    var idx = headerIndex(values[0] || [], SHEETS.submit.headers);
    if (!idx) return submitFail_('CONFIG');
    var rows = findSubmissionRows(values, idx, email);
    if (rows.length > 1) return submitFail_('DUPLICATE');

    var width = values[0].length;
    var now = new Date();
    var target, base, firstAt;
    if (rows.length === 1) {
      // 再提出：同じ行を更新する。初回提出日時と、先生が追加した列（式を含む）はそのまま残す
      target = rows[0];
      var formulas = submitSheet.getRange(target, 1, 1, width).getFormulas()[0];
      base = values[target - 1].map(function (val, c) { return formulas[c] ? formulas[c] : val; });
      firstAt = values[target - 1][idx['初回提出日時']] || now;
    } else {
      target = Math.max(submitSheet.getLastRow(), 1) + 1;
      base = [];
      for (var c = 0; c < width; c++) base.push('');
      firstAt = now;
    }
    var row = buildSubmissionRow(idx, base, v.value, email, firstAt, now);
    submitSheet.getRange(target, 1, 1, width).setValues([row]);
    SpreadsheetApp.flush();
    return {
      ok: true,
      resubmitted: rows.length === 1,
      savedAt: Utilities.formatDate(now, 'Asia/Tokyo', 'M月d日 H:mm')
    };
  } finally {
    lock.releaseLock();
  }
}

// 【先生が最初に1回だけ実行】提出先スプレッドシートに「名簿」「提出データ」シートと見出しを用意する
// すでにあるシートやデータは消さない。見出しが足りない場合は知らせる
function setupSheets() {
  var ss = openSubmitSpreadsheet_();
  if (!ss) {
    throw new Error('提出先のスプレッドシートを開けません。スクリプトプロパティ SPREADSHEET_ID に、スプレッドシートの ID を登録してください。');
  }
  ss.setSpreadsheetTimeZone('Asia/Tokyo');
  var report = [];
  [SHEETS.roster, SHEETS.submit].forEach(function (def) {
    var sh = ss.getSheetByName(def.name);
    if (!sh) {
      sh = ss.insertSheet(def.name);
      report.push('シート「' + def.name + '」を作りました。');
    }
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      sh.setFrozenRows(1);
      report.push('「' + def.name + '」に見出しを入れました。');
    } else {
      var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      if (!headerIndex(head, def.headers)) {
        throw new Error('「' + def.name + '」の1行目に必要な見出しがありません。必要な見出し：' + def.headers.join('、'));
      }
      report.push('「' + def.name + '」の見出しを確認しました。');
    }
  });
  // 提出データの日時の列を、日本時間の日付と時刻で表示する
  var sub = ss.getSheetByName(SHEETS.submit.name);
  var head2 = sub.getRange(1, 1, 1, sub.getLastColumn()).getValues()[0];
  var idx = headerIndex(head2, SHEETS.submit.headers);
  ['初回提出日時', '最終提出日時'].forEach(function (h) {
    sub.getRange(2, idx[h] + 1, sub.getMaxRows() - 1, 1).setNumberFormat('yyyy/mm/dd hh:mm:ss');
  });
  report.push('準備ができました。「名簿」シートに、クラスコード・名簿番号・メールアドレスを入力してください。');
  Logger.log(report.join('\n'));
  return report.join('\n');
}
