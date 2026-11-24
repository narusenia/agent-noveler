// syuki を子プロセスで呼ぶ。1 回 0.1〜0.2 秒なので常駐させず、結果を作品ごとにキャッシュして、本文や台帳が変わったら捨てる。
import { execFile } from "node:child_process";
import path from "node:path";

const LIST_KINDS = ["characters", "terms", "places", "items", "secrets", "threads", "documents"];
/** 章:場面（巻つきも可）。syuki の時点の形 */
const POINT = /^(?:[\w-]+\/)?[\w-]+(?::\d+)?$/;
/** manuscript/ からの章（例: vol1/02） */
const CHAP = /^[\w-]+\/[\w-]+$/;

export class ArgError extends Error {}

function word(v: string | null, name: string): string {
  // 先頭が - の値は syuki のオプションに化けるので通さない
  if (!v || v.startsWith("-") || v.length > 100 || /[\n\0]/.test(v)) throw new ArgError(`bad ${name}`);
  return v;
}
const point = (v: string | null) => {
  if (!v || !POINT.test(v)) throw new ArgError("bad at");
  return v;
};
const chap = (v: string | null) => {
  if (!v || !CHAP.test(v)) throw new ArgError("bad chapter");
  return v;
};
const at = (q: URLSearchParams) => (q.get("at") ? ["--at", point(q.get("at"))] : []);

/** 画面から呼んでよい、読むだけのコマンド。台帳を書くもの（add・init・contrast・ask add）は入れない */
const READ: Record<string, (q: URLSearchParams) => string[]> = {
  brief: (q) => ["brief", point(q.get("at"))],
  state: (q) => ["state", word(q.get("name"), "name"), ...at(q)],
  knows: (q) => ["knows", word(q.get("name"), "name"), ...at(q)],
  where: (q) => ["where", word(q.get("name"), "name"), ...at(q)],
  search: (q) => ["search", word(q.get("q"), "q"), ...at(q)],
  threads: (q) => ["threads", ...at(q)],
  list: (q) => {
    const k = q.get("kind") ?? "";
    if (!LIST_KINDS.includes(k)) throw new ArgError("bad kind");
    return ["list", k];
  },
  timeline: () => ["timeline"],
  recap: (q) => ["recap", ...(q.get("until") ? ["--until", point(q.get("until"))] : [])],
  stages: () => ["stages"],
  check: () => ["check"],
  ask: () => ["ask", "list"],
  impact: () => ["impact"],
  lint: (q) => ["lint", chap(q.get("chapter"))],
  heat: (q) => ["style", "heat", chap(q.get("chapter"))],
  endings: (q) => ["style", "endings", chap(q.get("chapter"))],
  excess: (q) => ["style", "excess", chap(q.get("chapter"))],
};

export function readArgs(cmd: string, q: URLSearchParams): string[] {
  const f = READ[cmd];
  if (!f) throw new ArgError("bad cmd");
  return f(q);
}

export function settleArgs(id: string, answer: string): string[] {
  if (!/^Q-\d+$/.test(id)) throw new ArgError("bad id");
  if (!answer.trim() || answer.startsWith("-")) throw new ArgError("bad answer");
  return ["ask", "settle", id, answer];
}

export function syukiRunner(project: string | null) {
  const cache = new Map<string, Promise<unknown>>();
  const cmd = project ? ["uv", "run", "-q", "--project", project, "--extra", "ja", "syuki"] : ["syuki"];
  const exec = (dir: string, args: string[]) =>
    new Promise<unknown>((ok, ng) =>
      execFile(
        cmd[0],
        [...cmd.slice(1), ...args, "--work", dir, "--json"],
        { encoding: "utf8", maxBuffer: 32 << 20, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
        (err, out, errOut) => {
          // check・lint・impact は見つけたものがあると終了コード 1 で JSON を出す。JSON が読めれば答えとして使う
          try {
            ok(JSON.parse(out));
          } catch {
            ng(new Error(err ? errOut.trim() || err.message : "syuki の出力が JSON でない"));
          }
        },
      ),
    );
  return {
    read(dir: string, args: string[]) {
      const key = `${dir}\0${args.join("\0")}`;
      let p = cache.get(key);
      // impact は git の作業中の差分を見るので、台帳の変更の知らせでは捨てられない。毎回呼ぶ
      if (!p || args[0] === "impact") {
        p = exec(dir, args);
        cache.set(key, p);
        p.catch(() => cache.delete(key));
      }
      return p;
    },
    async write(dir: string, args: string[]) {
      const out = await exec(dir, args);
      this.clear(dir);
      return out;
    },
    clear(dir: string) {
      for (const k of cache.keys()) if (k.startsWith(`${dir}\0`)) cache.delete(k);
    },
  };
}

/** syuki.yml の render（生成物の置き場所）。{vol} を含むもの（巻ごとの状態表）は外す */
export function renderDocs(yml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const m = yml.match(/^render:[^\n]*\n((?:[ \t]+.*\n?)*)/m);
  for (const line of m?.[1].split("\n") ?? []) {
    const kv = line.match(/^\s+(\w+):\s*([^\s#]+)/);
    if (kv && !kv[2].includes("{")) out[kv[1]] = kv[2];
  }
  return out;
}
