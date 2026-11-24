import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { docHref, entrySource, kymHtml, themePackage, typesetter } from "./typeset";

const SRC = "---\ntitle: 第一章\n---\n## 第一章\n\n　｜漢字《かんじ》の段落。\n\n「台詞」\n";

describe("kymHtml", () => {
  it("段落と見出しに元の .kym.txt の行番号を付ける", () => {
    const html = kymHtml(SRC, { chap: "01", vfm: { hardLineBreaks: true } });
    expect(html).toMatch(/<h2[^>]*data-line="4"[^>]*>第一章<\/h2>/);
    expect(html).toMatch(/<p data-line="6" data-chap="01" id="L6">　<ruby>漢字<rt>かんじ<\/rt><\/ruby>の段落。<\/p>/);
    expect(html).toMatch(/<p data-line="8"[^>]*>「台詞」<\/p>/);
    expect(html).toContain('class="vrtl"');
  });
  it("frontmatter の無い原稿でも行がずれない", () => {
    expect(kymHtml("一行目\n\n三行目\n", { chap: "x" })).toMatch(/data-line="3"[^>]*>　三行目/);
  });
});

describe("名前の読み替え", () => {
  it("entry の .kym.md を .kym.txt に、元のファイルを組んだ文書の名前にする", () => {
    expect(entrySource("manuscript/vol1/01.kym.md")).toBe("manuscript/vol1/01.kym.txt");
    expect(entrySource("front/vol1/title.md")).toBe("front/vol1/title.md");
    expect(docHref("manuscript/vol1/01.kym.txt")).toBe("manuscript/vol1/01.kym.html");
    expect(docHref("front/vol1/title.md")).toBe("front/vol1/title.html");
  });
  it("テーマの指定からパッケージの名前を取る", () => {
    expect(themePackage("@vivliostyle/theme-epub3j@^1.1.0")).toBe("@vivliostyle/theme-epub3j");
    expect(themePackage("front/front.css")).toBeNull();
  });
});

describe("typesetter", () => {
  it("book.config.js から文書の一覧・manifest・目次を作り、config が変われば読み直す", async () => {
    const pkgs = fs.mkdtempSync(path.join(os.tmpdir(), "shosai-ts-"));
    const w = path.join(pkgs, "w");
    fs.mkdirSync(path.join(w, "manuscript/vol1"), { recursive: true });
    fs.mkdirSync(path.join(w, "front/vol1"), { recursive: true });
    fs.writeFileSync(path.join(w, "manuscript/vol1/01.kym.txt"), SRC);
    fs.writeFileSync(path.join(w, "front/vol1/title.md"), "---\ntitle: 扉\n---\n\n題\n");
    fs.writeFileSync(path.join(w, "front/front.css"), "html{}");
    const cfg = (title: string) =>
      `export default (vol) => ({ title: "${title}", language: "ja", readingProgression: "rtl", theme: "@vivliostyle/theme-epub3j@^1.1.0",
        vfm: { hardLineBreaks: true }, entry: [{ path: \`front/\${vol}/title.md\`, theme: ["front/front.css"] }, { rel: "contents", pageBreakBefore: "right" }, \`manuscript/\${vol}/01.kym.md\`] });`;
    fs.writeFileSync(path.join(w, "book.config.js"), cfg("本"));
    const t = typesetter(pkgs, path.resolve(__dirname, ".."));

    const pub = JSON.parse(String((await t.serve("w", "vol1", "publication.json")).body));
    expect(pub.name).toBe("本");
    expect(pub.readingOrder.map((x: any) => x.url)).toEqual(["front/vol1/title.html", "toc.html", "manuscript/vol1/01.kym.html"]);
    const ch = String((await t.serve("w", "vol1", "manuscript/vol1/01.kym.html")).body);
    expect(ch).toContain('href="../../themes/@vivliostyle/theme-epub3j/theme.css"');
    const toc = String((await t.serve("w", "vol1", "toc.html")).body);
    expect(toc).toContain("break-before: right");
    // 横書きの目次でも、本が右から左へ進むことを core に伝える
    expect(toc).toContain(":root { direction: rtl; } body { direction: ltr; }");
    expect(toc).toContain("@page { size: letter; }");
    expect(toc).toContain('<a href="manuscript/vol1/01.kym.html">第一章</a>');
    expect(String((await t.serve("w", "vol1", "front/vol1/title.html")).body)).toContain('href="../../front/front.css"');
    expect((await t.serve("w", "vol1", "themes/@vivliostyle/theme-epub3j/theme.css")).type).toBe("text/css");
    await expect(t.serve("w", "vol1", "../../etc/x.css")).rejects.toThrow();

    fs.writeFileSync(path.join(w, "book.config.js"), cfg("改題"));
    fs.utimesSync(path.join(w, "book.config.js"), new Date(), new Date(Date.now() + 5000));
    expect(JSON.parse(String((await t.serve("w", "vol1", "publication.json")).body)).name).toBe("改題");
    fs.rmSync(pkgs, { recursive: true });
  });
});
