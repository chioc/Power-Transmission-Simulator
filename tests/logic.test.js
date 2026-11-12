// 計算処理（src/logic.html）のテスト。実行：npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// src/logic.html は GAS では <script> 内に読み込まれる JS。Node では vm で評価する
const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'logic.html'), 'utf8');
const ctx = { module: { exports: {} } };
vm.runInNewContext(code, ctx);
const Sim = ctx.module.exports;

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≒ ${b}`);

test('受け入れテストNo.2：入力20歯・出力40歯', () => {
  const s = { inTeeth: 20, outTeeth: 40, idler: false };
  const g = Sim.gearTrain(s);
  near(g.ratio, 0.5);
  near(g.outRpm, 30);
  near(g.outTorque, 2);
  assert.equal(g.outSameDir, false);
  // 入力2回転（720°）で出力は逆向きに1回転
  near(Sim.gearAngles(s, 720).output, -360);
});

test('受け入れテストNo.3：中間歯車の追加と歯数の入替', () => {
  const s = { inTeeth: 20, outTeeth: 40, idler: true };
  const g = Sim.gearTrain(s);
  assert.equal(g.outSameDir, true);
  near(g.ratio, 0.5); near(g.outRpm, 30); near(g.outTorque, 2);
  near(Sim.gearAngles(s, 720).output, 360); // 同じ向きに1回転
  const g2 = Sim.gearTrain({ inTeeth: 40, outTeeth: 20, idler: true });
  near(g2.ratio, 2); near(g2.outRpm, 120); near(g2.outTorque, 0.5);
});

test('中間歯車は前後の歯車とかみ合う（周速が等しい）', () => {
  const s = { inTeeth: 40, outTeeth: 20, idler: true };
  const a = Sim.gearAngles(s, 90);
  // 歯数×回転角 の大きさが等しい＝同じ歯数分だけ進む
  near(Math.abs(a.input * 40), Math.abs(a.idler * 20));
  near(Math.abs(a.idler * 20), Math.abs(a.output * 20));
});

test('受け入れテストNo.4：答えの確認とヒント', () => {
  const s = { inTeeth: 20, outTeeth: 40, idler: false };
  const wrong = Sim.checkCalc(s, '2', '30');
  assert.equal(wrong.ratioOk, false);
  assert.equal(wrong.allOk, false);
  assert.match(wrong.hints[0], /入力の歯数 ÷ 出力の歯数/);
  assert.match(wrong.hints[0], /逆/);
  const ok = Sim.checkCalc(s, '0.5', '30');
  assert.equal(ok.allOk, true);
  assert.equal(Sim.checkCalc(s, '1/2', '３０').allOk, true); // 分数・全角
  assert.equal(Sim.checkCalc(s, '０．５', '30').allOk, true);
  assert.equal(Sim.checkCalc(s, '', '').hints.length, 2);
});

test('数値の読み取り', () => {
  near(Sim.parseNumber(' 0.5 '), 0.5);
  near(Sim.parseNumber('.5'), 0.5);
  near(Sim.parseNumber('20÷40'), 0.5);
  assert.ok(Number.isNaN(Sim.parseNumber('abc')));
  assert.ok(Number.isNaN(Sim.parseNumber('1/0')));
});

test('受け入れテストNo.6：クランク・スライダは1回転で往復して元に戻る', () => {
  const { rod, radii } = Sim.LINK.slider;
  for (const size of ['small', 'large']) {
    const r = radii[size];
    near(Sim.crankSlider(r, rod, 0).slider.x, Sim.crankSlider(r, rod, 360).slider.x);
    near(Sim.crankSlider(r, rod, 0).slider.x, r + rod);    // 右端
    near(Sim.crankSlider(r, rod, 180).slider.x, rod - r);  // 左端
  }
});

test('受け入れテストNo.7：クランク半径で出力の範囲が変わり、1回転できる', () => {
  const s1 = Sim.linkRange('slider', 'small'), s2 = Sim.linkRange('slider', 'large');
  near(s1.span, 2 * Sim.LINK.slider.radii.small, 1e-3);
  near(s2.span, 2 * Sim.LINK.slider.radii.large, 1e-3);
  const r1 = Sim.linkRange('rocker', 'small'), r2 = Sim.linkRange('rocker', 'large');
  assert.ok(r1.ok && r2.ok, 'レバー機構が1回転中つながっている');
  assert.ok(r2.span > r1.span + 5, `揺動範囲 小${r1.span.toFixed(1)}° < 大${r2.span.toFixed(1)}°`);
  // リンクの長さが1回転中ずっと保たれる
  const d = Sim.LINK.rocker;
  for (let a = 0; a < 360; a += 15) {
    const p = Sim.crankRocker(d.radii.large, d, a);
    near(Math.hypot(p.tip.x - p.pin.x, p.tip.y - p.pin.y), d.coupler, 1e-6);
    near(Math.hypot(p.tip.x - p.pivot.x, p.tip.y - p.pivot.y), d.lever, 1e-6);
    assert.ok(p.tip.y < 0, 'レバーの先端は軸より上にある（組み方が入れ替わらない）');
  }
});

test('受け入れテストNo.8：カムAは止まらず、カムBは止まる区間がある', () => {
  assert.ok(Sim.camDwell('A') < 3, `A の停止区間 ${Sim.camDwell('A')}°`);
  assert.ok(Sim.camDwell('B') >= 100, `B の停止区間 ${Sim.camDwell('B')}°`);
  // 一周で元に戻る・上下の量は同じ
  for (const t of ['A', 'B']) {
    near(Sim.camLift(t, 0), Sim.camLift(t, 360));
    const vals = Array.from({ length: 361 }, (_, a) => Sim.camLift(t, a));
    near(Math.max(...vals), Sim.CAM.lift, 1e-3);
    near(Math.min(...vals), 0, 1e-9);
  }
});

test('受け入れテストNo.6：ラックは端で止まり、逆回転で戻る', () => {
  const R = Sim.RACK;
  const end = Sim.rackState(R.maxAngle + 500);
  assert.equal(end.atEnd, true);
  near(end.x, R.travel);
  const back = Sim.rackState(end.angle - 90);
  assert.equal(back.atEnd, false);
  assert.ok(back.x < end.x);
});

test('ベルトの全長がピッチの整数倍になる軸間距離', () => {
  const pitch = 14;
  const D = Sim.fitCenterDistance(26, 44, 220, pitch);
  const L = Sim.openBeltPath(0, 26, D, 44, 0).length;
  near(L / pitch, Math.round(L / pitch), 1e-6);
  assert.ok(Math.abs(D - 220) < 10);
});

test('表示用の数値', () => {
  assert.equal(Sim.fmt(0.5), '0.5');
  assert.equal(Sim.fmt(2), '2');
  assert.equal(Sim.fmt(1 / 3), '0.33');
  assert.equal(Sim.fmt(-0.0001), '0');
});
