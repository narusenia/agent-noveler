import type { Entry, Review } from "../src/types";

export const KIND_LABEL: Record<Entry["kind"], string> = {
  replace: "差替",
  insert: "挿入",
  delete: "トル",
  ruby: "ルビ",
  emphasis: "傍点",
  suggest: "提案",
  comment: "コメント",
  keep: "keep",
};

/** before / after を持つ（原稿を書き換える）指摘 */
export const isRed = (e: Entry) => e.after !== undefined;

const SECTIONS: [string, (e: Entry) => boolean][] = [
  ["未適用の赤（作者が入れた直し）", (e) => e.status === "open" && isRed(e)],
  ["未処理の提案・コメント", (e) => e.status === "open" && !isRed(e)],
  ["作者への質問", (e) => e.status === "question"],
  ["適用済みの赤", (e) => (e.status === "done" && isRed(e)) || (e.status === "applied" && e.kind !== "keep")],
  ["処理済み", (e) => (e.status === "done" && !isRed(e)) || e.status === "declined" || e.kind === "keep"],
  ["取り消した赤（イキ）", (e) => e.status === "reverted"],
];

const one = (s: string) => s.replace(/\n/g, " ");

function item(e: Entry): string {
  const where = `${e.file}:${e.line}`;
  const out = [`### ${e.id} ${KIND_LABEL[e.kind]}（${where}）`, ""];
  if (e.before !== undefined && e.after !== undefined) {
    out.push(`- 直し: 「${one(e.before)}」→「${one(e.after)}」`);
  } else if (e.quote) {
    out.push(`- 引用: 「${one(e.quote)}」`);
  }
  if (e.status === "declined") out.push("- 状態: 見送り");
  if (e.body) out.push("", e.body);
  if (e.reply) out.push("", `> 返信: ${one(e.reply)}`);
  for (const m of e.thread ?? []) out.push("", `> ${m.by === "author" ? "作者" : "エージェント"}: ${one(m.body)}`);
  out.push("");
  return out.join("\n");
}

export function reviewMarkdown(r: Review): string {
  const out = [
    `# 赤入れ ${r.work} ${r.vol}`,
    "",
    `このファイルは shosai が \`${r.vol}.json\` から作る。手で編集しない（正本は JSON）。`,
    "",
  ];
  for (const [title, pick] of SECTIONS) {
    const list = r.entries.filter(pick);
    if (!list.length) continue;
    out.push(`## ${title}（${list.length}）`, "", ...list.map(item));
  }
  return out.join("\n");
}
