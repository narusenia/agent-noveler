// 動作確認: `pnpm review` を起動した状態で、検証用の作品を作って赤を入れ、結果を確かめて片づける。
// 使い方: node e2e/smoke.mjs [スクリーンショットの出力先]
// 見本作品（examples/sample-work）の序章を examples/zz-shosai-test に写して使う。見本の原稿は触らない。
// サーバーは既定の作品フォルダ（examples/）で起動しておく。URL は SHOSAI_URL で変えられる。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, devices, webkit } from "playwright-core";

const work = "zz-shosai-test";
const base = process.env.SHOSAI_URL ?? "http://localhost:13002";
const out = process.argv[2] ?? ".";
const pkgs = path.resolve(import.meta.dirname, "../../../examples");
const sample = "sample-work";
const root = path.join(pkgs, work);
const file = path.join(root, "manuscript/vol1/00-prologue.kym.txt");
const chapUrl = `${base}/${work}/vol1/00-prologue`;
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.copyFileSync(path.join(pkgs, sample, "manuscript/vol1/00-prologue.kym.txt"), file);
fs.writeFileSync(path.join(root, "package.json"), '{"description":"検証用"}');
// 組版の設定（目次と序章だけ）
fs.writeFileSync(
  path.join(root, "book.config.js"),
  `export default (vol) => ({ title: "検証用", language: "ja", readingProgression: "rtl", theme: "@vivliostyle/theme-epub3j@^1.1.0",
    vfm: { hardLineBreaks: true }, toc: { title: "目次" }, entry: [{ rel: "contents" }, \`manuscript/\${vol}/00-prologue.kym.md\`] });`,
);
process.on("exit", () => fs.rmSync(root, { recursive: true, force: true }));
const review = path.join(root, "review/vol1.json");
const read = () => fs.readFileSync(file, "utf8");
const entries = () => JSON.parse(fs.readFileSync(review, "utf8")).entries;
const byKind = (k) => entries().find((e) => e.kind === k);
const editJson = (f) => {
  const rv = JSON.parse(fs.readFileSync(review, "utf8"));
  f(rv.entries);
  fs.writeFileSync(review, JSON.stringify(rv, null, 2));
};

// Chromium で iPhone の大きさとタッチを真似る（defaultBrowserType は Chromium の文脈に渡さない）
const { defaultBrowserType: _, ...iphone } = devices["iPhone 13"];
const phoneOpts = { ...iphone, viewport: { width: 390, height: 844 } };
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

// 前の版のハッシュで来たら、新しい URL に置き換える
await page.goto(`${base}/#/${work}/vol1/00-prologue.kym.txt`);
await page.waitForSelector(".reader p[data-line]");
assert.equal(page.url(), chapUrl);

/** 本文の中の文字列を選択する（ドラッグの代わり）。 */
const select = (p, text, nth = 0) =>
  p.evaluate(
    ([text, nth]) => {
      const w = document.createTreeWalker(document.querySelector(".reader"), NodeFilter.SHOW_TEXT);
      let n = 0;
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        const i = t.textContent.indexOf(text);
        if (i >= 0 && n++ === nth) {
          const r = document.createRange();
          r.setStart(t, i);
          r.setEnd(t, i + text.length);
          getSelection().removeAllRanges();
          getSelection().addRange(r);
          return true;
        }
      }
      throw new Error(`not found: ${text}`);
    },
    [text, nth],
  );
const toolbar = (p = page) => p.waitForSelector('[role="toolbar"][aria-label="赤"]', { timeout: 2000 });
const settle = (p = page) => p.waitForTimeout(400);
const dialog = '[role="dialog"]';
const item = (id) => page.locator(`#item-${id}`);
const btn = (id, label) => item(id).getByRole("button", { name: label, exact: true });
/** 組版の見えているページに段落が出るまで待つ */
const waitTypeset = (p) =>
  p.waitForFunction(
    () =>
      [...(document.querySelector('iframe[title="組版"]')?.contentDocument?.querySelectorAll("[data-vivliostyle-page-container]") ?? [])].some(
        (x) => x.style.display !== "none" && x.querySelector("[data-line]"),
      ),
    null,
    { timeout: 60000 },
  );
const toastText = () => page.locator("[data-base-ui-toast-viewport], [role=region]").last().innerText();

// 赤は原稿を変えず、未適用（open）の指摘として残る
const src0 = read();
const last = () => entries().at(-1);

// 差し替え（入力欄には記法のボタンがある）
await select(page, "霧が出ていた");
await toolbar();
await page.keyboard.press("r");
await page.waitForSelector(`${dialog} input`);
assert.ok(await page.locator(dialog).getByRole("button", { name: "ルビ" }).count(), "markup buttons");
await page.fill(`${dialog} input`, "靄がかかっていた");
await page.keyboard.press("Enter");
await settle();
assert.equal(read(), src0);
assert.deepEqual([last().kind, last().status, last().before, last().after], ["replace", "open", "霧が出ていた", "靄がかかっていた"]);
assert.match(await page.locator("[data-save]").getAttribute("data-save"), /saved/);

// ルビ
await select(page, "港町");
await toolbar();
await page.keyboard.press("y");
await page.fill(`${dialog} input`, "みなとまち");
await page.keyboard.press("Enter");
await settle();
assert.deepEqual([last().kind, last().status, last().after], ["ruby", "open", "｜港町《みなとまち》"]);

// トル
await select(page, "岬の");
await toolbar();
await page.keyboard.press("d");
await settle();
assert.equal(read(), src0);
assert.deepEqual([last().kind, last().status, last().after], ["delete", "open", ""]);

// トルは ⌘Z で取り消せる（記録ごと消える）
const n0 = entries().length;
await page.keyboard.press("Meta+z");
await settle();
assert.equal(entries().length, n0 - 1, "undo removes the delete");
await select(page, "岬の");
await toolbar();
await page.keyboard.press("d");
await settle();

// 提案（空のままでは決定を押せない）
await select(page, "少年は灯台の下に腰をおろして");
await toolbar();
await page.keyboard.press("s");
await page.waitForSelector(`${dialog} textarea`);
assert.ok(await page.locator(dialog).getByRole("button", { name: "決定" }).isDisabled(), "empty note cannot be saved");
await page.fill(`${dialog} textarea`, "腰をおろす理由を一言");
await page.keyboard.press("Meta+Enter");
await settle();
const sug = last();
assert.deepEqual([sug.kind, sug.status], ["suggest", "open"]);

