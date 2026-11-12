// ⑦まとめ課題の提出処理（src/Summary.js・src/Code.js）のテスト。実行：npm test
// GAS の SpreadsheetApp などは、手元で動く簡単な模型（モック）に置き換えて確かめる。
// メールアドレス・名簿はすべて架空のもの。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const ROSTER_HEAD = ['クラスコード', '名簿番号', 'メールアドレス'];

// ---------- スプレッドシートの模型 ----------
// setValues の動き：「=」で始まる文字列は式になり、「'」で始まる文字列は「'」を除いた文字列として入る（本物と同じ）
function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  const formulas = {};
  const width = () => Math.max(0, ...data.map(r => r.length));
  const cell = (r, c) => (data[r - 1] && data[r - 1][c - 1] !== undefined ? data[r - 1][c - 1] : '');
  const sheet = {
    name, data, formulas, writes: 0,
    getLastRow: () => data.length,
    getLastColumn: () => width(),
    getMaxRows: () => 1000,
    setFrozenRows() {},
    getDataRange() {
      return sheet.getRange(1, 1, Math.max(1, data.length), Math.max(1, width()));
    },
    getRange(r, c, nr, nc) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
        getFormulas: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => formulas[(r + i) + ',' + (c + j)] || '')),
        setValues(vals) {
          sheet.writes++;
          vals.forEach((rowVals, i) => rowVals.forEach((v, j) => {
            const R = r + i, C = c + j;
            while (data.length < R) data.push([]);
            delete formulas[R + ',' + C];
            if (typeof v === 'string' && v.startsWith('=')) { formulas[R + ',' + C] = v; data[R - 1][C - 1] = '（式の結果）'; }
            else if (typeof v === 'string' && v.startsWith("'")) data[R - 1][C - 1] = v.slice(1);
            else data[R - 1][C - 1] = v;
          }));
        },
        setNumberFormat() {}
      };
    }
  };
  return sheet;
}

// GAS の環境を用意して src/Summary.js と src/Code.js を読み込む
function setup(opts = {}) {
  const roster = opts.roster || [ROSTER_HEAD,
    ['201', 1, 'student-a@example.com'],
    ['201', 2, 'Student-B@Example.com '],
    [202, '03', 'student-c@example.com']];
  const sheets = {
    '名簿': makeSheet('名簿', roster),
    '提出データ': makeSheet('提出データ', opts.submit || [[]])
  };
  if (!opts.submit) sheets['提出データ'].data.length = 0;
  const ss = {
    getSheetByName: (n) => (opts.missingSheet === n ? null : sheets[n] || null),
    insertSheet: (n) => (sheets[n] = makeSheet(n, [])),
    setSpreadsheetTimeZone() {}
  };
  const env = {
    email: opts.email === undefined ? 'student-a@example.com' : opts.email,
    lockFree: opts.lockFree !== false, locked: 0, released: 0
  };
  const ctx = {
    module: undefined,
    Session: { getActiveUser: () => ({ getEmail: () => env.email }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'SPREADSHEET_ID' && !opts.noId ? 'dummy-id' : null) }) },
    SpreadsheetApp: { openById: () => { if (opts.openFails) throw new Error('not found'); return ss; }, flush() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (!env.lockFree) return false; env.locked++; return true; }, releaseLock: () => { env.released++; } }) },
    Utilities: { formatDate: () => '11月12日 9:00' },
    Logger: { log() {} },
    HtmlService: {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'Summary.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'Code.js'), 'utf8'), ctx);
  if (!opts.noId && !opts.openFails && !opts.skipSetup) ctx.setupSheets();
  return { ctx, sheets, env };
}

const goodPayload = (over = {}) => Object.assign({
  classCode: '201', number: '1',
  learned: 'チェーンがスプロケットの歯にかみ合って進んだ',
  reason: '自転車では、チェーンとスプロケットを使っている',
  answers: [1, 1, 2, 0]
}, over);

