// syuki との連携の画面: 受信箱、場面（brief と recap）、人物・用語のカード、好意の段階、文体、設定集、台帳の検索。読むだけ（答えの決着を除く）。
import clsx from "clsx";
import { ArrowUp, X } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { KIND_LABEL } from "../server/markdown";
import { api } from "./api";
import { type Block, inline, parseMd } from "./md";
import type { AskList, AskQ, Impact, InboxItem, SceneRow } from "./syuki";
import type { Entry } from "./types";
import { IconButton } from "./ui";

/** syuki のコマンドを読む。cmd が null なら呼ばない。tick が変わったら読み直す（台帳や本文が変わった知らせ） */
export function useSy<T>(work: string, cmd: string | null, params: Record<string, string>, tick = 0): { data: T | null; err: string | null } {
  const [res, setRes] = useState<{ key: string; data: T | null; err: string | null }>({ key: "", data: null, err: null });
  const key = cmd ? `${work}\0${cmd}\0${JSON.stringify(params)}` : "";
  useEffect(() => {
    if (!cmd) return;
    let live = true;
    api.syuki<T>(work, cmd, params).then(
      (data) => live && setRes({ key, data, err: null }),
      (e) => live && setRes({ key, data: null, err: (e as Error).message }),
    );
    return () => {
      live = false;
    };
  }, [key, tick]);
  // 引数が変わった直後は前の答えを出さない（場面をまたいだ時に前の場面の brief が残らないように）
  return res.key === key ? res : { data: null, err: null };
}

const card = "flex flex-col gap-2 rounded-[10px] p-3 shadow-[0_0_0_1px_var(--color-line)]";
const meta = "flex items-center gap-2 text-[11px] text-sub";

function Reply(props: { label: string; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    props.onSend(text.trim());
    setText("");
  };
  return (
    <form className="well flex items-end gap-1 rounded-lg py-1 pr-1 pl-3" onSubmit={(ev) => (ev.preventDefault(), send())}>
      <textarea
        rows={1}
        className="field-sizing-content max-h-40 min-w-0 flex-1 resize-none bg-transparent py-1 outline-none"
        placeholder={props.label}
        aria-label={props.label}
        value={text}
        onChange={(ev) => setText(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) (ev.preventDefault(), send());
        }}
      />
      <IconButton size={28} type="submit" label="送る" className="primary! text-white!" disabled={!text.trim()}>
        <ArrowUp size={15} />
      </IconButton>
    </form>
  );
}

export interface InboxProps {
  items: InboxItem[];
  asks: AskList | null;
  impact: Impact | null;
  chapterTitle: (vol: string, file: string) => string;
  jumpEntry: (e: Entry) => void;
  jumpAsk: (q: AskQ) => void;
  reply: (e: Entry, body: string) => void;
  /** 送る前に確かめる（取り消せない）のは呼ぶ側 */
  settle: (q: AskQ, answer: string) => void;
  dismissImpact: () => void;
  err: string | null;
}

