// 組版の表示。サーバーの `/typeset/<作品>/<巻>/` の publication を @vivliostyle/core の CoreViewer で組む。
// 画面の CSS（Tailwind の preflight など）が組版に混ざらないよう、iframe の中で組む。
import { CoreViewer, Navigation } from "@vivliostyle/core";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as prefs from "./prefs";

/** 組版と赤入れで共有する位置。段落の単位（.kym.txt の行番号）。line 0 は章の頭 */
export interface Spot {
  chap: string;
  line: number;
}
export interface TocItem {
  href: string;
  name: string;
}
export interface PageInfo {
  page: number;
  /** 巻全体を組み終えるまでは null */
  total: number | null;
  spot: Spot | null;
  /** 目次のページを開いている */
  toc: boolean;
  /** 巻の中の位置（0〜1） */
  frac: number;
  /** 章の残りページ。章を組み終えていない時は null */
  left: number | null;
}
/** 読書の見方。紙の色・字の色・行間・余白（px）。top / bottom は天地の余白（重ねるバーの分を含む） */
export interface Reading {
  paper: string;
  ink: string;
  lineHeight: number;
  margin: number;
  top: number;
  bottom: number;
}
type Where = Spot | { href: string };
export interface TypesetApi {
  /** 今のページの最初の段落 */
  spot(): Spot | null;
  step(dir: 1 | -1): void;
  go(to: Where): void;
}

// shortcut: core に今のページの位置と文書ごとのページ数を返す公開 API が無いので、内部の adaptViewer_ を読む。core の版を上げる時に確かめる
const inner = (v: CoreViewer) =>
  (v as unknown as {
    adaptViewer_?: {
      opf?: { spine?: { epage: number }[] };
      opfView?: { spineItems?: ({ complete: boolean; layoutPositions: unknown[] } | undefined)[] };
      pagePosition?: { spineIndex: number; pageIndex: number } | null;
    };
  }).adaptViewer_;

/** 読書の見方: ページを画面の大きさにし、行間・余白を上書きする。柱とノンブルは出さない。
 *  見開きでは章（文書）の頭を、読む順で見開きの先の側（右開きなら右）から始める（前の章がその側で終わると、章の頭が見開きの真ん中に来るため）。
 *  recto は core では右開きの左になるので使わない。
 *  色はここに書かない（変えるたびに組み直しになる）。paintCss で iframe の CSS だけ差し替える */
const readingCss = (r: Reading, w: number, h: number, first: "right" | "left" | null) => `
${first ? `:root { break-before: ${first} !important; }` : ""}
@page { size: ${w}px ${h}px !important; margin: ${r.top}px ${Math.round(r.margin * 0.75)}px ${r.bottom}px !important;
  @top-center { content: none !important; } @bottom-center { content: none !important; } }
:root { line-height: ${r.lineHeight} !important; }`;
/** @vivliostyle/core が見開きの二ページの間に入れる隙間（px）。shortcut: core の値を写した数。core の版を上げたら溢れないか測り直す */
const SPREAD_GAP = 2;
/** 組まずに変える色。core はページに色を直に書くので !important で上書きする */
const paintCss = (stage: string, r: Reading | null) =>
  r
    ? `html,#vp{background:${r.paper} !important}[data-vivliostyle-page-container]{background:${r.paper} !important}[data-vivliostyle-page-container] *{color:${r.ink} !important}`
    : `html,#vp{background:${stage} !important}`;

// ページが枠から少しはみ出すと出るスクロールバー。既定の白い太い棒をやめ、地は透明・つまみは細い半透明の灰（紙の色でも灰の地でも馴染む）
const scrollbarCss =
  "#vp{scrollbar-width:thin;scrollbar-color:rgba(128,128,128,.35) transparent}" +
  "#vp::-webkit-scrollbar{width:6px;height:6px}#vp::-webkit-scrollbar-track,#vp::-webkit-scrollbar-corner{background:transparent}" +
  "#vp::-webkit-scrollbar-thumb{background:rgba(128,128,128,.35);border-radius:3px}#vp::-webkit-scrollbar-thumb:hover{background:rgba(128,128,128,.6)}";

// 周りは theme.css の --color-stage（中立の灰色）。core はビューポートに #aaa を直に塗るので !important で上書きする
const frame = (stage: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:${stage}}#vp{position:absolute;inset:0;overflow:auto;background:${stage} !important}${scrollbarCss}</style></head><body><div id="vp"></div></body></html>`;