// 提出データを「見出し → 値」の形で読む
function rowsOf(sheet) {
  const [head, ...rest] = sheet.data;
  return rest.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// ---------- 入力の検査 ----------
test('名簿番号の正規化（全角・先頭ゼロ・空白）', () => {
  const { ctx } = setup();
  assert.equal(ctx.normalizeRosterNumber('０１'), 1);
  assert.equal(ctx.normalizeRosterNumber(' 1 '), 1);
  assert.equal(ctx.normalizeRosterNumber('　０１２　'), 12);
  assert.equal(ctx.normalizeRosterNumber(3), 3);
  for (const bad of ['', '0', '00', '-1', '1.5', 'abc', '1a', null]) assert.equal(ctx.normalizeRosterNumber(bad), null, String(bad));
});

test('9f：不足・不正の項目を示し、保存しない', () => {
  const { ctx, sheets } = setup();
  const r = ctx.submitSummary({ classCode: '', number: 'abc', learned: ' ', reason: '', answers: [0, null, 5] });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID');
  const all = r.errors.join('\n');
  assert.match(all, /クラスコード/); assert.match(all, /名簿番号/);
  assert.match(all, /試して分かったこと/); assert.match(all, /生活の中で使われる理由/);
  assert.match(all, /問2・問3・問4/);
  assert.equal(sheets['提出データ'].data.length, 1, '見出しだけのまま');
  assert.equal(ctx.validateSubmission(goodPayload({ classCode: '205' })).ok, false, '201〜204 以外は不可');
});

test('9f：誤答を含んでも全問に答えていれば提出できる', () => {
  const { ctx, sheets } = setup();
  const r = ctx.submitSummary(goodPayload({ answers: [0, 1, 0, 1] }));
  assert.equal(r.ok, true);
  assert.equal(rowsOf(sheets['提出データ'])[0]['正答数'], 0);
});

// ---------- 提出と再提出 ----------
test('9c：初回提出で1行追加される（本人のメール・記述・回答・得点・時刻）', () => {
  const { ctx, sheets, env } = setup();
  const r = ctx.submitSummary(goodPayload());
  assert.deepEqual({ ok: r.ok, resubmitted: r.resubmitted }, { ok: true, resubmitted: false });
  assert.equal(r.savedAt, '11月12日 9:00');
  const rows = rowsOf(sheets['提出データ']);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row['メールアドレス'], 'student-a@example.com');
  assert.equal(row['クラスコード'], '201');
  assert.equal(row['名簿番号'], 1);
  assert.equal(row['問1回答'], 'チェーンとスプロケット');
  assert.equal(row['問2回答'], '両方小さくなる');
  assert.equal(row['正答数'], 3);
  assert.equal(row['満点'], 4);
  const isDate = (d) => Object.prototype.toString.call(d) === '[object Date]';
  assert.ok(isDate(row['初回提出日時']) && isDate(row['最終提出日時']));
  assert.equal(env.locked, 1); assert.equal(env.released, 1);
});

test('9d：再提出は同じ1行を更新し、初回提出日時と先生が足した列は残る', () => {
  const { ctx, sheets } = setup();
  ctx.submitSummary(goodPayload());
  const sub = sheets['提出データ'];
  // 先生が右端に列を足し、式を入れた場合
  sub.data[0].push('先生メモ');
  sub.data[1].push('よく書けている');
  const first = rowsOf(sub)[0]['初回提出日時'];
  const r = ctx.submitSummary(goodPayload({ number: '０１', learned: '書き直した', answers: [1, 0, 2, 0] }));
  assert.deepEqual({ ok: r.ok, resubmitted: r.resubmitted }, { ok: true, resubmitted: true });
  const rows = rowsOf(sub);
  assert.equal(rows.length, 1, '行は増えない');
  assert.equal(rows[0]['初回提出日時'], first, '初回提出日時は同じ');
  assert.equal(rows[0]['試して分かったこと'], '書き直した');
  assert.equal(rows[0]['正答数'], 4);
  assert.equal(rows[0]['先生メモ'], 'よく書けている');
});

