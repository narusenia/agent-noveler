import type { HeatPar } from "./heat";
import type { ChapterData, Entry, Review, SearchHit, Work } from "./types";

export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
}

const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();

export interface Loc {
  work: string;
  vol: string;
  file: string;
}

export const api = {
  works: () => call<Work[]>("GET", "/api/works"),
  chapter: (l: Loc) => call<ChapterData>("GET", `/api/chapter?${qs({ ...l })}`),
  search: (work: string, vol: string, q: string) =>
    call<{ hits: SearchHit[]; capped: boolean }>("GET", `/api/search?${qs({ work, vol, q })}`),
  style: (l: Loc) => call<{ paragraphs: HeatPar[] }>("GET", `/api/style?${qs({ work: l.work, file: `${l.vol}/${l.file}` })}`),
  review: (work: string, vol: string) => call<Review>("GET", `/api/review?${qs({ work, vol })}`),
  edit: (
    l: Loc,
    b: { line: number; expect: string; start: number; end: number; text: string; entry: Partial<Entry> },
  ) => call<Review>("POST", "/api/edit", { ...l, ...b }),
  /** base は読んだ時の updated。ほかで書き換わっていたら 409 */
  upsert: (work: string, vol: string, entry: Partial<Entry>, base?: string) =>
    call<Review>("POST", "/api/review", { work, vol, entry, base }),
  reply: (work: string, vol: string, id: string, body: string, base?: string) =>
    call<Review>("POST", "/api/review/reply", { work, vol, id, body, base }),
  apply: (work: string, vol: string, ids: string[]) =>
    call<{ review: Review; failed: { id: string; reason: string }[] }>("POST", "/api/apply", { work, vol, ids }),
  remove: (work: string, vol: string, id: string, base?: string) =>
    call<Review>("POST", "/api/review/delete", { work, vol, id, base }),
  /** 台帳を読むだけの syuki のコマンド（server/syuki.ts の READ） */
  syuki: <T>(work: string, cmd: string, o: Record<string, string> = {}) => call<T>("GET", `/api/syuki?${qs({ work, cmd, ...o })}`),
  /** 作者の答えで ask を決着させる。questions.yaml を書くので取り消せない */
  settle: (work: string, id: string, answer: string) => call<unknown>("POST", "/api/ask/settle", { work, id, answer }),
  doc: (work: string, name: string) => call<{ text: string }>("GET", `/api/doc?${qs({ work, name })}`),
  keep: (l: Loc, sentence: string, entry: Partial<Entry>) =>
    call<Review>("POST", "/api/keep", { work: l.work, vol: l.vol, file: `${l.vol}/${l.file}`, sentence, entry }),
};
