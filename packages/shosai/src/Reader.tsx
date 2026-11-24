// 縦書きの本文。各文字の要素に原稿上の位置（data-line / data-s / data-e）を持たせ、
// 選択やタップを .kym.txt の行・文字位置に戻せるようにする。
import { memo, type ReactNode, type Ref } from "react";
import type { Tint } from "./heat";
import { type Tok, tokenize } from "./kym";

export interface Mark {
  /** 指摘の ID。syuki の印は空 */
  id: string;
  s: number;
  e: number;
  cls: string;
  title?: string;
  /** syuki の印の中身（押した時に読む） */
  sy?: string;
}

/** 本文の間に差し込む印（消した字、指摘の札、挿入点）。選択の対象にしない。 */
export interface Insert {
  p: number;
  key: string;
  cls: string;
  text: string;
  id?: string;
  /** 短いコメントを列の脇に添える（CSS の attr() で描く） */
  note?: string;
  title?: string;
  /** syuki の印の中身（押した時に読む） */
  sy?: string;
}

function renderLine(line: string, toks: Tok[], marks: Mark[], ins: Insert[]): ReactNode[] {
  const sorted = [...ins].sort((a, b) => a.p - b.p);
  let ii = 0;
  const flush = (upto: number, inclusive: boolean, sink: ReactNode[]) => {
    while (ii < sorted.length && (sorted[ii].p < upto || (inclusive && sorted[ii].p === upto))) {
      const x = sorted[ii++];
      sink.push(
        <span key={x.key} className={`skip ${x.cls}`} data-p={x.p} data-entry={x.id} data-note={x.note} data-sy={x.sy} title={x.title}>
          {x.text}
        </span>,
      );
    }
  };
  const over = (s: number, e: number) => marks.filter((m) => m.s < e && m.e > s);
  const attrs = (s: number, e: number, base = "") => {
    const ms = over(s, e);
    return {
      className: [base, ...ms.map((m) => m.cls)].filter(Boolean).join(" ") || undefined,
      "data-entry": ms.find((m) => m.id)?.id,
      "data-sy": ms.find((m) => m.sy)?.sy,
      title: ms.find((m) => m.title)?.title,
      "data-s": s,
      "data-e": e,
    };
  };

  const walk = (toks: Tok[], sink: ReactNode[]) => {
    for (const k of toks) {
      if (k.t === "text") {
        const pts = new Set([k.s, k.e]);
        for (const m of marks) for (const p of [m.s, m.e]) if (p > k.s && p < k.e) pts.add(p);
        for (const x of sorted) if (x.p > k.s && x.p < k.e) pts.add(x.p);
        const ps = [...pts].sort((a, b) => a - b);
        for (let j = 0; j < ps.length - 1; j++) {
          flush(ps[j], true, sink);
          sink.push(
            <span key={`t${ps[j]}`} {...attrs(ps[j], ps[j + 1])}>
              {line.slice(ps[j], ps[j + 1])}
            </span>,
          );
        }
      } else if (k.t === "em") {
        flush(k.s, true, sink);
        const kids: ReactNode[] = [];
        walk(k.inner, kids);
        sink.push(
          <span key={`m${k.s}`} {...attrs(k.s, k.e, "em")}>
            {kids}
          </span>,
        );
      } else {
        flush(k.e, false, sink);
        const base = line.slice(k.cs, k.ce);
        sink.push(
          k.t === "ruby" ? (
            <ruby key={`r${k.s}`} {...attrs(k.s, k.e)}>
              <span data-s={k.cs} data-e={k.ce}>
                {base}
              </span>
              <rt>{k.rt}</rt>
            </ruby>
          ) : (
            <span key={`y${k.s}`} {...attrs(k.s, k.e, "tcy")}>
              <span data-s={k.cs} data-e={k.ce}>
                {base}
              </span>
            </span>
          ),
        );
      }
    }
  };
  const out: ReactNode[] = [];
  walk(toks, out);
  flush(Infinity, true, out);
  return out;
}

