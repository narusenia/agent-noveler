# harness

AI エージェントに小説の作業を分担させるための道具です。原稿のリポジトリの `.agents/` に入れて使います。

```sh
bash scripts/install.sh ~/novels [文体パック]
```

| フォルダ | 中身 |
| --- | --- |
| `AGENTS.md` | 原稿のリポジトリに置く雛形。作業の分担と、一章を書くときの流れ |
| `agents/` | 役の手順書（writer、planner、proofreader、checker、critic、auditor、editor、reader） |
| `rules/` | どの役も守る決まり（台帳は syuki で引く、書斎の指摘ファイルの扱い） |
| `skills/` | syuki の使い方、壁打ち（spar）、初見読み（first-read）、herdr の agy への頼み方 |
| `scripts/` | 役の担い手を引く `role.py`、頼む入口 `ask.sh`、指摘ファイルに赤を積む `review_add.py`、`link-pack.sh`、`install.sh` |
| `roles.toml` | 役ごとの担い手とモデル、本文を誰が書くか（`[mode] write`）、使う文体パック |
| `packs/` | 文体パック。今は `light-novel` だけ |

`skills/`・`rules/`・`agents/` の中で `packs/` を指しているリンクは、`link-pack.sh` がつないだ文体パックの中身です。パックを替えるときは `bash scripts/link-pack.sh <名前>` を回し、`roles.toml` の `[style] pack` も同じ名前にします。

テスト: `python3 scripts/test_role.py`、`python3 scripts/test_review_add.py`

ライセンス: MIT（light-novel パックが参考にしたリポジトリは `packs/light-novel/skills/light-novel/NOTICE`）
