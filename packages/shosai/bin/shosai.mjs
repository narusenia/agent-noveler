#!/usr/bin/env node
// npx @narusenia/shosai [作品が並んだフォルダ] [--port 番号]
// 作品のフォルダを渡さないと、今いるフォルダを開く。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { port: { type: "string" }, help: { type: "boolean", short: "h" } },
});
if (values.help) {
  console.log("使い方: npx @narusenia/shosai [作品が並んだフォルダ] [--port 13002]");
  process.exit(0);
}
process.env.SHOSAI_WORKS = path.resolve(positionals[0] ?? process.env.SHOSAI_WORKS ?? ".");

process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING ??= "true";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  server: values.port ? { port: Number(values.port) } : {},
});
await server.listen();
console.log(`書斎: ${process.env.SHOSAI_WORKS}`);
server.printUrls();
