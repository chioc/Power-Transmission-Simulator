// 画面の動作確認（仕様書「7」の受け入れテスト No.1〜8・9a〜9c・10 を自動で操作する）
// 実行：npm run preview の後に node tests/e2e.js
// GAS 上ではなく、include を展開した dist/preview.html をブラウザで開いて確かめる。
'use strict';
const { chromium, devices } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');

const URL = 'file://' + path.join(__dirname, '..', 'dist', 'preview.html');

async function run(label, contextOptions) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(contextOptions);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'null' }).catch(() => ctx.grantPermissions(['clipboard-read', 'clipboard-write']));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const touch = !!contextOptions.hasTouch;
  const press = async (loc) => { if (touch) await loc.tap(); else await loc.click(); };
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const info = () => page.locator('[data-k="info"]').innerText();
  const setSlider = async (v) => {
    await page.locator('input[type=range]').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
  };
  const results = [];
  const check = async (no, fn) => {
    try { await fn(); results.push([no, 'OK']); } catch (e) { results.push([no, 'NG: ' + e.message.split('\n')[0]]); }
  };

  await page.goto(URL);

  await check('No.1 画面の移動', async () => {
    for (const [title, h] of [['③ 速度伝達比の計算', '③ 速度伝達比の計算'], ['⑤ カムの実験', '⑤ カムの実験'], ['⑥ 教科書の機構を見る', '⑥ 教科書の機構を見る'], ['⑦ まとめ課題', '⑦ まとめ課題']]) {
      await press(page.locator('.card-btn', { hasText: title }));
      assert.equal(await page.locator('h2').first().innerText(), h);
      await press(page.locator('#homeBtn'));
      assert.equal(await page.locator('h1').innerText(), '動力伝達・運動変換シミュレーター');
    }
  });

  await check('No.2 入力20歯・出力40歯で2回転', async () => {
    await press(page.locator('.card-btn', { hasText: '② 平歯車' }));
    const vals = await page.locator('[data-k="calcv"]').innerText();
    assert.match(vals, /速度伝達比\s*0\.5/);
    assert.match(vals, /30 回転\/分/);
    assert.match(vals, /2 N·m/);
    await setSlider(720);
    const t = await info();
    assert.match(t, /入力の回転\s*2 回転/);
    assert.match(t, /出力の回転\s*1 回転\s*反時計回り（入力と逆向き）/);
  });

  await check('No.3 中間歯車と歯数の入替', async () => {
    await press(page.locator('[data-set="idler"][data-val="true"]'));
    let vals = await page.locator('[data-k="calcv"]').innerText();
    assert.match(vals, /速度伝達比\s*0\.5/); assert.match(vals, /30 回転\/分/); assert.match(vals, /入力と同じ/);
    await setSlider(720);
    assert.match(await info(), /1 回転\s*時計回り（入力と同じ向き）/);
    await press(page.locator('[data-set="inTeeth"][data-val="40"]'));
    await press(page.locator('[data-set="outTeeth"][data-val="20"]'));
    vals = await page.locator('[data-k="calcv"]').innerText();
    assert.match(vals, /速度伝達比\s*2\b/); assert.match(vals, /120 回転\/分/); assert.match(vals, /0\.5 N·m/);
  });

  await check('No.4 計算画面への引き継ぎとヒント', async () => {
    await press(page.locator('[data-set="inTeeth"][data-val="20"]'));
    await press(page.locator('[data-set="outTeeth"][data-val="40"]'));
    await press(page.locator('[data-set="idler"][data-val="false"]'));
    await press(btn('次：③ 計算 →'));
    const set = await page.locator('.step').nth(1).innerText();
    assert.match(set, /入力の歯数\s*20 歯/); assert.match(set, /出力の歯数\s*40 歯/);
    await page.fill('#ansRatio', '2');
    await press(btn('確かめる'));
    assert.match(await page.locator('.feedback.ng').innerText(), /入力の歯数 ÷ 出力の歯数/);
    await page.fill('#ansRatio', '0.5');
    await page.fill('#ansRpm', '30');
    await press(btn('確かめる'));
    const ok = await page.locator('.feedback.ok').innerText();
    assert.match(ok, /20 ÷ 40 ＝ 0\.5/); assert.match(ok, /＝ 30 回転\/分/);
    await press(page.locator('.pager [data-go="gear2"]'));
    assert.equal(await page.locator('[data-set="outTeeth"][data-val="40"]').getAttribute('aria-pressed'), 'true');
  });

  await check('No.5 機構一覧の7種', async () => {
    await press(page.locator('#homeBtn'));
    await press(page.locator('.card-btn', { hasText: '⑥ 教科書の機構を見る' }));
    const names = await page.locator('.card-btn strong').allInnerTexts();
    assert.equal(names.length, 7);
    for (const n of names) {
      await press(page.locator('.card-btn', { hasText: n }));
      assert.ok((await page.locator('.question-box').innerText()).includes('観察の問い'));
      assert.match(await info(), /入力[\s\S]*出力/);
      await press(btn('▶ 再生'));
      await page.waitForTimeout(250);
      await press(btn('⏸ 一時停止'));
      const v = Number(await page.locator('input[type=range]').inputValue());
      assert.notEqual(v, 0, n + ' が回っていない');
      await setSlider(n === 'ラックとピニオン' ? -100 : 200);
      assert.equal(Number(await page.locator('input[type=range]').inputValue()), n === 'ラックとピニオン' ? -100 : 200);
      await press(page.locator('.pager [data-go="list"]'));
    }
  });

  await check('No.6 ラックの端・クランクスライダの往復', async () => {
    await press(page.locator('.card-btn', { hasText: 'ラックとピニオン' }));
    await press(btn('はじめの位置に戻す'));
    const max = await page.locator('input[type=range]').getAttribute('max');
    await setSlider(max);
    assert.match(await info(), /端に着いた/);
    const pos1 = await info();
    await press(btn('▶ 再生')); // 同じ向きには進まない
    await page.waitForTimeout(150);
    assert.equal(await info(), pos1);
    await setSlider(Number(max) - 120); // 手で逆向きに回す
    const t = await info();
    assert.doesNotMatch(t, /端に着いた/);
    assert.ok(Number(/(\d+) mm/.exec(t)[1]) < Number(/(\d+) mm/.exec(pos1)[1]), '戻っていない');
    // 再生でも端で止まる
    await press(btn('回す向き：時計回り'));
    await press(btn('▶ 再生'));
    await page.waitForTimeout(150);
    await press(btn('回す向き：反時計回り'));
    await page.waitForFunction(() => /端に着いた/.test(document.querySelector('[data-k="info"]').innerText), null, { timeout: 4000 });
    assert.ok(await btn('▶ 再生').isVisible(), '端で再生が止まっていない');
    // クランク・スライダ
    await press(page.locator('#homeBtn'));
    await press(page.locator('.card-btn', { hasText: '④ リンクの実験' }));
    await press(page.locator('[data-set="type"][data-val="slider"]'));
    const posAt = async (a) => { await setSlider(a); return Number(/スライダの位置\s*(\d+) mm/.exec(await info())[1]); };
    const p0 = await posAt(0), p180 = await posAt(180), p360 = await posAt(360);
    assert.equal(p0, p360); assert.equal(p180, 0); assert.ok(p0 > p180);
  });

  await check('No.7 クランク半径で範囲が変わる', async () => {
    const span = async () => { const t = await info(); return Number(/動く範囲は (\d+)mm|揺動の範囲は約 (\d+)°/.exec(t).slice(1).find(Boolean)); };
    await press(page.locator('[data-set="size"][data-val="small"]'));
    const s1 = await span();
    await press(page.locator('[data-set="size"][data-val="large"]'));
    const s2 = await span();
    assert.ok(s2 > s1, `スライダ ${s1}→${s2}`);
    await press(page.locator('[data-set="type"][data-val="rocker"]'));
    await press(page.locator('[data-set="size"][data-val="small"]'));
    const r1 = await span();
    for (let a = 0; a <= 360; a += 45) await setSlider(a); // 1回転させてもエラーにならない
    await press(page.locator('[data-set="size"][data-val="large"]'));
    const r2 = await span();
    assert.ok(r2 > r1, `レバー ${r1}→${r2}`);
  });

  await check('No.8 カム2種類', async () => {
    await press(btn('次：⑤ カムの実験 →'));
    const posAt = async (a) => { await setSlider(a); return /従動節の位置\s*(\d+) mm[\s\S]*「(.+)」/.exec(await info()).slice(1); };
    await press(page.locator('[data-set="type"][data-val="B"]'));
    const b1 = await posAt(130), b2 = await posAt(170);
    assert.equal(b1[0], b2[0]); assert.equal(b2[1], '同じ位置にとどまっている');
    await press(page.locator('[data-set="type"][data-val="A"]'));
    const a1 = await posAt(130), a2 = await posAt(170);
    assert.notEqual(a1[0], a2[0]);
  });

  await check('No.9a 小テストの正誤と理由', async () => {
    await press(page.locator('#homeBtn'));
    await press(page.locator('.card-btn', { hasText: '⑦ まとめ課題' }));
    assert.equal(await page.locator('.fq').count(), 4);
    await press(page.locator('[data-fq="0"][data-opt="1"]'));   // 問1 正答
    await press(page.locator('[data-fq="1"][data-opt="1"]'));   // 問2「両方小さくなる」（誤答）
    await press(page.locator('[data-fq="2"][data-opt="2"]'));   // 問3 正答（問4は未解答）
    await press(btn('答え合わせ'));
    const items = page.locator('.fq');
    assert.match(await items.nth(0).innerText(), /○ 正解[\s\S]*理由：チェーン/);
    const q2 = await items.nth(1).innerText();
    assert.match(q2, /× 不正解/); assert.match(q2, /回転数は半分/); assert.match(q2, /理想トルクは2倍/);
    assert.match(await items.nth(2).innerText(), /○ 正解/);
    assert.match(await items.nth(3).innerText(), /未解答/);
    assert.match(await page.locator('[data-k="fqScore"]').innerText(), /4問中 2問 正解（未解答 1問）/);
  });

  await check('No.9b 未解答のまま記入し、実験・観察に戻っても残る', async () => {
    await page.fill('#tLearned', 'チェーンの観察テスト');
    await page.fill('#tReason', '自転車のテスト');
    // 問4（未解答）の参照先：⑤カム
    await press(page.locator('[data-ref="3"]'));
    assert.equal(await page.locator('h2').first().innerText(), '⑤ カムの実験');
    await press(page.locator('#summaryBackBtn'));
    assert.equal(await page.inputValue('#tLearned'), 'チェーンの観察テスト');
    assert.equal(await page.inputValue('#tReason'), '自転車のテスト');
    assert.equal(await page.locator('[data-fq="1"][data-opt="1"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-fq="0"][data-opt="1"]').getAttribute('aria-pressed'), 'true');
    // 問1の参照先：⑥、問3の参照先：④（クランク・スライダ）
    await press(page.locator('[data-ref="0"]'));
    assert.equal(await page.locator('h2').first().innerText(), '⑥ 教科書の機構を見る');
    await press(page.locator('#summaryBackBtn'));
    await press(page.locator('[data-ref="2"]'));
    assert.equal(await page.locator('[data-set="type"][data-val="slider"]').getAttribute('aria-pressed'), 'true');
    await press(page.locator('#summaryBackBtn'));
    assert.equal(await page.inputValue('#tReason'), '自転車のテスト');
  });

  await check('No.9c 2欄をコピーできる・氏名入力や提出がない', async () => {
    assert.equal(await page.locator('input[type=text], input[type=email]').count(), 0, '氏名などの入力欄がない');
    await page.fill('#tLearned', 'チェーンがスプロケットの歯にかみ合って進み、離れた軸が同じ向きに回った');
    await page.fill('#tReason', '自転車では、チェーンとスプロケットを使って、ペダル側の回転を離れた後輪に伝えている。');
    await press(page.locator('.hint summary'));
    assert.ok(await page.locator('.hint p').isVisible(), '記述例のヒントが開く');
    await press(btn('まとめてコピー'));
    await page.waitForFunction(() => document.querySelector('[data-k="copyMsg"]').textContent !== '', null, { timeout: 5000 });
    assert.match(await page.locator('[data-k="copyMsg"]').innerText(), /コピーしました/);
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /生活の中で使われる理由\n自転車では/);
    const all = await page.inputValue('#tAll');
    assert.match(all, /試して分かったこと\nチェーンがスプロケット/);
    assert.match(all, /生活の中で使われる理由\n自転車では/);
    assert.doesNotMatch(all, /問1|正解/, 'コピーに小テストの結果は含めない');
  });

  await check('No.10 操作部と図が重ならない・計算値が低速で変わらない', async () => {
    for (const s of ['gear2', 'link', 'cam']) {
      await page.evaluate(s => window.__sim.go(s), s);
      const before = s === 'gear2' ? await page.locator('[data-k="calcv"]').innerText() : '';
      await press(page.locator('[data-act="slow"]'));
      assert.equal(await page.locator('[data-act="slow"]').getAttribute('aria-pressed'), 'true');
      if (s === 'gear2') assert.equal(await page.locator('[data-k="calcv"]').innerText(), before);
      await press(page.locator('[data-act="play"]'));
      await page.waitForTimeout(200);
      await press(page.locator('[data-act="play"]'));
      await setSlider(90);
      await press(page.locator('[data-act="reset"]'));
      assert.equal(await page.locator('input[type=range]').inputValue(), '0');
      await press(page.locator('[data-act="slow"]'));
      // 図と操作部の重なり、横スクロールの有無
      const r = await page.evaluate(() => {
        const box = (el) => el.getBoundingClientRect();
        const svg = box(document.querySelector('.sim-svg'));
        const ctrls = [...document.querySelectorAll('.controls .btn, input[type=range], .sim-info')].map(box);
        const overlap = ctrls.some(c => c.left < svg.right - 1 && c.right > svg.left + 1 && c.top < svg.bottom - 1 && c.bottom > svg.top + 1);
        return { overlap, hscroll: document.documentElement.scrollWidth > window.innerWidth };
      });
      assert.equal(r.overlap, false, s + ' で図と操作部が重なる');
      assert.equal(r.hscroll, false, s + ' で横にはみ出す');
    }
  });

  assert.deepEqual(errors, [], 'ページのエラー：' + errors.join(' / '));
  await browser.close();
  console.log('\n[' + label + ']');
  for (const [no, r] of results) console.log('  ' + no + '：' + r);
  return results.every(([, r]) => r === 'OK');
}

(async () => {
  const pc = await run('PC（1366×768・マウス）', { viewport: { width: 1366, height: 768 } });
  const ipadL = await run('iPad 相当（横向き・タッチ）', devices['iPad (gen 7) landscape']);
  const ipadP = await run('iPad 相当（縦向き・タッチ）', devices['iPad (gen 7)']);
  process.exit(pc && ipadL && ipadP ? 0 : 1);
})();