// 挿入（文字間をクリック）
const span = page.locator(".reader p[data-line] span", { hasText: "少年は鍵を握っていた" }).first();
await span.evaluate((el) => {
  const r = document.querySelector(".reader");
  const a = el.getBoundingClientRect();
  const b = r.getBoundingClientRect();
  r.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
});
await settle();
const box = await span.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + 4);
await toolbar();
await page.keyboard.press("i");
await page.fill(`${dialog} input`, "ずっと");
await page.keyboard.press("Enter");
await settle();
assert.equal(read(), src0);
assert.deepEqual([last().kind, last().status, last().quote, last().after], ["insert", "open", "", "ずっと"]);

// 傍点
await select(page, "冷たさだけ");
await toolbar();
await page.keyboard.press("e");
await settle();
assert.deepEqual([last().kind, last().status, last().after], ["emphasis", "open", "《《冷たさだけ》》"]);

// 未適用の赤が本文に描かれる。印は Tab で入れる（roving tabindex）
for (const c of [".pend-del", ".pend-ins", ".pend-insert", ".pend-ruby", ".pend-em", ".badge"])
  assert.ok(await page.locator(`.reader ${c}`).count(), `${c} is drawn`);
assert.equal(await page.locator('.reader [data-entry][tabindex="0"]').count(), 1);

// 清書は読むだけ: 赤を出さない（⌘K のパレットから切り替える）
await page.keyboard.press("Meta+k");
await page.keyboard.type("清書");
await page.keyboard.press("Enter");
await settle();
assert.equal(await page.locator(".reader .pend-del").count(), 0, "clean view hides reds");
await page.keyboard.press("Meta+k");
await page.keyboard.type("赤を出す");
await page.keyboard.press("Enter");
await settle();
assert.ok(await page.locator(".reader .pend-del").count());

// スクリーンショット（PC とスマホ、ライトとダーク）
if (process.argv[2]) await shots();

// 印を押すと、その指摘に注目し、URL に残る。戻るで外れる
await page.locator(".reader .badge").first().click();
await page.waitForURL(/\?e=R-\d+/);
assert.ok(await page.locator(`#item-${sug.id}`).count());
await page.goBack();
await page.waitForURL(chapUrl);

// j/k で指摘を前後する
await page.keyboard.press("j");
await page.waitForURL(/\?e=R-\d+/);
await page.keyboard.press("Escape");

// 1 件だけ適用し、取り消す
const rep = byKind("replace");
await page.getByRole("tab", { name: /赤/ }).click();
await btn(rep.id, "適用").click();
await settle();
assert.match(read(), /海に、靄がかかっていた。/);
assert.equal(byKind("replace").status, "done");
await page.keyboard.press("Meta+z");
await settle();
assert.equal(read(), src0, "undo puts the text back");
assert.equal(byKind("replace").status, "open");
await btn(rep.id, "適用").click();
await settle();

// 外で元の字が変わった赤は適用できず、open のまま残る。ほかは「すべて適用」で件数を確かめてから入る
fs.writeFileSync(file, read().replace("冷たさだけ", "冷たいだけ"));
await page.waitForTimeout(800);
await page.getByRole("button", { name: /すべて適用/ }).click();
await page.getByRole("button", { name: "4 件を適用" }).click();
await settle();
assert.match(read(), /｜港町《みなとまち》の西/);
assert.doesNotMatch(read(), /岬の坂/);
assert.match(read(), /ずっと/);
assert.doesNotMatch(read(), /《《冷/);
assert.equal(byKind("emphasis").status, "open");
assert.equal(byKind("ruby").status, "done");
assert.match(await page.getByText(/3 件適用した。適用できない/).first().innerText(), /適用できない: R-\d+（/);

// 消した指摘は、トーストの「取り消す」で同じ ID のまま戻る
await page.getByRole("tab", { name: /すべて/ }).click();
await btn(sug.id, "消す").click();
await settle();
assert.ok(!entries().some((e) => e.id === sug.id));
await page.locator(".toast", { hasText: /^消した/ }).getByRole("button", { name: "取り消す" }).click();
await settle();
assert.equal(entries().find((e) => e.id === sug.id)?.body, "腰をおろす理由を一言");

// 迷子: 外で本文を書き換えると、提案が迷子になる
fs.writeFileSync(file, read().replace("少年は灯台の下に腰をおろして", "少年は桟橋の端にしゃがんで"));
await page.waitForTimeout(800);
await page.getByRole("tab", { name: /未処理/ }).click();
assert.ok(await item(sug.id).getByText("迷子").count(), "lost suggestion is shown");

// 付け直す: 本文を選んで、一覧の「付け直す」
await select(page, "桟橋の端に");
await toolbar();
await btn(sug.id, "付け直す").click();
await settle();
assert.equal(entries().find((e) => e.id === sug.id).quote, "桟橋の端に");

// 質問に返事をすると、やり取りに積まれて open に戻る
editJson((es) => Object.assign(es.find((e) => e.id === sug.id), { status: "question", reply: "どんな理由？" }));
await page.waitForTimeout(800);
await item(sug.id).getByLabel("返事").fill("疲れているから");
await btn(sug.id, "送る").click();
await settle();
const answered = entries().find((e) => e.id === sug.id);
assert.equal(answered.status, "open");
assert.deepEqual(answered.thread.map((m) => [m.by, m.body]), [["author", "疲れているから"]]);

// 読んだ後にほかで書き換わった指摘への書き込みは 409
const stale = await page.evaluate(
  ([work, id]) =>
    fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work, vol: "vol1", entry: { id, body: "x" }, base: "1999-01-01T00:00:00.000Z" }) }).then((r) => r.status),
  [work, sug.id],
);
assert.equal(stale, 409);

// 前の版の赤（applied、もう原稿に入っている）はイキで戻せる
editJson((es) => Object.assign(es.find((e) => e.kind === "replace"), { status: "applied", quote: "靄がかかっていた" }));
await page.waitForTimeout(800);
await page.getByRole("tab", { name: /すべて/ }).click();
await btn(rep.id, "イキ").click();
await settle();
assert.match(read(), /海に、霧が出ていた。/);
assert.equal(byKind("replace").status, "reverted");

