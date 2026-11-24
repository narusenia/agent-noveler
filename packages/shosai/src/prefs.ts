// 端末ごとに覚える設定（localStorage）。プライベートモードなどで読めない・書けない時は既定で動く。
export type Theme = "system" | "light" | "dark";
export interface ReadPos {
  vol: string;
  chap: string;
  /** 章の右端（頭）からの横の距離 */
  off: number;
}
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const store = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};
export function get(key: string, s = store()): string | null {
  try {
    return s?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
export function set(key: string, value: string, s = store()) {
  try {
    s?.setItem(key, value);
  } catch {}
}

/** 作品ごとの最後に読んだ位置。作品につき一つだけ持つ */
export function readPos(s = store()): Record<string, ReadPos> {
  try {
    return JSON.parse(get("shosai.read", s) ?? "{}");
  } catch {
    return {};
  }
}
export const savePos = (work: string, p: ReadPos, s = store()) => set("shosai.read", JSON.stringify({ ...readPos(s), [work]: p }), s);

/** 前の版が章ごとに溜めた位置などのキーを消す */
export function cleanup(s = store()) {
  if (!s) return;
  try {
    const old: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && /^(akaire|shosai)\.(pos\.|last$|preview$)/.test(k)) old.push(k);
    }
    for (const k of old) s.removeItem(k);
  } catch {}
}

export const theme = (): Theme => {
  const t = get("shosai.theme");
  return t === "light" || t === "dark" ? t : "system";
};
export const fontSize = (fallback: number) => Number(get("shosai.font")) || fallback;

/** 作品・巻ごとに、前に巻全体を組んだ時の総ページ数（組み終えるまでの目安に出す） */
export function totalPages(work: string, vol: string, s = store()): number | null {
  try {
    return JSON.parse(get("shosai.pages", s) ?? "{}")[`${work}/${vol}`] ?? null;
  } catch {
    return null;
  }
}
export function saveTotalPages(work: string, vol: string, n: number, s = store()) {
  let all: Record<string, number> = {};
  try {
    all = JSON.parse(get("shosai.pages", s) ?? "{}");
  } catch {}
  set("shosai.pages", JSON.stringify({ ...all, [`${work}/${vol}`]: n }), s);
}

/** 前に巻全体を組んだ時の、文書ごとの最初のページ番号（startPage に渡してノンブルを本番に寄せる） */
export function startPages(work: string, vol: string, s = store()): number[] | null {
  try {
    return JSON.parse(get("shosai.starts", s) ?? "{}")[`${work}/${vol}`] ?? null;
  } catch {
    return null;
  }
}
export function saveStartPages(work: string, vol: string, starts: number[], s = store()) {
  let all: Record<string, number[]> = {};
  try {
    all = JSON.parse(get("shosai.starts", s) ?? "{}");
  } catch {}
  set("shosai.starts", JSON.stringify({ ...all, [`${work}/${vol}`]: starts }), s);
}

// ---- 組版の見方と紙 ----
/** 組版の見方。本番は本の判型と白い紙、読書は画面いっぱいに組んで紙の色と行間を選べる */
export type TsMode = "print" | "reading";
export type Paper = "white" | "sepia" | "gray" | "black";
export type Spacing = "tight" | "normal" | "loose";

/** 紙の色。ink と penText は紙に対して 4.5:1 以上（prefs.test で確かめる）。pen は線と札の地 */
export const PAPERS: Record<Paper, { label: string; paper: string; ink: string; pen: string; penText: string }> = {
  white: { label: "白", paper: "#ffffff", ink: "#1b1c20", pen: "#c23a22", penText: "#b0341e" },
  sepia: { label: "生成り", paper: "#f4ecd8", ink: "#2b2418", pen: "#c23a22", penText: "#a5301b" },
  gray: { label: "グレー", paper: "#d5d5d2", ink: "#1b1c20", pen: "#b0341e", penText: "#922915" },
  black: { label: "黒", paper: "#141414", ink: "#d2cbbd", pen: "#d4543a", penText: "#f08a72" },
};
/** margin は左右、y は天地の余白（px）。スマホではこれに重ねるバーの分を足す */
export const SPACINGS: Record<Spacing, { label: string; lineHeight: number; margin: number; y: number }> = {
  tight: { label: "狭い", lineHeight: 1.6, margin: 16, y: 24 },
  normal: { label: "普通", lineHeight: 1.8, margin: 28, y: 42 },
  loose: { label: "広い", lineHeight: 2.05, margin: 44, y: 66 },
};

/** 既定はスマホで読書、PC で本番 */
export function tsMode(mobile: boolean, s = store()): TsMode {
  const v = get("shosai.tsmode", s);
  return v === "print" || v === "reading" ? v : mobile ? "reading" : "print";
}
/** 紙の色の設定。auto はアプリのテーマに合わせる */
export function paper(s = store()): Paper | "auto" {
  const v = get("shosai.paper", s);
  return v && Object.hasOwn(PAPERS, v) ? (v as Paper) : "auto";
}
/** auto ならダークで黒い紙、ライトで生成り */
export const paperOf = (p: Paper | "auto", dark: boolean): Paper => (p !== "auto" ? p : dark ? "black" : "sepia");
export function spacing(s = store()): Spacing {
  const v = get("shosai.spacing", s);
  return v && Object.hasOwn(SPACINGS, v) ? (v as Spacing) : "normal";
}
