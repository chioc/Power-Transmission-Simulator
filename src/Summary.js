// ===== ⑦まとめ課題：問題の定義と、提出データの検査・採点などの純粋な処理 =====
// GAS のサーバー側で使う（SpreadsheetApp などの GAS の機能はここでは使わない）。
// Node.js からも読み込んでテストできる。問題と正答の定義はこのファイルだけに置く（画面にも ここから渡す）。

// 小テストの問題（仕様書「3. ⑦ まとめ課題」の表のとおり）
var FINAL_QUIZ = [
  { q: '離れた2つの軸に、歯とかみ合わせて回転を伝える組合せはどれか',
    opts: ['摩擦車', 'チェーンとスプロケット', 'ラックとピニオン'], ans: 1,
    exp: 'チェーンが両方のスプロケットとかみ合い、離れた軸へ回転を伝える。',
    ref: { label: '⑥ 教科書の機構を見る', go: 'list' } },
  { q: '入力軸の回転数・トルクと入力側の歯数を同じにして、平歯車の出力側を20歯から40歯にするとどうなるか',
    opts: ['回転数は小さく、理想トルクは大きくなる', '両方小さくなる', '回転数は大きく、理想トルクは小さくなる'], ans: 0,
    exp: '回転数は半分、損失を無視した理想トルクは2倍になる。',
    ref: { label: '② 平歯車の速さとトルク', go: 'gear2' } },
  { q: 'クランク・スライダでクランクの半径を大きくすると、スライダの往復する範囲はどうなるか',
    opts: ['小さくなる', '同じ', '大きくなる'], ans: 2,
    exp: 'クランクの回転中心から連結点までの距離が伸び、往復の幅が広がる。',
    ref: { label: '④ リンクの実験', go: 'link', link: 'slider' } },
  { q: '入力軸を回し続けても、押す部品が一定の位置にとどまる時間をつくりたい。何を変えるとよいか',
    opts: ['カムを、従動節が一定位置にとどまる区間のある形に替える', 'カムを同じ形のまま速く回す', 'カムを同じ形のまま逆に回す'], ans: 0,
    exp: 'カムの形で従動節の動き方が変わり、一定位置を保つ区間を設けられる。',
    ref: { label: '⑤ カムの実験', go: 'cam' } }
];

// 選べるクラスコード
var CLASS_CODES = ['201', '202', '203', '204'];

// 記述1欄あたりの文字数の上限（スプレッドシートのセルの上限より十分小さくする）
var TEXT_MAX = 2000;

// シート名と見出し（列は見出しの名前で探すので、並べ替えても動く）
var SHEETS = {
  roster: { name: '名簿', headers: ['クラスコード', '名簿番号', 'メールアドレス'] },
  submit: {
    name: '提出データ',
    headers: ['初回提出日時', '最終提出日時', 'メールアドレス', 'クラスコード', '名簿番号',
      '試して分かったこと', '生活の中で使われる理由', '問1回答', '問2回答', '問3回答', '問4回答', '正答数', '満点']
  }
};

// 生徒に見せるエラーの文章（中学生にわかる言葉で）
var SUBMIT_MESSAGES = {
  NO_EMAIL: '学校アカウントで開いているか確認してください。解決しない場合は先生に知らせてください。',
  ROSTER: 'クラスコード・名簿番号・学校アカウントを確認してください。',
  DUPLICATE: '提出データに同じアカウントの行が複数あるため、保存できませんでした。先生に知らせてください。',
  BUSY: 'ほかの人の提出が重なっています。少し待ってから、もう一度「提出する」を押してください。',
  CONFIG: '提出先の準備ができていないため、保存できませんでした。先生に知らせてください。'
};

// 画面に渡す設定（問題・クラスコードなど）を JSON にする。HTML の中に埋め込んでも安全なように「<」を変換する
function summaryConfigJson() {
  var data = { quiz: FINAL_QUIZ, classCodes: CLASS_CODES, textMax: TEXT_MAX };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// メールアドレスを照合用にそろえる（前後の空白を除き、小文字にする）
function normalizeEmail(v) {
  return String(v === null || v === undefined ? '' : v).trim().toLowerCase();
}

// 名簿番号をそろえる（全角数字・前後の空白・先頭のゼロ）。正の整数でなければ null
function normalizeRosterNumber(v) {
  var t = String(v === null || v === undefined ? '' : v)
    .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/^[\s　]+|[\s　]+$/g, '');
  if (!/^\d+$/.test(t)) return null;
  var n = parseInt(t, 10);
  return n >= 1 ? n : null;
}

