# harness

AIエージェントに小説の作業を分担させるための道具です。原稿のリポジトリの`.agents/`に入れて使います。

```sh
bash scripts/install.sh ~/novels [文体パック]
```

`~/novels/.agents/`にハーネスが写り、各ツールが読む場所からリンクが張られます。`AGENTS.md`が無ければ雛形も置かれるので、【】の所を書き換えてください。

| ツール | 読むもの |
| --- | --- |
| Claude Code | `.claude/agents`・`.claude/skills`・`.claude/rules`と`CLAUDE.md`（どれも`.agents/`と`AGENTS.md`へのリンク） |
| Codex | `AGENTS.md`と`.agents/skills/` |
| pi | `AGENTS.md`と`.agents/skills/` |
| OpenCode | `AGENTS.md`、`.agents/skills/`、`.opencode/agents`（リンク）。決まりは`opencode.json`の`instructions`に書く |
| Antigravity（agy） | `GEMINI.md`（リンク）と`.agents/` |

| フォルダ | 中身 |
| --- | --- |
| `AGENTS.md` | 原稿のリポジトリに置く雛形。作業の分担と、一章を書くときの流れ |
| `agents/` | 役の手順書（writer、planner、proofreader、checker、critic、auditor、editor、reader、slop） |
| `rules/` | どの役も守る決まり（台帳はsyukiで引く、書斎の指摘ファイルの扱い） |
| `skills/` | syukiの使い方、壁打ち（spar）、初見読み（first-read）、herdrのagyへの頼み方 |
| `scripts/` | 役の担い手を引く`role.py`、頼む入口`ask.sh`、指摘ファイルに赤を積む`review_add.py`、`link-pack.sh`、`install.sh` |
| `roles.toml` | 役ごとの担い手とモデル、本文を誰が書くか（`[mode] write`）、一章で回す段（`[mode] flow` = `full`・`standard`・`lite`）、使う文体パック |
| `packs/` | 文体パック。`light-novel`と最小の`general`。作り方は`packs/README.md` |
| `style` | 使っている文体パックへのリンク。役の手順書は`style/roles/<役>.md`でパックの見方を読む |

`skills/`・`rules/`・`agents/`の中で`packs/`を指しているリンクと`style`は、`link-pack.sh`がつないだ文体パックの中身です。パックを替えるときは`bash scripts/link-pack.sh <名前>`を実行します（`roles.toml`の`[style] pack`も書き換わる）。

テスト: `python3 scripts/test_role.py`、`python3 scripts/test_review_add.py`

ライセンス: MIT（light-novelパックが参考にしたリポジトリは`packs/light-novel/skills/light-novel/NOTICE`）
