---
name: herdr-agy
description: roles.toml で planner と writer の担い手を agy（Gemini）にしたときの呼び方。メインの会話（Claude Code）が herdr の中で動いているとき、隣のペインに agy を役割つきで起動して依頼を渡し、終わるまで待って報告を受け取る。章のカード作り・執筆・改稿を頼むときに使う。agy -p（裏で動かす print モード）は使わない。
---

# herdr-agy

`.agents/roles.toml` で planner と writer（物語の面白さを作る役）の担い手を `agy` にしたとき、このスキルで herdr の隣のペインの agy（Gemini）に頼む。穴探しと監査（critic、auditor、checker、proofreader、reader、editor）は Claude に残すと、書く側と見る側のモデルが分かれ、同じモデルが自分の文を甘く見るのを避けられる。

## 前提

- メインの会話が herdr の中で動いていること（`HERDR_ENV=1`）。外で動いているときは、作者に herdr の中で Claude Code を起動し直してもらう。agy -p での代わりはしない。
- agy は `.agents/agents/<役割>.md` を `--agent <役割>` で読む。役割の手順を依頼文に書き写さない。

## 使い方

リポジトリ直下から。名前は作業ごとに一つ（英小文字・数字・`-`、32字まで。例: `rc-v1-03-writer`）。

```sh
h=.agents/skills/herdr-agy/scripts/hand.sh
# カード作り
bash $h planner rc-v1-03-planner - <<'TASK'
作品: mywork。章: vol1 の 03。plot の参照: ……。コミットはしない。
TASK
# 直しの往復は同じ名前で送ると、同じ会話に続く
bash $h planner rc-v1-03-planner - <<'TASK'
editor の指摘 1・3 をカードに入れて。……
TASK
```

- 依頼文には、ルートの AGENTS.md の「依頼文」の決まりどおり、作品・章・参照する plot の節・コミットしてよいかを書く。
- 報告は `.hand/<名前>.md`（git に入れない）。スクリプトは終わったらその中身を出す。報告がないときはペインの末尾を出す。
- agy が承認待ちで止まったら、スクリプトはそれを知らせて待つ。作者がペインで答える。メインの会話は代わりに答えない。
- ペインはメインの会話のタブを割らず、同じワークスペースの「agy」タブにまとめる（`scripts/agy-pane.sh`）。作者が会話のタブで作業を続けられるように、ペインはそこに増やさない。agy タブが無ければ作り、空いたシェルがあれば使い、無ければ agy タブの中で割る。モデルは `HAND_MODEL`、待つ上限は `HAND_TIMEOUT`（ミリ秒、既定 1 時間）。
- 終わったペインはメインの会話が定期的に閉じる。開いたままにすると、タブがペインで埋まる。報告を読み終え、同じ名前で続きを送る予定がない役のペインを閉じる（`herdr pane close <pane_id>`）。動いているペイン、承認待ちのペイン、自分が開いていないペインは触らない。