export function InboxView(p: InboxProps) {
  const prov = p.asks?.provisional ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pt-1 pb-3" aria-label="受信箱">
      {p.err && <p className="text-pen-text">{p.err}</p>}
      {p.impact && <ImpactCard impact={p.impact} onDismiss={p.dismissImpact} />}
      {p.items.length === 0 && !p.impact && <p className="py-8 text-center text-sub">なし</p>}
      <ol className="flex flex-col gap-2">
        {p.items.map((x) =>
          x.t === "entry" ? (
            <li key={x.e.id} className={card} data-inbox={x.e.id}>
              <button className={clsx(meta, "text-left")} onClick={() => p.jumpEntry(x.e)}>
                <span className="kind-line k-q" />
                <span className="text-fg">{KIND_LABEL[x.e.kind]}</span>
                <span>質問</span>
                <span className="truncate">{p.chapterTitle(x.vol, x.e.file.split("/")[1])}</span>
              </button>
              {x.e.quote && <p className="font-mincho text-[13px] leading-relaxed text-sub">{x.e.quote}</p>}
              {x.e.body && <p className="whitespace-pre-wrap leading-relaxed">{x.e.body}</p>}
              {(x.e.thread?.length ? x.e.thread : x.e.reply ? [{ by: "agent", body: x.e.reply }] : []).map((m, i) => (
                <p key={i} className={clsx("whitespace-pre-wrap border-l-2 border-[var(--color-line)] pl-2.5 leading-relaxed", m.by === "agent" && "text-sub")}>
                  {m.body}
                </p>
              ))}
              <Reply label="返事" onSend={(b) => p.reply(x.e, b)} />
            </li>
          ) : (
            <li key={x.q.id} className={card} data-inbox={x.q.id}>
              <button className={clsx(meta, "text-left")} onClick={() => p.jumpAsk(x.q)} disabled={!x.file}>
                <span className="text-fg">{x.q.id}</span>
                {x.q.at && <span>{x.q.at}</span>}
                {x.vol && x.file && <span className="truncate">{p.chapterTitle(x.vol, x.file)}</span>}
              </button>
              <p className="whitespace-pre-wrap leading-relaxed">{x.q.q}</p>
              <Reply label="答え" onSend={(a) => p.settle(x.q, a)} />
            </li>
          ),
        )}
      </ol>
      {prov.length > 0 && (
        <details className="text-sub">
          <summary className="cursor-default py-1 text-[12px]">【本文仮】の確定待ち {prov.length}</summary>
          <ul className="flex flex-col gap-1.5 pt-1 text-[12px] leading-relaxed">
            {prov.map((x) => (
              <li key={x.where}>
                <span className="text-[11px]">{x.where}</span> {x.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const evText = (e: { at: string; kind: string; who?: string | string[]; what?: string; note?: string }) =>
  `${e.at} ${[e.who].flat().filter(Boolean).join("・")} ${e.what ?? ""}`.trim();

function ImpactCard({ impact, onDismiss }: { impact: Impact; onDismiss: () => void }) {
  return (
    <section className={card} aria-label="直しの影響" data-impact>
      <div className={meta}>
        <span className="flex-1 text-fg">直しの影響</span>
        <IconButton size={24} label="消す" onClick={onDismiss}>
          <X size={13} />
        </IconButton>
      </div>
      <p className="text-[12px] text-sub">変えた場面: {impact.changed.map((c) => c.at).join("、") || "なし"}</p>
      {impact.lost.length > 0 && (
        <ul className="flex flex-col gap-1 text-[12px] text-pen-text">
          {impact.lost.map((l, i) => (
            <li key={i}>迷子: {l.msg}</li>
          ))}
        </ul>
      )}
      {impact.dependents.length > 0 && (
        <ul className="flex flex-col gap-1 text-[12px]">
          {impact.dependents.map((d, i) => (
            <li key={i}>後ろ: {evText(d)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- 場面 ----
interface Brief {
  at: string;
  when?: string;
  place?: string;
  summary?: string;
  card?: string[];
  notes?: string[];
  cast?: { name: string; place?: string; stage?: string; knows?: { what: string; at: string }[]; unknown_secrets?: string[]; items?: string[] }[];
  place_info?: { name: string; where?: string; looks?: string } | null;
  documents?: { id?: string; title?: string }[];
  threads?: { id: string; desc?: string; status?: string }[];
  questions?: { id: string; q: string }[];
}

function Section({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group">
      <summary className="cursor-default py-1 text-[12px] text-sub">{title}</summary>
      <div className="flex flex-col gap-1.5 pt-1 pb-2 leading-relaxed">{children}</div>
    </details>
  );
}

export function SceneView(props: { work: string; at: string; until: string; chapterAt: (at: string) => boolean; tick: number }) {
  const b = useSy<Brief>(props.work, "brief", { at: props.at }, props.tick);
  const r = useSy<SceneRow[]>(props.work, "recap", { until: props.until }, props.tick);
  // あらすじはこの章より前まで（この章の分は場面のカードと重なる）
  const recap = r.data?.filter((x) => !props.chapterAt(x.at)) ?? [];
  const d = b.data;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pt-1 pb-3" aria-label="場面" data-scene-at={props.at}>
      {recap.length > 0 && (
        <Section title="ここまで">
          {recap.map((x) => (
            <p key={x.at} className="text-[12px]">
              <span className="text-sub">{x.at}</span> {x.summary}
            </p>
          ))}
        </Section>
      )}
      {b.err && <p className="text-pen-text">{b.err}</p>}
      {!d && !b.err && <p className="py-8 text-center text-sub">…</p>}
      {d && (
        <>
          <div className="flex flex-col gap-1 py-1">
            <span className="text-[11px] text-sub">
              {d.at}
              {d.when && `　${d.when}`}
              {d.place && `　${d.place}`}
            </span>
            {d.summary && <p className="leading-relaxed">{d.summary}</p>}
          </div>
          {!!d.card?.length && (
            <Section title="カード">
              {d.card.map((c, i) => (
                <p key={i} className="whitespace-pre-wrap text-[13px]">
                  {c}
                </p>
              ))}
            </Section>
          )}
          {!!d.notes?.length && (
            <Section title="筋道メモ">
              {d.notes.map((c, i) => (
                <p key={i} className="whitespace-pre-wrap text-[13px]">
                  {c}
                </p>
              ))}
            </Section>
          )}
          {!!d.cast?.length && (
            <Section title="出ている人物" open>
              {d.cast.map((c) => (
                <details key={c.name} className="text-[13px]">
                  <summary className="cursor-default">
                    {c.name}
                    <span className="text-sub">
                      {c.place && `　${c.place}`}
                      {c.stage && `　${c.stage}`}
                    </span>
                  </summary>
                  <PersonBody s={c} />
                </details>
              ))}
            </Section>
          )}
          {d.place_info && (
            <Section title="場所">
              <p className="text-[13px]">
                {d.place_info.name}
                <span className="text-sub">{[d.place_info.where, d.place_info.looks].filter(Boolean).map((x) => `　${x}`)}</span>
              </p>
            </Section>
          )}
          {!!d.threads?.length && (
            <Section title="近くの伏線">
              {d.threads.map((t) => (
                <p key={t.id} className="text-[13px]">
                  {t.id} <span className="text-sub">{t.desc}</span>
                </p>
              ))}
            </Section>
          )}
          {!!d.documents?.length && (
            <Section title="文書">
              {d.documents.map((x, i) => (
                <p key={i} className="text-[13px]">
                  {x.title ?? x.id}
                </p>
              ))}
            </Section>
          )}
          {!!d.questions?.length && (
            <Section title="確認中">
              {d.questions.map((q) => (
                <p key={q.id} className="text-[13px]">
                  {q.id} {q.q}
                </p>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

interface State {
  name?: string;
  place?: string;
  knows?: { what: string; at: string }[];
  unknown_secrets?: string[];
  feels?: { to: string; what: string; at: string }[];
  items?: string[];
  stage?: string | null;
}
function PersonBody({ s }: { s: State }) {
  const row = (label: string, v: ReactNode) => (
    <div className="grid grid-cols-[4.5em_1fr] gap-2 text-[12px]">
      <span className="text-sub">{label}</span>
      <div>{v}</div>
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5 py-1.5">
      {s.place && row("居場所", s.place)}
      {s.stage && row("段階", s.stage)}
      {!!s.items?.length && row("持ち物", s.items.join("、"))}
      {!!s.feels?.length && row("気持ち", s.feels.map((f) => <p key={f.to + f.at}>{f.to}: {f.what}</p>))}
      {!!s.knows?.length &&
        row(
          "知っている",
          s.knows.map((k, i) => (
            <p key={i}>
              {k.what} <span className="text-sub">{k.at}</span>
            </p>
          )),
        )}
      {!!s.unknown_secrets?.length && row("知らない", s.unknown_secrets.join("、"))}
    </div>
  );
}

export type NameKind = "character" | "term" | "item";
/** 人物・用語・持ち物のカードの中身。時点はその場面の頭 */
export function NameCard(props: { work: string; name: string; kind: NameKind; note: string | null; desc?: string; at: string; secret: boolean; tick: number }) {
  const { work, name, kind, at } = props;
  const st = useSy<State>(work, kind === "character" ? "state" : null, { name, at }, props.tick);
  const wh = useSy<{ holder?: string; moves?: unknown[] }>(work, kind === "item" ? "where" : null, { name, at }, props.tick);
  const kn = useSy<{ fact?: string; knows?: { name: string; at: string }[]; not_yet?: string[] }>(work, props.secret ? "knows" : null, { name, at }, props.tick);
  const se = useSy<{ ledger?: { where: string; text: string }[]; markdown?: { where: string; heading?: string; text: string }[] }>(
    work,
    // 説明のある用語は説明を出す。無い用語だけ台帳・設定集の当たりで代える
    kind === "term" && !props.desc ? "search" : null,
    { q: name, at },
    props.tick,
  );
  const err = st.err ?? wh.err ?? kn.err ?? se.err;
  return (
    <div className="flex flex-col gap-1.5" data-card={name}>
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">{name}</span>
        {props.note && <span className="text-[12px] text-sub">{props.note}</span>}
        <span className="flex-1" />
        <span className="text-[11px] text-sub">{at.replace(/^[\w-]+\//, "")}</span>
      </div>
      {err && <p className="text-[12px] text-pen-text">{err}</p>}
      {st.data && <PersonBody s={st.data} />}
      {props.desc && <p className="text-[12px] leading-relaxed">{props.desc}</p>}
      {wh.data && <p className="text-[12px]">持ち主: {wh.data.holder ?? "不明"}</p>}
      {kn.data && (
        <div className="flex flex-col gap-1 text-[12px]">
          {kn.data.fact && <p>{kn.data.fact}</p>}
          <p>
            <span className="text-sub">知っている </span>
            {kn.data.knows?.map((k) => k.name).join("、") || "なし"}
          </p>
        </div>
      )}
      {se.data && (
        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto text-[12px] leading-relaxed">
          {[...(se.data.markdown ?? []), ...(se.data.ledger ?? [])].slice(0, 6).map((h, i) => (
            <li key={i}>{h.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- 好意の段階 ----
interface Stage {
  heroine: string;
  chapters: { chapter: string; stage: string; seen: boolean }[];
  last_seen: string | null;
  absent: boolean;
}
export function StagesView({ work, tick }: { work: string; tick: number }) {
  const { data, err } = useSy<Stage[]>(work, "stages", {}, tick);
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4" data-stages>
      <h2 className="text-sm font-semibold">好意の段階</h2>
      {err && <p className="text-pen-text">{err}</p>}
      {data?.map((h) => (
        <section key={h.heroine} className={card}>
          <div className={meta}>
            <span className="text-fg">{h.heroine}</span>
            {h.absent && <span className="text-pen-text">しばらく出ていない（最後 {h.last_seen ?? "なし"}）</span>}
          </div>
          <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
            {h.chapters.map((c) => (
              <li key={c.chapter} className={clsx(!c.seen && "text-sub opacity-70")}>
                <span className="text-sub">{c.chapter}</span> {c.stage}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

// ---- 文体（文末のずれと出すぎた語） ----
interface Ending {
  speaker: string;
  sentences: number;
  off_sample: number;
  off_top: [string, number][];
  sample_unused: string[];
}
interface Excess {
  excess: { gram: string; z: number; count: number; per_10k: number; base_per_10k: number }[];
}
export function StyleView({ work, chapter, title, tick }: { work: string; chapter: string; title: string; tick: number }) {
  const en = useSy<Ending[]>(work, "endings", { chapter }, tick);
  const ex = useSy<Excess>(work, "excess", { chapter }, tick);
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4" data-style>
      <h2 className="text-sm font-semibold">文体 <span className="font-normal text-sub">{title}</span></h2>
      <section className="flex flex-col gap-1.5">
        <h3 className="text-[12px] text-sub">文末（見本に無い割合）</h3>
        {en.err && <p className="text-pen-text">{en.err}</p>}
        {!en.data && !en.err && <p className="text-sub">…</p>}
        {en.data?.length === 0 && <p className="text-sub">なし</p>}
        {en.data?.map((r) => (
          <div key={r.speaker} className="grid grid-cols-[7em_3.5em_1fr] gap-2 text-[12px]">
            <span className="truncate">{r.speaker}</span>
            <span className={clsx("tabular-nums", r.off_sample >= 0.4 && "text-pen-text")}>{Math.round(r.off_sample * 100)}%</span>
            <span className="text-sub">
              {r.off_top.map(([w, n]) => `${w} ${n}`).join("、")}
              {r.sample_unused.length > 0 && ` ／ 使っていない: ${r.sample_unused.join("、")}`}
            </span>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className="text-[12px] text-sub">出すぎた語（ほかの章と比べて）</h3>
        {ex.err && <p className="text-pen-text">{ex.err}</p>}
        {!ex.data && !ex.err && <p className="text-sub">…</p>}
        <ol className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-[12px]">
          {ex.data?.excess.slice(0, 15).map((x) => (
            <Fragment key={x.gram}>
              <span>{x.gram}</span>
              <span className="tabular-nums">{x.count}</span>
              <span className="text-sub tabular-nums">
                {x.per_10k} / {x.base_per_10k}
              </span>
            </Fragment>
          ))}
        </ol>
      </section>
    </div>
  );
}

// ---- 設定集 ----
export const DOC_LABEL: Record<string, string> = { characters: "人物", details: "設定", map: "地図", documents: "文書" };
export function DocsView(props: { work: string; docs: string[]; name: string; pick: (n: string) => void }) {
  const [res, setRes] = useState<{ name: string; text?: string; err?: string } | null>(null);
  useEffect(() => {
    let live = true;
    api.doc(props.work, props.name).then(
      (r) => live && setRes({ name: props.name, text: r.text }),
      (e) => live && setRes({ name: props.name, err: (e as Error).message }),
    );
    return () => {
      live = false;
    };
  }, [props.work, props.name]);
  const cur = res?.name === props.name ? res : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-docs>
      <div role="tablist" aria-label="設定集" className="flex gap-1 px-3 pt-3 pb-2 shadow-[0_1px_0_var(--color-line)]">
        {props.docs.map((d) => (
          <button key={d} role="tab" aria-selected={d === props.name} className="ghost h-7 rounded-md px-2.5 text-[13px]" onClick={() => props.pick(d)}>
            {DOC_LABEL[d] ?? d}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {cur?.err && <p className="text-pen-text">{cur.err}</p>}
        {cur?.text !== undefined && <Md blocks={parseMd(cur.text)} />}
      </div>
    </div>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {inline(text).map((x, i) =>
        x.t === "b" ? <strong key={i}>{x.s}</strong> : x.t === "code" ? <code key={i} className="well rounded px-1 text-[12px]">{x.s}</code> : <Fragment key={i}>{x.s}</Fragment>,
      )}
    </>
  );
}
function Md({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-2.5 leading-relaxed">
      {blocks.map((b, i) => {
        if (b.t === "h") {
          const cls = ["text-lg font-semibold", "pt-3 text-base font-semibold", "pt-2 font-semibold", "font-semibold"][Math.min(b.level, 4) - 1];
          return (
            <div key={i} role="heading" aria-level={b.level} className={cls}>
              <Inline text={b.text} />
            </div>
          );
        }
        if (b.t === "p") return <p key={i} className="whitespace-pre-wrap"><Inline text={b.text} /></p>;
        if (b.t === "quote") return <blockquote key={i} className="border-l-2 border-[var(--color-line)] pl-3 whitespace-pre-wrap text-sub"><Inline text={b.text} /></blockquote>;
        if (b.t === "table")
          return (
            <div key={i} className="overflow-x-auto">
              <table className="text-[13px]">
                <thead>
                  <tr>
                    {b.head.map((h, j) => (
                      <th key={j} className="px-2 py-1 text-left font-semibold shadow-[0_1px_0_var(--color-line)]">
                        <Inline text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k} className="px-2 py-1 align-top shadow-[0_1px_0_var(--color-line)]">
                          <Inline text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        const List = b.t === "ol" ? "ol" : "ul";
        return (
          <List key={i} className={clsx("flex flex-col gap-1 pl-5", b.t === "ol" ? "list-decimal" : "list-disc")}>
            {b.items.map((it, j) => (
              <li key={j} style={{ marginLeft: `${it.depth * 1.25}em` }}>
                <Inline text={it.text} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

// ---- 検索の台帳・設定集・plot の段 ----
interface SyHit {
  where: string;
  text: string;
  heading?: string;
}
export function LedgerHits({ work, q }: { work: string; q: string }) {
  const [res, setRes] = useState<{ q: string; hits: SyHit[]; err?: string } | null>(null);
  useEffect(() => {
    if (!q) return setRes(null);
    let live = true;
    const t = window.setTimeout(
      () =>
        api.syuki<{ ledger?: SyHit[]; markdown?: SyHit[] }>(work, "search", { q }).then(
          (r) => live && setRes({ q, hits: [...(r.ledger ?? []), ...(r.markdown ?? [])] }),
          (e) => live && setRes({ q, hits: [], err: (e as Error).message }),
        ),
      250,
    );
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [work, q]);
  if (!res || res.q !== q) return null;
  return (
    <section aria-label="台帳と設定" className="shadow-[0_-1px_0_var(--color-line)]">
      <h3 className="px-4 pt-2 pb-1 text-[11px] text-sub">
        台帳・設定集・plot {res.hits.length} 件
      </h3>
      {res.err && <p className="px-4 py-1 text-pen-text">{res.err}</p>}
      <ul className="max-h-[30dvh] overflow-y-auto px-1.5 pb-1.5" data-ledger-hits>
        {res.hits.slice(0, 100).map((h, i) => (
          <li key={i} className="flex items-baseline gap-3 rounded-lg px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate">{h.text}</span>
            <span className="shrink-0 text-[11px] text-sub">{h.where.replace(/:\d+$/, "")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
