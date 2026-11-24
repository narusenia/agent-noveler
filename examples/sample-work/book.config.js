// @ts-check
// 巻ごとの組版の設定。shosai の組版の見方がこの一覧を読む。
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

/** @param {string} vol */
export default function book(vol) {
  // 章は manuscript/<巻>/*.kym.txt。entry には変換後の名前（01.kym.md）で入れる
  const chapters = readdirSync(`${root}manuscript/${vol}`)
    .filter((f) => f.endsWith(".kym.txt"))
    .sort()
    .map((f) => `manuscript/${vol}/${f.replace(/\.txt$/, ".md")}`);
  if (chapters.length === 0) throw new Error(`No chapters in manuscript/${vol}/.`);
  return {
    title: "灯台の鍵",
    author: "見本",
    language: "ja",
    readingProgression: /** @type {const} */ ("rtl"),
    theme: "@vivliostyle/theme-epub3j@^1.1.0",
    vfm: { hardLineBreaks: true },
    toc: { title: "目次", htmlPath: "toc.html", sectionDepth: 0 },
    entry: [{ rel: "contents" }, ...chapters],
  };
}