// md が生成されている
assert.match(fs.readFileSync(review.replace(/json$/, "md"), "utf8"), /## 未処理/);

// 検索: 当たりを開くと、その語が選択されて赤入れの道具が出る
await page.keyboard.press("/");
await page.fill(".search-input", "灯台");
await page.waitForSelector(".hit");
await page.keyboard.press("Enter");
await toolbar();
assert.equal(await page.evaluate(() => getSelection().toString()), "灯台");

// キー一覧
await page.keyboard.press("Escape");
await page.keyboard.press("?");
await page.getByRole("dialog", { name: "キー一覧" }).waitFor();
await page.keyboard.press("Escape");

// 文字の大きさは端末に覚える
const fs0 = await page.evaluate(() => getComputedStyle(document.querySelector(".reader > .text")).fontSize);
await page.keyboard.press("Meta+=");
await settle();
assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector(".reader > .text")).fontSize), fs0);
assert.ok(await page.evaluate(() => localStorage.getItem("shosai.font")));

// テーマ: 上のバーの「表示」から手で選び、覚える
await page.getByRole("button", { name: "表示", exact: true }).click();
await page.getByRole("radio", { name: "ダーク" }).click();
assert.ok(await page.evaluate(() => document.documentElement.classList.contains("dark")));
assert.equal(await page.evaluate(() => localStorage.getItem("shosai.theme")), "dark");
await page.keyboard.press("Escape");
await page.evaluate(() => localStorage.removeItem("shosai.theme"));

// 読書位置は作品ごとに一つ。`/<作品>` で続きから開く
await page.goto(`${base}/${work}`);
await page.waitForURL(chapUrl);
assert.ok(await page.evaluate((w) => JSON.parse(localStorage.getItem("shosai.read"))[w], work));

// 本棚: 作品の本と未処理の件数
await page.goto(`${base}/`);
await page.locator(`a.book[href="/${work}"]`).waitFor();
assert.match(await page.locator(`a.book[href="/${work}"]`).innerText(), /検証用/);

// 声の色: syuki style heat の答え（読むだけなので見本の作品を使う。syuki.yml の無い作品は 404）
const heat = await page.evaluate(() => fetch("/api/style?work=sample-work&file=vol1/01.kym.txt").then((r) => r.json()));
assert.ok(heat.paragraphs.every((p) => "run" in p && "drop" in p), "style api returns runs and drops");
assert.equal(await page.evaluate((w) => fetch(`/api/style?work=${w}&file=vol1/00-prologue.kym.txt`).then((r) => r.status), work), 404);
await page.goto(`${base}/sample-work/vol1/01`);
await page.waitForSelector(".reader p[data-line]");
assert.equal(await page.locator(".reader p.heat-run").count(), 0, "heat is off by default");
await page.getByRole("button", { name: "重ねて表示" }).click();
await page.getByRole("menuitemcheckbox", { name: "声の色" }).click();
await page.waitForSelector(".reader p.heat-run");
const runLines = await page.$$eval(".reader p.heat-run", (ps) => ps.map((p) => Number(p.dataset.line)));
assert.ok(runLines.every((n) => heat.paragraphs.find((p) => p.line === n)?.run), "tinted lines match the api");
await ctx.close();

// スマホ: 読む時はタップで道具を出さない。選ぶと下のバーが赤の道具に入れ替わる。指摘はシート
const phone = await (await browser.newContext(phoneOpts)).newPage();
phone.on("pageerror", (e) => console.error("pageerror:", e.message));
await phone.goto(chapUrl);
await phone.waitForSelector(".reader p[data-line]");
// 赤の印に当たると一覧が開くので、印の無い所をタップする
const plainSpot = () =>
  phone.evaluate(() => {
    for (let y = 300; y < 700; y += 20) for (let x = 120; x < 300; x += 15) if (!document.elementFromPoint(x, y)?.closest("[data-entry], .badge, a, button")) return [x, y];
    return [195, 400];
  });
const [tx, ty] = await plainSpot();
await phone.touchscreen.tap(tx, ty);
await phone.waitForTimeout(400);
assert.equal(await phone.locator('[role="toolbar"][aria-label="赤"]').count(), 0, "reading tap shows no tools");
// 読む時のタップは上下のバーを出し入れする。出し入れで本文を組み直さない（最初の段落の位置が変わらない）
const firstBox = () => phone.evaluate(() => JSON.stringify(document.querySelector(".reader p[data-line]:not(.blank)").getBoundingClientRect()));
const barsShown = await firstBox();
assert.ok(await phone.locator("header.-translate-y-16").count(), "bars hidden after tap");
await phone.touchscreen.tap(tx, ty);
await phone.waitForTimeout(400);
assert.equal(await firstBox(), barsShown, "hiding the bars does not reflow the text");
// ページを送っても、左端で行の途中が見えない（切れた列は隠し、次のページはその列から始める）
const exposed = () =>
  phone.evaluate(() => {
    const r = document.querySelector(".reader");
    const left = r.getBoundingClientRect().left;
    const cut = parseFloat(document.querySelector(".page-cut")?.style.width || "0");
    const range = document.createRange();
    let n = 0;
    for (const p of r.querySelectorAll("p[data-line]")) {
      range.selectNodeContents(p);
      for (const c of range.getClientRects()) if (c.width && c.left < left && c.right > left + cut + 1) n++;
    }
    return n;
  });
const scrollAt = () => phone.evaluate(() => document.querySelector(".reader").scrollLeft);
for (let i = 0; i < 3; i++) {
  const s0 = await scrollAt();
  await phone.keyboard.press("ArrowLeft");
  await phone.waitForTimeout(250);
  assert.ok((await scrollAt()) < s0, "page turned");
  assert.equal(await exposed(), 0, `no half column at the left edge (page ${i + 2})`);
}
// 縦書きの本なので、指を左から右へ動かす（右へ払う）と次のページ、右から左へ動かすと前のページ
const readerSwipe = (from, to) =>
  phone.evaluate(
    ([a, b]) => {
      const r = document.querySelector(".reader");
      const t = (x) => [new Touch({ identifier: 1, target: r, clientX: x, clientY: 400 })];
      r.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: t(a), changedTouches: t(a) }));
      r.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: t(b) }));
    },
    [from, to],
  );
