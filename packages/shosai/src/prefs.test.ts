import { describe, expect, it } from "vitest";
import { PAPERS, paper, paperOf, set, spacing, tsMode } from "./prefs";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};
// WCAG の相対輝度とコントラスト比
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("typeset prefs", () => {
  it("defaults the mode by device and remembers a choice", () => {
    const s = mem();
    expect(tsMode(true, s)).toBe("reading");
    expect(tsMode(false, s)).toBe("print");
    set("shosai.tsmode", "reading", s);
    expect(tsMode(false, s)).toBe("reading");
    set("shosai.tsmode", "junk", s);
    expect(tsMode(false, s)).toBe("print");
  });
  it("reads paper and spacing, ignoring unknown values", () => {
    const s = mem();
    expect(paper(s)).toBe("auto");
    expect(spacing(s)).toBe("normal");
    set("shosai.paper", "gray", s);
    set("shosai.spacing", "loose", s);
    expect(paper(s)).toBe("gray");
    expect(spacing(s)).toBe("loose");
    set("shosai.paper", "toString", s);
    expect(paper(s)).toBe("auto");
  });
  it("follows the app theme when the paper is auto", () => {
    expect(paperOf("auto", true)).toBe("black");
    expect(paperOf("auto", false)).toBe("sepia");
    expect(paperOf("white", true)).toBe("white");
  });
  it("keeps text and red text at 4.5:1 on every paper", () => {
    for (const [k, p] of Object.entries(PAPERS)) {
      expect(contrast(p.ink, p.paper), `${k} ink`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.penText, p.paper), `${k} pen`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
