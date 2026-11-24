import { describe, expect, it } from "vitest";
import { cleanup, readPos, savePos } from "./prefs";
import { fromHash, parseRoute, routeUrl } from "./route";
import { History } from "./undo";

describe("route", () => {
  it("round-trips paths and query", () => {
    const r = { work: "sample-work", vol: "vol1", chap: "01", e: "R-0012", s: "notes" };
    expect(routeUrl(r)).toBe("/sample-work/vol1/01?e=R-0012&s=notes");
    expect(parseRoute("/sample-work/vol1/01", "?e=R-0012&s=notes")).toEqual(r);
  });
  it("keeps the typeset view in the query", () => {
    const r = { work: "w", vol: "vol1", chap: "01", view: "typeset" as const };
    expect(routeUrl(r)).toBe("/w/vol1/01?view=typeset");
    expect(parseRoute("/w/vol1/01", "?view=typeset")).toEqual(r);
    expect(parseRoute("/w/vol1/01", "?view=other")).toEqual({ work: "w", vol: "vol1", chap: "01" });
    expect(parseRoute("/w/vol1/01", "?view=typeset&mode=reading").mode).toBe("reading");
    expect(parseRoute("/w/vol1/01", "?mode=x").mode).toBeUndefined();
  });
  it("reads the shelf and a bare work", () => {
    expect(parseRoute("/", "")).toEqual({});
    expect(parseRoute("/other-work", "")).toEqual({ work: "other-work" });
    expect(routeUrl({})).toBe("/");
  });
  it("strips the extension and converts old hashes", () => {
    expect(parseRoute("/w/vol1/00-prologue.kym.txt", "").chap).toBe("00-prologue");
    expect(fromHash("#/w/vol1/02.kym.txt")).toEqual({ work: "w", vol: "vol1", chap: "02" });
    expect(fromHash("#work=w&vol=vol2&file=03.kym.txt")).toEqual({ work: "w", vol: "vol2", chap: "03" });
    expect(fromHash("")).toBeNull();
  });
});

const fake = (init: Record<string, string>) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    m,
  };
};

describe("prefs", () => {
  it("drops old per-chapter keys and keeps one position per work", () => {
    const s = fake({ "shosai.pos.#/a/v/1": "3", "akaire.pos.x": "1", "akaire.last": "#/a", "shosai.commit": "1" });
    cleanup(s);
    expect([...s.m.keys()]).toEqual(["shosai.commit"]);
    savePos("a", { vol: "v", chap: "1", off: 10 }, s);
    savePos("a", { vol: "v", chap: "2", off: 0 }, s);
    expect(readPos(s)).toEqual({ a: { vol: "v", chap: "2", off: 0 } });
  });
});

describe("History", () => {
  it("undoes newest first and forgets past the limit", async () => {
    const done: string[] = [];
    const h = new History(2);
    for (const l of ["a", "b", "c"]) h.push({ label: l, undo: async () => void done.push(l) });
    expect(await h.undo()).toBe("c");
    expect(await h.undo()).toBe("b");
    expect(await h.undo()).toBeNull();
    expect(done).toEqual(["c", "b"]);
  });
  it("undoes a given step once", async () => {
    const h = new History();
    const s = { label: "x", undo: async () => {} };
    h.push(s);
    expect(await h.undoStep(s)).toBe("x");
    expect(await h.undoStep(s)).toBeNull();
  });
});