let sw = await scrollAt();
await readerSwipe(100, 300);
await phone.waitForTimeout(250);
assert.ok((await scrollAt()) < sw, "swiping right turns to the next page");
sw = await scrollAt();
await readerSwipe(300, 100);
await phone.waitForTimeout(250);
assert.ok((await scrollAt()) > sw, "swiping left turns to the previous page");
await select(phone, "少年は鍵");
await toolbar(phone);
assert.ok(await phone.locator('[role="toolbar"] >> text=差替').count());
await phone.evaluate(() => getSelection().removeAllRanges());
await phone.getByRole("button", { name: "やめる" }).click();
await phone.getByRole("button", { name: /指摘/ }).click();
await phone.waitForURL(/s=notes/);
await phone.getByRole("dialog", { name: "指摘" }).waitFor();
await phone.goBack();
await phone.waitForURL(chapUrl);
// 赤入れにすると、タップで挿入点が置ける
await phone.getByRole("button", { name: "赤入れ" }).click();
await phone.touchscreen.tap(195, 400);
await phone.waitForTimeout(600);
assert.ok(await phone.locator(".reader .caret").count(), "caret is placed");

// スマホの組版: ⋯ から開き、左右のスワイプでページを送る。バーを隠しても組み直さない
await phone.getByRole("button", { name: "やめる" }).click();
await phone.getByRole("button", { name: "赤入れ" }).click();
await phone.getByRole("button", { name: "その他" }).click();
await phone.getByRole("menuitem", { name: "組版" }).click();
await phone.waitForURL(/view=typeset/);
const pframe = () => phone.frames().find((f) => f !== phone.mainFrame());
await waitTypeset(phone);
await phone.waitForTimeout(600);
const pLabel = () => phone.locator('[aria-label="ページ"]').innerText();
const pl0 = await pLabel();
const swipe = (from, to) =>
  pframe().evaluate(
    ([a, b]) => {
      const t = (x) => [new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 300 })];
      document.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: t(a), changedTouches: t(a) }));
      document.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: t(b) }));
    },
    [from, to],
  );
// 右へ払うと次のページ、左へ払うと前のページ
await swipe(100, 300);
await phone.waitForFunction((l) => document.querySelector('[aria-label="ページ"]').textContent !== l, pl0);
const pl1 = await pLabel();
assert.ok(parseInt(pl1) > parseInt(pl0), `swiping right goes to the next page (${pl0} -> ${pl1})`);
await swipe(300, 100);
await phone.waitForFunction((l) => document.querySelector('[aria-label="ページ"]').textContent !== l, pl1);
assert.ok(parseInt(await pLabel()) < parseInt(pl1), "swiping left goes back");
const stageBox = () => phone.locator('iframe[title="組版"]').evaluate((f) => JSON.stringify(f.getBoundingClientRect()));
const sb0 = await stageBox();
await pframe().evaluate(() => {
  const t = [new Touch({ identifier: 2, target: document.body, clientX: 200, clientY: 300 })];
  document.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: t, changedTouches: t }));
  document.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: t }));
});
await phone.waitForTimeout(400);
assert.ok(await phone.locator("header.-translate-y-16").count(), "tap in typeset hides the bars");
assert.equal(await stageBox(), sb0, "hiding the bars does not resize the typeset stage");
await readingFlow();
await typesetFlow();
await syukiFlow();
await browser.close();

// WebKit（iPhone）: キャレットを置いて別の所をタップしても、横スクロールが右端に戻らない（WebKit が入っている時だけ）
let wk = null;
try {
  wk = await webkit.launch();
} catch {
  console.log("skip: webkit is not installed");
}
if (wk) {
  const ip = await (await wk.newContext({ ...devices["iPhone 13"] })).newPage();
  await ip.goto(chapUrl);
  await ip.waitForSelector(".reader p[data-line]");
  await ip.getByRole("button", { name: "赤入れ" }).click();
  await ip.evaluate(() => {
    const r = document.querySelector(".reader");
    r.scrollLeft -= r.clientWidth * 2;
  });
  await ip.waitForTimeout(400);
  const left = () => ip.evaluate(() => document.querySelector(".reader").scrollLeft);
  const before = await left();
  await ip.touchscreen.tap(195, 340);
  await ip.waitForTimeout(600);
  await ip.touchscreen.tap(120, 340);
  await ip.waitForTimeout(600);
  assert.ok(Math.abs((await left()) - before) <= 1, `scrollLeft kept (${before} -> ${await left()})`);
  await wk.close();
}

console.log("smoke ok");

