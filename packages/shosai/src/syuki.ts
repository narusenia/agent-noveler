// syuki の答えの形と、本文に当てるための計算（場面の区切り、時点の読み方、名前と引用の拾い方、受信箱の並べ方）。
import { plainMap, sourceRange } from "./kym";
import { chapOf } from "./route";
import type { Entry, Work } from "./types";

export interface AskQ {
  id: string;
  q: string;
  at?: string;
  status: string;
  asked?: string;
}
export interface AskList {
  questions: AskQ[];
  provisional: { where: string; text: string }[];
}
export interface ListRow {
  name: string;
  note: string | null;
  /** 人物の短い呼び名と別名 */
  short?: string;
  aliases?: string[];
  /** 用語の読みと説明 */
  reading?: string;
  desc?: string;
}
/** threads の一本。done は置いた・匂わせた・回収した記録で、引用があれば syuki が引き直した行（迷子なら lost） */
export interface ThreadRow {
  id: string;
  desc?: string;
  status?: string;
  done: { at: string; kind: string; src?: string; where?: string; line?: number; lost?: string }[];
}
export interface Ev {
  at: string;
  kind: string;
  who?: string | string[];
  what?: string;
  to?: string;
  note?: string;
  src?: string;
}
export interface SceneRow {
  at: string;
  when?: string;
  place?: string;
  cast?: string[];
  summary?: string;
  events?: Ev[];
}
export interface CheckItem {
  level: string;
  kind: string;
  msg: string;
  where?: string;
}
export interface Impact {
  changed: { at: string; lines: number[] }[];
  lost: CheckItem[];
  events: Ev[];
  dependents: Ev[];
}
export interface LintFinding {
  kind: string;
  line: number;
  message: string;
  match: string;
  judgment: boolean;
}

// ---- 場面 ----
/** 場面の区切り（`＊` だけの行）の行番号（1 始まり）。syuki の BREAK と同じ */
export const sceneBreaks = (lines: string[]) => lines.flatMap((x, i) => (/^[\s　]*＊[\s　]*$/.test(x) ? [i + 1] : []));
/** 行の場面の番号（1 始まり）。区切りの行は前の場面に数える */
export const sceneOf = (breaks: number[], line: number) => 1 + breaks.filter((b) => b < line).length;
/** 場面の頭の行。1 は本文の頭（frontmatter の次）、N はその章の N-1 個目の `＊` の行の次 */
export const sceneHead = (breaks: number[], n: number, first: number) =>
  n <= 1 || !breaks.length ? first : breaks[Math.min(n, breaks.length + 1) - 2] + 1;

// ---- 時点（「章:場面」、巻つきは「vol2/04:3」） ----
export function parsePoint(at: string): { vol?: string; chap: string; scene?: number } {
  const m = at.match(/^(?:([\w-]+)\/)?([\w-]+)(?::(\d+))?$/);
  if (!m) return { chap: at };
  return { vol: m[1], chap: m[2], scene: m[3] ? Number(m[3]) : undefined };
}
/** 章の書き方は、ファイル名から拡張子を外したもの（00-prologue）か、- で区切った一部（00）。syuki の Chapter.matches と同じ */
export const chapMatches = (token: string, id: string) => token === id || id.split("-").includes(token);
/** 時点を作品の巻・章・場面に読み替える。巻の無い時点は、巻が一つの作品の書き方なので最初の巻 */
export function locate(work: Work, at: string): { vol: string; file: string; vi: number; ci: number; scene: number } | null {
  const p = parsePoint(at);
  for (const [vi, v] of work.vols.entries()) {
    if (p.vol ? p.vol !== v.name : vi > 0) continue;
    const ci = v.chapters.findIndex((c) => chapMatches(p.chap, chapOf(c.file)));
    if (ci >= 0) return { vol: v.name, file: v.chapters[ci].file, vi, ci, scene: p.scene ?? 1 };
  }
  return null;
}
/** syuki に渡す時点。巻はいつも付ける（一巻の作品でも通る） */
export const pointOf = (vol: string, file: string, scene?: number) => `${vol}/${chapOf(file)}${scene ? `:${scene}` : ""}`;
/** その章の時点か */
export const atChapter = (work: Work, at: string, vol: string, file: string) => {
  const l = locate(work, at);
  return !!l && l.vol === vol && l.file === file;
};