export function Typeset(props: {
  work: string;
  vol: string;
  /** 開いてほしい章（サイドバーなどで章を移った時） */
  chap: string;
  /** 最初に開く位置 */
  start: Spot | null;
  fontSize: number;
  spread: boolean;
  /** 1 で画面に合わせる */
  zoom: number;
  /** 巻全体を組む */
  all: boolean;
  /** 増えたら組み直す（原稿や設定が変わった時） */
  reload: number;
  /** 読書の見方。null は本番 */
  reading: Reading | null;
  onNav: (p: PageInfo) => void;
  onToc: (t: TocItem[]) => void;
  /** 段落をダブルクリック（スマホは長押し）して、赤入れの同じ段落へ */
  onOpenText: (s: Spot) => void;
  onTap: () => void;
  onKey: (ev: KeyboardEvent) => void;
  onBusy: (busy: boolean) => void;
  onError: (msg: string) => void;
  api: Ref<TypesetApi | null>;
}) {
  const frameEl = useRef<HTMLIFrameElement>(null);
  const stage = useRef(getComputedStyle(document.documentElement).getPropertyValue("--color-stage").trim() || "#46474b").current;
  const viewer = useRef<CoreViewer | null>(null);
  const base = `${location.origin}/typeset/${encodeURIComponent(props.work)}/${props.vol}/`;
  const docUrl = (chap: string) => `${base}manuscript/${props.vol}/${chap}.kym.html`;
  const cb = useRef(props);
  cb.current = props;
  /** 最後に知らせた位置。組み直した後にそこへ戻る */
  const last = useRef<Where | null>(props.start);
  const total = useRef<number | null>(null);
  const arriving = useRef(true);
  /** 組み直して last へ戻る途中。利用者が動かすまで、着いたページの頭の段落で last を上書きしない
   *  （頭の段落は前のページから続く段落のことがあり、上書きすると組み直すたびに前へずれる） */
  const hold = useRef(false);
  const moved = () => ((arriving.current = false), (hold.current = false));
  /** 読書の見方で、画面の大きさが変わったら増やして組み直す */
  const [resized, setResized] = useState(0);

  const doc = () => frameEl.current?.contentDocument ?? null;
  /** 今のページ（見開きなら読む順で先のページ）の最初の段落か、目次のページか */
  const look = (): { spot: Spot | null; toc: boolean } => {
    const d = doc();
    if (!d) return { spot: null, toc: false };
    const rtl = viewer.current?.getCurrentPageProgression() !== "ltr";
    const pages = [...d.querySelectorAll<HTMLElement>("[data-vivliostyle-page-container]")]
      .filter((p) => p.style.display !== "none" && p.getBoundingClientRect().width > 0)
      .sort((a, b) => (rtl ? b.getBoundingClientRect().left - a.getBoundingClientRect().left : a.getBoundingClientRect().left - b.getBoundingClientRect().left));
    for (const p of pages) {
      const el = p.querySelector<HTMLElement>("[data-line][data-chap]");
      if (el) return { spot: { chap: el.dataset.chap!, line: el.tagName === "H2" ? 0 : Number(el.dataset.line) }, toc: false };
      if (p.querySelector('[role="doc-toc"], #toc')) return { spot: null, toc: true };
    }
    return { spot: null, toc: false };
  };
  const go = (to: Where) => {
    const v = viewer.current;
    if (!v) return;
    if ("href" in to) v.navigateToInternalUrl(new URL(to.href, base).href);
    else v.navigateToInternalUrl(docUrl(to.chap) + (to.line ? `#L${to.line}` : ""));
  };
  useImperativeHandle(props.api, () => ({
    spot: () => (hold.current && last.current && "chap" in last.current ? last.current : (look().spot ?? (last.current && "chap" in last.current ? last.current : null))),
    step: (dir) => {
      moved();
      viewer.current?.navigateToPage(dir > 0 ? Navigation.NEXT : Navigation.PREVIOUS);
    },
    go: (to) => {
      moved();
      if ("href" in to) last.current = to;
      go(to);
    },
  }));

  const options = () =>
    cb.current.reading
      ? { fontSize: cb.current.fontSize, pageViewMode: (cb.current.spread ? "spread" : "singlePage") as never, fitToScreen: false, zoom: 1 }
      : {
          fontSize: cb.current.fontSize,
          pageViewMode: (cb.current.spread ? "spread" : "singlePage") as never,
          fitToScreen: cb.current.zoom === 1,
          zoom: cb.current.zoom === 1 ? 1 : (viewer.current?.queryZoomFactor("fit inside viewport" as never) ?? 1) * cb.current.zoom,
        };
  const reading = props.reading;
  // 読書の見方は紙の色・行間・余白・見開きのどれが変わっても組み直す（ページの大きさが変わる）
  const readingKey = reading ? JSON.stringify([reading.lineHeight, reading.margin, reading.top, reading.bottom, props.spread, resized]) : "";
  /** 色だけを iframe の CSS で変える（組み直さない） */
  const paint = () => {
    const d = doc();
    if (!d?.head) return;
    let st = d.getElementById("paint");
    if (!st) {
      st = d.createElement("style");
      st.id = "paint";
      d.head.append(st);
    }
    st.textContent = paintCss(stage, cb.current.reading);
  };

  // 組む（作品・巻・全体を組むか・組み直しの印・文字の大きさ・読書の行間と余白と画面の大きさが変わるたび）。
  // 文字の大きさも組み直すのは、ページの番号の覚え（startPages）が文字の大きさごとだから
  useEffect(() => {
    const f = frameEl.current!;
    let alive = true;
    const init = () => {
      const d = f.contentDocument!;
      const vp = d.getElementById("vp")!;
      vp.replaceChildren();
      paint();
      // 読書の見方は自分で大きさの変化を見て組み直す（core の autoResize は拡大率を合わせるだけ）
      const size = { w: vp.clientWidth, h: vp.clientHeight };
      // 見開きは core が二つのページの間に SPREAD_GAP の隙間を入れるので、そのぶん引く（引かないと枠から溢れてスクロールバーが出る）
      const pageW = props.spread ? Math.floor((size.w - SPREAD_GAP) / 2) : size.w;
      const v = new CoreViewer({ viewportElement: vp, window: f.contentWindow! }, { renderAllPages: props.all, autoResize: !reading, ...options() });
      viewer.current = v;
      total.current = null;
      cb.current.onBusy(true);
      let first = true;
      // 開いた直後は巻の頭（目次のことがある）を通ってから目的の位置へ移る。着くか、利用者が動かすまでは目次と見なさない
      arriving.current = true;
      let lastP = { epage: 0, epageCount: 0 };
      const report = () =>
        requestAnimationFrame(() => {
          if (!alive) return;
          if (first) return; // 最初のページを出し終えて目的の位置へ移るまでは知らせない
          const l = look();
          if (arriving.current && !l.spot && !(last.current && "href" in last.current)) l.toc = false;
          else arriving.current = false;
          if (l.spot && !hold.current) last.current = l.spot;
          else if (l.toc) last.current = { href: tocHref };
          // ページ番号は、前に巻全体を組んだ時の文書の頭の番号 + 文書の中のページ。無ければ core の見積もり
          const iv = inner(v);
          const pos = iv?.pagePosition;
          const st = pos && starts?.[pos.spineIndex];
          const item = pos && iv?.opfView?.spineItems?.[pos.spineIndex];
          const count = item?.complete ? item.layoutPositions.length : null;
          const n = iv?.opf?.spine?.length || 1;
          const frac = total.current && lastP.epage ? (lastP.epage + 1) / total.current : pos ? (pos.spineIndex + (count ? (pos.pageIndex + 1) / count : 0)) / n : 0;
          cb.current.onNav({
            page: st ? st + pos.pageIndex : Math.round(lastP.epage ?? 0) + 1,
            total: total.current,
            frac: Math.min(1, frac),
            left: count && pos ? count - 1 - pos.pageIndex : null,
            ...l,
          });
        });
      v.addListener("nav", (p) => {
        if (!alive) return;
        lastP = { epage: p.epage ?? lastP.epage, epageCount: p.epageCount ?? lastP.epageCount };
        // 巻全体を組み終えた後は、ページの数が本物になる
        if (props.all && v.readyState === "complete") total.current = lastP.epageCount;
        report();
      });
      v.addListener("loaded", () => {
        if (!alive || !first) return;
        first = false;
        const s = last.current;
        if (s) {
          hold.current = "chap" in s && s.line > 0;
          go(s);
        }
        report();
      });
      v.addListener("readystatechange", () => {
        if (!alive) return;
        if (v.readyState === "complete") {
          if (props.all) {
            total.current = lastP.epageCount;
            const sp = inner(v)?.opf?.spine;
            if (sp?.length && !reading) {
              starts = sp.map((x) => x.epage + 1);
              prefs.saveStartPages(props.work, `${props.vol}@${props.fontSize}`, starts);
            }
          }
          cb.current.onBusy(false);
          report();
        } else if (v.readyState === "interactive" && !props.all) cb.current.onBusy(false);
      });
      v.addListener("hyperlink", (p) => {
        if (p.internal) v.navigateToInternalUrl(p.href);
      });
      let tocHref = "";
      // ページの番号の覚えは本番の判型だけ（読書は画面の大きさで変わる）
      let starts = reading ? null : prefs.startPages(props.work, `${props.vol}@${props.fontSize}`);
      // manifest でなく文書の一覧で読む。最初の文書に startPage: 1 を渡さないと、core は前に組んだページの
      // 番号の続きから数える（設定を変えて組み直した後、巻の頭の目次が 181 ページになる）
      fetch(`${base}publication.json`)
        .then((r) => r.json())
        .then((m: { readingProgression?: "rtl" | "ltr"; readingOrder: { url: string; name: string; rel?: string }[] }) => {
          if (!alive) return;
          tocHref = m.readingOrder.find((x) => x.rel === "contents")?.url ?? "";
          cb.current.onToc(m.readingOrder.map((x) => ({ href: x.url, name: x.name })));
          if (starts?.length !== m.readingOrder.length) starts = null; // 文書の数が変わったら使わない
          v.loadDocument(
            m.readingOrder.map((x, i) => ({ url: base + x.url, startPage: starts?.[i] ?? (i === 0 ? 1 : undefined) })),
            { userStyleSheet: reading ? [{ text: readingCss(reading, pageW, size.h, props.spread ? (m.readingProgression === "ltr" ? "left" : "right") : null) }] : undefined },
          );
        })
        .catch((e) => alive && cb.current.onError(`組版を開けなかった: ${(e as Error).message}`));

      // iframe の中のキーとタップを外に渡す
      d.onkeydown = (ev) => cb.current.onKey(ev);
      d.ondblclick = (ev) => {
        const el = (ev.target as Element).closest?.<HTMLElement>("[data-line][data-chap]");
        if (el) cb.current.onOpenText({ chap: el.dataset.chap!, line: el.tagName === "H2" ? 0 : Number(el.dataset.line) });
      };
      let touch: { x: number; y: number; t: number } | null = null;
      let held = 0;
      d.ontouchstart = (ev) => {
        const t = ev.touches[0];
        touch = ev.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
        // 長押しで赤入れの同じ段落へ
        const el = (ev.target as Element).closest?.<HTMLElement>("[data-line][data-chap]");
        clearTimeout(held);
        if (el) held = window.setTimeout(() => ((touch = null), d.ondblclick?.({ target: el } as never)), 650);
      };
      d.ontouchmove = () => clearTimeout(held);
      d.ontouchend = (ev) => {
        clearTimeout(held);
        const s = touch;
        touch = null;
        if (!s) return;
        const t = ev.changedTouches[0];
        const dx = t.clientX - s.x;
        const v2 = viewer.current;
        if (Math.abs(dx) > 50 && Math.abs(t.clientY - s.y) < 60 && Date.now() - s.t < 600) {
          // 縦書きの本は右へ払うと次のページ
          const rtl = v2?.getCurrentPageProgression() !== "ltr";
          moved();
          v2?.navigateToPage((dx > 0) === rtl ? Navigation.NEXT : Navigation.PREVIOUS);
        } else if (Math.abs(dx) < 10 && Date.now() - s.t < 400) cb.current.onTap();
      };
    };
    if (f.contentDocument?.getElementById("vp")) init();
    else f.addEventListener("load", init, { once: true });
    // 読書の見方: 向きや大きさが変わったら、落ち着いてから組み直す（位置は last の段落に戻る）
    let laid = "";
    let timer = 0;
    const onResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const vp = f.contentDocument?.getElementById("vp");
        if (alive && vp && laid && laid !== `${vp.clientWidth}x${vp.clientHeight}`) setResized((n) => n + 1);
      }, 250);
    };
    if (reading) {
      requestAnimationFrame(() => {
        const vp = f.contentDocument?.getElementById("vp");
        if (vp) laid = `${vp.clientWidth}x${vp.clientHeight}`;
      });
      window.addEventListener("resize", onResize);
    }
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      viewer.current = null;
    };
  }, [props.work, props.vol, props.all, props.reload, props.fontSize, readingKey]);

  useEffect(paint, [reading?.paper, reading?.ink, !reading]);

  // 組版を読んでいる間は画面を消さない。使えない環境では何もしない。隠れたら離し、戻ったら取り直す
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const take = () => {
      if (document.visibilityState !== "visible" || lock) return;
      navigator.wakeLock.request("screen").then(
        (l) => (alive ? ((lock = l), l.addEventListener("release", () => lock === l && (lock = null))) : void l.release()),
        () => {},
      );
    };
    const onVis = () => {
      if (document.visibilityState === "visible") take();
      else {
        void lock?.release().catch(() => {});
        lock = null;
      }
    };
    take();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    // 文字の大きさなどで組み直る時は、前の段落に戻す（core の位置はページの中の位置なのでずれる）
    const s = last.current;
    viewer.current?.setOptions(options());
    if (s && viewer.current) {
      hold.current = "chap" in s && s.line > 0;
      go(s);
    }
  }, [props.spread, props.zoom]);

  // 章を移った（サイドバー・前後の章）: 今のページの章と違えばその章の頭へ
  useEffect(() => {
    const l = last.current;
    if (viewer.current && !(l && "chap" in l && l.chap === props.chap)) {
      last.current = { chap: props.chap, line: 0 };
      hold.current = false;
      go(last.current);
    }
  }, [props.chap]);

  return <iframe ref={frameEl} title="組版" srcDoc={frame(stage)} className="block h-full w-full border-0" />;
}
