import { Tabs } from "@base-ui/react/tabs";
import clsx from "clsx";
import { ArrowUp, Check, ClipboardCopy, CheckCheck, LocateFixed, Pencil, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { isRed, KIND_LABEL } from "../server/markdown";
import * as prefs from "./prefs";
import type { Entry, Review } from "./types";
import { IconButton, toast } from "./ui";

export type Filter = "todo" | "red" | "all";

/** 状態の呼び名は四つに揃える */
export const statusLabel = (e: Entry): string =>
  e.status === "question" ? "質問" : e.status === "open" ? "未適用" : e.status === "declined" || e.status === "reverted" ? "見送り" : "済";
export const isTodo = (e: Entry) => e.status === "open" || e.status === "question";

export function requestText(r: Review, ids: string[], commit: boolean): string {
  return [
    `packages/${r.work}/review/${r.vol}.json の未処理の指摘 ${ids.join(", ")} を処理して。`,
    "決まりは .agents/rules/shosai-review.md。直したら各指摘の status と reply を JSON に書き戻すこと。",
    commit ? "コミットはしてよい。" : "コミットはしない。",
  ].join("\n");
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // http で開いたときなど clipboard API が使えない場合
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}
export const copyRequest = async (r: Review) => {
  const ids = r.entries.filter((e) => e.status === "open").map((e) => e.id);
  if (!ids.length) return toast("未処理の指摘が無い");
  await copy(requestText(r, ids, prefs.get("shosai.commit") === "1"));
  toast(`依頼文をコピーした（${ids.length} 件）`);
};

export interface PanelActions {
  jump: (e: Entry) => void;
  apply: (ids: string[]) => void;
  fix: (e: Entry) => void;
  edit: (e: Entry) => void;
  status: (e: Entry, s: Entry["status"]) => void;
  revert: (e: Entry) => void;
  remove: (e: Entry) => void;
  reattach: (e: Entry) => void;
  reply: (e: Entry, body: string) => void;
}

export function Panel(props: {
  review: Review;
  fileKey: string;
  chapterTitle: (file: string) => string;
  /** 今の章の指摘が見つかるか。false は迷子 */
  located: Map<string, boolean>;
  focusId: string | null;
  act: PanelActions;
}) {
  const { review, focusId, act } = props;
  const [filter, setFilter] = useState<Filter>("todo");
  const [wide, setWide] = useState(false);
  const [commit, setCommit] = useState(() => prefs.get("shosai.commit") === "1");

  const lost = (e: Entry) => e.file === props.fileKey && props.located.get(e.id) === false;
  const inFilter = (e: Entry, f: Filter) =>
    f === "all" || (f === "todo" && (isTodo(e) || lost(e))) || (f === "red" && isRed(e) && e.status !== "reverted");
  const scoped = review.entries.filter((e) => wide || e.file === props.fileKey);
  const list = scoped.filter((e) => inFilter(e, filter)).reverse();
  const reds = review.entries.filter((e) => e.status === "open" && isRed(e)).map((e) => e.id);

  useEffect(() => {
    if (!focusId) return;
    const e = review.entries.find((x) => x.id === focusId);
    if (e && e.file !== props.fileKey) setWide(true);
    if (e && !inFilter(e, filter)) setFilter("all");
    requestAnimationFrame(() => document.getElementById(`item-${focusId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [focusId]);

  const tab = "ghost h-7 rounded-md px-2.5 text-[13px]";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs.Root value={filter} onValueChange={(v) => setFilter(v as Filter)} className="flex items-center gap-1 px-3 pt-3 pb-2">
        <Tabs.List className="flex gap-1">
          {(
            [
              ["todo", "未処理"],
              ["red", "赤"],
              ["all", "すべて"],
            ] as const
          ).map(([f, label]) => (
            <Tabs.Tab key={f} value={f} className={tab}>
              {label} <span className={f === "todo" ? "text-pen-text" : "text-sub"}>{scoped.filter((e) => inFilter(e, f)).length}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <span className="flex-1" />
        <button aria-pressed={wide} className={tab} onClick={() => setWide(!wide)}>
          巻
        </button>
      </Tabs.Root>

      <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3" aria-label="指摘">
        {list.length === 0 && <li className="py-8 text-center text-sub">なし</li>}
        {list.map((e) => (
          <Item key={e.id} e={e} lost={lost(e)} focus={focusId === e.id} where={wide ? props.chapterTitle(e.file) : ""} act={act} />
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-1 px-3 py-2 shadow-[0_-1px_0_var(--color-line)]">
        <button className="ghost flex h-8 items-center gap-1.5 rounded-lg px-2 disabled:opacity-40" disabled={!reds.length} onClick={() => act.apply(reds)}>
          <CheckCheck size={15} />
          すべて適用 <span className="text-pen-text">{reds.length}</span>
        </button>
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-sub">
          <input
            type="checkbox"
            className="accent-pen"
            checked={commit}
            onChange={(ev) => {
              setCommit(ev.target.checked);
              prefs.set("shosai.commit", ev.target.checked ? "1" : "0");
            }}
          />
          コミット可
        </label>
        <IconButton label="依頼文をコピー" onClick={() => copyRequest(review)}>
          <ClipboardCopy size={16} />
        </IconButton>
      </div>
    </div>
  );
}

function Item({ e, lost, focus, where, act }: { e: Entry; lost: boolean; focus: boolean; where: string; act: PanelActions }) {
  const [text, setText] = useState("");
  const red = isRed(e);
  const thread = e.thread?.length ? e.thread : e.reply ? [{ by: "agent" as const, body: e.reply, at: e.updated }] : [];
  const kindCls = e.status === "question" ? "k-q" : `k-${e.kind}`;
  const send = () => {
    if (!text.trim()) return;
    act.reply(e, text.trim());
    setText("");
  };
  return (
    <li
      id={`item-${e.id}`}
      className={clsx(
        "flex flex-col gap-2 rounded-[10px] p-3 transition-shadow",
        focus ? "raised" : "shadow-[0_0_0_1px_var(--color-line)]",
        !isTodo(e) && !lost && "opacity-65",
      )}
    >
      <div className="flex items-center gap-2 text-[11px] text-sub">
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => act.jump(e)}>
          <span className={clsx("kind-line", kindCls)} />
          <span className="text-fg">{KIND_LABEL[e.kind]}</span>
          <span className={clsx(lost ? "text-pen-text" : "")}>{lost ? "迷子" : statusLabel(e)}</span>
          <span className="truncate">{where}</span>
        </button>
        <div className="-my-1 flex shrink-0 items-center">
          {e.status === "open" && red && (
            <IconButton size={26} label="適用" onClick={() => act.apply([e.id])}>
              <Check size={14} />
            </IconButton>
          )}
          {e.status === "open" && red && (
            <IconButton size={26} label="直す" onClick={() => act.fix(e)}>
              <Pencil size={14} />
            </IconButton>
          )}
          {isTodo(e) && !red && (
            <IconButton size={26} label="直す" onClick={() => act.edit(e)}>
              <Pencil size={14} />
            </IconButton>
          )}
          {isTodo(e) && !red && (
            <IconButton size={26} label="済にする" onClick={() => act.status(e, "done")}>
              <Check size={14} />
            </IconButton>
          )}
          {e.status === "applied" && e.kind !== "keep" && (
            <IconButton size={26} label="イキ" onClick={() => act.revert(e)}>
              <Undo2 size={14} />
            </IconButton>
          )}
          {!isTodo(e) && e.status !== "applied" && e.kind !== "keep" && !(red && e.status === "done") && e.status !== "reverted" && (
            <IconButton size={26} label="未処理に戻す" onClick={() => act.status(e, "open")}>
              <RotateCcw size={14} />
            </IconButton>
          )}
          {lost && (
            <IconButton size={26} label="付け直す" onClick={() => act.reattach(e)}>
              <LocateFixed size={14} />
            </IconButton>
          )}
          <IconButton size={26} label="消す" onClick={() => act.remove(e)}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      {red ? (
        <p className="font-mincho text-[13px] leading-relaxed">
          <del className="text-sub">{e.before || "（なし）"}</del> → <ins className="text-pen-text no-underline">{e.after || "（トル）"}</ins>
        </p>
      ) : (
        e.quote && <p className="font-mincho text-[13px] leading-relaxed text-sub">{e.quote}</p>
      )}
      {e.body && <p className="whitespace-pre-wrap leading-relaxed">{e.body}</p>}
      {thread.length > 0 && (
        <div className="flex flex-col gap-1.5 border-l-2 border-[var(--color-line)] pl-2.5">
          {thread.map((m, i) => (
            <p key={i} className={clsx("whitespace-pre-wrap leading-relaxed", m.by === "agent" && "text-sub")}>
              {m.body}
            </p>
          ))}
        </div>
      )}
      {(e.status === "question" || (focus && !red)) && (
        <form className="well flex items-center gap-1 rounded-lg py-1 pr-1 pl-3" onSubmit={(ev) => (ev.preventDefault(), send())}>
          <input
            className="min-w-0 flex-1 bg-transparent py-1 outline-none"
            placeholder="返事"
            aria-label="返事"
            value={text}
            onChange={(ev) => setText(ev.target.value)}
          />
          <IconButton size={28} type="submit" label="送る" className="primary! text-white!" disabled={!text.trim()}>
            <ArrowUp size={15} />
          </IconButton>
        </form>
      )}
    </li>
  );
}
