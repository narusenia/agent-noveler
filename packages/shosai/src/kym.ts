// カクヨム記法の 1 行（= 1 段落）を、原稿上の位置つきのトークンに分ける。
// 規則は @narusenia/kakuyomu-vfm に合わせる（傍点 → 縦中横 → 明示ルビ → 自動ルビ）。

export type Tok =
  | { t: "text"; s: number; e: number }
  | { t: "ruby"; s: number; e: number; cs: number; ce: number; rt: string }
  | { t: "em"; s: number; e: number; cs: number; ce: number; inner: Tok[] }
  | { t: "tcy"; s: number; e: number; cs: number; ce: number };

const KANJI = "\\u3005\\u3006\\u3007\\u30F6\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF";
const RES: [Tok["t"], RegExp][] = [
  ["em", /《《(.+?)》》/g],
  ["tcy", /\{(?![#.])([^{}|]+)\}/g],
  ["ruby", /[|｜]([^|｜《》]+)《([^《》]+)》/g],
  ["ruby", new RegExp(`([${KANJI}]+)《([^《》]+)》`, "g")],
];

export function tokenize(line: string, from = 0, to = line.length): Tok[] {
  const out: Tok[] = [];
  const src = line.slice(0, to);
  let i = from;
  while (i < to) {
    let best: { t: Tok["t"]; m: RegExpExecArray } | null = null;
    for (const [t, re] of RES) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && (!best || m.index < best.m.index)) best = { t, m };
    }
    if (!best) break;
    const { t, m } = best;
    const s = m.index;
    const e = s + m[0].length;
    if (s > i) out.push({ t: "text", s: i, e: s });
    if (t === "em") {
      out.push({ t, s, e, cs: s + 2, ce: e - 2, inner: tokenize(line, s + 2, e - 2) });
    } else if (t === "tcy") {
      out.push({ t, s, e, cs: s + 1, ce: e - 1 });
    } else {
      const ce = s + m[0].indexOf("《");
      const cs = ce - m[1].length;
      out.push({ t: "ruby", s, e, cs, ce, rt: m[2] });
    }
    i = e;
  }
  if (i < to) out.push({ t: "text", s: i, e: to });
  return out;
}

/** 範囲が記法の内側（ルビの親字、傍点の語）に収まらず記号にかかるなら、トークンごと含むよう広げる。 */
export function snap(toks: Tok[], s: number, e: number): [number, number] {
  for (const k of toks) {
    if (k.t === "text") continue;
    if (s === e) {
      if (s <= k.s || s >= k.e) continue;
      if (s >= k.cs && s <= k.ce) return k.t === "em" ? snap(k.inner, s, e) : [s, e];
      s = e = s < k.cs ? k.s : k.e; // 挿入点が記号の中なら外へ出す
      continue;
    }
    if (k.e <= s || k.s >= e) continue;
    if (s >= k.cs && e <= k.ce) return k.t === "em" ? snap(k.inner, s, e) : [s, e];
    s = Math.min(s, k.s);
    e = Math.max(e, k.e);
  }
  return [s, e];
}

/** 範囲を含む指定種のトークン（傍点の中のルビも探す）。 */
export function findTok(toks: Tok[], s: number, e: number, t: "ruby" | "em"): Tok | null {
  for (const k of toks) {
    if (k.t === "text") continue;
    if (k.t === t && s >= k.s && e <= k.e) return k;
    if (k.t === "em" && s >= k.cs && e <= k.ce) {
      const r = findTok(k.inner, s, e, t);
      if (r) return r;
    }
  }
  return null;
}

/** 記法を外した見た目の文字列。 */
export function plain(line: string, s = 0, e = line.length): string {
  let out = "";
  const walk = (toks: Tok[]) => {
    for (const k of toks) {
      if (k.e <= s || k.s >= e) continue;
      if (k.t === "text") out += line.slice(Math.max(k.s, s), Math.min(k.e, e));
      else if (k.t === "em") walk(k.inner);
      else out += line.slice(Math.max(k.cs, s), Math.min(k.ce, e));
    }
  };
  walk(tokenize(line));
  return out;
}

export function hasMarkup(line: string, s: number, e: number): boolean {
  return /[|｜《》{}]/.test(line.slice(s, e));
}

const CTX = 12;

export function context(line: string, s: number, e: number) {
  return { prefix: line.slice(Math.max(0, s - CTX), s), suffix: line.slice(e, e + CTX) };
}

export interface Anchor {
  line: number;
  start: number;
  end: number;
}

/** 指摘の位置を、行の手がかりと引用・前後の文字で探し直す。見つからなければ null（迷子）。 */
export function resolve(
  a: { line: number; quote: string; prefix: string; suffix: string },
  lines: string[],
): Anchor | null {
  const order = lines
    .map((_, i) => i)
    .sort((x, y) => Math.abs(x + 1 - a.line) - Math.abs(y + 1 - a.line));
  const tries: [string, number][] = [[a.prefix + a.quote + a.suffix, a.prefix.length]];
  if (a.quote) tries.push([a.prefix + a.quote, a.prefix.length], [a.quote + a.suffix, 0], [a.quote, 0]);
  else {
    if (a.prefix) tries.push([a.prefix, a.prefix.length]);
    if (a.suffix) tries.push([a.suffix, 0]);
  }
  for (const [key, off] of tries) {
    if (!key) continue;
    for (const i of order) {
      const at = lines[i].indexOf(key);
      if (at >= 0) return { line: i + 1, start: at + off, end: at + off + a.quote.length };
    }
  }
  return null;
}

/** 見た目の文字列（見出しの「## 」も外す）と、その各文字の原稿上の位置。 */
export function plainMap(line: string): { text: string; pos: number[] } {
  let text = "";
  const pos: number[] = [];
  const walk = (toks: Tok[]) => {
    for (const k of toks) {
      if (k.t === "em") walk(k.inner);
      else
        for (let i = k.t === "text" ? k.s : k.cs; i < (k.t === "text" ? k.e : k.ce); i++) {
          text += line[i];
          pos.push(i);
        }
    }
  };
  walk(tokenize(line, line.startsWith("## ") ? 3 : 0));
  return { text, pos };
}

/** 見た目の文字列の中の [a, b) を、原稿の行の中の [start, end) に戻す。 */
export const sourceRange = (pos: number[], a: number, b: number): [number, number] => [pos[a], pos[b - 1] + 1];