test('再提出で、先生の列の式は式のまま残る', () => {
  const { ctx, sheets } = setup();
  ctx.submitSummary(goodPayload());
  const sub = sheets['提出データ'];
  const col = sub.data[0].length + 1;
  sub.data[0].push('確認');
  sub.getRange(2, col, 1, 1).setValues([['=L2/M2']]);
  ctx.submitSummary(goodPayload());
  assert.equal(sub.formulas['2,' + col], '=L2/M2');
});

test('名簿のメールは大文字・空白の違いを無視して照合する', () => {
  const { ctx } = setup({ email: 'student-b@example.com' });
  assert.equal(ctx.submitSummary(goodPayload({ number: '2' })).ok, true);
});

// ---------- なりすまし・照合できない場合 ----------
test('9e：他の生徒の番号・別クラス・未登録アカウント・メールが空は保存しない', () => {
  const cases = [
    [{}, { number: '2' }, 'ROSTER'],                         // 他の生徒の番号
    [{}, { classCode: '202', number: '1' }, 'ROSTER'],         // 別クラス
    [{ email: 'stranger@example.com' }, {}, 'ROSTER'],         // 名簿にないアカウント
    [{ email: '' }, {}, 'NO_EMAIL']                            // メールが取れない
  ];
  for (const [opt, over, code] of cases) {
    const { ctx, sheets } = setup(opt);
    const r = ctx.submitSummary(goodPayload(over));
    assert.equal(r.ok, false); assert.equal(r.code, code, JSON.stringify(over));
    assert.ok(r.message.length > 0);
    assert.equal(sheets['提出データ'].data.length, 1, '保存されていない');
  }
});

test('9e：既存の行は、ほかの人の失敗した提出で変わらない', () => {
  const { ctx, sheets, env } = setup();
  ctx.submitSummary(goodPayload());
  const before = JSON.stringify(sheets['提出データ'].data);
  env.email = 'student-b@example.com';
  assert.equal(ctx.submitSummary(goodPayload({ number: '1' })).code, 'ROSTER');
  assert.equal(JSON.stringify(sheets['提出データ'].data), before);
});

test('名簿の重複（同じ番号が2行・同じメールが2行）は照合を確定できないので保存しない', () => {
  const dupKey = setup({ roster: [ROSTER_HEAD, ['201', 1, 'student-a@example.com'], ['201', '01', 'other@example.com']] });
  assert.equal(dupKey.ctx.submitSummary(goodPayload()).code, 'ROSTER');
  const dupMail = setup({ roster: [ROSTER_HEAD, ['201', 1, 'student-a@example.com'], ['203', 5, 'STUDENT-A@example.com']] });
  assert.equal(dupMail.ctx.submitSummary(goodPayload()).code, 'ROSTER');
});

test('9g：送られてきたメールや得点は使わない', () => {
  const { ctx, sheets } = setup();
  const r = ctx.submitSummary(goodPayload({ email: 'student-b@example.com', score: 4, max: 4, answers: [0, 0, 0, 1] }));
  assert.equal(r.ok, true);
  const row = rowsOf(sheets['提出データ'])[0];
  assert.equal(row['メールアドレス'], 'student-a@example.com');
  assert.equal(row['正答数'], 1);
});

test('9g：同じメールの行がすでに複数あるときは保存を止める', () => {
  const head = [['初回提出日時', '最終提出日時', 'メールアドレス', 'クラスコード', '名簿番号', '試して分かったこと', '生活の中で使われる理由', '問1回答', '問2回答', '問3回答', '問4回答', '正答数', '満点']];
  const dup = (e) => [new Date(), new Date(), e, '201', 1, 'a', 'b', '', '', '', '', 0, 4];
  const { ctx, sheets } = setup({ submit: head.concat([dup('student-a@example.com'), dup('Student-A@example.com')]) });
  const r = ctx.submitSummary(goodPayload());
  assert.equal(r.code, 'DUPLICATE');
  assert.match(r.message, /先生/);
  assert.equal(sheets['提出データ'].data.length, 3);
});

test('9g：ほかの提出が処理中で順番を待てないときは保存せず、もう一度押すよう案内する', () => {
  const { ctx, sheets } = setup({ lockFree: false });
  const r = ctx.submitSummary(goodPayload());
  assert.equal(r.code, 'BUSY');
  assert.equal(sheets['提出データ'].data.length, 1);
});