/** 組版（PC）: 開く、ページ送り、赤入れ⇄組版で同じ段落、保存で組み直し。見本の vol1 で組む時間も測る */
async function typesetFlow() {
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await c.newPage();
  p.on("pageerror", (e) => console.error("pageerror:", e.message));
  const frame = () => p.frames().find((f) => f !== p.mainFrame());
  const label = () => p.locator('[aria-label="ページ"]').innerText();
  /** 見えているページにある段落の行番号 */
  const shownLines = () =>
    frame().evaluate(() =>
      [...document.querySelectorAll("[data-vivliostyle-page-container]")]
        .filter((x) => x.style.display !== "none")
        .flatMap((x) => [...x.querySelectorAll("[data-line]")].map((e) => Number(e.dataset.line))),
    );
  const readerFirst = () =>
    p.evaluate(() => {
      const r = document.querySelector(".reader");
      const right = r.getBoundingClientRect().right - 40;
      return Number([...r.querySelectorAll("p[data-line]:not(.blank)")].find((x) => x.getBoundingClientRect().left < right - 4)?.dataset.line);
    });

  await p.goto(chapUrl);
  await p.waitForSelector(".reader p[data-line]");
  await p.waitForTimeout(400);
  await p.keyboard.press("ArrowLeft");
  await p.keyboard.press("ArrowLeft");
  await p.waitForTimeout(300);
  const l0 = await readerFirst();
  // 赤入れ → 組版: 同じ段落のページを開く
  await p.getByRole("button", { name: "組版", exact: true }).click();
  await p.waitForURL(/view=typeset/);
  await waitTypeset(p);
  await p.waitForFunction(() => /^\d/.test(document.querySelector('[aria-label="ページ"]')?.textContent ?? ""));
  await p.waitForTimeout(500);
  assert.ok((await shownLines()).includes(l0), `typeset opens the page of line ${l0}`);
  assert.match(await label(), /^\d+$/, "before any whole-volume layout, only the current page is shown");
  // ページ送り（組版の中にフォーカスがあっても効く）
  const before = await shownLines();
  await p.locator('iframe[title="組版"]').click({ position: { x: 5, y: 5 } });
  await p.keyboard.press("ArrowLeft");
  await p.waitForFunction((l) => document.querySelector('[aria-label="ページ"]').textContent !== l, await label());
  await p.waitForTimeout(400);
  let after = await shownLines();
  assert.ok(after.length && after[0] > before[0], "← shows later paragraphs");
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(600);
  assert.ok((await shownLines())[0] < after[0], "→ goes back");
  await p.keyboard.press("ArrowLeft");
  await p.waitForTimeout(600);
  after = await shownLines();
  // 保存で組み直し、位置を保つ
  const src = read();
  const lines = src.split("\n");
  const target = after[0];
  lines[target - 1] += "【組み直しの印】";
  fs.writeFileSync(file, lines.join("\n"));
  await p.waitForFunction(
    () => [...(document.querySelector('iframe[title="組版"]').contentDocument?.querySelectorAll("[data-vivliostyle-page-container]") ?? [])].some((x) => x.style.display !== "none" && x.textContent.includes("【組み直しの印】")),
    null,
    { timeout: 15000 },
  );
  assert.equal((await shownLines())[0], target, "re-typeset keeps the page");
  fs.writeFileSync(file, src);
  await p.waitForTimeout(1500);
  // 組版 → 赤入れ: 同じ段落を開く
  await p.getByRole("button", { name: "赤入れ", exact: true }).click();
  await p.waitForSelector(".reader p[data-line]");
  await p.waitForTimeout(400);
  assert.equal(await readerFirst(), target, "reader opens the same paragraph");
  assert.ok(!p.url().includes("view="), "url drops the typeset view");

  // 目次（巻の頭）のノンブルは 1。目次を開くと巻全体を組み、章のページ番号を埋める。総ページ数を覚える
  await p.getByRole("button", { name: "組版", exact: true }).click();
  await waitTypeset(p);
  await p.getByRole("button", { name: "目次" }).click();
  await p.getByRole("menuitem", { name: "目次" }).click();
  await p.waitForFunction(() => document.querySelector('[aria-label="ページ"] [data-total="final"]'), null, { timeout: 60000 });
  await p.waitForTimeout(500);
  const tocPage = await frame().evaluate(() =>
    [...document.querySelectorAll("[data-vivliostyle-page-container]")].find((x) => x.style.display !== "none" && x.querySelector("#toc")).innerText.trim(),
  );
  assert.match(await label(), /^1 \/ \d+$/, "the toc is page 1");
  assert.match(tocPage, /\s1$/, "the toc page's folio is 1");
  assert.ok(!tocPage.includes("??"), "toc page numbers are filled after the whole volume is laid out");
  await p.reload();
  await waitTypeset(p);
  await p.waitForTimeout(500);
  assert.equal(await p.locator('[aria-label="ページ"] .opacity-50').count(), 1, "the remembered total is shown faintly until laid out again");

  // 見本の vol1 で時間を測る（読むだけ）
  const t0 = Date.now();
  await p.goto(`${base}/sample-work/vol1/01?view=typeset`);
  await waitTypeset(p);
  const first = Date.now() - t0;
  const t1 = Date.now();
  await p.getByRole("button", { name: "巻全体を組む" }).click();
  await p.waitForFunction(() => document.querySelector('[aria-label="ページ"] [data-total="final"]'), null, { timeout: 300000 });
  console.log(`typeset sample vol1: first page ${first} ms, whole volume ${Date.now() - t1} ms (${await label()})`);
  await c.close();
}