// クラスコードをそろえる（シートで数値になっていても文字列で比べる）
function normalizeClassCode(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

// 画面から届いた提出内容を検査する。使うのは決まった項目だけ（メールや得点が送られてきても無視する）
function validateSubmission(payload) {
  var p = payload || {};
  var errors = [];
  var classCode = normalizeClassCode(p.classCode);
  if (CLASS_CODES.indexOf(classCode) < 0) errors.push('クラスコードを選んでください。');
  var number = normalizeRosterNumber(p.number);
  if (number === null) errors.push('名簿番号は 1 以上の数字で入力してください。');
  var learned = typeof p.learned === 'string' ? p.learned : '';
  var reason = typeof p.reason === 'string' ? p.reason : '';
  if (!learned.trim()) errors.push('「試して分かったこと」を書いてください。');
  if (!reason.trim()) errors.push('「生活の中で使われる理由」を書いてください。');
  if (learned.length > TEXT_MAX || reason.length > TEXT_MAX) errors.push('記述は1つの欄につき ' + TEXT_MAX + ' 文字以内にしてください。');
  var answers = [];
  var missing = [];
  for (var i = 0; i < FINAL_QUIZ.length; i++) {
    var a = p.answers && p.answers[i];
    var ok = typeof a === 'number' && a % 1 === 0 && a >= 0 && a < FINAL_QUIZ[i].opts.length;
    if (!ok) missing.push('問' + (i + 1));
    answers.push(ok ? a : null);
  }
  if (missing.length) errors.push('小テストの ' + missing.join('・') + ' に答えてください。');
  return {
    ok: errors.length === 0,
    errors: errors,
    value: { classCode: classCode, number: number, learned: learned, reason: reason, answers: answers }
  };
}

// サーバーが持つ正答で採点する
function scoreAnswers(answers) {
  var score = 0;
  for (var i = 0; i < FINAL_QUIZ.length; i++) if (answers[i] === FINAL_QUIZ[i].ans) score++;
  return { score: score, max: FINAL_QUIZ.length };
}

// 見出し行から「見出し名 → 列番号（0始まり）」の対応を作る。足りない見出しがあれば null
function headerIndex(headerRow, required) {
  var idx = {};
  for (var c = 0; c < headerRow.length; c++) {
    var h = String(headerRow[c]).trim();
    if (h && !(h in idx)) idx[h] = c;
  }
  for (var i = 0; i < required.length; i++) if (!(required[i] in idx)) return null;
  return idx;
}

// 名簿と照合する。クラスコード・名簿番号の組がちょうど1行あり、そのメールが本人と一致し、
// 名簿の中でそのメールも1行だけのときに限り ok
function matchRoster(rosterValues, classCode, number, email) {
  if (!rosterValues || rosterValues.length < 1) return { ok: false, reason: 'config' };
  var idx = headerIndex(rosterValues[0], SHEETS.roster.headers);
  if (!idx) return { ok: false, reason: 'config' };
  var byKey = 0, byEmail = 0, emailOfKey = null;
  for (var r = 1; r < rosterValues.length; r++) {
    var row = rosterValues[r];
    var rc = normalizeClassCode(row[idx['クラスコード']]);
    var rn = normalizeRosterNumber(row[idx['名簿番号']]);
    var re = normalizeEmail(row[idx['メールアドレス']]);
    if (rc === classCode && rn === number) { byKey++; emailOfKey = re; }
    if (re && re === email) byEmail++;
  }
  if (byKey !== 1 || byEmail !== 1 || emailOfKey !== email) return { ok: false, reason: 'roster' };
  return { ok: true };
}

// 提出データの中から、そのメールの行（シートの行番号、1始まり）を探す
function findSubmissionRows(submitValues, idx, email) {
  var rows = [];
  for (var r = 1; r < submitValues.length; r++) {
    if (normalizeEmail(submitValues[r][idx['メールアドレス']]) === email) rows.push(r + 1);
  }
  return rows;
}

// 記述をセルに入れる形にする。「=」などで始まると式として扱われるので、先頭に「'」を付けて文字列にする
function safeCellText(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

// 提出データの1行分（見出しの並びに合わせた配列）を作る。baseRow の、決まった見出し以外の列はそのまま残す
function buildSubmissionRow(idx, baseRow, v, email, firstAt, now) {
  var sc = scoreAnswers(v.answers);
  var row = baseRow.slice();
  var put = function (h, val) { row[idx[h]] = val; };
  put('初回提出日時', firstAt);
  put('最終提出日時', now);
  put('メールアドレス', email);
  put('クラスコード', v.classCode);
  put('名簿番号', v.number);
  put('試して分かったこと', safeCellText(v.learned));
  put('生活の中で使われる理由', safeCellText(v.reason));
  for (var i = 0; i < FINAL_QUIZ.length; i++) put('問' + (i + 1) + '回答', safeCellText(FINAL_QUIZ[i].opts[v.answers[i]]));
  put('正答数', sc.score);
  put('満点', sc.max);
  return row;
}

if (typeof module !== 'undefined') {
  module.exports = {
    FINAL_QUIZ: FINAL_QUIZ, CLASS_CODES: CLASS_CODES, TEXT_MAX: TEXT_MAX, SHEETS: SHEETS, SUBMIT_MESSAGES: SUBMIT_MESSAGES,
    summaryConfigJson: summaryConfigJson, normalizeEmail: normalizeEmail, normalizeRosterNumber: normalizeRosterNumber,
    normalizeClassCode: normalizeClassCode, validateSubmission: validateSubmission, scoreAnswers: scoreAnswers,
    headerIndex: headerIndex, matchRoster: matchRoster, findSubmissionRows: findSubmissionRows,
    safeCellText: safeCellText, buildSubmissionRow: buildSubmissionRow
  };
}
