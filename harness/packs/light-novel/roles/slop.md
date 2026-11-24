# slop の見方（light-novel）

核の手順書 `agents/slop.md` に重ねて読む。

- 見るのは「ラノベの語りになっていない所」。効いている所も、ラノベの語り（語り手の声、ツッコミ、ずらした比喩、間）として拾う。
- 癖の一覧はスキル `light-novel` の `references/ai-tells.md`。判断には `references/check.md` も使う。層 3 の段落と場面の波は `references/rhythm.md`「段落と場面の波」。
- 自分の印象を根拠にしない理由は、パックの調査 `.agents/style/docs/research.md` の第3部7と、`references/sources.md` の P12。
- 七つの層は、調査の第3部「LLM がラノベ風に書けない七つの理由」に対応する。層の判断に迷ったときだけ、第3部の該当の節を引く。層 2 は「脱文脈化」（ai-tells「説明しすぎ」）、層 3 は ai-tells「リズム」、層 4 は ai-tells「読点」「語彙」、層 6 は ai-tells「構成」に当たる。
- 「声なし」は、語り手のツッコミとボヤキが消えた区間として見る。山場の静かな地の文は意図の側。
- 層 7 では、定番のギャグがひねらずに置かれている所も拾う。
- syuki の無い作品では、lint を `uv run --offline .agents/skills/light-novel/scripts/check_style.py <章>`（「平ら」「短い場面」もここに出る）、段落ごとの数を同じスクリプトの `--paragraphs` で出す。
