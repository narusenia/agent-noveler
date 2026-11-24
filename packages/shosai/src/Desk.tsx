// 赤入れの画面。PC は左にサイドバー、上に薄いバー、中央に紙、右に指摘。スマホは上に章の名前、下に浮いたバー。
import { Drawer } from "@base-ui/react/drawer";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import clsx from "clsx";
import {
  ALargeSmall,
  AlertCircle,
  BookOpen,
  BookOpenText,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Clapperboard,
  Command as CommandIcon,
  File as FileIcon,
  Eraser,
  Highlighter,
  Inbox,
  Layers,
  Library,
  Loader2,
  ListTree,
  LocateFixed,
  MessageSquare,
  MoreHorizontal,
  PenLine,
  Pin,
  Printer,
  Plus,
  RefreshCw,
  Replace,
  Search as SearchIcon,
  Sparkles,
  Type,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isRed, KIND_LABEL } from "../server/markdown";
import { ApiError, api, type Loc } from "./api";
import { type Nav, THEMES, themeCommands, useMedia } from "./App";
import { type Tint, tints } from "./heat";
import { type Anchor, context, findTok, hasMarkup, plain, resolve, snap, tokenize } from "./kym";
import { type Command, Palette, Search } from "./Palette";
import {
  type AskList,
  type AskQ,
  askCounts,
  atChapter,
  type CheckItem,
  chapMatches,
  callNames,
  findNames,
  findQuote,
  type Impact,
  inbox,
  type ListRow,
  type ThreadRow,
  lintFindings,
  locate,
  pointOf,
  quoteOf,
  type SceneRow,
  sceneBreaks,
  sceneHead,
  sceneOf,
  checkLine,
} from "./syuki";
import { DOC_LABEL, DocsView, InboxView, LedgerHits, NameCard, type NameKind, SceneView, StagesView, StyleView, useSy } from "./SyukiViews";
import { copyRequest, isTodo, Panel, type PanelActions } from "./Panel";
import * as prefs from "./prefs";
import { Reader, type Insert, type Mark, toDom, toSource } from "./Reader";
import { chapOf, fileOf, type Route } from "./route";
import { type PageInfo, type Spot, type TocItem, Typeset, type TypesetApi } from "./Typeset";
import type { Entry, Kind, Review, SearchHit, Work } from "./types";
import { Ask, type AskSpec, Confirm, type ConfirmSpec, IconButton, Kbd, Modal, Tip, toast } from "./ui";
import { History, type Step } from "./undo";

interface Sel {
  line: number;
  s: number;
  e: number;
  /** 選択（または挿入点）の画面上の箱。ツールバーをその隣に出す */
  box: { left: number; right: number; top: number };
}
interface Action {
  key: string;
  label: string;
  icon: ReactNode;
  run: () => void;
}

const NO_TINT = new Map<number, Tint>();
const MOBILE = "(max-width: 820px)";
const FONT_MIN = 13;
const FONT_MAX = 30;
const FONT_PC = 19;
const FONT_PHONE = 17;
/** 組版の既定の文字の大きさ（vivliostyle build と同じ）。赤入れの既定の大きさをこれに当て、同じ比で変える */
const TYPESET_FONT = 16;
/** スマホで本文に重ねる上下のバーの高さ（safe-area の内側から測る）。読書の組版の天地はこれより広くする */
const BAR_TOP = 52;
const BAR_BOTTOM = 76;
/** 左端からこれより内に掛かる列は、切れているとみなして隠す */
const CUT_GAP = 6;

function caretAt(x: number, y: number): { node: Node; off: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const p = d.caretPositionFromPoint?.(x, y);
  if (p) return { node: p.offsetNode, off: p.offset };
  const r = d.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, off: r.startOffset } : null;
}

// PC: 縦書きでは選択の左隣が「これから読む側」なので、そこに縦長のツールバーを出す。左に場所がなければ右隣
function toolbarAt(b: Sel["box"]): React.CSSProperties {
  const top = Math.min(Math.max(b.top, 8), window.innerHeight - 380);
  return b.left > 140 ? { left: b.left - 8, top, transform: "translateX(-100%)" } : { left: b.right + 8, top };
}