// ---- 本文で探す ----
/** 引用（`04「本文の字」`）を章と字に分ける */
export function quoteOf(src: string): { chap: string; text: string } | null {
  const m = src.match(/^([^「]+)「(.+)」$/s);
  return m ? { chap: m[1].trim(), text: m[2] } : null;
}
/** 記法と空白を外した見た目で引用を探し、原稿の行と行内の位置を返す */
export function findQuote(lines: string[], from: number, text: string): { line: number; s: number; e: number } | null {
  const want = text.replace(/[\s　]/g, "");
  if (!want) return null;
  for (let i = from; i < lines.length; i++) {
    const { text: t, pos } = plainMap(lines[i]);
    // 空白を外した見た目と、元の見た目の位置の対応
    const keep: number[] = [];
    let flat = "";
    for (let j = 0; j < t.length; j++)
      if (!/[\s　]/.test(t[j])) {
        flat += t[j];
        keep.push(j);
      }
    const a = flat.indexOf(want);
    if (a < 0) continue;
    const [s, e] = sourceRange(pos, keep[a], keep[a + want.length - 1] + 1);
    return { line: i + 1, s, e };
  }
  return null;
}

/** 人物の名前から、本文で拾う呼び名。フルネームと、「・」の前の名前、台帳の短い呼び名と別名 */
export const callNames = (full: string, more: string[] = []) => [...new Set([full, full.split("・")[0], ...more])].filter((n) => n.length >= 2);

export interface NameHit {
  s: number;
  e: number;
  /** 台帳の名前（list の name） */
  name: string;
}
/** 行の中の名前を拾う。長い呼び名を先に取り、重ならないようにする。位置は原稿の行の中 */
export function findNames(line: string, names: Map<string, string>): NameHit[] {
  const { text, pos } = plainMap(line);
  const taken = new Array(text.length).fill(false);
  const out: NameHit[] = [];
  for (const call of [...names.keys()].sort((a, b) => b.length - a.length)) {
    for (let a = text.indexOf(call); a >= 0; a = text.indexOf(call, a + call.length)) {
      const b = a + call.length;
      if (taken.slice(a, b).some(Boolean)) continue;
      taken.fill(true, a, b);
      const [s, e] = sourceRange(pos, a, b);
      out.push({ s, e, name: names.get(call)! });
    }
  }
  return out.sort((x, y) => x.s - y.s);
}

/** check の項目が指す本文の行（`manuscript/vol1/01.kym.txt:657`）。where か msg のどちらかに書いてある */
export function checkLine(c: CheckItem, fileKey: string): number | null {
  for (const s of [c.where ?? "", c.msg]) {
    const m = s.match(new RegExp(`manuscript/${fileKey.replace(/[.]/g, "\\.")}:(\\d+)`));
    if (m) return Number(m[1]);
  }
  return null;
}
/** check_style の指摘を lint の答えから取り出す（out は JSON の文字列） */
export function lintFindings(rows: { tool: string; out: string }[]): LintFinding[] {
  return rows.flatMap((r) => {
    if (r.tool !== "check_style") return [];
    try {
      return JSON.parse(r.out).findings ?? [];
    } catch {
      return [];
    }
  });
}

// ---- 受信箱 ----
export type InboxItem =
  | { t: "entry"; e: Entry; vol: string; vi: number; ci: number; line: number }
  | { t: "ask"; q: AskQ; vol: string | null; file: string | null; vi: number; ci: number; scene: number };

/** 指摘の質問と、syuki の作者への問いを章の順に混ぜる。指摘は行、問いは場面で並べ、同じ場所なら問いが先。場所の無い問いは最後 */
export function inbox(work: Work, reviews: Entry[][], asks: AskQ[]): InboxItem[] {
  const items: InboxItem[] = [];
  for (const es of reviews)
    for (const e of es) {
      if (e.status !== "question") continue;
      const [vol, file] = e.file.split("/");
      const vi = work.vols.findIndex((v) => v.name === vol);
      const ci = work.vols[vi]?.chapters.findIndex((c) => c.file === file) ?? -1;
      items.push({ t: "entry", e, vol, vi: vi < 0 ? Infinity : vi, ci, line: e.line });
    }
  for (const q of asks) {
    const l = q.at ? locate(work, q.at) : null;
    items.push(
      l
        ? { t: "ask", q, vol: l.vol, file: l.file, vi: l.vi, ci: l.ci, scene: l.scene }
        : { t: "ask", q, vol: null, file: null, vi: Infinity, ci: 0, scene: 0 },
    );
  }
  // 問いは場面の番号を、指摘は行番号をそのまま比べられないので、章の中では問い（場面の頭）を先に置き、場面の番号どうし・行どうしで並べる
  const key = (x: InboxItem): number[] => [x.vi, x.ci, x.t === "ask" ? 0 : 1, x.t === "ask" ? x.scene : x.line];
  return items.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  });
}

/** 章ごと（`vol1/01.kym.txt`）の作者への問いの件数 */
export function askCounts(work: Work, asks: AskQ[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const q of asks) {
    const l = q.at ? locate(work, q.at) : null;
    if (l) m.set(`${l.vol}/${l.file}`, (m.get(`${l.vol}/${l.file}`) ?? 0) + 1);
  }
  return m;
}
