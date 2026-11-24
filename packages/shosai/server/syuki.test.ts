import { describe, expect, it } from "vitest";
import { ArgError, readArgs, renderDocs, settleArgs } from "./syuki";

const q = (o: Record<string, string>) => new URLSearchParams(o);

describe("readArgs", () => {
  it("読むだけのコマンドを syuki の引数にする", () => {
    expect(readArgs("brief", q({ at: "02:1" }))).toEqual(["brief", "02:1"]);
    expect(readArgs("state", q({ name: "ハル", at: "vol1/04:3" }))).toEqual(["state", "ハル", "--at", "vol1/04:3"]);
    expect(readArgs("heat", q({ chapter: "vol1/02" }))).toEqual(["style", "heat", "vol1/02"]);
    expect(readArgs("excess", q({ chapter: "vol2/03" }))).toEqual(["style", "excess", "vol2/03"]);
    expect(readArgs("ask", q({}))).toEqual(["ask", "list"]);
  });
  it("書くコマンドと、オプションに化ける値を通さない", () => {
    expect(() => readArgs("add", q({}))).toThrow(ArgError);
    expect(() => readArgs("search", q({ q: "--work=/etc" }))).toThrow(ArgError);
    expect(() => readArgs("brief", q({ at: "02:1 --json" }))).toThrow(ArgError);
    expect(() => readArgs("list", q({ kind: "events" }))).toThrow(ArgError);
    expect(() => readArgs("lint", q({ chapter: "../x" }))).toThrow(ArgError);
  });
});

describe("settleArgs", () => {
  it("Q 番号と答えだけを通す", () => {
    expect(settleArgs("Q-012", "降参は認めない")).toEqual(["ask", "settle", "Q-012", "降参は認めない"]);
    expect(() => settleArgs("012", "x")).toThrow(ArgError);
    expect(() => settleArgs("Q-1", "--all")).toThrow(ArgError);
    expect(() => settleArgs("Q-1", "  ")).toThrow(ArgError);
  });
});

describe("renderDocs", () => {
  it("render の置き場所を読み、巻ごとのものは外す", () => {
    const yml = "title: x\nrender:\n  characters: charactor.md\n  map: plot/map.md   # 地図\n  state: plot/{vol}-state.md\nother: 1\n";
    expect(renderDocs(yml)).toEqual({ characters: "charactor.md", map: "plot/map.md" });
    expect(renderDocs("title: x\n")).toEqual({});
  });
});
