// 組版の材料を作る。book.config.js を読み、.kym.txt → kakuyomu-vfm → VFM → HTML をメモリで作り、
// publication manifest と目次も作る。URL は `/typeset/<作品>/<巻>/` の下に、作品のフォルダと同じ並びで置く
// （front.css の相対パスがそのまま通るように）。ファイルには書き出さない。
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { convert } from "@narusenia/kakuyomu-vfm";
import { stringify } from "@vivliostyle/vfm";

type Theme = string | string[];
interface EntryObj {
  path?: string;
  rel?: string;
  title?: string;
  theme?: Theme;
  pageBreakBefore?: string;
}
export interface BookConfig {
  title?: string;
  author?: string;
  language?: string;
  readingProgression?: "rtl" | "ltr";
  theme?: Theme;
  vfm?: Record<string, unknown>;
  toc?: { title?: string; htmlPath?: string } | boolean;
  /** vivliostyle build の --size と同じ書き方（A5、182mm,257mm）。無ければ CLI の既定の letter */
  size?: string;
  entry: (string | EntryObj)[];
}

/** 組む一つの文書。href は `/typeset/<作品>/<巻>/` からの相対 */
export interface Doc {
  href: string;
  /** 元のファイル（作品のフォルダからの相対）。目次は null */
  src: string | null;
  title: string;
  themes: string[];
  rel?: string;
  pageBreakBefore?: string;
}

const KYM_OPTS = { frontmatter: { class: "vrtl", lang: "ja" }, jisage: "all" as const };
const MIME: Record<string, string> = {
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
};

export class TypesetError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const frontTitle = (text: string) => text.match(/^---\n[\s\S]*?^title:\s*(.+)$[\s\S]*?^---$/m)?.[1].trim();
/** `@vivliostyle/theme-epub3j@^1.1.0` → `@vivliostyle/theme-epub3j`。作品のフォルダのファイルなら null */
export const themePackage = (spec: string) => (/\.css$/.test(spec) || spec.startsWith(".") ? null : spec.match(/^(@[^/@]+\/[^@]+|[^@]+)/)![1]);
/** `manuscript/vol1/01.kym.md`（vivliostyle build 用の名前）→ 組む元の `.kym.txt` */
export const entrySource = (p: string) => p.replace(/\.kym\.md$/, ".kym.txt");
/** 元のファイル → 組んだ文書の href（vivliostyle build と同じ名前） */
export const docHref = (src: string) => src.replace(/\.kym\.txt$/, ".kym.html").replace(/\.md$/, ".html");

