// URL の読み書き。`/` は本棚、`/<作品>` は続きから、`/<作品>/<巻>/<章>` は章を直接開く。
// 注目中の指摘（e）と開いている重ね物（s: シート・パレットなど）、組版の表示（view=typeset）と見方（mode=print|reading）は ? で持つ。
export interface Route {
  work?: string;
  vol?: string;
  /** 章のファイル名から .kym.txt を除いたもの */
  chap?: string;
  e?: string;
  s?: string;
  view?: "typeset";
  /** 組版の見方。無ければ端末の設定 */
  mode?: "print" | "reading";
}

const EXT = ".kym.txt";
export const chapOf = (file: string) => file.replace(/\.kym\.txt$/, "");
export const fileOf = (chap: string) => chap + EXT;

export function parseRoute(pathname: string, search: string): Route {
  const [work, vol, chap] = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const q = new URLSearchParams(search);
  const r: Route = { work, vol, chap: chap && chapOf(chap) };
  if (q.get("e")) r.e = q.get("e")!;
  if (q.get("s")) r.s = q.get("s")!;
  if (q.get("view") === "typeset") r.view = "typeset";
  const m = q.get("mode");
  if (m === "print" || m === "reading") r.mode = m;
  return clean(r);
}

export function routeUrl(r: Route): string {
  const path = "/" + [r.work, r.work && r.vol, r.work && r.vol && r.chap].filter(Boolean).map((x) => encodeURIComponent(x!)).join("/");
  const q = new URLSearchParams();
  if (r.e) q.set("e", r.e);
  if (r.s) q.set("s", r.s);
  if (r.view) q.set("view", r.view);
  if (r.mode) q.set("mode", r.mode);
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

/** 前の版のハッシュ（`#/作品/巻/章.kym.txt` か `#work=…&vol=…&file=…`）を新しい形に読み替える。 */
export function fromHash(hash: string): Route | null {
  const h = decodeURIComponent(hash.replace(/^#\/?/, ""));
  if (!h) return null;
  if (h.includes("=")) {
    const q = new URLSearchParams(h);
    const file = q.get("file");
    return q.get("work") ? clean({ work: q.get("work")!, vol: q.get("vol") ?? undefined, chap: file ? chapOf(file) : undefined }) : null;
  }
  const [work, vol, file] = h.split("/");
  return work ? clean({ work, vol, chap: file ? chapOf(file) : undefined }) : null;
}

function clean(r: Route): Route {
  for (const k of Object.keys(r) as (keyof Route)[]) if (!r[k]) delete r[k];
  return r;
}