export function Desk(props: {
  works: Work[];
  work: Work;
  route: Route;
  nav: Nav;
  theme: prefs.Theme;
  setTheme: (t: prefs.Theme) => void;
  dark: boolean;
}) {
  const { work, route, nav } = props;
  const mobile = useMedia(MOBILE);
  const vol = work.vols.find((v) => v.name === route.vol) ?? work.vols[0];
  const file = fileOf(route.chap ?? "");
  const loc: Loc = { work: work.name, vol: vol.name, file };
  const fileKey = `${loc.vol}/${loc.file}`;
  const ci = vol.chapters.findIndex((c) => c.file === file);
  const chapter = vol.chapters[ci];
  const focusId = route.e ?? null;

  const [chap, setChap] = useState<{ key: string; text: string } | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const review = reviews[loc.vol] ?? null;
  const [sel, setSel] = useState<Sel | null>(null);
  const [ask, setAsk] = useState<AskSpec | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [clean, setClean] = useState(false);
  const [heat, setHeat] = useState(false);
  const [tint, setTint] = useState<Map<number, Tint>>(NO_TINT);
  const [fs, setFs] = useState(() => prefs.fontSize(matchMedia(MOBILE).matches ? FONT_PHONE : FONT_PC));
  const [redMode, setRedMode] = useState(false);
  const [bare, setBare] = useState(false);
  const [reattach, setReattach] = useState<Entry | null>(null);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [band, setBand] = useState<{ msg: string; retry: () => void } | null>(null);
  const [live, setLive] = useState(true);
  const [hit, setHit] = useState<SearchHit | null>(null);
  // ---- syuki ----
  const sy = !!work.syuki;
  /** 台帳・本文が変わった知らせ。syuki の答えを読み直す */
  const [syTick, setSyTick] = useState(0);
  const [ovCheck, setOvCheck] = useState(true);
  const [ovLint, setOvLint] = useState(false);
  const [ovThreads, setOvThreads] = useState(true);
  const [ovNames, setOvNames] = useState(false);
  const [side, setSide] = useState<"notes" | "inbox" | "scene">("notes");
  /** 読んでいる段落の行（場面のタブが追いかける） */
  const [curLine, setCurLine] = useState(0);
  const [nameCard, setNameCard] = useState<{ name: string; kind: NameKind; note: string | null; desc?: string; at: string; el: HTMLElement } | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [impactOff, setImpactOff] = useState(() => prefs.get("shosai.impact") ?? "");
  const [sceneJump, setSceneJump] = useState<{ key: string; scene: number } | null>(null);
  const [docName, setDocName] = useState(work.docs?.[0] ?? "");
  // ---- 組版 ----
  const typeset = route.view === "typeset";
  const [tsPage, setTsPage] = useState<PageInfo | null>(null);
  const [tsToc, setTsToc] = useState<TocItem[]>([]);
  const [tsBusy, setTsBusy] = useState(false);
  const [spread, setSpread] = useState(() => prefs.get("shosai.spread") !== "0");
  const [zoom, setZoom] = useState(1);
  const reading = typeset && (route.mode ?? prefs.tsMode(mobile)) === "reading";
  const [paperPref, setPaperState] = useState(prefs.paper);
  const [spacing, setSpacingState] = useState(prefs.spacing);
  const pc = prefs.PAPERS[prefs.paperOf(paperPref, props.dark)];
  // 紙の色は赤入れと読書の組版で共有する。朱は紙の上でだけ紙に合わせる（画面の部品の朱は変えない）
  const sp = prefs.SPACINGS[spacing];
  // 赤入れの天地の余白も同じ段で広げる（reader.css のスマホの余白に足す）
  const paperVars = { "--color-paper": pc.paper, "--color-ink": pc.ink, "--read-pad": `${sp.y / 2}px` } as CSSProperties;
  const penVars = { "--color-pen": pc.pen, "--color-pen-text": pc.penText } as CSSProperties;
  const [allPages, setAllPages] = useState(false);
  const [tsReload, setTsReload] = useState(0);
  const tsApi = useRef<TypesetApi | null>(null);
  /** 赤入れ ⇄ 組版で、切り替えた先で開く段落 */
  const jump = useRef<Spot | null>(null);
  const hist = useRef(new History()).current;
  const reader = useRef<HTMLDivElement>(null);
  const restore = useRef(true);
  const locRef = useRef(loc);
  locRef.current = loc;
  const routeRef = useRef(route);
  routeRef.current = route;

  // ---- 読み込み ----
  const loadChapter = useCallback(async (l: Loc) => {
    try {
      const c = await api.chapter(l);
      const cur = locRef.current;
      if (cur.vol === l.vol && cur.file === l.file) setChap({ key: `${l.vol}/${l.file}`, text: c.text });
    } catch (e) {
      setBand({ msg: `章を開けなかった: ${(e as Error).message}`, retry: () => loadChapter(locRef.current) });
    }
  }, []);
  const loadReview = useCallback(
    async (v: string) => {
      try {
        const r = await api.review(work.name, v);
        setReviews((m) => ({ ...m, [v]: r }));
      } catch (e) {
        setBand({ msg: `指摘を読めなかった: ${(e as Error).message}`, retry: () => loadReview(v) });
      }
    },
    [work.name],
  );
  const reload = () => {
    loadChapter(locRef.current);
    loadReview(locRef.current.vol);
  };

  useEffect(() => {
    for (const v of work.vols) loadReview(v.name);
  }, [work]);
  useEffect(() => {
    restore.current = true;
    setSel(null);
    loadChapter(loc);
  }, [fileKey]);

  // 声の色: 切り替えたときと、章を読み直したときに取り直す
  useEffect(() => {
    if (!heat || !chap) return setTint(NO_TINT);
    let live = true;
    api
      .style(locRef.current)
      .then((r) => live && setTint(tints(r.paragraphs)))
      .catch((e) => live && toast(`声の色を出せない: ${(e as Error).message}`));
    return () => {
      live = false;
    };
  }, [heat, chap]);

  // 原稿・指摘ファイルが外で書き換わったら読み直す。切れたら印を出し、つながり直したら読み直す
  useEffect(() => {
    const es = new EventSource("/api/events");
    let down = false;
    es.onopen = () => {
      if (down) reload();
      down = false;
      setLive(true);
    };
    es.onerror = () => {
      down = true;
      setLive(false);
    };
    es.onmessage = (ev) => {
      const l = locRef.current;
      const paths: string[] = JSON.parse(ev.data);
      if (paths.some((p) => p.endsWith(`${l.work}/manuscript/${l.vol}/${l.file}`))) loadChapter(l);
      // 組版は巻の原稿・book.config.js・前付けのどれが変わっても組み直す（位置は Typeset が保つ）
      if (paths.some((p) => p.startsWith(`${l.work}/manuscript/${l.vol}/`) || p === `${l.work}/book.config.js` || p.startsWith(`${l.work}/front/`))) setTsReload((n) => n + 1);
      for (const v of work.vols) if (paths.some((p) => p.endsWith(`${l.work}/review/${v.name}.json`))) loadReview(v.name);
      if (paths.some((p) => p.startsWith(`${l.work}/`) && /\/(ledger\/|syuki\.yml|manuscript\/)/.test(`/${p.slice(l.work.length + 1)}`))) setSyTick((n) => n + 1);
    };
    return () => es.close();
  }, []);

  // ---- 本文と指摘の位置 ----
  const shown = chap?.key ?? "";
  const busy = shown !== fileKey;
  const lines = useMemo(() => chap?.text.split("\n") ?? [], [chap]);
  const from = useMemo(() => {
    if (lines[0] !== "---") return 0;
    const j = lines.indexOf("---", 1);
    return j < 0 ? 0 : j + 1;
  }, [lines]);
  const here = useMemo(
    () => (reviews[shown.split("/")[0]]?.entries ?? []).filter((e) => e.file === shown && e.status !== "reverted"),
    [reviews, shown],
  );
  const anchors = useMemo(() => {
    const m = new Map<string, Anchor | null>();
    for (const e of here) m.set(e.id, resolve(e, lines));
    return m;
  }, [here, lines]);
  const located = useMemo(() => new Map([...anchors].map(([k, v]) => [k, v !== null])), [anchors]);

  const red = useMemo(() => {
    const marks = new Map<number, Mark[]>();
    const ins = new Map<number, Insert[]>();
    const add = <T,>(m: Map<number, T[]>, n: number, v: T) => m.set(n, [...(m.get(n) ?? []), v]);
    // 清書は読むだけ: 赤も挿入点も出さない
    if (clean) return { marks, ins };
    for (const e of here) {
      const a = anchors.get(e.id);
      if (!a || !isTodo(e)) continue;
      if (e.after !== undefined) {
        // 未適用の赤を校正紙のように描く（原稿はまだ変えていない）
        const mark = (cls: string) => add(marks, a.line, { id: e.id, s: a.start, e: a.end, cls });
        const label = (cls: string, text: string) => add(ins, a.line, { p: a.end, key: `p${e.id}`, cls, text, id: e.id });
        if (e.kind === "replace" || e.kind === "delete") mark("pend-del");
        if (e.kind === "replace") label("pend-ins", plain(e.after));
        if (e.kind === "insert") label("pend-ins pend-insert", plain(e.after));
        if (e.kind === "ruby") {
          mark("fix");
          // 新しい読みは、本物のルビと同じく親字の右脇に出す
          add(ins, a.line, { p: a.start, key: `p${e.id}`, cls: "pend-ruby", text: "", id: e.id, note: e.after.match(/《([^《》]+)》$/)?.[1] ?? "ルビトル" });
        }
        if (e.kind === "emphasis") {
          if (e.after.startsWith("《《")) mark("pend-em");
          else label("pend-note", "傍点トル");
        }
      } else if (e.kind === "suggest" || e.kind === "comment") {
        const q = e.status === "question";
        const short = e.body.length <= 20 && !e.body.includes("\n");
        if (a.end > a.start) add(marks, a.line, { id: e.id, s: a.start, e: a.end, cls: `note ${q ? "note-q" : `note-${e.kind}`}` });
        add(ins, a.line, {
          p: a.start,
          key: `b${e.id}`,
          cls: `badge b-${e.kind}`,
          text: q ? "？" : e.kind === "suggest" ? "提" : "註",
          id: e.id,
          note: short ? e.body : undefined,
        });
      }
    }
    if (sel && sel.s === sel.e) add(ins, sel.line, { p: sel.s, key: "caret", cls: "caret", text: "く" });
    return { marks, ins };
  }, [here, anchors, clean, sel]);

  // ---- syuki の印（赤入れの表示だけ。組版には出さない） ----
  const W0 = work.name;
  const asks = useSy<AskList>(W0, sy ? "ask" : null, {}, syTick);
  const tl = useSy<SceneRow[]>(W0, sy ? "timeline" : null, {}, syTick);
  const thr = useSy<{ threads: ThreadRow[] }>(W0, sy && ovThreads ? "threads" : null, {}, syTick);
  const chk = useSy<{ items: CheckItem[] }>(W0, sy && ovCheck ? "check" : null, {}, syTick);
  const lint = useSy<{ tool: string; out: string }[]>(W0, sy && ovLint ? "lint" : null, { chapter: `${loc.vol}/${chapOf(file)}` }, syTick);
  const listOf = (kind: string) => useSy<ListRow[]>(W0, sy && ovNames ? "list" : null, { kind }, syTick).data;
  const chars = listOf("characters");
  const terms = listOf("terms");
  const items = listOf("items");
  const secrets = listOf("secrets");
  /** 本文で拾う呼び名 → 台帳の名前と種類 */
  const names = useMemo(() => {
    const m = new Map<string, { name: string; kind: NameKind; note: string | null; desc?: string }>();
    for (const r of items ?? []) m.set(r.name, { name: r.name, kind: "item", note: r.note });
    for (const r of terms ?? []) for (const n of [r.name, r.name.replace(/（.*）$/, "")]) if (n.length >= 2 && (n === r.name || !m.has(n))) m.set(n, { name: r.name, kind: "term", note: r.note, desc: r.desc });
    for (const r of chars ?? []) for (const n of callNames(r.name, [r.short ?? "", ...(r.aliases ?? [])])) m.set(n, { name: r.name, kind: "character", note: r.note });
    return m;
  }, [chars, terms, items]);
  const breaks = useMemo(() => sceneBreaks(lines), [lines]);
  const syLayer = useMemo(() => {
    const marks = new Map<number, Mark[]>();
    const ins = new Map<number, Insert[]>();
    const add = <T,>(m: Map<number, T[]>, n: number, v: T) => m.set(n, [...(m.get(n) ?? []), v]);
    if (!sy || !lines.length || !shown) return { marks, ins };
    const [v, f] = shown.split("/");
    // 場面の番号と、timeline の作中の日時・場所・出ている人物
    const rows = tl.data?.filter((r) => atChapter(work, r.at, v, f)) ?? [];
    for (let n = 1; n <= breaks.length + 1; n++) {
      const r = rows.find((x) => locate(work, x.at)?.scene === n);
      const line = n === 1 ? from + 1 : breaks[n - 2];
      const text = [String(n), r?.when, r?.place, r?.cast?.join("・")].filter(Boolean).join("　");
      add(ins, line, { p: (lines[line - 1] ?? "").length, key: `sc${n}`, cls: "sy-scene", text });
    }
    if (ovCheck)
      chk.data?.items.forEach((c, i) => {
        let line = checkLine(c, shown);
        // 迷子の引用は本文に無いので、引用の章の頭に印を出す
        const q = c.kind === "lost_anchor" ? c.msg.match(/^([\w/-]+)「/) : null;
        if (!line && q && chapMatches(q[1].split("/").at(-1)!, chapOf(f))) line = from + 1;
        if (line) add(ins, line, { p: 0, key: `ck${i}`, cls: "sy-mark sy-check", text: "台", title: c.msg, sy: `msg:台帳: ${c.msg}` });
      });
    if (ovLint)
      lintFindings(lint.data ?? []).forEach((x) => {
        const h = lines[x.line - 1] !== undefined ? findQuote([lines[x.line - 1]], 0, x.match) : null;
        const msg = `${x.kind}: ${x.message}`;
        if (h) add(marks, x.line, { id: "", s: h.s, e: h.e, cls: "sy-lint", title: msg, sy: `msg:${msg}` });
      });
    const thWord = (k: string) => ({ plant: "置いた", hint: "匂わせた", payoff: "回収した" } as Record<string, string>)[k];
    const thMark = (line: number, p: number, key: string, word: string, msg: string) =>
      add(ins, line, { p, key, cls: "sy-mark sy-thread", text: word[0], title: msg, sy: `msg:${msg}` });
    if (ovThreads && thr.data)
      // syuki が引き直した行に付ける（迷子は check の印が出す）
      for (const t of thr.data.threads)
        for (const d of t.done) {
          const word = thWord(d.kind);
          if (!word || !d.line || !d.src || d.where !== `manuscript/${shown}:${d.line}`) continue;
          const q = quoteOf(d.src);
          const h = q && findQuote([lines[d.line - 1] ?? ""], 0, q.text);
          thMark(d.line, h ? h.s : 0, `th${d.at}${t.id}${d.kind}`, word, `伏線を${word}: ${t.id}`);
        }
    else if (ovThreads)
      // threads がまだ来ない・読めない時は timeline の出来事の引用から
      for (const r of tl.data ?? [])
        for (const e of r.events ?? []) {
          const word = thWord(e.kind);
          const q = word && e.src ? quoteOf(e.src) : null;
          if (!word || !q || !chapMatches(q.chap, chapOf(f)) || !atChapter(work, e.at, v, f)) continue;
          const h = findQuote(lines, from, q.text);
          if (h) thMark(h.line, h.s, `th${e.at}${e.what}${e.kind}`, word, `伏線を${word}: ${e.what}${e.note ? `（${e.note}）` : ""}`);
        }
    if (ovNames && names.size) {
      const calls = new Map([...names].map(([k, x]) => [k, x.name]));
      for (let i = from; i < lines.length; i++)
        for (const h of findNames(lines[i], calls)) add(marks, i + 1, { id: "", s: h.s, e: h.e, cls: "sy-name", sy: `name:${h.name}` });
    }
    return { marks, ins };
  }, [sy, lines, from, shown, breaks, tl.data, thr.data, chk.data, lint.data, names, ovCheck, ovLint, ovThreads, ovNames]);
  const { marks, ins } = useMemo(() => {
    const join = <T,>(a: Map<number, T[]>, b: Map<number, T[]>) => {
      const m = new Map(a);
      for (const [k, v] of b) m.set(k, [...(m.get(k) ?? []), ...v]);
      return m;
    };
    return { marks: join(red.marks, syLayer.marks), ins: join(red.ins, syLayer.ins) };
  }, [red, syLayer]);

  // ---- 選択 → 原稿の位置 ----
  useEffect(() => {
    let t = 0;
    const onChange = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const s = getSelection();
        if (!s || !s.rangeCount || s.isCollapsed || clean) return;
        const r = s.getRangeAt(0);
        if (!reader.current?.contains(r.commonAncestorContainer)) return;
        const a = toSource(r.startContainer, r.startOffset, false);
        const b = toSource(r.endContainer, r.endOffset, true);
        if (!a || !b) return;
        const src = lines[a.line - 1] ?? "";
        const head = src.startsWith("## ") ? 3 : 0;
        if (b.line !== a.line) {
          // 段落をまたいだら最初の段落の末尾で切り、選択の見た目も縮める
          const p = reader.current.querySelector(`[data-line="${a.line}"]`);
          const end = p && toDom(p, src.length, true);
          if (end) {
            r.setEnd(end.node, end.off);
            toast("段落をまたぐ選択は、最初の段落までにした");
            return;
          }
        }
        const [ss, ee] = snap(tokenize(src, head), Math.max(head, a.pos), Math.max(head, b.pos));
        const rect = r.getBoundingClientRect();
        setSel({ line: a.line, s: ss, e: ee, box: { left: rect.left, right: rect.right, top: rect.top } });
      }, 120);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [lines, clean]);

  const clearSel = () => {
    getSelection()?.removeAllRanges();
    setSel(null);
  };

  // 指摘に注目する（URL の e）。スマホでは指摘のシートも開く
  const focusEntry = (id: string, sheet = mobile) => {
    setSide("notes");
    nav.go({ ...routeRef.current, e: id });
    if (sheet) nav.open("notes");
  };

  /** syuki の印を押した時: 名前はカード、ほかは中身を知らせる */
  const openSy = (el: HTMLElement, v: string) => {
    if (!v.startsWith("name:")) return toast(v.slice(4));
    const x = names.get(v.slice(5)) ?? [...names.values()].find((n) => n.name === v.slice(5));
    const line = Number(el.closest<HTMLElement>("[data-line]")?.dataset.line ?? 0);
    if (x) setNameCard({ ...x, at: pointOf(loc.vol, file, sceneOf(breaks, line)), el });
  };
  const onReaderClick = (ev: React.MouseEvent) => {
    const s = getSelection();
    if (s && !s.isCollapsed) return;
    const hitEl = (ev.target as Element).closest<HTMLElement>("[data-entry]");
    if (hitEl?.dataset.entry) {
      setSel(null);
      return focusEntry(hitEl.dataset.entry);
    }
    const syEl = (ev.target as Element).closest<HTMLElement>("[data-sy]");
    if (syEl?.dataset.sy) {
      setSel(null);
      return openSy(syEl, syEl.dataset.sy);
    }
    // スマホの読む時は、タップで上下のバーを出し入れするだけ
    if ((mobile && !redMode && !reattach) || clean || busy) {
      setSel(null);
      if (mobile) setBare(!bare);
      return;
    }
    const c = caretAt(ev.clientX, ev.clientY);
    const p = c && toSource(c.node, c.off, false);
    if (!p) return setSel(null);
    const src = lines[p.line - 1] ?? "";
    const head = src.startsWith("## ") ? 3 : 0;
    const [pos] = snap(tokenize(src, head), Math.max(head, p.pos), Math.max(head, p.pos));
    setSel({ line: p.line, s: pos, e: pos, box: { left: ev.clientX, right: ev.clientX, top: ev.clientY } });
  };

  // ---- 書き込み ----
  /** 書き込みが失敗した時。409 は読み直して知らせ、ほかは消えない帯に出して再試行を付ける */
  const fail = (e: unknown, retry: () => void) => {
    if (e instanceof ApiError && e.code === 409) {
      setSave("idle");
      toast(e.message);
      reload();
    } else {
      setSave("error");
      setBand({ msg: `書き込めなかった: ${(e as Error).message}`, retry });
    }
  };
  const runUndo = async (step?: Step) => {
    setSave("saving");
    try {
      const label = step ? await hist.undoStep(step) : await hist.undo();
      setSave(label ? "saved" : "idle");
      toast(label ? `取り消した: ${label}` : "取り消せるものが無い");
    } catch (e) {
      fail(e, reload);
    }
    reload();
  };
  const remember = (label: string, undo: () => Promise<unknown>) => {
    const step = { label, undo };
    hist.push(step);
    toast(label, () => runUndo(step));
  };

  type UndoOf = (r: Review) => () => Promise<unknown>;
  const write = async (label: string, op: () => Promise<Review>, undo?: UndoOf) => {
    setSave("saving");
    try {
      const r = await op();
      setReviews((m) => ({ ...m, [r.vol]: r }));
      setSave("saved");
      setBand(null);
      clearSel();
      if (undo) remember(label, undo(r));
      else toast(label);
    } catch (e) {
      fail(e, () => write(label, op, undo));
    }
    loadChapter(locRef.current);
  };
  const W = () => [work.name, locRef.current.vol] as const;
  /** 作った指摘を消して戻す */
  const created: UndoOf = (r) => {
    const n = r.entries.at(-1)!;
    return () => api.remove(r.work, r.vol, n.id, n.updated);
  };
  /** 変えた項目を前の値に戻す */
  const updated =
    (e: Entry, keys: (keyof Entry)[]): UndoOf =>
    (r) => {
      const n = r.entries.find((x) => x.id === e.id);
      const old = Object.fromEntries(keys.map((k) => [k, k === "thread" ? (e.thread ?? []) : e[k]]));
      return () => api.upsert(r.work, r.vol, { id: e.id, ...old }, n?.updated);
    };
  const removed =
    (e: Entry): UndoOf =>
    (r) =>
    () =>
      api.upsert(r.work, r.vol, e);

  /** 原稿の from を to に書き換え、指摘の状態を変える。章は読み直してから探す（ほかの章でも効く） */
  const swap = async (e: Entry, fromText: string, to: string, status: Entry["status"]) => {
    const [v, name] = e.file.split("/");
    const l = { work: work.name, vol: v, file: name };
    const ls = (await api.chapter(l)).text.split("\n");
    const a = resolve({ ...e, quote: fromText }, ls);
    if (!a || ls[a.line - 1].slice(a.start, a.end) !== fromText) throw new Error("位置が見つからない（本文が変わっている）");
    return api.edit(l, { line: a.line, expect: ls[a.line - 1], start: a.start, end: a.end, text: to, entry: { id: e.id, status } });
  };

  const edit = (kind: Kind, line: number, s: number, e: number, after: string) => {
    const src = lines[line - 1];
    const before = src.slice(s, e);
    if (before === after) return toast("元と同じなので入れなかった");
    // 原稿はまだ変えず、元の字に付けた未適用の赤として残す（「適用」で書き込む）
    write(
      `${KIND_LABEL[kind]}を入れた`,
      () =>
        api.upsert(...W(), { kind, status: "open", file: shown, line, quote: before, ...context(src, s, e), before, after, body: "" }),
      created,
    );
  };

  /** 本文を変えたら、後ろの章への影響（syuki impact。git の HEAD と作業中の本文の差分）を受信箱に出す */
  const loadImpact = () => {
    if (sy)
      api.syuki<Impact>(work.name, "impact").then(
        (r) => setImpact(r),
        (e) => toast(`影響を出せない: ${(e as Error).message}`),
      );
  };
  useEffect(loadImpact, []);
  const impactKey = (x: Impact) => JSON.stringify([x.lost, x.dependents]);
  const shownImpact = impact && (impact.lost.length || impact.dependents.length) && impactKey(impact) !== impactOff ? impact : null;
  const dismissImpact = () => {
    if (!impact) return;
    prefs.set("shosai.impact", impactKey(impact));
    setImpactOff(impactKey(impact));
  };

  const apply = (ids: string[]) => {
    const go = async () => {
      setSave("saving");
      try {
        const { review: r, failed } = await api.apply(...W(), ids);
        setReviews((m) => ({ ...m, [r.vol]: r }));
        setSave("saved");
        setBand(null);
        const done = r.entries.filter((e) => ids.includes(e.id) && !failed.some((f) => f.id === e.id));
        const msg = [
          done.length && `${done.length} 件適用した`,
          failed.length && `適用できない: ${failed.map((f) => `${f.id}（${f.reason}）`).join("、")}`,
        ]
          .filter(Boolean)
          .join("。");
        if (done.length) loadImpact();
        if (done.length)
          remember(msg, async () => {
            for (const e of [...done].reverse()) await swap(e, e.after ?? "", e.before ?? "", "open");
          });
        else toast(msg);
      } catch (e) {
        fail(e, go);
      }
      loadChapter(locRef.current);
    };
    if (ids.length > 1) setConfirm({ title: `未適用の赤 ${ids.length} 件を本文に書き込む`, ok: `${ids.length} 件を適用`, onOk: go });
    else go();
  };

  const note = (kind: "suggest" | "comment", sl: Sel) => {
    const src = lines[sl.line - 1];
    setAsk({
      title: kind === "suggest" ? "提案" : "コメント",
      context: plain(src, sl.s, sl.e) || undefined,
      value: "",
      multiline: true,
      onOk: (body) =>
        write(
          `${KIND_LABEL[kind]}を入れた`,
          () =>
            api.upsert(...W(), { kind, status: "open", file: shown, line: sl.line, quote: src.slice(sl.s, sl.e), ...context(src, sl.s, sl.e), body }),
          created,
        ),
    });
  };

  const doReattach = (e: Entry, sl: Sel) => {
    const src = lines[sl.line - 1];
    setReattach(null);
    write(
      "付け直した",
      () => api.upsert(...W(), { id: e.id, file: shown, line: sl.line, quote: src.slice(sl.s, sl.e), ...context(src, sl.s, sl.e) }, e.updated),
      updated(e, ["file", "line", "quote", "prefix", "suffix"]),
    );
  };

  const actions = useMemo((): Action[] => {
    if (!sel || busy) return [];
    if (reattach) return [{ key: "Enter", label: "ここに付け直す", icon: <LocateFixed size={16} />, run: () => doReattach(reattach, sel) }];
    const src = lines[sel.line - 1] ?? "";
    const toks = tokenize(src);
    const { line, s, e } = sel;
    const text = plain(src, s, e);
    const notes: Action[] = [
      { key: "s", label: "提案", icon: <MessageSquare size={16} />, run: () => note("suggest", sel) },
      { key: "c", label: "コメント", icon: <PenLine size={16} />, run: () => note("comment", sel) },
    ];
    if (s === e) {
      return [
        {
          key: "i",
          label: "挿入",
          icon: <Plus size={16} />,
          run: () => setAsk({ title: "挿入", value: "", markup: true, onOk: (v) => edit("insert", line, s, s, v) }),
        },
        ...notes,
      ];
    }
    const ruby = findTok(toks, s, e, "ruby");
    const em = findTok(toks, s, e, "em");
    return [
      {
        key: "r",
        label: "差替",
        icon: <Replace size={16} />,
        run: () =>
          setAsk({
            title: "差替",
            context: text,
            value: src.slice(s, e),
            allowEmpty: true,
            markup: true,
            onOk: (v) => edit(v ? "replace" : "delete", line, s, e, v),
          }),
      },
      { key: "d", label: "トル", icon: <Eraser size={16} />, run: () => edit("delete", line, s, e, "") },
      {
        key: "y",
        label: ruby ? "ルビ直し" : "ルビ",
        icon: <Type size={16} />,
        run: () => {
          if (ruby && ruby.t === "ruby") {
            const base = src.slice(ruby.cs, ruby.ce);
            setAsk({
              title: `ルビ「${base}」`,
              value: ruby.rt,
              allowEmpty: true,
              onOk: (v) => edit("ruby", line, ruby.s, ruby.e, v ? `｜${base}《${v}》` : base),
            });
          } else if (hasMarkup(src, s, e)) toast("記法を含む範囲にはルビを振れない");
          else setAsk({ title: `ルビ「${text}」`, value: "", onOk: (v) => edit("ruby", line, s, e, `｜${src.slice(s, e)}《${v}》`) });
        },
      },
      {
        key: "e",
        label: em ? "傍点トル" : "傍点",
        icon: <Sparkles size={16} />,
        run: () =>
          em && em.t === "em"
            ? edit("emphasis", line, em.s, em.e, src.slice(em.cs, em.ce))
            : edit("emphasis", line, s, e, `《《${src.slice(s, e)}》》`),
      },
      ...notes,
      {
        key: "k",
        label: "keep",
        icon: <Pin size={16} />,
        run: () => {
          let a = s;
          while (a > 0 && !"。！？".includes(src[a - 1])) a--;
          let b = e;
          while (b < src.length && !"。！？".includes(src[b - 1])) b++;
          if (b < src.length && src[b] === "」") b++;
          // keep.md への書き足しは取り消せないので、この欄で確かめてから書く
          setAsk({
            title: "残す文（style/keep.md に足す）",
            value: plain(src, a, b).replace(/^[\s　]+/, ""),
            onOk: (v) =>
              write("keep.md に足した", () =>
                api.keep(locRef.current, v, { kind: "keep", status: "applied", file: shown, line, quote: src.slice(a, b), ...context(src, a, b), body: v }),
              ),
          });
        },
      },
    ];
  }, [sel, lines, reattach, busy, shown]);

  // ---- 指摘の操作 ----
  const chapterRoute = (e: Entry): Route => {
    const [v, f] = e.file.split("/");
    return { work: work.name, vol: v, chap: chapOf(f), e: e.id };
  };
  const act: PanelActions = {
    jump: (e) => nav.go(chapterRoute(e)),
    apply,
    fix: (e) =>
      setAsk({
        title: `${KIND_LABEL[e.kind]}を直す`,
        context: plain(e.before ?? "") || undefined,
        value: e.after ?? "",
        allowEmpty: e.kind === "replace" || e.kind === "delete",
        markup: true,
        onOk: (after) => {
          if (after === e.after) return;
          const kind = e.kind === "replace" || e.kind === "delete" ? (after ? "replace" : "delete") : e.kind;
          write("直した", () => api.upsert(...W(), { id: e.id, kind, after }, e.updated), updated(e, ["kind", "after"]));
        },
      }),
    edit: (e) =>
      setAsk({
        title: `${KIND_LABEL[e.kind]}を直す`,
        value: e.body,
        multiline: true,
        onOk: (body) => write("直した", () => api.upsert(...W(), { id: e.id, body }, e.updated), updated(e, ["body"])),
      }),
    status: (e, status) =>
      write(status === "done" ? "済にした" : "未処理に戻した", () => api.upsert(...W(), { id: e.id, status }, e.updated), updated(e, ["status"])),
    revert: (e) =>
      write(
        "イキにした",
        () => swap(e, e.after ?? "", e.before ?? "", "reverted").finally(loadImpact),
        () => () => swap(e, e.before ?? "", e.after ?? "", "applied"),
      ),
    remove: (e) => write("消した", () => api.remove(...W(), e.id, e.updated), removed(e)),
    reattach: (e) => {
      if (sel && !busy) return doReattach(e, sel);
      setReattach(e);
      if (e.file !== fileKey) nav.go(chapterRoute(e));
      else nav.close();
      toast("付け直す所を本文で選ぶ");
    },
    reply: (e, body) => write("返事を送った", () => api.reply(...W(), e.id, body, e.updated), updated(e, ["thread", "status"])),
  };

  // 注目中の指摘へ本文を寄せる
  useLayoutEffect(() => {
    if (!focusId || busy) return;
    const el =
      reader.current?.querySelector(`[data-entry="${focusId}"]`) ?? reader.current?.querySelector(`[data-line="${anchors.get(focusId)?.line}"]`);
    if (!el) return;
    restore.current = false;
    centerOn(el, "smooth");
    el.classList.add("flash");
    window.setTimeout(() => el.classList.remove("flash"), 1200);
  }, [focusId, chap]);

  // 本文の印に roving tabindex: Tab で入るのは注目中（なければ最初）の印だけ。中は矢印で移る
  useEffect(() => {
    let first = true;
    reader.current?.querySelectorAll<HTMLElement>("[data-entry]").forEach((el) => {
      const on = focusId ? el.dataset.entry === focusId && first : first;
      el.tabIndex = on ? 0 : -1;
      if (on) first = false;
    });
  });
  const onMarkKey = (ev: React.KeyboardEvent) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-entry]");
    if (!el) return;
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      focusEntry(el.dataset.entry!);
    } else if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(ev.key)) {
      ev.preventDefault();
      ev.stopPropagation();
      const all = [...reader.current!.querySelectorAll<HTMLElement>("[data-entry]")];
      const next = all[all.indexOf(el) + (ev.key === "ArrowDown" || ev.key === "ArrowLeft" ? 1 : -1)];
      next?.focus();
    }
  };

  /** j/k: 今の章の未処理の指摘を本文の順に前後する */
  const stepEntry = (dir: 1 | -1) => {
    const order = here
      .filter((e) => isTodo(e) && anchors.get(e.id))
      .sort((a, b) => anchors.get(a.id)!.line - anchors.get(b.id)!.line || anchors.get(a.id)!.start - anchors.get(b.id)!.start);
    if (!order.length) return toast("この章に未処理の指摘は無い");
    const i = order.findIndex((e) => e.id === focusId);
    const next = order[i < 0 ? (dir > 0 ? 0 : order.length - 1) : (i + dir + order.length) % order.length];
    nav.go({ ...route, e: next.id }, true);
  };
  const stepChapter = (dir: 1 | -1) => {
    const c = vol.chapters[ci + dir];
    if (c) nav.go({ work: work.name, vol: vol.name, chap: chapOf(c.file) });
    else toast(dir > 0 ? "巻の最後の章" : "巻の最初の章");
  };

  // ---- ページ送り・位置 ----
  // ページの区切りで行の途中が見えないよう、左端で切れた列を紙の色で隠す（cut は隠す幅）。
  // 次のページはその列から始め、前のページは送った時の位置に戻す
  const [cut, setCut] = useState(0);
  const flips = useRef<number[]>([]);
  const measureCut = () => {
    const r = reader.current;
    if (!r) return setCut(0);
    const box = r.getBoundingClientRect();
    const edge = box.left + CUT_GAP;
    let right = box.left;
    const range = document.createRange();
    for (const p of r.querySelectorAll<HTMLElement>("p[data-line], h2[data-line]")) {
      const b = p.getBoundingClientRect();
      if (b.right <= box.left) break; // 縦書きなので、後の段落ほど左にある
      if (b.left >= edge) continue;
      range.selectNodeContents(p);
      for (const c of range.getClientRects()) if (c.width && c.left < edge && c.right > box.left) right = Math.max(right, c.right);
    }
    setCut(Math.ceil(right - box.left));
  };
  const cutFrame = useRef(0);
  const scheduleCut = () => {
    cancelAnimationFrame(cutFrame.current);
    cutFrame.current = requestAnimationFrame(measureCut);
  };
  const page = (dir: 1 | -1) => {
    if (typeset) return tsApi.current?.step(dir);
    const r = reader.current;
    if (!r) return;
    const gutter = mobile ? 16 : 40;
    if (dir > 0) {
      flips.current.push(r.scrollLeft);
      r.scrollBy({ left: -(r.clientWidth - gutter - Math.max(cut, CUT_GAP)) });
    } else {
      const back = flips.current.pop();
      if (back !== undefined && back > r.scrollLeft) r.scrollLeft = back;
      else r.scrollBy({ left: r.clientWidth - gutter - CUT_GAP });
    }
    scheduleCut();
  };
  useLayoutEffect(() => {
    flips.current = [];
    scheduleCut();
  }, [chap, fs, typeset]);
  useEffect(() => {
    window.addEventListener("resize", scheduleCut);
    return () => window.removeEventListener("resize", scheduleCut);
  }, []);
  /** 赤入れで今見えている最初の段落 */
  const readerSpot = (): Spot | null => {
    const r = reader.current;
    if (!r || busy) return null;
    // 頭の余白（gutter）に掛かっているだけの段落は前のページの分
    const right = r.getBoundingClientRect().right - (mobile ? 16 : 40);
    for (const p of r.querySelectorAll<HTMLElement>("p[data-line]:not(.blank), h2[data-line]")) {
      const b = p.getBoundingClientRect();
      if (b.width && b.left < right - 4) return { chap: chapOf(file), line: p.tagName === "H2" ? 0 : Number(p.dataset.line) };
    }
    return null;
  };
  const showTypeset = (on: boolean) => {
    if (on === typeset) return;
    if (on) {
      jump.current = readerSpot() ?? { chap: chapOf(file), line: 0 };
      nav.go({ ...route, view: "typeset" });
    } else {
      const sp = tsApi.current?.spot() ?? null;
      jump.current = sp;
      nav.go({ ...route, chap: sp?.chap ?? route.chap, view: undefined, mode: undefined });
    }
  };
  /** 組版の段落から、赤入れの同じ段落へ */
  const openText = (sp: Spot) => {
    jump.current = sp;
    nav.go({ ...route, chap: sp.chap, view: undefined, mode: undefined });
  };
  // 章の頭は右端。位置は右端からの距離で覚える（本文が伸び縮みしても読んでいた所がずれない）
  const maxLeft = (r: HTMLElement) => r.scrollWidth - r.clientWidth;
  // scrollIntoView の inline/block は WebKit だと縦書きの要素の向きで解釈されるので、横位置を自分で合わせる
  const centerOn = (el: Element, behavior: ScrollBehavior = "auto") =>
    requestAnimationFrame(() => {
      const r = reader.current;
      if (!r) return;
      const e = el.getBoundingClientRect();
      const box = r.getBoundingClientRect();
      r.scrollBy({ left: e.left + e.width / 2 - (box.left + box.width / 2), behavior });
    });
  const posTimer = useRef(0);
  const onScroll = () => {
    scheduleCut();
    window.clearTimeout(posTimer.current);
    posTimer.current = window.setTimeout(() => {
      const r = reader.current;
      if (r && !busy) prefs.savePos(work.name, { vol: loc.vol, chap: chapOf(loc.file), off: maxLeft(r) - r.scrollLeft });
      if (sy) setCurLine(readerSpot()?.line ?? 0);
    }, 250);
  };
  useLayoutEffect(() => {
    const r = reader.current;
    if (!chap || busy || !restore.current || !r) return;
    restore.current = false;
    const p = prefs.readPos()[work.name];
    const off = p && p.vol === loc.vol && p.chap === chapOf(loc.file) ? p.off : 0;
    r.scrollLeft = maxLeft(r) - off;
    prefs.savePos(work.name, { vol: loc.vol, chap: chapOf(loc.file), off });
  }, [chap]);
  // 章を開いたら、読んでいる段落を取り直す（場面のタブ）
  useEffect(() => {
    if (sy && !busy && !typeset) requestAnimationFrame(() => setCurLine(readerSpot()?.line ?? 0));
  }, [chap, busy, typeset]);

  /** 段落の頭を本文の頭（右端）に合わせて開く */
  const scrollToLine = (n: number) => {
    const r = reader.current;
    if (!r) return;
    restore.current = false;
    flips.current = [];
    let p: Element | null = null;
    for (let i = n; i < n + 6 && !p; i++) p = r.querySelector(`[data-line="${i}"]:not(.blank)`);
    if (!p) return;
    r.scrollBy({ left: p.getBoundingClientRect().right - (r.getBoundingClientRect().right - (mobile ? 16 : 40)) });
    p.classList.add("flash");
    window.setTimeout(() => p.classList.remove("flash"), 1200);
    scheduleCut();
    setCurLine(n);
  };
  // 受信箱の問いから、その場面の頭へ
  useLayoutEffect(() => {
    if (!sceneJump || busy || typeset || sceneJump.key !== shown) return;
    setSceneJump(null);
    scrollToLine(sceneHead(breaks, sceneJump.scene, from + 1));
  }, [sceneJump, chap, busy, typeset]);

  // 検索の当たりを開く: 章の位置の復元より後に、当たりを本物の選択にして赤入れの道具を出す
  useLayoutEffect(() => {
    const r = reader.current;
    if (!hit || busy || !r || `${loc.vol}/${hit.file}` !== shown) return;
    setHit(null);
    const p = r.querySelector(`[data-line="${hit.line}"]`);
    const a = p && toDom(p, hit.start, false);
    const b = p && toDom(p, hit.end, true);
    if (!p || !a || !b) return toast("当たりの位置が見つからない（本文が変わっている）");
    const range = document.createRange();
    range.setStart(a.node, a.off);
    range.setEnd(b.node, b.off);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    restore.current = false;
    centerOn(a.node.parentElement!);
    p.classList.add("flash");
    window.setTimeout(() => p.classList.remove("flash"), 1200);
  }, [hit, chap]);
  // 組版から戻った時: 同じ段落を右端に合わせて開く（位置の復元より後に動かす）
  useLayoutEffect(() => {
    const r = reader.current;
    const j = jump.current;
    if (typeset || !j || busy || !r || `${loc.vol}/${fileOf(j.chap)}` !== shown) return;
    jump.current = null;
    restore.current = false;
    flips.current = [];
    const p = j.line ? r.querySelector(`[data-line="${j.line}"]`) : null;
    if (!p) r.scrollLeft = maxLeft(r);
    else {
      r.scrollBy({ left: p.getBoundingClientRect().right - (r.getBoundingClientRect().right - (mobile ? 16 : 40)) });
      p.classList.add("flash");
      window.setTimeout(() => p.classList.remove("flash"), 1200);
    }
    scheduleCut();
  }, [chap, typeset, busy]);
  const openHit = (h: SearchHit) => {
    setHit(h);
    nav.go({ work: work.name, vol: loc.vol, chap: chapOf(h.file) });
  };

  // スマホ: 左右のスワイプでページ送り（右へ払うと次のページ）
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (ev: React.TouchEvent) => {
    const t = ev.touches[0];
    touch.current = ev.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  };
  const onTouchEnd = (ev: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    const t = ev.changedTouches[0];
    if (!s) return;
    const dx = t.clientX - s.x;
    if (Math.abs(dx) > 50 && Math.abs(t.clientY - s.y) < 60 && Date.now() - s.t < 600 && getSelection()?.isCollapsed !== false) page(dx > 0 ? 1 : -1);
  };

  const font = (d: number) =>
    setFs((v) => {
      const n = Math.max(FONT_MIN, Math.min(FONT_MAX, v + d));
      prefs.set("shosai.font", String(n));
      return n;
    });

  // ---- キー ----
  const onKey = (ev: KeyboardEvent) => {
    const t = ev.target as Element;
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && ev.key.toLowerCase() === "k") {
      ev.preventDefault();
      return route.s === "k" ? nav.close() : nav.open("k");
    }
    if (route.s || ask || confirm || t.closest("input, textarea, select, [contenteditable]")) return;
    if (mod && ev.key.toLowerCase() === "z" && !ev.shiftKey) {
      ev.preventDefault();
      return void runUndo();
    }
    if (mod && (ev.key === "=" || ev.key === "+")) return ev.preventDefault(), font(1);
    if (mod && ev.key === "-") return ev.preventDefault(), font(-1);
    if (mod || ev.altKey) return;
    const a = actions.find((x) => x.key === ev.key);
    if (a && (a.key !== "Enter" || sel)) {
      ev.preventDefault();
      return a.run();
    }
    const keys: Record<string, () => void> = {
      "/": () => nav.open("find"),
      "?": () => nav.open("keys"),
      j: () => stepEntry(1),
      k: () => stepEntry(-1),
      "]": () => stepChapter(1),
      "[": () => stepChapter(-1),
      Escape: () => (clearSel(), setReattach(null)),
    };
    if (keys[ev.key]) {
      ev.preventDefault();
      return keys[ev.key]();
    }
    // ページ送りは、本文か何も無い所にフォーカスがある時だけ（部品の Space・矢印は横取りしない）
    const free = typeset
      ? t === document.body || t.ownerDocument !== document
      : (t === document.body || reader.current?.contains(t)) && !t.closest("[data-entry]");
    if (!free) return;
    if (ev.key === "ArrowLeft" || ev.key === "PageDown" || ev.key === " ") (ev.preventDefault(), page(1));
    else if (ev.key === "ArrowRight" || ev.key === "PageUp") (ev.preventDefault(), page(-1));
  };
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  useEffect(() => {
    const f = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  // ---- 画面 ----
  const askN = useMemo(() => askCounts(work, asks.data?.questions ?? []), [asks.data]);
  const todoIn = (v: string, f?: string) =>
    (reviews[v]?.entries.filter((e) => isTodo(e) && (!f || e.file === `${v}/${f}`)).length ?? 0) + (f ? (askN.get(`${v}/${f}`) ?? 0) : 0);
  const openCount = review?.entries.filter((e) => isTodo(e) && e.file === fileKey).length ?? 0;
  const reds = review?.entries.filter((e) => e.status === "open" && isRed(e)).map((e) => e.id) ?? [];
  const tsFont = Math.round((TYPESET_FONT * fs * 10) / (mobile ? FONT_PHONE : FONT_PC)) / 10;
  const zoomBy = (d: 1 | -1) => setZoom((z) => Math.max(0.5, Math.min(4, Math.round(z * (d > 0 ? 1.25 : 0.8) * 100) / 100)));
  const setMode = (m: prefs.TsMode) => {
    prefs.set("shosai.tsmode", m);
    nav.go({ ...route, view: "typeset", mode: m }, true);
  };
  const setPaper = (p: prefs.Paper | "auto") => {
    prefs.set("shosai.paper", p);
    setPaperState(p);
  };
  const setSpacing = (v: prefs.Spacing) => {
    prefs.set("shosai.spacing", v);
    setSpacingState(v);
  };
  const setSpreadPref = (v: boolean) => {
    prefs.set("shosai.spread", v ? "1" : "0");
    setSpread(v);
  };
  // 総ページ数は巻全体を組み終えたら出す。それまでは前に組んだ時の数を薄く出し、無ければ今のページだけ
  const knownTotal = tsPage?.total ?? null;
  const guessTotal = knownTotal ?? (reading ? null : prefs.totalPages(work.name, `${vol.name}@${tsFont}`));
  const pageLabel = tsPage && (
    <span data-total={knownTotal ? "final" : undefined}>
      {tsPage.page}
      {guessTotal !== null && (
        <>
          {" / "}
          <span className={clsx(!knownTotal && "opacity-50")}>{guessTotal}</span>
        </>
      )}
    </span>
  );

  const commands: Command[] = [
    ...actions.map((a) => ({ id: `act-${a.key}`, group: "赤", label: a.label, keys: a.key === "Enter" ? undefined : a.key, run: a.run })),
    { id: "view", group: "表示", label: typeset ? "赤入れにする" : "組版にする", run: () => showTypeset(!typeset) },
    ...(typeset
      ? [
          { id: "all-pages", group: "組版", label: "巻全体を組む", run: () => setAllPages(true) },
          { id: "mode", group: "組版", label: reading ? "本番の見方にする" : "読書の見方にする", run: () => setMode(reading ? "print" : "reading") },
          ...(reading
            ? (Object.keys(prefs.SPACINGS) as prefs.Spacing[]).map((k) => ({ id: `spacing-${k}`, group: "組版", label: `行間と余白: ${prefs.SPACINGS[k].label}`, run: () => setSpacing(k) }))
            : []),
          ...(mobile ? [] : [{ id: "spread", group: "組版", label: spread ? "単ページにする" : "見開きにする", run: () => setSpreadPref(!spread) }]),
          ...(reading
            ? []
            : [
                { id: "zoom+", group: "組版", label: "拡大", run: () => zoomBy(1) },
                { id: "zoom-", group: "組版", label: "縮小", run: () => zoomBy(-1) },
                { id: "zoom-fit", group: "組版", label: "画面に合わせる", run: () => setZoom(1) },
              ]),
          ...tsToc.map((t) => ({ id: `toc-${t.href}`, group: "目次", label: t.name, run: () => tsApi.current?.go({ href: t.href }) })),
        ]
      : []),
    { id: "find", group: "操作", label: "検索", keys: "/", run: () => nav.open("find") },
    { id: "undo", group: "操作", label: "取り消す", keys: "⌘Z", run: () => void runUndo() },
    { id: "apply-all", group: "操作", label: `すべて適用（${reds.length} 件）`, run: () => (reds.length ? apply(reds) : toast("未適用の赤が無い")) },
    { id: "copy", group: "操作", label: "依頼文をコピー", run: () => review && copyRequest(review) },
    { id: "next", group: "操作", label: "次の指摘", keys: "j", run: () => stepEntry(1) },
    { id: "prev", group: "操作", label: "前の指摘", keys: "k", run: () => stepEntry(-1) },
    ...(mobile ? [{ id: "notes", group: "操作", label: "指摘の一覧", run: () => nav.open("notes") }] : []),
    { id: "keys", group: "操作", label: "キー一覧", keys: "?", run: () => nav.open("keys") },
    { id: "next-ch", group: "移動", label: "次の章", keys: "]", run: () => stepChapter(1) },
    { id: "prev-ch", group: "移動", label: "前の章", keys: "[", run: () => stepChapter(-1) },
    { id: "shelf", group: "移動", label: "本棚", run: () => nav.go({}) },
    ...work.vols.flatMap((v) =>
      v.chapters.map((c) => ({
        id: `ch-${v.name}-${c.file}`,
        group: "移動",
        label: `${v.name} ${c.title}`,
        run: () => nav.go({ work: work.name, vol: v.name, chap: chapOf(c.file) }),
      })),
    ),
    ...props.works
      .filter((w) => w.name !== work.name)
      .map((w) => ({ id: `work-${w.name}`, group: "移動", label: w.title, run: () => nav.go({ work: w.name }) })),
    ...(sy
      ? [
          { id: "inbox", group: "台帳", label: "受信箱", run: () => openSide("inbox") },
          { id: "scene", group: "台帳", label: "場面", run: () => openSide("scene") },
          { id: "stages", group: "台帳", label: "好意の段階", run: () => nav.open("stages") },
          { id: "style", group: "台帳", label: "文体", run: () => nav.open("style") },
          ...(work.docs ?? []).map((d) => ({ id: `doc-${d}`, group: "台帳", label: `設定集: ${DOC_LABEL[d] ?? d}`, run: () => (setDocName(d), nav.open("docs")) })),
          { id: "ov-check", group: "台帳", label: ovCheck ? "台帳の照合を消す" : "台帳の照合を出す", run: () => setOvCheck(!ovCheck) },
          { id: "ov-lint", group: "台帳", label: ovLint ? "文体の指摘を消す" : "文体の指摘を出す", run: () => setOvLint(!ovLint) },
          { id: "ov-threads", group: "台帳", label: ovThreads ? "伏線を消す" : "伏線を出す", run: () => setOvThreads(!ovThreads) },
          { id: "ov-names", group: "台帳", label: ovNames ? "人物・用語を消す" : "人物・用語を出す", run: () => setOvNames(!ovNames) },
        ]
      : []),
    { id: "clean", group: "表示", label: clean ? "赤を出す" : "清書にする", run: () => setClean(!clean) },
    { id: "heat", group: "表示", label: heat ? "声の色を消す" : "声の色を出す", run: () => setHeat(!heat) },
    ...(mobile ? [{ id: "red", group: "表示", label: redMode ? "読むだけにする" : "赤入れにする", run: () => setRedMode(!redMode) }] : []),
    { id: "font+", group: "表示", label: "文字を大きく", keys: "⌘+", run: () => font(1) },
    { id: "font-", group: "表示", label: "文字を小さく", keys: "⌘−", run: () => font(-1) },
    ...themeCommands(props.setTheme),
    { id: "paper-auto", group: "表示", label: "紙: テーマに合わせる", run: () => setPaper("auto") },
    ...(Object.keys(prefs.PAPERS) as prefs.Paper[]).map((k) => ({ id: `paper-${k}`, group: "表示", label: `紙: ${prefs.PAPERS[k].label}`, run: () => setPaper(k) })),
  ];

  const saveMark =
    save === "saving" ? (
      <Loader2 size={15} className="animate-spin" />
    ) : save === "error" ? (
      <AlertCircle size={15} className="text-pen-text" />
    ) : save === "saved" ? (
      <Check size={15} />
    ) : null;
  const saveLabel = { saving: "保存中", error: "保存できなかった", saved: "保存済み", idle: "" }[save];
  const status = (
    <span className="flex items-center gap-1 text-sub" role="status">
      {saveMark && (
        <Tip label={saveLabel}>
          <span aria-label={saveLabel} className="grid size-7 place-items-center" data-save={save}>
            {saveMark}
          </span>
        </Tip>
      )}
      {!live && (
        <Tip label="変更の知らせが切れている">
          <span aria-label="変更の知らせが切れている" className="grid size-7 place-items-center text-pen-text" data-live="off">
            <WifiOff size={15} />
          </span>
        </Tip>
      )}
    </span>
  );

  const menuPopup = "panel z-40 max-h-[var(--available-height)] min-w-52 overflow-y-auto p-1.5 outline-none transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0";
  const menuItem = "flex h-8 cursor-default items-center gap-2 rounded-md px-2.5 outline-none data-highlighted:bg-raised data-highlighted:shadow-raised";
  const label = "px-2.5 pt-1.5 pb-1 text-[11px] text-sub";
  const layersItems = (
    <Menu.Group>
      <Menu.CheckboxItem className={menuItem} checked={!clean} onCheckedChange={(v) => setClean(!v)} closeOnClick={false}>
        <span className="flex-1">赤</span>
        <Menu.CheckboxItemIndicator>
          <Check size={14} />
        </Menu.CheckboxItemIndicator>
      </Menu.CheckboxItem>
      <Menu.CheckboxItem className={menuItem} checked={heat} onCheckedChange={setHeat} closeOnClick={false}>
        <span className="flex-1">声の色</span>
        <Menu.CheckboxItemIndicator>
          <Check size={14} />
        </Menu.CheckboxItemIndicator>
      </Menu.CheckboxItem>
      {sy &&
        (
          [
            ["台帳の照合", ovCheck, setOvCheck],
            ["文体の指摘", ovLint, setOvLint],
            ["伏線", ovThreads, setOvThreads],
            ["人物・用語", ovNames, setOvNames],
          ] as const
        ).map(([l, v, set]) => (
          <Menu.CheckboxItem key={l} className={menuItem} checked={v} onCheckedChange={set} closeOnClick={false}>
            <span className="flex-1">{l}</span>
            <Menu.CheckboxItemIndicator>
              <Check size={14} />
            </Menu.CheckboxItemIndicator>
          </Menu.CheckboxItem>
        ))}
      {/* 凡例。色だけに頼らず、言葉を添える */}
      <div className="flex flex-col gap-1 px-2.5 pb-1.5 text-[11px] text-sub">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ background: "color-mix(in srgb, #2e9e78 30%, transparent)" }} />
          声なし区間
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-[3px] rounded-sm bg-[#8e5bd0]" />
          落とし
        </span>
      </div>
    </Menu.Group>
  );
  // 表示の設定（文字・紙・余白・テーマ）。スマホは下のシート、PC は上のバーの Popover
  const seg = "ghost flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg aria-checked:bg-raised aria-checked:shadow-raised md:h-8";
  const radios = <T extends string>(name: string, value: T, set: (v: T) => void, opts: [T, ReactNode, string?][]) => (
    <div role="radiogroup" aria-label={name} className="flex gap-1">
      {opts.map(([v, body, aria]) => (
        <button key={v} role="radio" aria-checked={value === v} aria-label={aria} className={seg} onClick={() => set(v)}>
          {body}
        </button>
      ))}
    </div>
  );
  const groupLabel = "pb-1 text-[11px] text-sub";
  const displayPanel = (
    <div className="flex flex-col gap-3 p-3" data-display>
      <div>
        <div className={groupLabel}>文字 {fs}px</div>
        <div className="flex gap-1">
          <button className={seg} aria-label="文字を小さく" onClick={() => font(-1)}>
            小さく
          </button>
          <button className={seg} aria-label="文字を大きく" onClick={() => font(1)}>
            大きく
          </button>
        </div>
      </div>
      <div>
        <div className={groupLabel}>紙</div>
        {radios<prefs.Paper | "auto">("紙", paperPref, setPaper, [
          ["auto", "自動"],
          ...(Object.keys(prefs.PAPERS) as prefs.Paper[]).map(
            (k) => [k, <span className="size-5 rounded-full shadow-[0_0_0_1px_rgb(127_127_127/0.5)]" style={{ background: prefs.PAPERS[k].paper }} />, `紙: ${prefs.PAPERS[k].label}`] as [prefs.Paper, ReactNode, string],
          ),
        ])}
      </div>
      {(reading || (mobile && !typeset)) && (
        <div>
          <div className={groupLabel}>{reading ? "行間と余白" : "余白"}</div>
          {radios<prefs.Spacing>(reading ? "行間と余白" : "余白", spacing, setSpacing, (Object.keys(prefs.SPACINGS) as prefs.Spacing[]).map((k) => [k, prefs.SPACINGS[k].label]))}
        </div>
      )}
      <div>
        <div className={groupLabel}>テーマ</div>
        {radios<prefs.Theme>("テーマ", props.theme, props.setTheme, THEMES.map(([t, l]) => [t, l]))}
      </div>
    </div>
  );
  const docItems = sy && (
    <>
      <Menu.Item className={menuItem} onClick={() => nav.open("style")}>
        文体
      </Menu.Item>
      {!!work.docs?.length && (
        <Menu.Item className={menuItem} onClick={() => nav.open("docs")}>
          設定集
        </Menu.Item>
      )}
      <Menu.Item className={menuItem} onClick={() => nav.open("stages")}>
        好意の段階
      </Menu.Item>
    </>
  );
  const copyItem = (
    <Menu.Item className={menuItem} onClick={() => review && copyRequest(review)}>
      依頼文をコピー
    </Menu.Item>
  );
  // PC の ⋯: 資料・依頼文・キー一覧
  const moreItems = (
    <>
      {docItems}
      {sy && <Menu.Separator className="my-1 h-px bg-[var(--color-line)]" />}
      {copyItem}
      <Menu.Item className={menuItem} onClick={() => nav.open("keys")}>
        キー一覧
      </Menu.Item>
    </>
  );
  /** 一段奥のメニュー */
  const sub = (title: string, items: ReactNode) => (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger className={menuItem}>
        <span className="flex-1">{title}</span>
        <ChevronRight size={14} className="text-sub" />
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} collisionPadding={8} className="z-40">
          <Menu.Popup className={menuPopup}>{items}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
  const menu = (icon: ReactNode, tip: string, items: ReactNode, size = 32) => (
    <Menu.Root>
      <Tip label={tip}>
        <Menu.Trigger aria-label={tip} className="ghost grid place-items-center rounded-lg" style={{ width: size, height: size }}>
          {icon}
        </Menu.Trigger>
      </Tip>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" collisionPadding={8} className="z-40">
          <Menu.Popup className={menuPopup}>{items}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );

  const errorBand = band && (
    <div role="alert" className="raised flex items-center gap-2 rounded-[10px] py-1.5 pr-1.5 pl-3 text-pen-text">
      <AlertCircle size={15} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{band.msg}</span>
      <button className="ghost flex h-7 items-center gap-1 rounded-md px-2" onClick={() => (setBand(null), band.retry())}>
        <RefreshCw size={14} />
        再試行
      </button>
      <IconButton label="閉じる" size={28} onClick={() => setBand(null)}>
        <X size={14} />
      </IconButton>
    </div>
  );

  const nav3 = (
    <nav aria-label="作品と章" className="flex flex-col gap-0.5">
      {work.vols.map((v) => (
        <div key={v.name} className="flex flex-col gap-0.5">
          <div className="px-2 pt-2 pb-1 text-[11px] text-sub">{v.name}</div>
          {v.chapters.map((c) => {
            const cur = v.name === vol.name && c.file === file;
            const n = todoIn(v.name, c.file);
            return (
              <a
                key={c.file}
                href={`/${work.name}/${v.name}/${chapOf(c.file)}`}
                aria-current={cur ? "page" : undefined}
                aria-selected={cur}
                className={clsx("ghost flex h-8 items-center gap-2 rounded-lg px-2", cur && "font-medium")}
                onClick={(ev) => {
                  if (ev.metaKey || ev.ctrlKey) return;
                  ev.preventDefault();
                  nav.go({ work: work.name, vol: v.name, chap: chapOf(c.file) });
                }}
              >
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                {n > 0 && <span className="text-[11px] text-pen-text">{n}</span>}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const tocItems = tsToc.map((t) => (
    <Menu.Item key={t.href} className={menuItem} onClick={() => tsApi.current?.go({ href: t.href })}>
      <span className="truncate">{t.name}</span>
    </Menu.Item>
  ));
  const paper = typeset ? (
    <div className="typeset relative min-h-0 min-w-0 flex-1" aria-busy={tsBusy}>
      <Typeset
        work={work.name}
        vol={vol.name}
        chap={chapOf(file)}
        start={jump.current ?? { chap: chapOf(file), line: 0 }}
        fontSize={tsFont}
        spread={spread && !mobile}
        zoom={zoom}
        reading={reading ? { paper: pc.paper, ink: pc.ink, lineHeight: sp.lineHeight, margin: sp.margin, top: mobile ? BAR_TOP + sp.y / 2 : sp.y, bottom: mobile ? BAR_BOTTOM + sp.y / 2 : sp.y } : null}
        all={allPages}
        reload={tsReload}
        api={tsApi}
        onNav={(p) => {
          setTsPage(p);
          if (sy && p.spot) setCurLine(p.spot.line);
          // スマホと PC の画面が入れ替わると組版を作り直すので、開く段落を持っておく
          jump.current = tsApi.current?.spot() ?? jump.current;
          if (p.total && !reading) prefs.saveTotalPages(work.name, `${vol.name}@${tsFont}`, p.total);
          // 目次のページを開いたら、章のページ番号を埋めるために巻全体を組む
          if (p.toc && !allPages) setAllPages(true);
          // ページの章をサイドバーと URL に映す（履歴は積まない）
          if (p.spot && p.spot.chap !== chapOf(file)) nav.go({ ...routeRef.current, chap: p.spot.chap }, true);
        }}
        onToc={setTsToc}
        onOpenText={openText}
        onTap={() => mobile && setBare((b) => !b)}
        onKey={(ev) => keyRef.current(ev)}
        onBusy={setTsBusy}
        onError={(msg) => setBand({ msg, retry: () => setTsReload((n) => n + 1) })}
      />
      {/* 巻の中の位置。縦書きの本なので右から伸ばす */}
      {reading && tsPage && (
        <div aria-hidden className="progress pointer-events-none absolute inset-x-0 bottom-0 flex h-[2px] justify-end">
          <div className="h-full bg-ink/40" style={{ width: `${tsPage.frac * 100}%` }} />
        </div>
      )}
      {tsBusy && (
        <div className="pointer-events-none absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-black/40 text-white" aria-label="組んでいる">
          <Loader2 size={16} className="animate-spin" />
        </div>
      )}
    </div>
  ) : (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" style={penVars} onClick={(e) => (e.target as Element).closest(".reader") && onReaderClick(e)} onKeyDown={onMarkKey} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {chap ? (
        <Reader ref={reader} lines={lines} from={from} marks={marks} ins={ins} tint={tint} onScroll={onScroll} busy={busy} fontSize={fs} />
      ) : (
        <div className="m-auto flex flex-col items-center gap-3 text-sub" aria-busy>
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}
      {cut > 0 && <div aria-hidden className="page-cut pointer-events-none absolute inset-y-0 left-0 bg-paper" style={{ width: cut }} />}
    </div>
  );

  const leftLabel = reading && tsPage?.left != null && (
    <span className="text-[11px] whitespace-nowrap text-sub tabular-nums" aria-label="章の残りページ">
      残り {tsPage.left}
    </span>
  );

  const panel = review && (
    <Panel
      review={review}
      fileKey={fileKey}
      chapterTitle={(f) => work.vols.flatMap((v) => v.chapters.map((c) => [`${v.name}/${c.file}`, c.title])).find(([k]) => k === f)?.[1] ?? f}
      located={located}
      focusId={focusId}
      act={act}
    />
  );

  const chapterTitle = (v: string, f: string) => work.vols.find((x) => x.name === v)?.chapters.find((c) => c.file === f)?.title ?? f;
  const inboxItems = useMemo(() => (sy ? inbox(work, Object.values(reviews).map((r) => r.entries), asks.data?.questions ?? []) : []), [sy, reviews, asks.data]);
  const inboxN = inboxItems.length + (shownImpact ? 1 : 0);
  const settle = (q: AskQ, answer: string) =>
    setConfirm({
      title: `${q.id} に答える。台帳に書くので取り消せない: 「${answer}」`,
      ok: "答える",
      onOk: async () => {
        setSave("saving");
        try {
          await api.settle(work.name, q.id, answer);
          setSave("saved");
          toast(`${q.id} に答えた`);
        } catch (e) {
          setSave("error");
          setBand({ msg: `答えを書けなかった: ${(e as Error).message}`, retry: () => settle(q, answer) });
        }
        setSyTick((n) => n + 1);
      },
    });
  const jumpAsk = (q: AskQ) => {
    const l = q.at ? locate(work, q.at) : null;
    if (!l) return;
    setSceneJump({ key: `${l.vol}/${l.file}`, scene: l.scene });
    nav.go({ work: work.name, vol: l.vol, chap: chapOf(l.file), view: undefined, mode: undefined });
  };
  /** 横のパネルのタブを開く。スマホはシートで */
  const openSide = (t: typeof side) => {
    setSide(t);
    if (mobile) nav.open("notes");
  };
  const curScene = sceneOf(breaks, curLine || from + 1);
  const sideTab = "ghost h-7 rounded-md px-2.5 text-[13px]";
  const sideTabs = sy && (
    <div role="tablist" aria-label="パネル" className="flex gap-1 px-3 pt-3">
      {(
        [
          ["notes", "指摘", null],
          ["inbox", "受信箱", inboxN],
          ["scene", "場面", null],
        ] as const
      ).map(([t, l, n]) => (
        <button key={t} role="tab" aria-selected={side === t} className={clsx(sideTab, side === t && "raised")} onClick={() => setSide(t)}>
          {l} {n ? <span className="text-pen-text">{n}</span> : null}
        </button>
      ))}
    </div>
  );
  const sideBody =
    sy && side === "inbox" ? (
      <InboxView
        items={inboxItems}
        asks={asks.data}
        impact={shownImpact || null}
        err={asks.err}
        chapterTitle={chapterTitle}
        jumpEntry={(e) => nav.go(chapterRoute(e))}
        jumpAsk={jumpAsk}
        reply={(e, body) => write("返事を送った", () => api.reply(work.name, e.file.split("/")[0], e.id, body, e.updated), updated(e, ["thread", "status"]))}
        settle={settle}
        dismissImpact={dismissImpact}
      />
    ) : sy && side === "scene" ? (
      <SceneView
        work={work.name}
        at={pointOf(vol.name, file, curScene)}
        until={pointOf(vol.name, file)}
        chapterAt={(at) => atChapter(work, at, vol.name, file)}
        tick={syTick}
      />
    ) : (
      panel
    );
  const side3 = (
    <>
      {sideTabs}
      {sideBody}
    </>
  );
  const secretIds = useMemo(() => new Set(secrets?.map((x) => x.name)), [secrets]);
  const cardBody = nameCard && (
    <NameCard work={work.name} name={nameCard.name} kind={nameCard.kind} note={nameCard.note} desc={nameCard.desc} at={nameCard.at} secret={secretIds.has(nameCard.name)} tick={syTick} />
  );

  const overlays = (
    <>
      {sy && (
        <>
          <Modal open={route.s === "stages"} onClose={nav.close} label="好意の段階" className="max-w-xl">
            <StagesView work={work.name} tick={syTick} />
          </Modal>
          <Modal open={route.s === "style"} onClose={nav.close} label="文体" className="max-w-xl">
            <StyleView work={work.name} chapter={`${vol.name}/${chapOf(file)}`} title={chapter?.title ?? ""} tick={syTick} />
          </Modal>
          {!!work.docs?.length && (
            <Modal open={route.s === "docs"} onClose={nav.close} label="設定集" className="h-[85dvh] max-w-3xl">
              <DocsView work={work.name} docs={work.docs} name={work.docs.includes(docName) ? docName : work.docs[0]} pick={setDocName} />
            </Modal>
          )}
          {!mobile && (
            <Popover.Root open={!!nameCard} onOpenChange={(o) => !o && setNameCard(null)}>
              <Popover.Portal>
                <Popover.Positioner anchor={nameCard?.el} side="left" sideOffset={8} collisionPadding={8} className="z-40">
                  <Popover.Popup aria-label={nameCard?.name} className="panel max-h-[70dvh] w-80 overflow-y-auto p-3 outline-none">
                    {cardBody}
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          )}
        </>
      )}
      <Palette open={route.s === "k"} onClose={nav.close} commands={commands} />
      <Search open={route.s === "find"} work={work.name} vol={loc.vol} onOpen={openHit} onClose={nav.close} extra={sy ? (q) => <LedgerHits work={work.name} q={q} /> : undefined} />
      <Modal open={route.s === "keys"} onClose={nav.close} label="キー一覧">
        <KeyList />
      </Modal>
      <Ask spec={ask} onClose={() => setAsk(null)} />
      <Confirm spec={confirm} onClose={() => setConfirm(null)} />
    </>
  );

  if (mobile) {
    const tools = sel && actions.length > 0;
    const main = actions.slice(0, 5);
    const rest = actions.slice(5);
    return (
      // バーは本文の上に重ね、出し入れは transform と opacity だけで行う（本文の大きさを変えると組み直されてチラつく）
      <div className={clsx("relative flex h-dvh flex-col", typeset && !reading ? "bg-stage" : "bg-paper")} style={paperVars}>
        <header
          className={clsx(
            "panel fixed inset-x-2 top-[max(8px,env(safe-area-inset-top))] z-10 flex h-11 items-center justify-center rounded-xl transition-[transform,opacity]",
            bare && "pointer-events-none -translate-y-16 opacity-0",
          )}
        >
          <button className="flex h-10 max-w-full items-center gap-1.5 px-3" aria-label="作品と章を選ぶ" onClick={() => nav.open("nav")}>
            <span className="truncate font-medium">{chapter?.title}</span>
            <ChevronDown size={15} className="shrink-0 text-sub" />
          </button>
          <span className="absolute right-3">{status}</span>
        </header>
        {errorBand && <div className="fixed inset-x-2 top-[calc(max(8px,env(safe-area-inset-top))+52px)] z-10">{errorBand}</div>}
        {typeset ? <div className={clsx("absolute flex", reading ? "reading-stage" : "phone-stage inset-x-0")}>{paper}</div> : paper}
        <div className={clsx("fixed inset-x-3 bottom-[max(16px,env(safe-area-inset-bottom))] z-20 transition-[transform,opacity]", bare && !tools && "pointer-events-none translate-y-24 opacity-0")}>
          {tools ? (
            <div role="toolbar" aria-label="赤" className="toolbar panel flex gap-0.5 rounded-2xl p-1.5" onMouseDown={(e) => e.preventDefault()}>
              {main.map((a) => (
                <button key={a.label} className="ghost flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px]" onClick={a.run}>
                  {a.icon}
                  <span className="max-w-full truncate">{a.label}</span>
                </button>
              ))}
              {rest.length > 0 &&
                menu(
                  <MoreHorizontal size={18} />,
                  "ほかの赤",
                  rest.map((a) => (
                    <Menu.Item key={a.label} className={menuItem} onClick={a.run}>
                      {a.icon}
                      {a.label}
                    </Menu.Item>
                  )),
                  44,
                )}
              <IconButton label="やめる" size={44} className="self-center" onClick={() => (clearSel(), setReattach(null))}>
                <X size={18} />
              </IconButton>
            </div>
          ) : (
            <nav aria-label="操作" className="panel flex h-15 items-center justify-around rounded-2xl px-1.5">
              {typeset ? (
                <>
                  {menu(<ListTree size={20} />, "目次", tocItems, 48)}
                  <span className="min-w-16 text-center text-sub tabular-nums" aria-label="ページ">
                    {pageLabel}
                  </span>
                  {leftLabel}
                </>
              ) : (
              <IconButton label={reattach ? "付け直すのをやめる" : "赤入れ"} size={48} aria-pressed={redMode || !!reattach} className={clsx((redMode || reattach) && "text-pen-text!")} onClick={() => (reattach ? setReattach(null) : setRedMode(!redMode))}>
                {reattach ? <LocateFixed size={20} /> : <Highlighter size={20} />}
              </IconButton>
              )}
              <IconButton label="検索" size={48} onClick={() => nav.open("find")}>
                <SearchIcon size={20} />
              </IconButton>
              <IconButton label={`指摘 ${openCount} 件`} size={48} className="relative" onClick={() => nav.open("notes")}>
                <Inbox size={20} />
                {openCount > 0 && <span className="absolute top-1.5 right-1 min-w-4 rounded-full bg-pen px-1 text-[10px] leading-4 text-white">{openCount}</span>}
              </IconButton>
              <IconButton label="表示" size={48} onClick={() => nav.open("display")}>
                <ALargeSmall size={20} />
              </IconButton>
              {menu(<MoreHorizontal size={20} />, "その他", (
                <>
                  <Menu.Item className={menuItem} onClick={() => showTypeset(!typeset)}>
                    {typeset ? <Highlighter size={15} /> : <BookOpen size={15} />}
                    {typeset ? "赤入れ" : "組版"}
                  </Menu.Item>
                  {typeset && (
                    <Menu.Item className={menuItem} onClick={() => setMode(reading ? "print" : "reading")}>
                      {reading ? <Printer size={15} /> : <BookOpenText size={15} />}
                      {reading ? "本番の見方" : "読書の見方"}
                    </Menu.Item>
                  )}
                  {typeset && (
                    <Menu.Item className={menuItem} disabled={allPages} onClick={() => setAllPages(true)}>
                      巻全体を組む
                    </Menu.Item>
                  )}
                  <Menu.Separator className="my-1 h-px bg-[var(--color-line)]" />
                  {!typeset && sub("重ねて表示", layersItems)}
                  {sy && sub("資料", docItems)}
                  {copyItem}
                </>
              ), 48)}
            </nav>
          )}
        </div>

        <Drawer.Root open={route.s === "notes"} onOpenChange={(o) => !o && nav.close()} snapPoints={[0.55, 1]}>
          <Sheet label={sy ? "パネル" : "指摘"}>{sy ? side3 : panel}</Sheet>
        </Drawer.Root>
        {sy && (
          <Drawer.Root open={!!nameCard} onOpenChange={(o) => !o && setNameCard(null)}>
            <Sheet label={nameCard?.name ?? ""}>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{cardBody}</div>
            </Sheet>
          </Drawer.Root>
        )}
        <Drawer.Root open={route.s === "display"} onOpenChange={(o) => !o && nav.close()}>
          <Sheet label="表示">
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">{displayPanel}</div>
          </Sheet>
        </Drawer.Root>
        <Drawer.Root open={route.s === "nav"} onOpenChange={(o) => !o && nav.close()}>
          <Sheet label="作品と章">
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
              <a href="/" className="ghost flex h-10 items-center gap-2 rounded-lg px-2 font-semibold" onClick={(e) => (e.preventDefault(), nav.go({}))}>
                <Library size={16} />
                本棚
              </a>
              <div className="px-2 pt-2 font-semibold">{work.title}</div>
              {nav3}
            </div>
          </Sheet>
        </Drawer.Root>
        {overlays}
      </div>
    );
  }

  return (
    <div className="grid h-dvh grid-cols-[232px_minmax(0,1fr)_320px] grid-rows-[44px_minmax(0,1fr)] gap-2 p-2" style={paperVars}>
      <aside className="panel row-span-2 flex min-h-0 flex-col gap-1 overflow-y-auto p-2">
        <a href="/" className="ghost flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 font-semibold" onClick={(e) => (e.preventDefault(), nav.go({}))}>
          <Library size={16} className="shrink-0" />
          <span className="truncate">{work.title}</span>
        </a>
        {nav3}
        <span className="flex-1" />
        {props.works
          .filter((w) => w.name !== work.name)
          .map((w) => (
            <a key={w.name} href={`/${w.name}`} className="ghost flex h-8 shrink-0 items-center gap-2 rounded-lg px-2" onClick={(e) => (e.preventDefault(), nav.go({ work: w.name }))}>
              <BookOpen size={15} className="shrink-0" />
              <span className="truncate">{w.title}</span>
            </a>
          ))}
      </aside>

      <header className="panel col-span-2 flex items-center gap-1.5 px-2">
        <IconButton label="前の章" keys="[" size={28} disabled={ci <= 0} onClick={() => stepChapter(-1)}>
          <ChevronLeft size={15} />
        </IconButton>
        <span className="text-sub">{vol.name}</span>
        <ChevronRight size={13} className="text-sub" aria-hidden />
        <h1 className="truncate font-medium">{chapter?.title}</h1>
        <IconButton label="次の章" keys="]" size={28} disabled={ci >= vol.chapters.length - 1} onClick={() => stepChapter(1)}>
          <ChevronRight size={15} />
        </IconButton>
        <span className="flex-1" />
        <div role="group" aria-label="表示" className="well flex gap-0.5 rounded-[9px] p-0.5">
          <button aria-pressed={!typeset} className="ghost flex h-7 items-center gap-1.5 rounded-[7px] px-2.5" onClick={() => showTypeset(false)}>
            <Highlighter size={14} />
            赤入れ
          </button>
          <button aria-pressed={typeset} className="ghost flex h-7 items-center gap-1.5 rounded-[7px] px-2.5" onClick={() => showTypeset(true)}>
            <BookOpen size={14} />
            組版
          </button>
        </div>
        <span className="flex-1" />
        {status}
        {typeset ? (
          <>
            <button
              className="ghost flex h-8 items-center gap-1.5 rounded-lg px-2.5 disabled:opacity-60"
              disabled={allPages}
              onClick={() => setAllPages(true)}
            >
              {allPages && tsBusy && <Loader2 size={14} className="animate-spin" />}
              {allPages ? (tsBusy ? "組んでいる" : "巻全体を組んだ") : "巻全体を組む"}
            </button>
            {menu(<ListTree size={16} />, "目次", tocItems)}
            <IconButton label={reading ? "本番の見方にする" : "読書の見方にする"} aria-pressed={reading} onClick={() => setMode(reading ? "print" : "reading")}>
              <BookOpenText size={16} />
            </IconButton>
            <IconButton label={spread ? "単ページにする" : "見開きにする"} onClick={() => setSpreadPref(!spread)}>
              {spread ? <FileIcon size={16} /> : <Columns2 size={16} />}
            </IconButton>
            {!reading && (
              <>
                <IconButton label="縮小" onClick={() => zoomBy(-1)}>
                  <ZoomOut size={16} />
                </IconButton>
                <IconButton label="拡大" onClick={() => zoomBy(1)}>
                  <ZoomIn size={16} />
                </IconButton>
              </>
            )}
          </>
        ) : (
          menu(<Layers size={16} />, "重ねて表示", layersItems)
        )}
        <Popover.Root>
          <Tip label="表示">
            <Popover.Trigger aria-label="表示" className="ghost grid size-8 place-items-center rounded-lg">
              <ALargeSmall size={16} />
            </Popover.Trigger>
          </Tip>
          <Popover.Portal>
            <Popover.Positioner sideOffset={6} align="end" collisionPadding={8} className="z-40">
              <Popover.Popup aria-label="表示" className="panel max-h-[var(--available-height)] w-72 overflow-y-auto outline-none">
                {displayPanel}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        {menu(<MoreHorizontal size={16} />, "その他", moreItems)}
        <Tip label="コマンド" keys="⌘K">
          <button aria-label="コマンド" className="raised flex h-8 items-center gap-2 rounded-lg px-2.5 text-sub" onClick={() => nav.open("k")}>
            <CommandIcon size={14} />
            <Kbd>⌘K</Kbd>
          </button>
        </Tip>
      </header>

      <main className="relative flex min-h-0 min-w-0 flex-col">
        {/* 帯は重ねて出す（本文の大きさを変えない） */}
        {errorBand && <div className="absolute inset-x-2 top-2 z-10">{errorBand}</div>}
        <div className={clsx("relative flex min-h-0 flex-1 overflow-hidden rounded-[10px]", typeset && !reading ? "bg-stage shadow-stage" : "bg-paper")}>
          {paper}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 opacity-70 hover:opacity-100">
            <IconButton label="次のページ" keys="←" className="raised" onClick={() => page(1)}>
              <ChevronLeft size={16} />
            </IconButton>
            {typeset && pageLabel && (
              <span className="raised rounded-lg px-2.5 py-1 tabular-nums" aria-label="ページ">
                {pageLabel}
              </span>
            )}
            {leftLabel && <span className="raised rounded-lg px-2.5 py-1">{leftLabel}</span>}
            <IconButton label="前のページ" keys="→" className="raised" onClick={() => page(-1)}>
              <ChevronRight size={16} />
            </IconButton>
          </div>
        </div>
      </main>

      <aside className="panel flex min-h-0 flex-col" aria-label={sy ? "パネル" : "指摘"}>
        {sy ? side3 : panel}
      </aside>

      {sel && actions.length > 0 && !ask && (
        <div role="toolbar" aria-label="赤" className="toolbar panel fixed z-30 flex flex-col gap-0.5 p-1" style={toolbarAt(sel.box)} onMouseDown={(e) => e.preventDefault()}>
          {actions.map((a) => (
            <button key={a.label} className="ghost flex h-8 items-center gap-2 rounded-md px-2 whitespace-nowrap" onClick={a.run}>
              {a.icon}
              <span className="flex-1 text-left">{a.label}</span>
              {a.key !== "Enter" && <Kbd>{a.key}</Kbd>}
            </button>
          ))}
          <button className="ghost flex h-7 items-center justify-center rounded-md" aria-label="閉じる" onClick={() => (clearSel(), setReattach(null))}>
            <X size={14} />
          </button>
        </div>
      )}
      {overlays}
    </div>
  );
}

function Sheet({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Drawer.Portal>
      <Drawer.Backdrop className="fixed inset-0 z-30 bg-black/25 transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-black/60" />
      <Drawer.Viewport className="fixed inset-0 z-30 flex items-end">
        <Drawer.Popup
          aria-label={label}
          className="sheet flex max-h-[calc(100dvh-24px)] min-h-[50dvh] w-full flex-col rounded-t-[20px] bg-panel shadow-sheet outline-none [transform:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))] transition-transform duration-300 ease-out data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)] data-swiping:duration-0"
        >
          <div className="grid h-6 shrink-0 place-items-center">
            <span className="h-1 w-9 rounded-full bg-sub/30" />
          </div>
          <Drawer.Title className="sr-only">{label}</Drawer.Title>
          <Drawer.Content className="flex min-h-0 flex-1 flex-col">{children}</Drawer.Content>
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  );
}

const KEYS: [string, string][] = [
  ["⌘K", "コマンド"],
  ["/", "検索"],
  ["j / k", "次・前の指摘"],
  ["] / [", "次・前の章"],
  ["← / →", "次・前のページ"],
  ["⌘Z", "取り消す"],
  ["⌘+ / ⌘−", "文字の大きさ"],
  ["r d y e", "差替・トル・ルビ・傍点"],
  ["i", "挿入（文字の間）"],
  ["s c k", "提案・コメント・keep"],
  ["Esc", "選択をやめる"],
];
function KeyList() {
  return (
    <div className="p-4">
      <h2 className="mb-3 text-sm font-semibold">キー一覧</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {KEYS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <Kbd>{k}</Kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