const Para = memo(function Para(props: { n: number; line: string; marks: Mark[]; ins: Insert[]; tint?: Tint }) {
  const { n, line, marks, ins, tint } = props;
  if (line.startsWith("## ")) {
    return (
      <h2 data-line={n}>
        {renderLine(line, tokenize(line, 3), marks, ins)}
      </h2>
    );
  }
  if (line.trim() === "" && !ins.length) return <p className="blank" data-line={n} />;
  return (
    <p data-line={n} className={tint?.cls} title={tint?.title}>
      {renderLine(line, tokenize(line), marks, ins)}
    </p>
  );
});

export function Reader(props: {
  lines: string[];
  from: number;
  marks: Map<number, Mark[]>;
  ins: Map<number, Insert[]>;
  /** 声の色（切のときは空） */
  tint: Map<number, Tint>;
  ref: Ref<HTMLDivElement>;
  onScroll: () => void;
  /** 次の章を読み込み中（前の章を薄く残す） */
  busy: boolean;
  fontSize: number;
}) {
  const { lines, from, marks, ins } = props;
  return (
    // スクロールするのは横書きの外枠。縦書きの要素そのものをスクロールさせると、
    // WebKit は中に要素を足すたびに scrollLeft を 0 に戻してしまう
    <div
      className="reader"
      ref={props.ref}
      onScroll={props.onScroll}
      aria-busy={props.busy}
      style={{ "--fs": `${props.fontSize}px` } as React.CSSProperties}
    >
      <div className="text">
        {lines.slice(from).map((line, i) => {
          const n = from + i + 1;
          return (
            <Para key={n} n={n} line={line} marks={marks.get(n) ?? NONE_M} ins={ins.get(n) ?? NONE_I} tint={props.tint.get(n)} />
          );
        })}
      </div>
    </div>
  );
}

const NONE_M: Mark[] = [];
const NONE_I: Insert[] = [];

/** DOM の位置（選択の端やタップ位置）を、原稿の行と行内の文字位置に戻す。 */
export function toSource(node: Node, off: number, end: boolean): { line: number; pos: number } | null {
  while (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length) {
    const kids = node.childNodes;
    if (off < kids.length) {
      node = kids[off];
      off = 0;
    } else {
      node = kids[kids.length - 1];
      off = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "").length : node.childNodes.length;
    }
  }
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const p = el?.closest<HTMLElement>("[data-line]");
  if (!el || !p) return null;
  const line = Number(p.dataset.line);
  const skip = el.closest<HTMLElement>(".skip");
  if (skip) return { line, pos: Number(skip.dataset.p) };
  const rt = el.closest("rt");
  if (rt) {
    const r = rt.closest<HTMLElement>("ruby")!;
    return { line, pos: Number(end ? r.dataset.e : r.dataset.s) };
  }
  const span = el.closest<HTMLElement>("[data-s]");
  if (!span) return { line, pos: 0 };
  const s = Number(span.dataset.s);
  const e = Number(span.dataset.e);
  return { line, pos: node.nodeType === Node.TEXT_NODE ? Math.min(s + off, e) : s };
}

/** toSource の逆: 段落の中の原稿の位置を、DOM の文字の位置にする。end は範囲の終わり側か。 */
export function toDom(p: Element, pos: number, end: boolean): { node: Text; off: number } | null {
  const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode() as Text | null; t; t = w.nextNode() as Text | null) {
    const el = t.parentElement!;
    if (el.closest(".skip, rt")) continue;
    const span = el.closest<HTMLElement>("[data-s]");
    if (!span) continue;
    const s = Number(span.dataset.s);
    const e = Number(span.dataset.e);
    if (end ? s < pos && pos <= e : s <= pos && pos < e) return { node: t, off: pos - s };
  }
  return null;
}
