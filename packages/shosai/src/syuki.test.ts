import { describe, expect, it } from "vitest";
import { askCounts, callNames, checkLine, findNames, findQuote, inbox, locate, sceneBreaks, sceneHead, sceneOf } from "./syuki";
import type { Entry, Work } from "./types";

const work: Work = {
  name: "w",
  title: "w",
  vols: [
    { name: "vol1", chapters: [{ file: "00-prologue.kym.txt", title: "序" }, { file: "01.kym.txt", title: "一" }] },
    { name: "vol2", chapters: [{ file: "01.kym.txt", title: "二の一" }] },
  ],
};

describe("場面", () => {
  // 1: ---, 2: title, 3: ---, 4: 本文, 5: ＊, 6: 本文, 7: 　＊　, 8: 本文
  const lines = ["---", "title: x", "---", "あ", "＊", "い", "　＊　", "う"];
  const br = sceneBreaks(lines);
  it("＊ だけの行で区切る", () => expect(br).toEqual([5, 7]));
  it("行の場面", () => {
    expect([4, 5, 6, 7, 8].map((l) => sceneOf(br, l))).toEqual([1, 1, 2, 2, 3]);
  });
  it("場面の頭: 1 は本文の頭、N は N-1 個目の ＊ の次の行", () => {
    expect([1, 2, 3].map((n) => sceneHead(br, n, 4))).toEqual([4, 6, 8]);
    expect(sceneHead(br, 9, 4)).toBe(8);
    expect(sceneHead([], 2, 4)).toBe(4);
  });
});

describe("時点", () => {
  it("章の一部（00）と巻つき（vol2/01:3）を読む", () => {
    expect(locate(work, "00:1")).toMatchObject({ vol: "vol1", file: "00-prologue.kym.txt", scene: 1 });
    expect(locate(work, "01:4")).toMatchObject({ vol: "vol1", file: "01.kym.txt", ci: 1, scene: 4 });
    expect(locate(work, "vol2/01:3")).toMatchObject({ vol: "vol2", vi: 1, scene: 3 });
    expect(locate(work, "09:1")).toBeNull();
  });
});

describe("本文で探す", () => {
  it("引用は記法と空白を外して探し、原稿の位置を返す", () => {
    const lines = ["前", "　｜王都《おうと》の東、　坂の上"];
    const h = findQuote(lines, 0, "王都の東、坂の上")!;
    expect(h.line).toBe(2);
    expect(lines[1].slice(h.s, h.e)).toBe("｜王都《おうと》の東、　坂の上".slice(1));
    expect(findQuote(lines, 0, "無い字")).toBeNull();
  });
  it("名前は長い呼び名を先に取り、重ねない", () => {
    const names = new Map(callNames("ハルカ・ミナト").map((n) => [n, "ハルカ・ミナト"]));
    names.set("歯車", "歯車");
    const line = "ハルカの歯車。ハルカ・ミナトは";
    const hits = findNames(line, names);
    expect(hits.map((h) => line.slice(h.s, h.e))).toEqual(["ハルカ", "歯車", "ハルカ・ミナト"]);
    expect(hits.every((h) => h.name === (line.slice(h.s, h.e) === "歯車" ? "歯車" : "ハルカ・ミナト"))).toBe(true);
  });
  it("台帳の短い呼び名と別名でも拾う", () => {
    const full = "ハルカ・ミナト";
    const names = new Map(callNames(full, ["ハルカ", "ハル", "首"]).map((n) => [n, full]));
    expect([...names.keys()]).toEqual([full, "ハルカ", "ハル"]);
    const line = "ハルが言った";
    expect(findNames(line, names).map((h) => line.slice(h.s, h.e))).toEqual(["ハル"]);
  });
  it("ルビの親字の中の名前も拾う", () => {
    const line = "｜歯車《はぐるま》が回る";
    const [h] = findNames(line, new Map([["歯車", "歯車"]]));
    expect(line.slice(h.s, h.e)).toBe("歯車");
  });
  it("check の項目から本文の行を取る", () => {
    expect(checkLine({ level: "confirm", kind: "x", msg: "最初の manuscript/vol1/01.kym.txt:657 を使う" }, "vol1/01.kym.txt")).toBe(657);
    expect(checkLine({ level: "v", kind: "term", msg: "m", where: "manuscript/vol1/01.kym.txt:12" }, "vol1/01.kym.txt")).toBe(12);
    expect(checkLine({ level: "v", kind: "term", msg: "m", where: "manuscript/vol1/011.kym.txt:12" }, "vol1/01.kym.txt")).toBeNull();
  });
});

describe("受信箱", () => {
  const e = (id: string, file: string, line: number, status: Entry["status"] = "question") =>
    ({ id, file, line, status, kind: "comment", quote: "", prefix: "", suffix: "", body: "", reply: null, created: "", updated: "" }) as Entry;
  it("指摘の質問と問いを章の順に混ぜ、章の中では問いを先に、場所の無い問いは最後", () => {
    const items = inbox(
      work,
      [[e("R-1", "vol1/01.kym.txt", 30), e("R-2", "vol1/00-prologue.kym.txt", 9), e("R-3", "vol1/01.kym.txt", 5, "open")], [e("R-4", "vol2/01.kym.txt", 1)]],
      [
        { id: "Q-1", q: "a", at: "01:2", status: "open" },
        { id: "Q-2", q: "b", status: "open" },
        { id: "Q-3", q: "c", at: "vol2/01:1", status: "open" },
        { id: "Q-4", q: "d", at: "01:1", status: "open" },
      ],
    );
    expect(items.map((x) => (x.t === "ask" ? x.q.id : x.e.id))).toEqual(["R-2", "Q-4", "Q-1", "R-1", "Q-3", "R-4", "Q-2"]);
  });
  it("章ごとの問いの件数", () => {
    const m = askCounts(work, [
      { id: "Q-1", q: "a", at: "01:2", status: "open" },
      { id: "Q-2", q: "b", at: "01", status: "open" },
      { id: "Q-3", q: "c", status: "open" },
    ]);
    expect([...m]).toEqual([["vol1/01.kym.txt", 2]]);
  });
});
