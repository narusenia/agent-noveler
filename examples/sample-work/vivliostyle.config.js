// @ts-check
import { defineConfig } from "@vivliostyle/cli";
import book from "./book.config.js";

// 巻は `VOL=vol2 pnpm build` で選ぶ。既定は vol1。中身は book.config.js
const vol = process.env.VOL ?? "vol1";
export default defineConfig({
  ...book(vol),
  // 巻ごとに作業フォルダを分ける（同時に二つの巻を組むと上書きし合うため）
  workspaceDir: `.vivliostyle-${vol}`,
});
