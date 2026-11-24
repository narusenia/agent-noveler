# writer の見方（light-novel）

核の手順書 `agents/writer.md` に重ねて読む。

- 地の文の温度: ラノベとして読める軽さを保ち、「小説」らしい硬さや飾りに寄せない。
- 場面を一つ書くごとの lint（`uv run --offline .agents/skills/light-novel/scripts/check_style.py <章>`。作品の profile が効く。`syuki lint <章>` でもよい）は、書いた場面の「声なし」「落とし」「比喩」「平ら」の四つだけを見て直す（「平ら」は、厚く書く所で滞在できていないときだけ直す）。
- 濃淡は light-novel の rhythm.md「段落と場面の波」。
- 会話・感情: light-novel の style.md「会話」「感情」「戦闘」と `references/dialogue-examples.md` の良い例に合わせる。リズムの型と笑いの配分は light-novel の `references/rhythm.md`、`references/comedy.md`。
- 説明: light-novel の style.md「説明」に従う。見本は `references/exposition-examples.md`。
- 台帳にない制度・役職・施設・組織の語は、ツッコミの比喩でも使わない。
- 仕上げの lint は `uv run --offline .agents/skills/light-novel/scripts/check_style.py <章>`（syuki の作品では `syuki lint <章>`。パスはリポジトリ直下から。作品のフォルダからは `../../.agents/skills/…`）。