test('9g：同じアカウントで何度送っても1行に保たれる', () => {
  const { ctx, sheets } = setup();
  for (let i = 0; i < 5; i++) ctx.submitSummary(goodPayload({ learned: '回数' + i }));
  const rows = rowsOf(sheets['提出データ']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['試して分かったこと'], '回数4');
});

// ---------- 式・改行・失敗 ----------
test('9h：式のような記述は式にならず、改行も含めてそのまま保存される', () => {
  const { ctx, sheets } = setup();
  const text = '=1+1\n2行目も書いた';
  ctx.submitSummary(goodPayload({ learned: text, reason: '+abc\n@x' }));
  const sub = sheets['提出データ'];
  const row = rowsOf(sub)[0];
  assert.equal(row['試して分かったこと'], text);
  assert.equal(row['生活の中で使われる理由'], '+abc\n@x');
  assert.equal(Object.keys(sub.formulas).length, 0, '式は1つも作られない');
});

test('9h：提出先が開けない・シートがないときは保存せず、先生に知らせるよう案内する', () => {
  for (const opt of [{ noId: true }, { openFails: true }, { missingSheet: '名簿' }]) {
    const { ctx } = setup(opt);
    const r = ctx.submitSummary(goodPayload());
    assert.equal(r.ok, false); assert.equal(r.code, 'CONFIG', JSON.stringify(opt));
    assert.match(r.message, /先生/);
  }
});

test('見出しが足りない名簿では保存しない', () => {
  const opts = { roster: [['クラス', '番号', 'メール'], ['201', 1, 'student-a@example.com']], skipSetup: true };
  const { ctx } = setup(opts);
  assert.throws(() => ctx.setupSheets(), /必要な見出し/, '準備の段階で先生に知らせる');
  assert.equal(ctx.submitSummary(goodPayload()).code, 'CONFIG');
});

// ---------- 画面に渡す設定 ----------
test('画面に渡す設定は HTML に埋め込んでも安全な JSON', () => {
  const { ctx } = setup();
  const json = ctx.summaryConfigJson();
  assert.ok(!json.includes('<'));
  const cfg = JSON.parse(json);
  assert.deepEqual(cfg.classCodes, ['201', '202', '203', '204']);
  assert.equal(cfg.quiz.length, 4);
  assert.equal(cfg.quiz[1].opts[1], '両方小さくなる');
});

test('画面での事前確認は、サーバーの検査と同じ結果になる', () => {
  const { ctx } = setup();
  const html = fs.readFileSync(path.join(SRC, 'logic.html'), 'utf8');
  const lctx = { module: { exports: {} } };
  vm.runInNewContext(/^\s*<script>([\s\S]*)<\/script>\s*$/.exec(html)[1], lctx);
  const Sim = lctx.module.exports;
  const cfg = JSON.parse(ctx.summaryConfigJson());
  const cases = [
    goodPayload(),
    goodPayload({ number: '０１' }), goodPayload({ number: '0' }), goodPayload({ number: '1.5' }), goodPayload({ number: '' }),
    goodPayload({ classCode: '' }), goodPayload({ classCode: '205' }),
    goodPayload({ learned: '  ' }), goodPayload({ reason: '' }), goodPayload({ learned: 'あ'.repeat(2001) }),
    goodPayload({ answers: [0, null, 2, 0] }), goodPayload({ answers: [0, 1, 3, 0] }), goodPayload({ answers: [] })
  ];
  for (const p of cases) {
    const server = ctx.validateSubmission(p), client = Sim.checkSummaryInput(p, cfg);
    assert.equal(client.ok, server.ok, JSON.stringify(p).slice(0, 80));
    assert.equal(JSON.stringify(client.errors), JSON.stringify(server.errors));
    for (const n of ['０１', ' 7 ', '00', 'x', '12']) assert.equal(Sim.normalizeRosterNumber(n), ctx.normalizeRosterNumber(n));
  }
});
