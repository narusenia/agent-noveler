import { describe, expect, it } from "vitest";
import { findTok, plain, plainMap, resolve, snap, sourceRange, tokenize } from "./kym";

describe("tokenize", () => {
  it("splits ruby, emphasis and text with source offsets", () => {
    const line = "一人は｜外套《がいとう》の裾《すそ》を《《翻》》した";
    const toks = tokenize(line);
    expect(toks.map((k) => k.t)).toEqual(["text", "ruby", "text", "ruby", "text", "em", "text"]);
    const r = toks[1];
    if (r.t !== "ruby") throw 0;
    expect(line.slice(r.cs, r.ce)).toBe("外套");
    expect(r.rt).toBe("がいとう");
    const auto = toks[3];
    if (auto.t !== "ruby") throw 0;
    expect(line.slice(auto.s, auto.e)).toBe("裾《すそ》");
  });

  it("parses ruby inside emphasis", () => {
    const toks = tokenize("《《外套《がいとう》を》》");
    expect(toks[0].t).toBe("em");
    if (toks[0].t !== "em") throw 0;
    expect(toks[0].inner[0].t).toBe("ruby");
  });
});

describe("snap", () => {
  const line = "一人は｜外套《がいとう》の裾";
  const toks = tokenize(line);
  it("keeps a range inside the ruby base", () => {
    expect(snap(toks, 4, 5)).toEqual([4, 5]);
  });
  it("expands a range crossing ruby markup to the whole token", () => {
    expect(snap(toks, 4, 14)).toEqual([3, 14]);
  });
  it("moves an insertion point out of the reading", () => {
    expect(snap(toks, 8, 8)).toEqual([12, 12]);
  });
});

describe("findTok / plain", () => {
  it("finds ruby around a base selection and strips markup", () => {
    const line = "一人は｜外套《がいとう》の";
    expect(findTok(tokenize(line), 4, 6, "ruby")?.s).toBe(3);
    expect(plain(line)).toBe("一人は外套の");
  });
});

describe("resolve", () => {
  it("re-finds a quote after lines shift", () => {
    const lines = ["新しい行", "海に、霧が出ていた。", "坂の下"];
    const a = { line: 1, quote: "霧", prefix: "海に、", suffix: "が出て" };
    expect(resolve(a, lines)).toEqual({ line: 2, start: 3, end: 5 });
  });
  it("anchors a deletion by its context", () => {
    const a = { line: 1, quote: "", prefix: "海に、", suffix: "が出て" };
    expect(resolve(a, ["海に、が出ていた"])).toEqual({ line: 1, start: 3, end: 3 });
  });
  it("returns null when the text is gone", () => {
    expect(resolve({ line: 1, quote: "灯台", prefix: "", suffix: "" }, ["何もない"])).toBeNull();
  });
});

describe("plainMap", () => {
  it("maps a visible-text match back to source offsets across ruby and emphasis", () => {
    const line = "｜王都《おうと》の《《東の坂》》に出た";
    const { text, pos } = plainMap(line);
    expect(text).toBe(plain(line));
    const a = text.indexOf("都の東");
    const [s, e] = sourceRange(pos, a, a + 3);
    expect([s, e]).toEqual([line.indexOf("都"), line.indexOf("東") + 1]);
    expect(plain(line, s, e)).toBe("都の東");
  });
  it("drops the heading mark", () => {
    expect(plainMap("## 序章").text).toBe("序章");
  });
});