/** スマホの読書の見方: 既定で読書、紙の色、バーの出し入れと向きの変化で位置を保つ、本番への切り替え */
async function readingFlow() {
  const tap = () =>
    pframe().evaluate(() => {
      const t = [new Touch({ identifier: 3, target: document.body, clientX: 200, clientY: 300 })];
      document.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: t, changedTouches: t }));
      document.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: t }));
    });
  /** 見えているページの最初の段落の行番号と位置 */
  const firstPara = () =>
    pframe().evaluate(() => {
      const pg = [...document.querySelectorAll("[data-vivliostyle-page-container]")].find((x) => x.style.display !== "none");
      const el = pg?.querySelector("[data-line]");
      return el && { line: Number(el.dataset.line), box: JSON.stringify(el.getBoundingClientRect()) };
    });
  const pageBox = () =>
    pframe().evaluate(() => {
      const pg = [...document.querySelectorAll("[data-vivliostyle-page-container]")].find((x) => x.style.display !== "none");
      const vp = document.getElementById("vp");
      return { w: pg.getBoundingClientRect().width, h: pg.getBoundingClientRect().height, vw: vp.clientWidth, vh: vp.clientHeight };
    });
  // スマホの既定は読書の見方。ページは組版の領域いっぱい（灰色の余白が無い）
  assert.ok(await phone.locator(".reading-stage").count(), "phone opens the typeset in reading mode");
  let pb = await pageBox();
  assert.ok(Math.abs(pb.w - pb.vw) <= 1 && Math.abs(pb.h - pb.vh) <= 1, `the page fills the stage (${JSON.stringify(pb)})`);
  // バーの出し入れで最初の段落の位置が変わらない
  const f0 = await firstPara();
  await tap();
  await phone.waitForTimeout(400);
  assert.equal(await phone.locator("header.-translate-y-16").count(), 0, "tap shows the bars again");
  assert.deepEqual(await firstPara(), f0, "showing the bars keeps the first paragraph in place");
  await tap();
  await phone.waitForTimeout(400);
  assert.deepEqual(await firstPara(), f0, "hiding the bars keeps the first paragraph in place");
  await tap();
  await phone.waitForTimeout(400);
  // 数ページ進めてから色を変えても、組み直さず、ページ番号と最初の段落が変わらない（序章は短いので見本の第一章を読むだけで使う）
  await phone.goto(`${base}/sample-work/vol1/01?view=typeset&mode=reading`);
  await waitTypeset(phone);
  await phone.waitForTimeout(1000);
  for (let i = 0; i < 3; i++) {
    await phone.keyboard.press("ArrowLeft");
    await phone.waitForTimeout(250);
  }
  await phone.waitForTimeout(800);
  const at10 = { label: await pLabel(), first: await firstPara() };
  assert.ok(parseInt(at10.label) >= 3, `moved a few pages (${at10.label})`);
  // 組み直すと core はページを作り直すので、印を付けたページが残っていれば組み直していない
  await pframe().evaluate(() => ([...document.querySelectorAll("[data-vivliostyle-page-container]")].find((x) => x.style.display !== "none").dataset.mark = "1"));
  const menuPick = async (role, name) => {
    await phone.getByRole("button", { name: "表示", exact: true }).click();
    await phone.getByRole(role, { name }).click();
    await phone.keyboard.press("Escape");
    await phone.waitForTimeout(800);
  };
  // 紙の色: 「表示」のシートから黒を選ぶと、組版の紙と赤入れの紙が揃って変わり、端末に覚える
  await menuPick("radio", "紙: 黒");
  assert.equal(await pframe().evaluate(() => getComputedStyle(document.getElementById("vp")).backgroundColor), "rgb(20, 20, 20)");
  assert.equal(await phone.evaluate(() => localStorage.getItem("shosai.paper")), "black");
  // アプリのテーマを変えても（紙は自動に戻して、テーマに合わせて変わる）同じ
  await menuPick("radio", "ダーク");
  await menuPick("radio", "自動");
  await menuPick("radio", "ライト");
  assert.equal(await pframe().evaluate(() => getComputedStyle(document.getElementById("vp")).backgroundColor), "rgb(244, 236, 216)", "auto paper follows the light theme");
  assert.ok(await pframe().evaluate(() => !!document.querySelector('[data-mark="1"]')), "changing colours does not lay out again");
  assert.deepEqual({ label: await pLabel(), first: await firstPara() }, at10, "colours keep the page and the first paragraph");
  // 文字の大きさを変えて戻しても、同じ段落に戻る
  await phone.keyboard.press("Meta+=");
  await phone.waitForTimeout(800);
  await waitTypeset(phone);
  await phone.waitForTimeout(1500);
  await phone.keyboard.press("Meta+-");
  await phone.waitForTimeout(800);
  await waitTypeset(phone);
  await phone.waitForTimeout(1500);
  assert.equal((await firstPara()).line, at10.first.line, "font size round trip returns to the same paragraph");
  await menuPick("radio", "紙: 黒");
  // 向きを変えると組み直し、ページは新しい大きさになり、同じ段落を開く（820px を超えると PC の画面になるので、小さめの横向き）
  const line0 = (await firstPara()).line;
  await phone.setViewportSize({ width: 667, height: 375 });
  await phone.waitForFunction(
    () => {
      const d = document.querySelector('iframe[title="組版"]').contentDocument;
      const pg = [...d.querySelectorAll("[data-vivliostyle-page-container]")].find((x) => x.style.display !== "none" && x.querySelector("[data-line]"));
      return pg && Math.abs(pg.getBoundingClientRect().width - d.getElementById("vp").clientWidth) <= 1;
    },
    null,
    { timeout: 30000 },
  );
  await phone.waitForTimeout(800);
  const shown = await pframe().evaluate(() =>
    [...document.querySelectorAll("[data-vivliostyle-page-container]")].filter((x) => x.style.display !== "none").flatMap((x) => [...x.querySelectorAll("[data-line]")].map((e) => Number(e.dataset.line))),
  );
  assert.ok(shown.includes(line0), `rotating keeps paragraph ${line0} on screen (${shown.slice(0, 3)})`);
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.waitForTimeout(1500);
  // 本番の見方に切り替えると URL に残り、本の判型（灰色の周り）に戻る
  await phone.getByRole("button", { name: "その他" }).click();
  await phone.getByRole("menuitem", { name: "本番の見方" }).click();
  await phone.waitForURL(/mode=print/);
  await waitTypeset(phone);
  assert.ok(await phone.locator(".phone-stage").count(), "print mode uses the book stage");
  assert.equal(await phone.evaluate(() => localStorage.getItem("shosai.tsmode")), "print");
  await phone.evaluate(() => ["shosai.tsmode", "shosai.paper", "shosai.theme", "shosai.font"].forEach((k) => localStorage.removeItem(k)));
}

