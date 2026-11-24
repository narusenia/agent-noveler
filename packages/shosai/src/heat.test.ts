import { describe, expect, it } from "vitest";
import { tints } from "./heat";

describe("tints", () => {
  it("colors voice runs and drops by line and skips plain paragraphs", () => {
    const run = { start: 5, sentences: 12 };
    const m = tints([
      { line: 5, run, drop: false },
      { line: 7, run, drop: true },
      { line: 9, run: null, drop: true },
      { line: 11, run: null, drop: false },
    ]);
    expect([...m.keys()]).toEqual([5, 7, 9]);
    expect(m.get(5)).toEqual({ cls: "heat-run", title: "声なし区間（5行目から12文）" });
    expect(m.get(7)?.cls).toBe("heat-run heat-drop");
    expect(m.get(9)).toEqual({ cls: "heat-drop", title: "落とし" });
  });
});
