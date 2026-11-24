---
trigger: always_on
description: syuki.yml のある作品で台帳（ledger/*.yaml）の中身を引くときの決まり
---

# 台帳は syuki で引く

`syuki.yml` のある作品で、台帳（`ledger/*.yaml`）の中身を知りたいときは、YAML を直接開かずに syuki のコマンドで引く。どのエージェントでも、メインの会話でも同じ。

## なぜ

- YAML は出来事の記録で、ある時点の状態は積み上げないと分からない。直接読むと、後の章の出来事や、まだ知らない秘密まで目に入り、時点を取り違える。
- syuki は時点（`章:場面`）で切って、根拠の本文の場所つきで返す。

## 何を使うか

| 知りたいこと | 使うもの |
|---|---|
| 場面の頭の状態一式（カード、筋道メモ、人物の知識・知らない秘密・気持ち・持ち物・居場所、道のり、文書、伏線、確認中の質問） | `syuki brief 章:場面` |
| 人物一人の状態 | `syuki state 人物 --at 章:場面` |
| 秘密を誰がいつ知ったか | `syuki knows 秘密 --at 章:場面` |
| 持ち物の場所 | `syuki where 持ち物 --at 章:場面` |
| 語・設定がどこに出るか（本文・台帳・設定集・plot） | `syuki search 語 [--at 章:場面]` |
| ここまでの出来事と因果 | `syuki recap --until 章` |
| 作中の日時順 | `syuki timeline` |
| 伏線の進み（置いた・匂わせた・回収、予定、予定を過ぎたもの） | `syuki threads [--at 章:場面]` |
| 名前の一覧 | `syuki list <kind>`（characters・terms・places・items・secrets・threads・documents） |
| 好意の段階 | `syuki stages` |
| 作者への質問 | `syuki ask list [--all]` |
| 改稿の影響 | `syuki impact [範囲]` |

- 一覧を通して読みたいとき（人物の全員、用語の全部、地図、文書の正本）は、生成物の Markdown（`syuki.yml` の `render` に書いた人物・設定・地図・文書・状態表のファイル）を読む。生成物が古いかもしれないときは、先に `syuki render` を回す。
- 呼び方は `.agents/skills/syuki/SKILL.md`。

## YAML を開いてよいとき

- 書き足す・直すとき。開くのは直す所の前後だけにする。出来事は、なるべく `syuki add` で足す。
- syuki のコマンドで引けない項目があって、どうしても要るとき。そのときは報告に「syuki で引けなかったもの」として書く（syuki に足す候補になる）。
