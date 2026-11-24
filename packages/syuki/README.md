# syuki

小説の台帳を YAML で持ち、場面ごとに引き出したり、本文と照らしたりする CLI です。人物が何を知っていて何を持っているか、どこにいるか、伏線をどこで置いてどこで回収するかを「章:場面」の時点で切って返すので、AI に章を書かせる前の確認と、書いたあとの点検に使えます。

```sh
uv tool install "syuki[ja] @ git+https://github.com/narusenia/agent-noveler#subdirectory=packages/syuki"
syuki init mywork              # syuki.yml と ledger/ の雛形を作る
cd mywork
syuki brief 01:3               # 第一章の場面 3 の頭の状態（カード、人物の知識・持ち物・居場所、伏線）
syuki check                    # 台帳と本文の照合。違反があれば終了コード 1
syuki render                   # 台帳から人物・設定・地図などの Markdown を作る
```

入れずに試すなら `uvx --from "git+https://github.com/narusenia/agent-noveler#subdirectory=packages/syuki" syuki check` です。

どのコマンドも `--json` で JSON を出します。台帳の書き方は `harness/skills/syuki/references/schema.md`、設計の考え方は `docs/design.md` にあります。動く見本は `examples/sample-work/` です。

開発: `uv run --extra ja pytest`

ライセンス: MIT
