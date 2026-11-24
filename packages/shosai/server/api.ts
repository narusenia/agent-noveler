// 原稿と指摘ファイルを読み書きする API。Vite の開発サーバに相乗りする。
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { plainMap, resolve, sourceRange } from "../src/kym";
import type { Entry, Review, SearchHit, Work } from "../src/types";
import { reviewMarkdown } from "./markdown";
import { ArgError, readArgs, renderDocs, settleArgs, syukiRunner } from "./syuki";
import { TypesetError, typesetter } from "./typeset";

const NAME = /^[\w-]+$/;
const FILE = /^[\w.-]+\.kym\.txt$/;
const MAX_HITS = 200;
/** 英字だけ小文字にする（長さを変えないので、位置がずれない） */
const fold = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

class HttpError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

export function shosaiApi(): Plugin {
  return {
    name: "shosai-api",
    configureServer(server) {
      // 作品が並ぶフォルダ。既定はこのリポジトリの見本（examples/）
      const pkgs = path.resolve(process.env.SHOSAI_WORKS ?? path.join(server.config.root, "../../examples"));
      const clients = new Set<ServerResponse>();
      // syuki はこのリポジトリの packages/syuki を uv で呼ぶ。無ければ PATH の syuki
      const syukiProject = path.resolve(server.config.root, "../syuki");
      const syuki = syukiRunner(fs.existsSync(path.join(syukiProject, "pyproject.toml")) ? syukiProject : null);
      const typeset = typesetter(pkgs, server.config.root);

      const workDir = (work: string) => {
        if (!NAME.test(work) || work === "shosai") throw new HttpError(400, "bad work");
        const dir = path.join(pkgs, work);
        if (!fs.existsSync(path.join(dir, "manuscript"))) throw new HttpError(404, "no work");
        return dir;
      };
      const syukiDir = (work: string) => {
        const dir = workDir(work);
        if (!fs.existsSync(path.join(dir, "syuki.yml"))) throw new HttpError(404, "syuki.yml が無い作品");
        return dir;
      };
      /** 設定集（syuki render の生成物）のうち、ファイルがあるもの */
      const docsOf = (dir: string) => {
        const yml = path.join(dir, "syuki.yml");
        if (!fs.existsSync(yml)) return {};
        return Object.fromEntries(Object.entries(renderDocs(fs.readFileSync(yml, "utf8"))).filter(([, f]) => fs.existsSync(path.join(dir, f))));
      };
      const chapterPath = (work: string, vol: string, file: string) => {
        if (!NAME.test(vol) || !FILE.test(file)) throw new HttpError(400, "bad path");
        const p = path.join(workDir(work), "manuscript", vol, file);
        if (!fs.existsSync(p)) throw new HttpError(404, "no chapter");
        return p;
      };
      const reviewPath = (work: string, vol: string) => {
        if (!NAME.test(vol)) throw new HttpError(400, "bad vol");
        return path.join(workDir(work), "review", `${vol}.json`);
      };
      const readReview = (work: string, vol: string): Review => {
        const p = reviewPath(work, vol);
        if (!fs.existsSync(p)) return { work, vol, entries: [] };
        return JSON.parse(fs.readFileSync(p, "utf8"));
      };
      const writeReview = (r: Review) => {
        const p = reviewPath(r.work, r.vol);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(r, null, 2) + "\n");
        fs.writeFileSync(p.replace(/\.json$/, ".md"), reviewMarkdown(r));
      };
      /** base は画面が読んだ時の updated。違えば、ほか（エージェントなど）が先に書き換えている */
      const checkBase = (old: Entry | undefined, base?: string) => {
        if (base && old && old.updated !== base) throw new HttpError(409, "ほかで書き換わったので読み直した");
      };
      const upsert = (work: string, vol: string, e: Partial<Entry>, base?: string): Review => {
        const r = readReview(work, vol);
        const now = new Date().toISOString();
        const old = e.id ? r.entries.find((x) => x.id === e.id) : undefined;
        checkBase(old, base);
        if (old) Object.assign(old, e, { updated: now });
        else {
          const n = Math.max(0, ...r.entries.map((x) => Number(x.id.slice(2)) || 0)) + 1;
          r.entries.push({
            reply: null,
            body: "",
            ...e,
            // 取り消しで消した指摘を戻す時は、同じ ID と作った時刻のまま戻す
            id: e.id && /^R-\d+$/.test(e.id) ? e.id : `R-${String(n).padStart(4, "0")}`,
            created: e.created ?? now,
            updated: now,
          } as Entry);
        }
        writeReview(r);
        return r;
      };

      const routes: Record<string, (q: URLSearchParams, body: any) => unknown | Promise<unknown>> = {
        "GET /api/works": () => {
          const works: Work[] = [];
          for (const name of fs.readdirSync(pkgs).sort()) {
            const man = path.join(pkgs, name, "manuscript");
            if (name === "shosai" || !fs.existsSync(man)) continue;
            let title = name;
            try {
              title = JSON.parse(fs.readFileSync(path.join(pkgs, name, "package.json"), "utf8")).description || name;
            } catch {}
            const vols = fs
              .readdirSync(man)
              .filter((v) => NAME.test(v) && fs.statSync(path.join(man, v)).isDirectory())
              .sort()
              .map((v) => ({
                name: v,
                chapters: fs
                  .readdirSync(path.join(man, v))
                  .filter((f) => FILE.test(f))
                  .sort()
                  .map((f) => ({ file: f, title: chapterTitle(path.join(man, v, f)) })),
              }))
              .filter((v) => v.chapters.length);
            const dir = path.join(pkgs, name);
            const syukiOn = fs.existsSync(path.join(dir, "syuki.yml"));
            if (vols.length) works.push({ name, title, vols, ...(syukiOn && { syuki: true, docs: Object.keys(docsOf(dir)) }) });
          }
          return works;
        },
        "GET /api/chapter": (q) => {
          const p = chapterPath(q.get("work")!, q.get("vol")!, q.get("file")!);
          return { text: fs.readFileSync(p, "utf8") };
        },
        // 設定集を読む。置き場所は syuki.yml の render
        "GET /api/doc": (q) => {
          const dir = syukiDir(q.get("work")!);
          const f = docsOf(dir)[q.get("name") ?? ""];
          if (!f) throw new HttpError(404, "no doc");
          return { text: fs.readFileSync(path.join(dir, f), "utf8") };
        },
        "GET /api/review": (q) => readReview(q.get("work")!, q.get("vol")!),
        // 段落ごとの声なし区間と落とし。判定は syuki style heat（中身は check_style）に任せる。
        "GET /api/style": (q) => {
          const work = q.get("work")!;
          const [vol, file] = (q.get("file") ?? "").split("/");
          chapterPath(work, vol, file ?? "");
          return syuki.read(syukiDir(work), ["style", "heat", `${vol}/${file.replace(/\.kym\.txt$/, "")}`]);
        },
        // 台帳を読むだけの syuki のコマンド（brief・state・threads など）。許すコマンドは server/syuki.ts の READ
        "GET /api/syuki": (q) => syuki.read(syukiDir(q.get("work")!), readArgs(q.get("cmd") ?? "", q)),
        // 作者が ask に答える。questions.yaml は syuki が書く（YAML を直接いじらない）
        "POST /api/ask/settle": (_q, b) => syuki.write(syukiDir(b.work), settleArgs(String(b.id), String(b.answer ?? ""))),
        // 巻の全章を、記法を外した見た目の文字列で探す（英字は大小を区別しない）。
        "GET /api/search": (q) => {
          const work = q.get("work")!;
          const vol = q.get("vol")!;
          const key = fold(q.get("q") ?? "");
          if (!NAME.test(vol)) throw new HttpError(400, "bad vol");
          const hits: SearchHit[] = [];
          if (!key) return { hits, capped: false };
          for (const file of fs.readdirSync(path.join(workDir(work), "manuscript", vol)).filter((f) => FILE.test(f)).sort()) {
            const p = chapterPath(work, vol, file);
            const lines = fs.readFileSync(p, "utf8").split("\n");
            const title = chapterTitle(p);
            const fm = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
            for (let i = fm + 1; i < lines.length; i++) {
              const { text, pos } = plainMap(lines[i]);
              const low = fold(text);
              for (let a = low.indexOf(key); a >= 0; a = low.indexOf(key, a + key.length)) {
                if (hits.length === MAX_HITS) return { hits, capped: true };
                const b = a + key.length;
                const [start, end] = sourceRange(pos, a, b);
                hits.push({
                  file,
                  title,
                  line: i + 1,
                  start,
                  end,
                  before: text.slice(Math.max(0, a - 20), a),
                  hit: text.slice(a, b),
                  after: text.slice(b, b + 20),
                });
              }
            }
          }
          return { hits, capped: false };
        },
        // 赤を原稿に書き込む。行が読み込んだ時と違えば書かない（409）。
        "POST /api/edit": (_q, b) => {
          const p = chapterPath(b.work, b.vol, b.file);
          const lines = fs.readFileSync(p, "utf8").split("\n");
          const i = b.line - 1;
          if (lines[i] !== b.expect) throw new HttpError(409, "原稿が変わっていたので書き込まずに読み直した");
          const s = Number(b.start);
          const e = Number(b.end);
          if (!(s >= 0 && e >= s && e <= lines[i].length)) throw new HttpError(400, "bad range");
          lines[i] = lines[i].slice(0, s) + String(b.text) + lines[i].slice(e);
          fs.writeFileSync(p, lines.join("\n"));
          return upsert(b.work, b.vol, b.entry);
        },
        "POST /api/review": (_q, b) => upsert(b.work, b.vol, b.entry, b.base),
        // 作者の返事を指摘のやり取りに積む。質問だったら open に戻し、次の依頼でエージェントが拾う
        "POST /api/review/reply": (_q, b) => {
          const r = readReview(b.work, b.vol);
          const e = r.entries.find((x) => x.id === b.id);
          if (!e) throw new HttpError(404, "no entry");
          checkBase(e, b.base);
          const body = String(b.body ?? "").trim();
          if (!body) throw new HttpError(400, "empty");
          const now = new Date().toISOString();
          e.thread = [...(e.thread ?? []), { by: "author", body, at: now }];
          if (e.status === "question") e.status = "open";
          e.updated = now;
          writeReview(r);
          return r;
        },
        // 未適用の赤（open で after を持つ）を原稿に書き込み、done にする。書けなかったものは open のまま返す。
        "POST /api/apply": (_q, b) => {
          const r = readReview(b.work, b.vol);
          const failed: { id: string; reason: string }[] = [];
          const byFile = new Map<string, Entry[]>();
          for (const id of b.ids as string[]) {
            const e = r.entries.find((x) => x.id === id);
            if (!e || e.status !== "open" || e.after === undefined) failed.push({ id, reason: "未適用の赤ではない" });
            else byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
          }
          const now = new Date().toISOString();
          for (const [file, es] of byFile) {
            const [vol, name] = file.split("/");
            const p = chapterPath(b.work, vol, name);
            const lines = fs.readFileSync(p, "utf8").split("\n");
            const ok: { e: Entry; line: number; start: number; end: number }[] = [];
            for (const e of es) {
              const a = resolve(e, lines);
              if (!a) failed.push({ id: e.id, reason: "位置が見つからない" });
              else if (lines[a.line - 1].slice(a.start, a.end) !== (e.before ?? "")) failed.push({ id: e.id, reason: "元の字が変わっている" });
              else ok.push({ e, ...a });
            }
            // 行の中は右から書き換えると、左の赤の位置がずれない
            ok.sort((x, y) => x.line - y.line || y.start - x.start);
            let last = { line: 0, start: Infinity };
            for (const { e, line, start, end } of ok) {
              if (line === last.line && end > last.start) {
                failed.push({ id: e.id, reason: "ほかの赤と重なる" });
                continue;
              }
              lines[line - 1] = lines[line - 1].slice(0, start) + e.after + lines[line - 1].slice(end);
              Object.assign(e, { status: "done", updated: now });
              last = { line, start };
            }
            if (ok.length) fs.writeFileSync(p, lines.join("\n"));
          }
          writeReview(r);
          return { review: r, failed };
        },
        "POST /api/review/delete": (_q, b) => {
          const r = readReview(b.work, b.vol);
          checkBase(r.entries.find((x) => x.id === b.id), b.base);
          r.entries = r.entries.filter((x) => x.id !== b.id);
          writeReview(r);
          return r;
        },
        // 作者が残したい文を style/keep.md に足す（形式は「- vol1/01.kym.txt: 文」）。
        "POST /api/keep": (_q, b) => {
          const dir = path.join(workDir(b.work), "style");
          const p = path.join(dir, "keep.md");
          const line = `- ${b.file}: ${String(b.sentence).replace(/\n/g, "")}`;
          fs.mkdirSync(dir, { recursive: true });
          const cur = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "# 残す文\n";
          if (!cur.split("\n").includes(line)) fs.writeFileSync(p, cur.replace(/\n*$/, "\n") + line + "\n");
          return upsert(b.work, b.vol, b.entry);
        },
      };

      // 原稿・指摘ファイル・台帳が外で書き換わったら、syuki のキャッシュを捨て、開いている画面に知らせる。
      let timer: NodeJS.Timeout | undefined;
      const changed = new Set<string>();
      fs.watch(pkgs, { recursive: true }, (_ev, f) => {
        if (!f || !/(manuscript\/.*\.kym\.txt|^[\w-]+\/book\.config\.js|^[\w-]+\/front\/.*|review\/.*\.json|ledger\/.*\.ya?ml|syuki\.yml)$/.test(f)) return;
        syuki.clear(path.join(pkgs, f.split(path.sep)[0]));
        changed.add(f);
        clearTimeout(timer);
        timer = setTimeout(() => {
          const data = `data: ${JSON.stringify([...changed])}\n\n`;
          changed.clear();
          for (const c of clients) c.write(data);
        }, 150);
      });

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? "/", "http://x");
        if (url.pathname === "/api/events") {
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
          res.write(": ok\n\n");
          clients.add(res);
          req.on("close", () => clients.delete(res));
          return;
        }
        // 組版の材料（文書・目次・manifest・テーマ）。`/typeset/<作品>/<巻>/<rest>`
        const ts = url.pathname.match(/^\/typeset\/([^/]+)\/([^/]+)\/(.+)$/);
        if (ts) {
          try {
            workDir(decodeURIComponent(ts[1]));
            if (!NAME.test(ts[2])) throw new HttpError(400, "bad vol");
            const out = await typeset.serve(decodeURIComponent(ts[1]), ts[2], decodeURIComponent(ts[3]));
            res.setHeader("Content-Type", out.type);
            res.setHeader("Cache-Control", "no-store");
            res.end(out.body);
          } catch (err) {
            res.statusCode = err instanceof HttpError || err instanceof TypesetError ? err.code : 500;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end((err as Error).message);
          }
          return;
        }
        const h = routes[`${req.method} ${url.pathname}`];
        if (!h) return next();
        try {
          let body: unknown = null;
          if (req.method === "POST") {
            let raw = "";
            for await (const c of req) raw += c;
            body = JSON.parse(raw);
          }
          const out = await h(url.searchParams, body);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(out));
        } catch (err) {
          const code = err instanceof HttpError ? err.code : err instanceof ArgError ? 400 : 500;
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    },
  };
}

function chapterTitle(p: string): string {
  const head = fs.readFileSync(p, "utf8").slice(0, 400);
  return head.match(/^title:\s*(.+)$/m)?.[1].trim() ?? path.basename(p);
}
