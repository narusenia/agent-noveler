// 本棚（入口）。作品ごとに縦書きの題名の背の本を並べ、下に最後に読んだ章・巻の数・未処理の件数を出す。
import { Inbox, Library, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "./api";
import { isTodo } from "./Panel";
import * as prefs from "./prefs";
import { fileOf } from "./route";
import type { AskList } from "./syuki";
import type { Work } from "./types";
import { IconButton } from "./ui";

/** 表紙の色。絵ができたら book.config.js の cover に置き換える */
const COVER: Record<string, [string, string, string]> = {
  "sample-work": ["#1f2a44", "#26355a", "#efe7d4"],
};
const GRAY: [string, string, string] = ["#4a4b50", "#5a5b61", "#ecebe8"];

export function Shelf(props: { works: Work[]; open: (work: string) => void; palette: () => void }) {
  const [todo, setTodo] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    // 未処理は、指摘の未処理と syuki の作者への問い（open）を足した数
    for (const w of props.works)
      Promise.all([
        Promise.all(w.vols.map((v) => api.review(w.name, v.name).catch(() => null))),
        w.syuki ? api.syuki<AskList>(w.name, "ask").catch(() => null) : null,
      ]).then(
        ([rs, ask]) =>
          live &&
          setTodo((t) => ({ ...t, [w.name]: rs.reduce((n, r) => n + (r?.entries.filter(isTodo).length ?? 0), 0) + (ask?.questions.length ?? 0) })),
      );
    return () => {
      live = false;
    };
  }, [props.works]);
  const pos = prefs.readPos();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2.5 px-5">
        <Library size={18} aria-hidden />
        <span className="flex-1 font-semibold tracking-wide">shosai</span>
        <IconButton label="コマンド" keys="⌘K" size={40} onClick={props.palette}>
          <Search size={18} />
        </IconButton>
      </header>
      <main className="flex flex-1 items-center justify-center overflow-auto px-4 pb-20">
        <div className="grid grid-cols-[repeat(auto-fit,136px)] justify-center gap-x-7 gap-y-10 md:grid-cols-[repeat(auto-fit,176px)] md:gap-x-[72px] w-full max-w-5xl">
          {props.works.map((w) => {
            const [spine, face, ink] = COVER[w.name] ?? GRAY;
            const p = pos[w.name];
            const last = p && w.vols.find((v) => v.name === p.vol)?.chapters.find((c) => c.file === fileOf(p.chap));
            const n = todo[w.name] ?? 0;
            return (
              <a
                key={w.name}
                href={`/${w.name}`}
                className="book group flex flex-col gap-4 rounded-lg outline-offset-4"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  props.open(w.name);
                }}
              >
                <div
                  className="flex aspect-[176/252] w-full justify-center rounded-[3px_8px_8px_3px] pt-6 transition-transform duration-200 group-hover:-translate-y-1"
                  style={{
                    background: `linear-gradient(90deg, ${spine} 0 8px, ${face} 8px)`,
                    boxShadow: "inset 1px 0 0 rgb(255 255 255 / .08), 0 10px 24px rgb(20 20 40 / .22), 0 2px 4px rgb(20 20 40 / .18)",
                  }}
                >
                  <span className="font-mincho text-base font-semibold tracking-[.14em] [writing-mode:vertical-rl] md:text-xl" style={{ color: ink }}>
                    {w.title}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-xs text-sub">
                  <span className="truncate text-[13px] text-fg">{last?.title ?? w.vols[0].chapters[0].title}</span>
                  <span className="flex items-center gap-3">
                    {w.vols.length} 巻
                    <span className={`flex items-center gap-1 ${n ? "text-pen-text" : ""}`} aria-label={`未処理 ${n} 件`}>
                      <Inbox size={13} aria-hidden />
                      {n}
                    </span>
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      </main>
    </div>
  );
}
