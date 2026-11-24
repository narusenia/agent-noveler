import { describe, expect, it } from "vitest";
import { inline, parseMd } from "./md";

describe("parseMd", () => {
  it("見出し・段落・箇条書き・表・引用", () => {
    const md = "# 人物\n\n段落の\n続き\n\n- 一\n  - 二\n- 三\n\n1. いち\n\n| 名 | 読み |\n|---|---|\n| 歯車 | はぐるま |\n\n> 引用\n> 二行\n| 半端な行\n";
    expect(parseMd(md)).toEqual([
      { t: "h", level: 1, text: "人物" },
      { t: "p", text: "段落の\n続き" },
      { t: "ul", items: [{ text: "一", depth: 0 }, { text: "二", depth: 1 }, { text: "三", depth: 0 }] },
      { t: "ol", items: [{ text: "いち", depth: 0 }] },
      { t: "table", head: ["名", "読み"], rows: [["歯車", "はぐるま"]] },
      { t: "quote", text: "引用\n二行" },
      { t: "p", text: "| 半端な行" },
    ]);
  });
  it("太字とコード", () => {
    expect(inline("a**b**`c`d")).toEqual([
      { t: "text", s: "a" },
      { t: "b", s: "b" },
      { t: "code", s: "c" },
      { t: "text", s: "d" },
    ]);
  });
});
