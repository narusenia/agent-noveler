import subprocess


def edit(path, old, new):
    text = path.read_text(encoding="utf-8")
    assert old in text, old
    path.write_text(text.replace(old, new), encoding="utf-8")


def check(run, sample):
    code, out = run(sample, "check")
    return code, out


def test_base_has_only_knowledge_confirm(sample, run):
    code, out = check(run, sample)
    assert code == 0
    assert "確認［知らないはずの知識］manuscript/vol1/02.kym.txt:13 ハル" in out


def test_scene_count_and_order(sample, run):
    edit(sample / "ledger/vol1/scenes.yaml", '- {at: "01:2"', '- {at: "02:2"')
    code, out = check(run, sample)
    assert code == 1
    assert "01 は場面の表に 1 場面" in out
    assert "02:2 が 2 行ある" in out
    assert "記録の時点の並び" in out


def test_unregistered_name_and_kind(sample, run):
    edit(sample / "ledger/vol1/events.yaml", "who: ソラ, what: 鍵は", "who: 誰か, what: 鍵は")
    edit(sample / "ledger/vol1/events.yaml", "kind: payoff", "kind: pick")
    code, out = check(run, sample)
    assert "人物「誰か」が台帳に無い" in out
    assert "種類「pick」" in out


def test_fixed_values_must_be_english(sample, run):
    edit(sample / "ledger/secrets.yaml", "reader: disclosed", "reader: 開示")
    edit(sample / "ledger/threads.yaml", "do: payoff", "do: 回収")
    code, out = check(run, sample)
    assert code == 1
    assert "reader: disclosed / hinted / hidden のどれか（'開示'）" in out
    assert "do: hint / payoff のどれか（'回収'）" in out


def test_document_quote_must_match(sample, run):
    edit(sample / "ledger/documents.yaml", "灯台の鍵を返せ。", "灯台の鍵を戻せ。")
    code, out = check(run, sample)
    assert code == 1 and "「灯台の鍵を返せ」が 守の手紙 の正本と合わない" in out


def test_items_from_wrong_holder_and_two_places(sample, run):
    edit(sample / "ledger/vol1/events.yaml", "from: 守, to: ソラ", "from: ハル, to: ソラ")
    edit(sample / "ledger/vol1/events.yaml", "- {at: \"02:1\", kind: stage",
         "- {at: \"02:1\", kind: move, what: 鍵, to: 灯台}\n- {at: \"02:1\", kind: stage")
    code, out = check(run, sample)
    assert "鍵 を ハル から移したが、その時は 守 が持っている" in out
    assert "鍵 が同じ場面で ソラ と 灯台 の二か所にある" in out


def test_thread_overdue_and_keep(sample, run):
    edit(sample / "ledger/vol1/events.yaml", "- {at: \"02:2\", kind: payoff, what: 二人の扉}\n", "")
    edit(sample / "style/keep.md", "それ、私のよ", "それ、俺のだ")
    code, out = check(run, sample)
    assert "二人の扉 は 02:2 で回収の予定だが" in out
    assert "「それ、俺のだ」が manuscript/vol1/01.kym.txt に無い" in out


def test_dates_and_travel(sample, run):
    edit(sample / "ledger/vol1/scenes.yaml", "day: 2, time: 昼", 'day: 2, time: "17:00"')
    edit(sample / "ledger/vol1/scenes.yaml", "day: 2, time: 夕方, place: 灯台", 'day: 2, time: "17:10", place: 灯台')
    edit(sample / "ledger/vol1/scenes.yaml", "day: 2, time: 朝", "day: 0, time: 朝")
    code, out = check(run, sample)
    assert "移動" in out and "前の場面から 10 分" in out
    assert "2日目が前の場面（01:2、0日目）より前" not in out  # 0日目 → 2日目 は順
    edit(sample / "ledger/vol1/scenes.yaml", "day: 1, time: 夕方", "day: 3, time: 夕方")
    _, out = check(run, sample)
    assert "0日目が前の場面（01:1、3日目）より前" in out


def test_terms(sample, run):
    edit(sample / "ledger/terms.yaml", "explained: 01「灯台守の詰所」", "explained: 02「灯台守らしい」\n  hidden_until: \"02\"")
    (sample / "manuscript/vol1/02.kym.txt").write_text(
        (sample / "manuscript/vol1/02.kym.txt").read_text(encoding="utf-8") + "\nらしい。らしい。らしい。\n", encoding="utf-8")
    code, out = check(run, sample)
    assert "「灯台守」を説明（02「灯台守らしい」）より前に使った" in out
    assert "「灯台守」は 02 まで出さない" in out
    assert "「らしい」が 4 回" in out


def test_new_terms_per_chapter(sample, run):
    with open(sample / "ledger/terms.yaml", "a", encoding="utf-8") as f:
        f.write("- term: 詰所\n  explained: 01「詰所へ鍵を届けた」\n")
    _, out = check(run, sample)
    assert "vol1/01 で新しい用語が 2 個" in out


def test_plugin(sample, run):
    (sample / "ledger/checks.py").write_text(
        "def check(work, report):\n    report.add('作品', f'章は {len(work.chapters)}', confirm=True)\n", encoding="utf-8")
    code, out = check(run, sample)
    assert code == 0 and "確認［作品］章は 2" in out


def test_impact(sample, run):
    git = lambda *a: subprocess.run(["git", "-C", str(sample), *a], check=True, capture_output=True)  # noqa: E731
    git("init", "-q")
    git("add", ".")
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init")
    edit(sample / "manuscript/vol1/01.kym.txt", "鍵を棚にしまった", "鍵を引き出しに入れた")
    code, out = run(sample, "impact")
    assert code == 1
    assert "- 01:2（manuscript/vol1/01.kym.txt:23-23）" in out
    assert "01「鍵を棚にしまった」" in out
    assert "02:1 鍵: 守→ソラ" in out.split("## 頼っている後ろの出来事")[1]


def test_unregistered_institution_word(sample, run):
    import pytest
    pytest.importorskip("sudachipy")
    edit(sample / "manuscript/vol1/02.kym.txt", "昼、詰所に", "昼、港湾監察局から詰所に")
    _, out = check(run, sample)
    assert "確認［登録していない語］manuscript/vol1/02.kym.txt:7 「港湾監察局」" in out
    assert "結局" not in out
    run(sample, "ask", "add", "港湾監察局を設定に足すか", "--at", "02:1")
    _, out = check(run, sample)
    assert "「港湾監察局」" in out


def test_document_line_quoting_two_documents(sample, run):
    edit(sample / "manuscript/vol1/02.kym.txt", "『灯台の鍵を返せ』", "　『灯台の鍵を返せ』と、『別の紙』。")
    code, out = check(run, sample)
    assert code == 0, out


def test_document_closing_line_drops_bracket():
    from syuki.check import fragments
    assert fragments("　各自、確かめること。　事務局』") == ["各自、確かめること。　事務局"]
    assert fragments("『題") == ["題"]