/** 段落と見出しに、元の .kym.txt の行番号（1 始まり）と章を付ける。shift は変換で増えた行数 */
const lineAttrs = (chap: string, shift: number) => () => (tree: any) => {
  const walk = (n: any) => {
    if (n.type === "element" && (n.tagName === "p" || n.tagName === "h2") && n.position) {
      const line = n.position.start.line - shift;
      n.properties.dataLine = line;
      n.properties.dataChap = chap;
      if (n.tagName === "p") n.properties.id = `L${line}`;
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(tree);
};

/** .kym.txt を HTML にする。styles は文書からの相対の href */
export function kymHtml(text: string, opts: { chap?: string; styles?: string[]; vfm?: Record<string, unknown>; language?: string; md?: boolean }) {
  const md = opts.md ? text : convert(text, KYM_OPTS);
  // 変換は本文の行を増やさず、frontmatter の足し分だけ行が増える
  const shift = md.split("\n").length - text.split("\n").length;
  return stringify(md, {
    ...opts.vfm,
    language: opts.language,
    style: opts.styles,
    editPlugins: opts.chap ? (p) => ({ ...p, hastPlugins: [...p.hastPlugins, lineAttrs(opts.chap!, shift)] }) : undefined,
  });
}

export function typesetter(pkgs: string, shosaiRoot: string) {
  const req = createRequire(path.join(shosaiRoot, "package.json"));
  const configs = new Map<string, { mtime: number; fn: (vol: string) => BookConfig }>();
  const htmlCache = new Map<string, { key: string; html: string }>();

  const workDir = (work: string) => path.join(pkgs, work);
  const configPath = (work: string) => path.join(workDir(work), "book.config.js");

  /** book.config.js を読む。変わっていたら import のキャッシュを避けて読み直す */
  async function book(work: string, vol: string): Promise<BookConfig> {
    const p = configPath(work);
    if (!fs.existsSync(p)) throw new TypesetError(404, "book.config.js が無い作品");
    const mtime = fs.statSync(p).mtimeMs;
    let c = configs.get(p);
    if (!c || c.mtime !== mtime) {
      const mod = await import(`${pathToFileURL(p).href}?t=${mtime}`);
      c = { mtime, fn: mod.default };
      configs.set(p, c);
    }
    try {
      return c.fn(vol);
    } catch (e) {
      throw new TypesetError(404, (e as Error).message);
    }
  }

  const themeList = (t: Theme | undefined) => (t === undefined ? [] : Array.isArray(t) ? t : [t]);
  /** テーマの指定 → `/typeset/<作品>/<巻>/` からの相対の href */
  const themeHref = (spec: string) => {
    const pkg = themePackage(spec);
    if (!pkg) return spec.replace(/^\.\//, "");
    let pj;
    try {
      pj = JSON.parse(fs.readFileSync(req.resolve(`${pkg}/package.json`), "utf8"));
    } catch {
      throw new TypesetError(500, `テーマ ${pkg} が shosai に入っていない`);
    }
    return `themes/${pkg}/${pj.vivliostyle?.theme?.style ?? pj.style ?? pj.main ?? "theme.css"}`;
  };

  /** 組む順の文書の一覧 */
  async function docs(work: string, vol: string): Promise<{ cfg: BookConfig; docs: Doc[] }> {
    const cfg = await book(work, vol);
    const base = themeList(cfg.theme);
    const tocPath = (typeof cfg.toc === "object" && cfg.toc.htmlPath) || "toc.html";
    const out: Doc[] = [];
    for (const e of cfg.entry) {
      const o: EntryObj = typeof e === "string" ? { path: e } : e;
      const themes = (o.theme !== undefined ? themeList(o.theme) : base).map(themeHref);
      if (o.rel === "contents") {
        out.push({ href: tocPath, src: null, title: (typeof cfg.toc === "object" && cfg.toc.title) || "目次", themes, rel: "contents", pageBreakBefore: o.pageBreakBefore });
        continue;
      }
      if (!o.path) continue;
      const src = entrySource(o.path);
      const abs = path.join(workDir(work), src);
      if (!fs.existsSync(abs)) throw new TypesetError(404, `${src} が無い`);
      const title = o.title ?? frontTitle(fs.readFileSync(abs, "utf8").slice(0, 600)) ?? path.basename(src);
      out.push({ href: docHref(src), src, title, themes, pageBreakBefore: o.pageBreakBefore });
    }
    return { cfg, docs: out };
  }

  const breakStyle = (d: Doc) => (d.pageBreakBefore ? `<style>:root { break-before: ${esc(d.pageBreakBefore)}; }</style>` : "");
  // 横書きの目次が巻の頭にあると、core は本を左から右へ進むと見なす（文書の一覧で読むので manifest の readingProgression が効かない）。
  // 根だけ rtl にして向きを伝え、中身は ltr に戻して見た目を変えない
  const rtlStyle = (cfg: BookConfig) => (cfg.readingProgression === "rtl" ? "<style>:root { direction: rtl; } body { direction: ltr; }</style>" : "");
  // 紙の大きさ。テーマより前に置き、テーマが @page で決めていればそちらを使う
  const sizeStyle = (cfg: BookConfig) => `<style>@page { size: ${esc((cfg.size ?? "letter").replace(/,/g, " "))}; }</style>`;
  /** 文書の場所から `/typeset/<作品>/<巻>/` への相対 */
  const up = (href: string) => "../".repeat(href.split("/").length - 1);

  function tocHtml(cfg: BookConfig, d: Doc, all: Doc[]) {
    const links = d.themes.map((t) => `<link rel="stylesheet" type="text/css" href="${esc(up(d.href) + t)}">`).join("");
    const items = all
      .filter((x) => x.rel !== "contents")
      .map((x) => `<li><a href="${esc(x.href)}">${esc(x.title)}</a></li>`)
      .join("");
    return `<!DOCTYPE html><html lang="${esc(cfg.language ?? "ja")}"><head><meta charset="utf-8"><title>${esc(cfg.title ?? "")}</title>${sizeStyle(cfg)}${breakStyle(d)}${rtlStyle(cfg)}${links}</head><body><h1>${esc(cfg.title ?? "")}</h1><nav id="toc" role="doc-toc"><h2>${esc(d.title)}</h2><ol>${items}</ol></nav></body></html>`;
  }

  function docHtml(work: string, cfg: BookConfig, d: Doc) {
    const abs = path.join(workDir(work), d.src!);
    const key = JSON.stringify([fs.statSync(abs).mtimeMs, d.themes, cfg.vfm, cfg.language, cfg.size, d.pageBreakBefore]);
    const hit = htmlCache.get(abs);
    if (hit?.key === key) return hit.html;
    const kym = d.src!.endsWith(".kym.txt");
    let html = kymHtml(fs.readFileSync(abs, "utf8"), {
      md: !kym,
      chap: kym ? path.basename(d.src!, ".kym.txt") : undefined,
      styles: d.themes.map((t) => up(d.href) + t),
      vfm: cfg.vfm,
      language: cfg.language,
    });
    html = html.replace(/<head>/, `<head>${sizeStyle(cfg)}`);
    if (d.pageBreakBefore) html = html.replace("</head>", `${breakStyle(d)}</head>`);
    htmlCache.set(abs, { key, html });
    return html;
  }

  /** `/typeset/<作品>/<巻>/<rest>` に答える */
  async function serve(work: string, vol: string, rest: string): Promise<{ type: string; body: string | Buffer }> {
    if (rest === "publication.json") {
      const { cfg, docs: ds } = await docs(work, vol);
      return {
        type: "application/json",
        body: JSON.stringify({
          "@context": ["https://schema.org", "https://www.w3.org/ns/pub-context"],
          type: "Book",
          name: cfg.title,
          author: cfg.author,
          inLanguage: cfg.language,
          readingProgression: cfg.readingProgression,
          readingOrder: ds.map((d) => (d.rel === "contents" ? { url: d.href, name: d.title, rel: "contents", type: "LinkedResource" } : { url: d.href, name: d.title })),
          resources: [],
          links: [],
        }),
      };
    }
    if (rest.endsWith(".html")) {
      const { cfg, docs: ds } = await docs(work, vol);
      const d = ds.find((x) => x.href === rest);
      if (!d) throw new TypesetError(404, "no doc");
      return { type: "text/html; charset=utf-8", body: d.rel === "contents" ? tocHtml(cfg, d, ds) : docHtml(work, cfg, d) };
    }
    const type = MIME[path.extname(rest).toLowerCase()];
    if (!type) throw new TypesetError(404, "no file");
    // テーマのパッケージの中（`themes/<名前>/…`）か、作品のフォルダの中だけを読む
    const m = rest.match(/^themes\/(@[^/]+\/[^/]+|[^/@]+)\/(.+)$/);
    let root = workDir(work);
    let rel = rest;
    if (m) {
      try {
        root = path.dirname(req.resolve(`${m[1]}/package.json`));
      } catch {
        throw new TypesetError(404, "no theme");
      }
      rel = m[2];
    }
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep) || !fs.existsSync(abs)) throw new TypesetError(404, "no file");
    return { type, body: fs.readFileSync(abs) };
  }

  return { serve, docs, book };
}
