// 設定集（syuki render の生成物）を描くための小さな Markdown の読み方。見出し・段落・箇条書き・表・引用だけ。
export type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: { text: string; depth: number }[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "quote"; text: string };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function parseMd(src: string): Block[] {
  const out: Block[] = [];
  const lines = src.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const x = lines[i];
    if (!x.trim()) continue;
    const h = x.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push({ t: "h", level: h[1].length, text: h[2].trim() });
      continue;
    }
    // 表: 見出しの行の次が |---|---| の行
    if (x.trim().startsWith("|") && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "") && lines[i + 1].includes("-")) {
      const head = cells(x);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(cells(lines[i]));
      i--;
      out.push({ t: "table", head, rows });
      continue;
    }
    const li = x.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      const t = /\d/.test(li[2]) ? "ol" : "ul";
      const items: { text: string; depth: number }[] = [];
      for (; i < lines.length; i++) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (m) items.push({ text: m[3], depth: Math.floor(m[1].replace(/\t/g, "  ").length / 2) });
        else if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) items[items.length - 1].text += " " + lines[i].trim();
        else break;
      }
      i--;
      out.push({ t, items });
      continue;
    }
    if (x.startsWith(">")) {
      const buf: string[] = [];
      for (; i < lines.length && lines[i].startsWith(">"); i++) buf.push(lines[i].replace(/^>\s?/, ""));
      i--;
      out.push({ t: "quote", text: buf.join("\n") });
      continue;
    }
    const buf: string[] = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\s*([-*+]|\d+[.)])\s)/.test(lines[i]) && !lines[i].trim().startsWith("|"); i++) buf.push(lines[i]);
    // 表の形でない | の行などは、その一行を段落にする
    if (!buf.length) {
      out.push({ t: "p", text: x });
      continue;
    }
    i--;
    out.push({ t: "p", text: buf.join("\n") });
  }
  return out;
}

/** 行の中の **太字** と `コード` を切り分ける */
export function inline(text: string): { t: "text" | "b" | "code"; s: string }[] {
  const out: { t: "text" | "b" | "code"; s: string }[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ t: "text", s: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { t: "b", s: m[1] } : { t: "code", s: m[2] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: "text", s: text.slice(last) });
  return out;
}