/** 読書の見方の見本: スマホの生成り・黒、PC の画面いっぱい、スマホの赤入れの黒い紙 */
async function readingShots() {
  const shot = async (opts, scheme, url, name, paper) => {
    const c = await browser.newContext({ ...opts, colorScheme: scheme });
    const p = await c.newPage();
    if (paper) await p.addInitScript((v) => localStorage.setItem("shosai.paper", v), paper);
    await p.goto(url);
    if (url.includes("view=typeset")) await waitTypeset(p);
    else await p.waitForSelector(".reader .pend-del");
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/reading-${name}.png` });
    await c.close();
  };
  await shot(phoneOpts, "light", `${base}/sample-work/vol1/01?view=typeset&mode=reading`, "phone-sepia");
  await shot(phoneOpts, "dark", `${base}/sample-work/vol1/01?view=typeset&mode=reading`, "phone-black");
  await shot({ viewport: { width: 1280, height: 800 } }, "light", `${base}/sample-work/vol1/01?view=typeset&mode=reading`, "pc-fill");
  await shot(phoneOpts, "light", chapUrl, "phone-red-black", "black");
}

/** 本棚・赤入れ・選択中・シートを、PC とスマホ、ライトとダークで撮る */
async function shots() {
  await readingShots();
  for (const scheme of ["light", "dark"]) {
    for (const [dev, opts] of [
      ["pc", { viewport: { width: 1280, height: 800 } }],
      ["phone", phoneOpts],
    ]) {
      const c = await browser.newContext({ ...opts, colorScheme: scheme });
      const p = await c.newPage();
      const name = (s) => `${out}/${dev}-${scheme}-${s}.png`;
      await p.goto(`${base}/`);
      await p.locator("a.book").first().waitFor();
      await p.waitForTimeout(500);
      await p.screenshot({ path: name("1-shelf") });
      await p.goto(chapUrl);
      await p.waitForSelector(".reader .pend-del");
      await p.waitForTimeout(500);
      await p.screenshot({ path: name("2-reader") });
      await select(p, "白い船が一艘");
      await toolbar(p);
      await p.screenshot({ path: name("3-select") });
      await p.evaluate(() => getSelection().removeAllRanges());
      await p.keyboard.press("Escape");
      if (dev === "phone") {
        await p.getByRole("button", { name: "やめる" }).click().catch(() => {});
        await p.getByRole("button", { name: /指摘/ }).click();
        await p.getByRole("dialog", { name: "指摘" }).waitFor();
      } else {
        await p.locator(".reader .badge").first().click();
      }
      await p.waitForTimeout(700);
      await p.screenshot({ path: name("4-sheet") });
      await c.close();
    }
  }
}

/** syuki の連携: 検証用の作品に最小の台帳を置き、受信箱・場面のタブ・重ね物・パネルを通す。ask の settle はこの作品にだけ書く */
async function syukiFlow() {
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await c.newPage();
  p.on("pageerror", (e) => console.error("pageerror:", e.message));
  const ch1 = `${base}/${work}/vol1/01`;
  // syuki.yml の無い作品では連携の UI を出さない
  await p.goto(chapUrl);
  await p.waitForSelector(".reader p[data-line]");
  assert.equal(await p.getByRole("tab", { name: /受信箱/ }).count(), 0, "no inbox without syuki.yml");
  assert.equal(await p.locator(".reader .sy-scene").count(), 0);

  // 第一章（場面が五つ）と最小の台帳
  const w = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  w("manuscript/vol1/01.kym.txt", fs.readFileSync(path.join(pkgs, sample, "manuscript/vol1/01.kym.txt")));
  w("syuki.yml", "manuscript: manuscript\next: .kym.txt\nvolumes: [vol1]\nledger: ledger\nsetting: []\nstages:\n  ハル: [幼なじみ, 気になる]\nrender:\n  characters: charactor.md\n  details: details.md\n");
  w("charactor.md", "# 登場人物\n\n## ソラ・アオバ\n\n- 一人称: 俺\n\n| 名 | 読み |\n|---|---|\n| 潮読み | しおよみ |\n");
  w("ledger/characters.yaml", "- name: ソラ・アオバ\n  short: ソラ\n- name: ハル・ミナト\n  short: ハル\n  aliases: [委員長]\n- name: 少年\n");
  w("ledger/terms.yaml", "- {term: 潮読み, reading: しおよみ, basic: true, note: 潮を読む}\n- {term: 霧笛, basic: true}\n");
  w("ledger/items.yaml", "- {name: 古い鍵, holder: ソラ}\n");
  w("ledger/secrets.yaml", "- {id: 地下の扉, fact: 古い鍵は灯台の地下の扉を開ける, reader: disclosed, known: [ソラ]}\n");
  w("ledger/threads.yaml", "- {id: 白い船, desc: 霧の日にだけ来る白い船}\n");
  w("ledger/documents.yaml", "[]\n");
  w("ledger/questions.yaml", '- {id: Q-001, q: 白い船の正体を第二章で明かすか, at: "01:2", status: open, asked: "2026-11-24"}\n');
  w("ledger/world.yaml", "sections: {}\nincidents: []\n");
  w("ledger/places.yaml", "places: []\nroutes: []\n");
  w(
    "ledger/vol1/scenes.yaml",
    ['"00-prologue:1", time: 昼すぎ, place: 岬の灯台, cast: [少年]', '"01:1", day: 1, time: 夕方, place: 灯台の裏, cast: [ソラ, ハル]', '"01:2", day: 1, time: 夜, place: ソラの家, cast: [ソラ]', '"01:3", day: 2, time: 朝, place: ソラの家, cast: [ソラ]', '"01:4", day: 2, time: 昼, place: 灯台の前, cast: [ソラ]', '"01:5", day: 2, time: 夕方, place: 灯台の前, cast: [ソラ, ハル]']
      .map((x) => `- {at: ${x}, summary: 場面}\n`)
      .join(""),
  );
  w("ledger/vol1/events.yaml", '- {at: "00:1", kind: plant, what: 白い船, src: 00「町の帳面には」}\n- {at: "01:1", kind: know, who: ハル, what: 地下の扉, src: 01「髪が風に揺れた」}\n');
  // 指摘の質問を一つ（序章）
  let qid;
  editJson((es) => {
    const e = es.find((x) => x.kind === "comment" || x.kind === "suggest");
    e.status = "question";
    qid = e.id;
  });
  await p.waitForTimeout(500);

  // 本棚: 未処理の件数に ask の open を足す
  const todo = entries().filter((e) => e.status === "open" || e.status === "question").length;
  await p.goto(`${base}/`);
  await p.locator(`a.book[href="/${work}"] [aria-label="未処理 ${todo + 1} 件"]`).waitFor();

  await p.goto(ch1);
  await p.waitForSelector(".reader .sy-scene");
  // 番号が先に出て、timeline はあとから入る
  await p.locator(".reader .sy-scene", { hasText: "1日目" }).first().waitFor();
  // 場面の番号と timeline（場面の頭の余白）
  const scenes = await p.locator(".reader .sy-scene").allInnerTexts();
  assert.equal(scenes.length, 5, "five scenes in chapter 1");
  assert.match(scenes[0], /^1\s+1日目 夕方\s+灯台の裏\s+ソラ・ハル$/);
  assert.match(scenes[1], /^2\s+1日目 夜\s+ソラの家/);
  // サイドバーの章の件数に ask を足す
  assert.match(await p.locator(`nav a[href="/${work}/vol1/01"]`).innerText(), /1$/, "chapter count includes the open ask");
  // check の印（台帳と設定集に無い語）
  await p.waitForSelector(".reader .sy-check");

  // 受信箱: 指摘の質問（序章）と ask（第一章）を章の順に
  await p.getByRole("tab", { name: /受信箱/ }).click();
  await p.locator('[data-inbox="Q-001"]').waitFor();
  assert.deepEqual(await p.locator("[data-inbox]").evaluateAll((xs) => xs.map((x) => x.dataset.inbox)), [qid, "Q-001"]);
  if (process.argv[2]) await p.screenshot({ path: `${out}/syuki-pc-inbox.png` });
  // ask から場面 2 の頭へ。場面のタブはそこを追いかける
  await p.locator('[data-inbox="Q-001"] button').first().click();
  await p.waitForTimeout(600);
  await p.getByRole("tab", { name: "場面" }).click();
  await p.locator('[data-scene-at="vol1/01:2"]').waitFor();
  await p.locator('[data-scene-at="vol1/01:2"]').getByText("1日目 夜").waitFor();
  // 次のページへ送ると、場面をまたいだ所で追いかける（ページ送りは部品にフォーカスがあると効かない）
  await p.evaluate(() => document.activeElement?.blur());
  const sceneAt = () => p.locator("[data-scene-at]").getAttribute("data-scene-at");
  for (let i = 0; i < 60 && (await sceneAt()) === "vol1/01:2"; i++) {
    await p.keyboard.press("ArrowLeft");
    await p.waitForTimeout(350);
  }
  // 見本の場面は短いので、見開き一枚で場面をいくつか飛ぶことがある
  assert.match(await sceneAt(), /^vol1\/01:[3-5]$/, "the scene tab follows the reading position");
  if (process.argv[2]) await p.screenshot({ path: `${out}/syuki-pc-scene.png` });
  // 指摘の質問から文へ飛ぶ
  await p.getByRole("tab", { name: /受信箱/ }).click();
  await p.locator(`[data-inbox="${qid}"] button`).first().click();
  await p.waitForURL(new RegExp(`/00-prologue\\?e=${qid}`));
  // 伏線の印（序章に置いた）
  await p.waitForSelector(".reader .sy-thread");
  assert.match(await p.locator(".reader .sy-thread").first().getAttribute("title"), /伏線を置いた: 白い船/);

  // スマホ: 下のシートのタブに受信箱
  const ph = await (await browser.newContext(phoneOpts)).newPage();
  await ph.goto(ch1);
  await ph.waitForSelector(".reader .sy-scene");
  await ph.getByRole("button", { name: /^指摘/ }).click();
  await ph.getByRole("tab", { name: /受信箱/ }).click();
  await ph.locator('[data-inbox="Q-001"]').waitFor();
  await ph.waitForTimeout(500);
  if (process.argv[2]) await ph.screenshot({ path: `${out}/syuki-phone-inbox.png` });
  await ph.keyboard.press("Escape");
  await ph.waitForTimeout(400);
  // 下のバー: 5 個でも親指の届く大きさ。⋯ は短く、画面の高さに収まる。キー一覧とコマンドは出さない
  const sizes = await ph.locator('nav[aria-label="操作"] button').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect()));
  assert.ok(sizes.length >= 5 && sizes.every((r) => r.width >= 44 && r.height >= 44), `bottom bar buttons are 44px or larger (${sizes.length})`);
  await ph.getByRole("button", { name: "その他" }).click();
  const pop = ph.locator('[role="menu"]');
  await pop.waitFor();
  const box = await pop.boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 844, `the ⋯ menu fits on screen (${JSON.stringify(box)})`);
  assert.equal(await ph.getByRole("menuitem", { name: /キー一覧|コマンド/ }).count(), 0, "no keyboard items on the phone");
  await ph.waitForTimeout(400);
  if (process.argv[2]) await ph.screenshot({ path: `${out}/syuki-phone-menu.png` });
  await ph.getByRole("menuitem", { name: "重ねて表示" }).click();
  await ph.getByRole("menuitemcheckbox", { name: "伏線" }).waitFor();
  await ph.keyboard.press("Escape");
  await ph.keyboard.press("Escape");
  await ph.waitForTimeout(300);
  await ph.getByRole("button", { name: "表示", exact: true }).click();
  await ph.getByRole("radio", { name: "紙: 生成り" }).waitFor();
  await ph.waitForTimeout(500);
  if (process.argv[2]) await ph.screenshot({ path: `${out}/syuki-phone-display.png` });
  await ph.context().close();

  // 人物・用語: 既定は切。切り替えると名前を拾い、押すとその場面の時点のカード
  await p.goto(ch1);
  await p.waitForSelector(".reader .sy-scene");
  assert.equal(await p.locator(".reader .sy-name").count(), 0, "names are off by default");
  await p.getByRole("button", { name: "重ねて表示" }).click();
  await p.getByRole("menuitemcheckbox", { name: "人物・用語" }).click();
  await p.getByRole("menuitemcheckbox", { name: "文体の指摘" }).click();
  await p.keyboard.press("Escape");
  await p.waitForSelector(".reader .sy-name");
  await p.waitForSelector(".reader .sy-lint");
  await p.locator(".reader .sy-name", { hasText: "潮読み" }).first().click();
  await p.locator('[data-card="潮読み"]').getByText("しおよみ").waitFor();
  await p.locator('[data-card="潮読み"]').getByText("潮を読む").waitFor();
  await p.keyboard.press("Escape");
  // 台帳の別名でも拾う
  await p.locator(".reader .sy-name", { hasText: /^委員長$/ }).first().waitFor();
  // 居場所は登場したあとの場面で出るので、最後の「ハル」を押す
  const who = p.locator(".reader .sy-name", { hasText: /^ハル$/ }).last();
  await who.scrollIntoViewIfNeeded();
  await who.click();
  const cardEl = p.locator('[data-card="ハル・ミナト"]');
  await cardEl.getByText("居場所").waitFor();
  await p.waitForTimeout(300);
  if (process.argv[2]) await p.screenshot({ path: `${out}/syuki-card.png` });
  await p.keyboard.press("Escape");

  // 検索: 本文に加えて台帳・設定集の段
  await p.keyboard.press("/");
  await p.fill('[aria-label="検索語"]', "潮読み");
  await p.locator("[data-ledger-hits] li").first().waitFor();
  await p.keyboard.press("Escape");
  // 設定集・好意の段階・文体（⌘K から）
  const cmd = async (label) => {
    await p.keyboard.press("Meta+k");
    await p.keyboard.type(label);
    await p.keyboard.press("Enter");
  };
  await cmd("設定集: 人物");
  await p.locator('[data-docs] [role="heading"]', { hasText: "登場人物" }).waitFor();
  assert.equal(await p.locator('[data-docs] [role="tab"]').count(), 1, "missing docs are not listed");
  assert.ok(await p.locator("[data-docs] table").count(), "tables are drawn");
  await p.keyboard.press("Escape");
  await cmd("好意の段階");
  await p.locator("[data-stages]").getByText("ハル").waitFor();
  await p.keyboard.press("Escape");
  await cmd("文体");
  await p.locator("[data-style]").getByText("出すぎた語").waitFor();
  await p.keyboard.press("Escape");
  // impact は git の差分を見る（検証用の作品は git に無いので空）
  const imp = await p.evaluate((w) => fetch(`/api/syuki?work=${w}&cmd=impact`).then((r) => r.json()), work);
  assert.deepEqual(Object.keys(imp).sort(), ["changed", "dependents", "events", "lost"]);

  // ask に答える: 確かめてから syuki ask settle で台帳に書く
  await p.getByRole("tab", { name: /受信箱/ }).click();
  await p.locator('[data-inbox="Q-001"] textarea').fill("出さない");
  await p.locator('[data-inbox="Q-001"]').getByRole("button", { name: "送る" }).click();
  await p.getByRole("button", { name: "答える" }).click();
  await p.locator('[data-inbox="Q-001"]').waitFor({ state: "detached" });
  const qs = fs.readFileSync(path.join(root, "ledger/questions.yaml"), "utf8");
  assert.match(qs, /status: settled/);
  assert.match(qs, /出さない/);
  await c.close();
}
