// ⌘K のパレット（全操作）と、巻の全章の検索。
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Search as SearchIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "./api";
import type { SearchHit } from "./types";
import { Kbd, Modal } from "./ui";

export interface Command {
  id: string;
  label: string;
  group: string;
  keys?: string;
  run: () => void;
}

export function Palette(props: { open: boolean; onClose: () => void; commands: Command[] }) {
  const groups = [...new Set(props.commands.map((c) => c.group))].map((g) => ({
    value: g,
    items: props.commands.filter((c) => c.group === g),
  }));
  return (
    <Modal open={props.open} onClose={props.onClose} label="コマンド" top className="max-w-lg">
      <Autocomplete.Root open inline items={groups} autoHighlight="always" keepHighlight itemToStringValue={(c: Command) => c.label}>
        <div className="flex items-center gap-2 px-3 shadow-[0_1px_0_var(--color-line)]">
          <SearchIcon size={16} className="text-sub" />
          <Autocomplete.Input autoFocus aria-label="コマンド" className="h-11 w-full bg-transparent text-[15px] outline-none" />
        </div>
        <div className="min-h-0 overflow-y-auto p-1.5">
          <Autocomplete.Empty>
            <p className="p-4 text-sub">なし</p>
          </Autocomplete.Empty>
          <Autocomplete.List>
            {(g: (typeof groups)[number]) => (
              <Autocomplete.Group key={g.value} items={g.items} className="mb-1">
                <Autocomplete.GroupLabel className="px-2.5 pt-2 pb-1 text-[11px] text-sub">{g.value}</Autocomplete.GroupLabel>
                <Autocomplete.Collection>
                  {(c: Command) => (
                    <Autocomplete.Item
                      key={c.id}
                      value={c}
                      onClick={() => {
                        // URL を変える操作は、パレットの履歴をその場で置き換える。変えない操作の時だけ閉じる
                        const before = location.href;
                        c.run();
                        if (location.href === before) props.onClose();
                      }}
                      className="flex h-9 cursor-default items-center gap-2 rounded-lg px-2.5 outline-none data-highlighted:bg-raised data-highlighted:shadow-raised"
                    >
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                      {c.keys && <Kbd>{c.keys}</Kbd>}
                    </Autocomplete.Item>
                  )}
                </Autocomplete.Collection>
              </Autocomplete.Group>
            )}
          </Autocomplete.List>
        </div>
      </Autocomplete.Root>
    </Modal>
  );
}

/** 巻の全章を検索する。Enter かクリックで当たりを開く */
export function Search(props: {
  open: boolean;
  work: string;
  vol: string;
  onOpen: (h: SearchHit) => void;
  onClose: () => void;
  /** 本文の当たりの下に足す段（syuki の台帳・設定集・plot） */
  extra?: (q: string) => ReactNode;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ hits: SearchHit[]; capped: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!q) return setRes(null);
    let live = true;
    const t = window.setTimeout(
      () =>
        api.search(props.work, props.vol, q).then(
          (r) => {
            if (!live) return;
            setRes(r);
            setErr(null);
            setIdx(0);
          },
          (e) => live && setErr(`探せなかった: ${(e as Error).message}`),
        ),
      200,
    );
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q, props.work, props.vol]);

  const hits = res?.hits ?? [];
  useEffect(() => document.getElementById(`hit-${idx}`)?.scrollIntoView({ block: "nearest" }), [idx]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, Math.min(hits.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && hits[idx]) {
      e.preventDefault();
      props.onOpen(hits[idx]);
    }
  };

  return (
    <Modal open={props.open} onClose={props.onClose} label="検索" top className="max-w-xl">
      <div className="flex items-center gap-2 px-3 shadow-[0_1px_0_var(--color-line)]">
        <SearchIcon size={16} className="text-sub" />
        <input
          autoFocus
          aria-label="検索語"
          placeholder={props.vol}
          className="search-input h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {res && (
          <span className="shrink-0 text-xs text-sub" role="status">
            {res.hits.length}
            {res.capped && "+"} 件
          </span>
        )}
      </div>
      {err && <p className="px-4 py-2 text-pen-text">{err}</p>}
      <ul className="min-h-0 overflow-y-auto p-1.5" role="listbox" aria-label="当たり">
        {hits.map((h, i) => (
          <li
            key={`${h.file}:${h.line}:${h.start}`}
            id={`hit-${i}`}
            role="option"
            aria-selected={i === idx}
            className="hit flex cursor-default items-baseline gap-3 rounded-lg px-2.5 py-2 aria-selected:bg-raised aria-selected:shadow-raised"
            onMouseEnter={() => setIdx(i)}
            onClick={() => props.onOpen(h)}
          >
            <span className="min-w-0 flex-1 truncate font-mincho">
              {h.before}
              <mark className="bg-transparent font-bold text-pen-text">{h.hit}</mark>
              {h.after}
            </span>
            <span className="shrink-0 text-[11px] text-sub">{h.title}</span>
          </li>
        ))}
      </ul>
      {props.extra?.(q)}
    </Modal>
  );
}
