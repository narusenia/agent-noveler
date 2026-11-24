# @narusenia/shosai

縦書きで原稿を読み、赤を入れ、組版の見た目で確かめる書斎ビューアです。赤は原稿を直接書き換えず、作品のフォルダの `review/<巻>.json` に指摘として残ります。採るものを選んで「適用」すると本文に入ります。作品に `syuki.yml` があれば、場面の状態、人物と用語のカード、伏線、作者への質問の受信箱も並べて出します。

```sh
npx @narusenia/shosai ~/novels        # 作品のフォルダが並んだフォルダを渡す。http://localhost:13002
npx @narusenia/shosai ~/novels --port 13003
```

フォルダを渡さないと、今いるフォルダを開きます。Node.js 22 以上が要ります。syuki は PATH の `syuki` を呼びます。入れていなければ、台帳の欄だけが出ません。

このリポジトリで開発するとき:

```sh
pnpm install
pnpm dev                              # http://localhost:13002
SHOSAI_WORKS=~/novels pnpm dev        # 作品のフォルダが並んだフォルダを渡す
```

開発のときに `SHOSAI_WORKS` を渡さないと、リポジトリの `examples/` を開きます。syuki は、同じリポジトリの `packages/syuki` があれば `uv run` で呼び、無ければ PATH の `syuki` を呼びます。

組版は `@vivliostyle/core` で行い、作品のフォルダの `book.config.js` を読みます（形は `examples/sample-work/book.config.js`）。

開発: `pnpm test`（vitest）、`pnpm typecheck`、`pnpm e2e`（書斎を起動した状態で。URL は `SHOSAI_URL` で変えられる）

ライセンス: AGPL-3.0-only（`@vivliostyle/core` が AGPL-3.0 のため）
