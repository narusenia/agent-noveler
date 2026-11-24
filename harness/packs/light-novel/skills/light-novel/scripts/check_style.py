#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["sudachipy>=0.6", "sudachidict-core"]
# ///
"""ラノベ本文の機械チェック。

使い方: uv run check_style.py [--json] [--paragraphs] [--fix] [--baseline 元.md] [--rhythm 型] [--profile profile.toml] 本文.md
  本文を省略すると標準入力から読む（--fix のときは省略できない）。
  --json      違反と統計を JSON で出す
  --paragraphs 段落ごとの文の数・声ありの文の数・声なし区間・落としだけを JSON で出す
  --fix       句点と記号だけを直して本文に書き戻し、残りの違反を出す
  --baseline  書き換え前の本文と比べ、違反の増減、セリフの変更、字数の増減、残す文（keep.md）の消失を出す
  --rhythm    リズムの型（緩急 / 軽快 / 描写 / 饒舌）。省略すると profile.toml の rhythm、無ければ緩急
  --profile   作品の文体の設定。省略すると本文のフォルダから上へたどって style/profile.toml を探す
違反を references/review.md と同じ形で出す。違反か要確認があれば終了コード 1。
口調と語りにかかわる指摘（台詞の読点、口癖、人称）は「判断」として出し、終了コードに数えない。
直すか残すかは書き手が決め、迷ったら作者に聞く（references/fix.md「判断の指摘」）。
判断が要る項目は references/check.md、直し方は references/fix.md、型の目安は references/rhythm.md で見る。
数値は目安で、違反0は目指さない。
"""
import argparse
import difflib
import json
import os
import re
import statistics
import sys
import tomllib
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import keep_check  # noqa: E402

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@dataclass(frozen=True)
class Finding:
    kind: str
    line: int  # 0は章全体
    message: str
    match: str = ""

    @property
    def judgment(self):
        return self.kind in JUDGMENT_KINDS


# 口調にかかわる指摘。型を固めすぎると表現が痩せるので、違反にせず判断に回す
JUDGMENT_KINDS = {"台詞の読点", "口癖", "人称", "落とし", "声なし", "平ら", "短い場面"}


# 型ごとの目安。references/rhythm.mdと合わせる。
# avg: 地の文の平均文長、single: 一文段落の割合の上限、cv: 文長の変動係数の下限、
# long: 長文とみなす字数、choppy: 細切れとみなす短文の連続数
RHYTHMS = {
    "緩急": {"avg": (25, 40), "single": 0.40, "cv": 0.45, "long": 60, "choppy": 6},
    "軽快": {"avg": (15, 28), "single": 0.60, "cv": 0.40, "long": 50, "choppy": 9},
    "描写": {"avg": (32, 55), "single": 0.25, "cv": 0.40, "long": 80, "choppy": 4},
    "饒舌": {"avg": (30, 50), "single": 0.30, "cv": 0.45, "long": 80, "choppy": 5},
}
DEFAULT_RHYTHM = "緩急"

EMOTION_END = re.compile(
    r"((悲し|嬉し|うれし|寂し|さみし|淋し|怖|恐ろし|悔し|楽し|辛|つら|切な)かった"
    r"|(怒っ|驚い|戸惑っ|安堵し|困惑し|動揺し|緊張し|興奮し|絶望し|感動し)(てい)?た)。$"
)
SIMILE = re.compile(r"まるで|かのよう|(?<!その)(?<!この)(?<!あの)(?<!どの)ような|みたいな")
SIMILE_END = re.compile(r"(まるで.*|かの)(よう|みたい)だ(った)?。$")
NO_CHAIN = re.compile(r"の[^、。！？「」『』の\s]{1,6}の[^、。！？「」『』の\s]{1,6}の")
OPENING = re.compile(r"目を覚ま|目が覚め|目覚まし|アラーム|朝の光|朝日|日差し|陽射し|青空|快晴|雨が|晴れ|通学路|登校")
SUMMARY_END = re.compile(r"^こうして|一日が終わ")
NEGATION_END = re.compile(r"(なかった|ませんでした|ずにいた)。$")
# ♪♡★ などセリフで使う記号は残し、絵文字として表示されるものだけを拾う。
EMOJI = (
    "(?:[\U0001F000-\U0001FAFF✨✅❌⭐⚡⛔⭕❗❓]️?|[☀-➿]️)"
    "(?:‍[\U0001F000-\U0001FAFF☀-➿]️?)*"
)
MARKUP = re.compile(r"\*\*|" + EMOJI)
TRAILING_EMOJI = re.compile("[ \t　]*(?:" + EMOJI + ")+[ \t　]*$")
PERIOD_BEFORE_CLOSE = re.compile(r"。(?=[」』])")
QUOTE_WITH_PERIOD = re.compile(r"[「『][^「」『』]*。[」』]")
QUOTE = re.compile(r"「([^」]*)」|『([^』]*)』")
SPEECH = re.compile(r"「([^」]*)」")
QUOTE_PUNCT = re.compile(r"[。！？!?…‥\s]")
SCENE_BREAK = re.compile(r"^[※＊*◇◆]+[\s　※＊*◇◆]*$")
SENTENCE = re.compile(r"[^。！？!?]+[。！？!?]*")
TERMINATORS = "。！？!?"
CATCHPHRASE_LINE = re.compile(r"^\s*[-*]\s*口癖\s*[:：]")

LONG_PARAGRAPH = 200
SHORT_SENTENCE = 20
SIMILE_LIMIT = 2
LENGTH_TOLERANCE = 0.15
# 文長が揃う: 地の文がUNIFORM_RUN 文続けて、最長が最短のUNIFORM_SPREAD 倍以内
UNIFORM_RUN = 5
UNIFORM_SPREAD = 1.3
UNIFORM_MIN = 8
# 文頭: 同じ書き出しがLEAD_RUN 文続く
LEAD_RUN = 3
# 打ち消し: 地の文のNEGATION_WINDOW 文のうちNEGATION_LIMIT 文が「〜なかった。」
NEGATION_WINDOW = 5
NEGATION_LIMIT = 3
# 章全体の目安。既刊の原稿で測って決めた（references/check.md）
TOPIC_COMMA_MAX = 0.08  # 地の文の文のうち「短い主語は、」で始まる文の割合
TA_MAX = 0.80  # 地の文の「〜た。」で終わる文の割合
MIN_SENTENCES = 30  # 章全体の目安を出す最小の文数
CATCHPHRASE_LIMIT = 2
# 前振りのあと一語で落とす型（AIの癖）。一章DROP_LIMIT 個まで
DROP_LIMIT = 3
DROP_PARAGRAPH = 12  # 落としの段落とみなす字数（句点を除く）
DROP_SETUP = 25  # 前振りとみなす直前の地の文の段落の字数
DROP_TAIL = re.compile(r"、[^、]{1,3}た$")  # 「俺も、歩いた」
DROP_TAIL_SENTENCE = 13
CLEFT = re.compile(r"のは、.+だった$")  # 「出てきたのは、〜だった」
INVERTED = re.compile(r"、(これ|それ|あれ|今の?)$")  # 倒置のツッコミは落としに数えない
TSUKKOMI_END = re.compile(r"[よなぞかねさわ]$")
# 台詞で、すぐあとに読点を打たない短い語（.agents/rules/prose-tools.md「台詞の読点」）
SHORT_WORDS = {
    "今", "もう", "全部", "毎朝", "毎日", "毎晩", "いつも", "絶対", "本当", "ほんと", "まだ", "また", "すぐ",
    "やっぱり", "やっぱ", "結局", "多分", "たぶん", "きっと", "一応", "別に",
}
# 列挙の読点（誰が、いつ、何を）と言いよどみ（あ、あの、それは、その）は台詞の読点に数えない
INTERROGATIVES = {"誰", "いつ", "何", "なに", "どこ", "どれ", "どっち", "どちら"}
FILLERS = {"あ", "え", "あの", "その", "えっと", "えと", "ええと", "う", "いや", "ま", "まあ"}
SPEECH_VERB = "(?:が|は)?(?:言|答|訊|聞|呟|つぶや|続け|返|叫|囁|ささや|笑)"

# 声なし: 語り手の声（話し言葉の型）がない地の文がVOICE_RUN 文続く（声ありが一文ずつ、四文に一つまで挟まってもよい）、または章の声ありの割合がVOICE_MIN 未満。
# 既定は作品のprofile.toml のvoice_run / voice_minで上書きする（references/check.md「声なし」）
VOICE_RUN = 10
VOICE_MIN = 0.30
# 平ら: THICK字以上の地の文の段落（場面の足場、厚く書く所）を挟まずに、本文がFLAT_GAP 字続く。
# 短い場面: ＊で区切った場面がSCENE_MIN 字未満。どちらもprofile.toml のthick / flat_gap / scene_minで上書き（references/rhythm.md「段落と場面の波」）
THICK = 100
FLAT_GAP = 2000
SCENE_MIN = 800
VOICE_END_PARTICLES = {"けど", "けれど", "し", "から", "って"}  # 文末で言いさす接続助詞
VOICE_CONTRACTIONS = ("てる", "でる", "ちゃ", "じゃ", "とく", "とい", "どく", "どい", "ちま", "じま")
VOICE_OPENERS = ("まあ", "で、", "でも、", "だって", "なんか", "って", "いや", "ていうか", "っていうか", "つーか")
VOICE_WORDS = {"とこ", "たぶん", "やっぱ", "やっぱり"}  # 語り手の口ぐせになりやすい口語
VOLITIONAL_END = re.compile(r"(よう|[おこごそぞとどのぼぽもろ]う)$")  # ごまかそう、付けよう

RUBY = re.compile(r"[｜|]([^｜|《》\n]+)《[^》\n]*》")
EMPHASIS = re.compile(r"《《([^》]*)》》")
TCY = re.compile(r"\{([^{}\n]{1,3})\}")

_tokenizer = None


def tokenize(text):
    """(表層形, 品詞の大分類, 品詞の中分類, 正規化形) の列を返す。"""
    global _tokenizer
    if _tokenizer is None:
        from sudachipy import Dictionary, SplitMode

        _tokenizer = Dictionary(dict="core").tokenizer(mode=SplitMode.C)
    return [(m.surface(), *m.part_of_speech()[:2], m.normalized_form()) for m in _tokenizer.tokenize(text)]


def is_comma(tok):
    return tok[1] == "補助記号" and tok[2] == "読点"


def is_symbol(tok):
    return tok[1] in ("補助記号", "空白")


def plain(line):
    """ルビ・傍点・縦中横の記法を外す。字数はルビを抜いて数える。"""
    line = EMPHASIS.sub(r"\1", line)
    line = RUBY.sub(r"\1", line)
    return TCY.sub(r"\1", line)


@dataclass
class Profile:
    rhythm: str = DEFAULT_RHYTHM
    cliches: list = field(default_factory=list)  # (上限, 正規表現, 見出し)
    catchphrases: dict = field(default_factory=dict)  # 名前 -> [口癖]
    catchphrase_limit: int = CATCHPHRASE_LIMIT
    drop_limit: int = DROP_LIMIT
    rhythms: dict = field(default_factory=dict)  # 型 -> 目安の上書き（RHYTHMSと同じ鍵）
    comma_exempt: list = field(default_factory=list)
    comma_exempt_speakers: list = field(default_factory=list)
    pov_mode: str = ""  # 三人称限定 / 一人称。空なら人称は見ない
    pov_names: list = field(default_factory=list)  # 視点人物の地の文での呼び名
    pov_first_person: str = ""  # 心の声の一人称
    pov_exclude: list = field(default_factory=list)  # 視点が違う章のファイル名の一部（序章、幕間など）
    voice_run: int = VOICE_RUN
    voice_min: float = VOICE_MIN
    thick: int = THICK
    flat_gap: int = FLAT_GAP
    scene_min: int = SCENE_MIN
    source: str = ""


def load_cliches(path):
    entries = []
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 3:
                continue
            entries.append((int(parts[0]), re.compile(parts[1]), parts[2]))
    return entries


def load_catchphrases(path):
    """人物ファイルの「## 名前」と「- 口癖: 「…」」を読む。【 から後ろは本文の記録なので読まない。"""
    found = defaultdict(list)
    name = None
    with open(path, encoding="utf-8") as f:
        for raw in f:
            if raw.startswith("## "):
                name = raw[3:].strip()
            elif name and CATCHPHRASE_LINE.match(raw):
                head = raw.split("【")[0]
                for phrase in re.findall(r"「([^」]+)」", head):
                    phrase = phrase.strip().rstrip("。！？!?")
                    if phrase and phrase not in found[name]:
                        found[name].append(phrase)
    return dict(found)


def find_profile(start):
    d = os.path.abspath(start)
    while True:
        path = os.path.join(d, "style", "profile.toml")
        if os.path.isfile(path):
            return path
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def load_profile(path, rhythm=None):
    p = Profile(cliches=load_cliches(os.path.join(SKILL_DIR, "data", "cliches.txt")))
    if path:
        with open(path, "rb") as f:
            conf = tomllib.load(f)
        p.source = path
        root = os.path.dirname(os.path.dirname(os.path.abspath(path)))
        p.rhythm = conf.get("rhythm", p.rhythm)
        p.catchphrase_limit = int(conf.get("catchphrase_limit", p.catchphrase_limit))
        p.drop_limit = int(conf.get("drop_limit", p.drop_limit))
        p.rhythms = conf.get("rhythms", {})
        p.voice_run = int(conf.get("voice_run", p.voice_run))
        p.voice_min = float(conf.get("voice_min", p.voice_min))
        p.thick = int(conf.get("thick", p.thick))
        p.flat_gap = int(conf.get("flat_gap", p.flat_gap))
        p.scene_min = int(conf.get("scene_min", p.scene_min))
        work_cliches = os.path.join(os.path.dirname(path), "cliches.txt")
        if os.path.isfile(work_cliches):
            p.cliches += load_cliches(work_cliches)
        chars = conf.get("characters")
        candidates = [chars] if chars else ["characters.md", "charactor.md"]
        for c in candidates:
            cpath = os.path.join(root, c)
            if os.path.isfile(cpath):
                p.catchphrases = load_catchphrases(cpath)
                break
        for name, phrases in conf.get("catchphrases", {}).items():
            p.catchphrases.setdefault(name, [])
            p.catchphrases[name] += [x for x in phrases if x not in p.catchphrases[name]]
        p.comma_exempt = list(conf.get("comma_exempt", {}).get("words", []))
        p.comma_exempt_speakers = list(conf.get("comma_exempt", {}).get("speakers", []))
        pov = conf.get("pov", {})
        p.pov_mode = pov.get("mode", "")
        p.pov_names = list(pov.get("names", []))
        p.pov_first_person = pov.get("first_person", "")
        p.pov_exclude = list(pov.get("exclude", []))
    if rhythm:
        p.rhythm = rhythm
    if p.rhythm not in RHYTHMS:
        raise SystemExit(f"unknown rhythm {p.rhythm!r}; choose one of {' / '.join(RHYTHMS)}")
    return p


def rows_of(text):
    """(行番号, 種別, ルビを外した行) を返す。先頭のフロントマターは meta にする。"""
    rows = []
    in_meta = False
    for i, raw in enumerate(text.splitlines(), 1):
        stripped = raw.lstrip("﻿").strip()
        if i == 1 and stripped == "---":
            in_meta = True
            rows.append((i, "meta", stripped))
            continue
        if in_meta:
            rows.append((i, "meta", stripped))
            if stripped == "---":
                in_meta = False
            continue
        kind, line = classify(raw)
        rows.append((i, kind, plain(line)))
    return rows


def classify(raw):
    line = raw.lstrip("﻿").strip().lstrip("　")
    if not line:
        return "blank", line
    if line.startswith("#"):
        return "heading", line
    if SCENE_BREAK.match(line):
        return "break", line
    if line[0] in "「『（":
        return "dialogue", line
    return "narration", line


def narration_part(kind, line):
    """地の文として検査する部分。会話行は閉じ括弧の後ろだけ。"""
    if kind == "narration":
        return line
    if kind == "dialogue":
        close = max(line.rfind("」"), line.rfind("』"), line.rfind("）"))
        return line[close + 1:].strip()
    return ""


def sentences(text):
    return [s.strip() for s in SENTENCE.findall(text) if s.strip()]


def body(sentence):
    return sentence.rstrip(TERMINATORS)


def sentence_at(line, pos):
    """pos を含む文を返す。違反の該当箇所を、比較で突き合わせられる長さにする。"""
    for m in SENTENCE.finditer(line):
        if m.start() <= pos < m.end():
            return m.group().strip()
    return line


def lead_of(tokens):
    """文の書き出し。最初の助詞までの表層形（4語まで）。"""
    words = [t for t in tokens if not is_symbol(t)]
    lead = ""
    for t in words[:4]:
        lead += t[0]
        if t[1] == "助詞":
            return lead
    return words[0][0] if words else ""


def topic_comma(tokens):
    """「短い主語は、」で始まる文か。主語は名詞か代名詞の8字まで。"""
    i = 0
    while i < len(tokens) and i < 4 and tokens[i][1] in ("名詞", "代名詞", "接尾辞", "接頭辞"):
        i += 1
    if i == 0 or i + 1 >= len(tokens):
        return False
    subject = "".join(t[0] for t in tokens[:i])
    return len(subject) <= 8 and tokens[i][0] == "は" and tokens[i][1] == "助詞" and is_comma(tokens[i + 1])


def ends_with_ta(tokens):
    words = [t for t in tokens if not is_symbol(t)]
    return bool(words) and words[-1][1] == "助動詞" and words[-1][3] == "た"


def speech_commas(content, exempt):
    """台詞の中の、短い語のすぐあとの読点を (語, 位置) で返す。exempt の語の中の読点は除く。"""
    tokens = tokenize(content)
    spans = []
    for word in exempt:
        start = content.find(word)
        while start != -1:
            spans.append((start, start + len(word)))
            start = content.find(word, start + 1)
    found, pos = [], 0
    offsets = []
    for t in tokens:
        offsets.append(pos)
        pos += len(t[0])
    for k, t in enumerate(tokens):
        if not is_comma(t) or k == 0:
            continue
        if any(a <= offsets[k] < b for a, b in spans):
            continue
        prev = tokens[k - 1]
        after = next((t for t in tokens[k + 1:] if t[1] != "空白"), None)
        if prev[0] in INTERROGATIVES or (after and after[0] in INTERROGATIVES):
            continue
        if after and (after[0] in FILLERS or after[1] == "補助記号"):
            continue
        if any(t[0] in FILLERS or t[1] == "感動詞" or t[0].startswith("…") for t in tokens[max(0, k - 3):k - 1]):
            continue
        word = None
        if prev[1] == "代名詞" or prev[0] in SHORT_WORDS:
            word = prev[0]
        elif prev[0] == "は" and prev[1] == "助詞" and k >= 2 and tokens[k - 2][1] == "代名詞":
            word = tokens[k - 2][0] + "は"
        if word:
            found.append((word, offsets[k]))
    return found


def tagged_speaker(line, names):
    """会話行の地の文の部分（「と〇〇が言った」など）から話者を探す。見つからなければ None。"""
    rest = SPEECH.sub("", line)
    for name in names:
        if re.search("と" + re.escape(name), rest) or re.search(re.escape(name) + SPEECH_VERB, rest):
            return name
    return None


def exempt_speaker(label, names):
    return bool(label) and any(n in label or label in n for n in names)


FIRST_PERSON_WORDS = {"俺", "僕", "私", "わたし", "あたし", "おれ", "ぼく"}


def inner_voice(tokens):
    """心の声らしい文か。終助詞か「？」で終わる、または一人称の代名詞がある。"""
    words = [t for t in tokens if t[1] != "空白"]
    if not words:
        return False
    if words[-1][0] in ("？", "?", "!?", "！？"):
        return True
    body_words = [t for t in words if not is_symbol(t)]
    if body_words and body_words[-1][1] == "助詞" and body_words[-1][2] == "終助詞":
        return True
    return any(t[1] == "代名詞" and t[0] in FIRST_PERSON_WORDS for t in words)


def voiced(sentence, tokens):
    """地の文の文に語り手の声（話し言葉の型）があるか。研究文書 第3部2「二重の語り」の目印を拾う。
    終助詞・言いさし・倒置・「だろ」「じゃない」・縮約・「〜んだ」・「って」・口語（とこ、たぶん、やっぱ）・意志形・
    非過去の「だ」と形容詞の言い切り、「？」「！」、感動詞や口語の接続（まあ、で、でも、いや）で始まる文。"""
    b = body(sentence).strip("　 ")
    if sentence.rstrip("。").endswith(("？", "！", "?", "!")):
        return True
    if b.startswith(VOICE_OPENERS):
        return True
    words = [t for t in tokens if not is_symbol(t)]
    if not words:
        return False
    last = words[-1]
    if words[0][1] == "感動詞":
        return True
    if last[1] == "助詞" and (last[2] == "終助詞" or last[0] in VOICE_END_PARTICLES):
        return True
    if last[1] == "形容詞" or (last[1] == "助動詞" and last[0] in ("う", "よう", "だ", "ん")):
        return True
    if VOLITIONAL_END.search(b):
        return True
    for a, nxt in zip(tokens, tokens[1:] + [None]):
        if a[1] == "助詞" and a[2] == "終助詞" and nxt and is_comma(nxt):  # 倒置「効くな、これ」
            return True
        if a[0] in VOICE_WORDS or (a[1] == "助詞" and a[0] == "って"):  # 「軽いって言えば」
            return True
        if a[1] == "助動詞" and (a[0] in ("て", "だろ", "だろう", "でしょ", "でしょう") or a[0].startswith(VOICE_CONTRACTIONS)):
            return True
        if a[0] == "ん" and a[2] == "準体助詞" and nxt and nxt[1] == "助動詞":  # 「なんだ」
            return True
    return False


def names_as_subject(sentence, names):
    return any(re.search(re.escape(n) + "(は|が|も)", sentence) for n in names)


def check_pov(rows, profile, add):
    """人称の揺れを見る。三人称限定では、台詞の直後に入口なしで心の声に入る段落と、
    同じ段落で視点人物の名前と一人称が混ざる所。一人称では、地の文で視点人物の名前が主語になる所。"""
    mode, names, first = profile.pov_mode, profile.pov_names, profile.pov_first_person
    if not mode or not names:
        return
    prev_kind = None
    for i, kind, line in rows:
        if kind in ("blank", "meta"):
            continue
        if kind in ("heading", "break"):
            prev_kind = kind
            continue
        if kind == "narration":
            text = SPEECH.sub("", line)
            sents = sentences(text)
            if mode.startswith("三人称") and sents:
                mixed = names_as_subject(text, names) and first and re.search(re.escape(first) + "(は|が|の|を|に|も)", text)
                if mixed:
                    add("人称", i, f"同じ段落で「{names[0]}」と「{first}」が混ざっています。語りか心の声のどちらかにそろえてください。", text)
                elif prev_kind == "dialogue" and inner_voice(tokenize(sents[0])) and not names_as_subject(sents[0], names):
                    outer = [s for s in sents[1:] if not inner_voice(tokenize(s))]
                    if outer:
                        add(
                            "人称", i,
                            f"台詞の直後に、入口なしで心の声に入り、同じ段落で外の描写に戻っています。{names[0]}の動作か知覚から入るか、段落を分けてください。",
                            sents[0],
                        )
            elif mode.startswith("一人称"):
                for s in sents:
                    if names_as_subject(s, names):
                        add("人称", i, f"一人称の地の文で「{names[0]}」が主語になっています。{first or '一人称'}にするか、主語を省いてください。", s)
        prev_kind = kind


def voice_runs(rows, min_run):
    """声の薄い地の文の区間を [(行, 文, 声あり), ...] の列で返す。あわせて地の文の文の数と声ありの数。
    会話行・見出し・場面の区切り・複数行にまたがる『』（作中の文書）で区間を切る。"""
    runs, run = [], []
    total = count = 0
    doc_depth = 0

    def flush():
        nonlocal run
        while run and run[-1][2]:
            run.pop()
        if len(run) >= min_run:
            runs.append(run)
        run = []

    for i, kind, line in rows:
        if kind in ("meta", "blank"):
            continue
        in_doc = doc_depth > 0
        doc_depth = max(0, doc_depth + line.count("『") - line.count("』"))
        if kind in ("heading", "break", "dialogue") or in_doc:
            flush()
        if kind in ("heading", "break") or in_doc:
            continue
        for s in sentences(narration_part(kind, line)):
            total += 1
            v = voiced(s, tokenize(s))
            count += v
            # 声ありが一文だけ挟まっても区間は切らない。二文続くか、四文に一つを超えたら切る
            if v and (not run or run[-1][2] or (sum(r[2] for r in run) + 1) * 4 > len(run) + 1):
                flush()
            else:
                run.append((i, s, v))
    flush()
    return runs, total, count


def drops(rows):
    """前振りのあと一語で落とす文を (行番号, 文) で返す。三つの形を数える。
    - 前振りの段落（DROP_SETUP 字以上の地の文）のすぐあとの、DROP_PARAGRAPH 字以下の短い段落（「二人ぶん。いつもどおりだ。」）
    - 読点のあと短い一語で終える短い文（「俺も、歩いた。」）
    - 分裂文（「出てきたのは、錆びた鍵だった。」）
    ツッコミ（終助詞で終わる）と倒置（「〜か、それ。」）は数えない。"""
    found = []
    prev_kind, prev_len = None, 0
    for i, kind, line in rows:
        if kind in ("blank", "meta"):
            continue
        if kind == "narration" and not re.search(r"[「」『』]", line):
            sents = sentences(line)
            bodies = [body(s) for s in sents]
            short = (
                prev_kind == "narration" and prev_len >= DROP_SETUP and len(sents) <= 2
                and sum(map(len, bodies)) <= DROP_PARAGRAPH and all(s.endswith("。") for s in sents)
                and not TSUKKOMI_END.search(bodies[-1]) and not INVERTED.search(bodies[-1])
            )
            if short:
                found.append((i, line))
            else:
                for s, b in zip(sents, bodies):
                    if (len(b) <= DROP_TAIL_SENTENCE and DROP_TAIL.search(b)) or CLEFT.search(b):
                        found.append((i, s))
        prev_kind, prev_len = kind, len(line)
    return found


def waves(rows, thick=THICK, gap=FLAT_GAP, scene_min=SCENE_MIN):
    """段落と場面の波。(平らな区間 [(始まりの行, 終わりの行, 字数)], 短い場面 [(始まりの行, 字数)]) を返す。
    平ら: thick 字以上の地の文の段落を挟まずに、本文（地の文と会話）が gap 字を超えて続く区間。
    短い場面: ＊で区切った場面が scene_min 字未満。＊のない章は数えない。"""
    flats, scenes = [], []
    span, size = None, 0
    scene_start, scene_size, has_break = None, 0, False

    def close_span():
        if span and size > gap:
            flats.append((span[0], span[1], size))

    for i, kind, line in rows:
        if kind == "break":
            has_break = True
            if scene_start is not None:
                scenes.append((scene_start, scene_size))
            scene_start, scene_size = None, 0
            close_span()
            span, size = None, 0
            continue
        if kind not in ("narration", "dialogue"):
            continue
        if scene_start is None:
            scene_start = i
        scene_size += len(line)
        if kind == "narration" and len(line) >= thick:
            close_span()
            span, size = None, 0
            continue
        span = (span[0] if span else i, i)
        size += len(line)
    close_span()
    if scene_start is not None:
        scenes.append((scene_start, scene_size))
    short = [s for s in scenes if s[1] < scene_min] if has_break else []
    return flats, short


def check(text, profile=None, speakers=None):
    """speakers は {行番号: 話者} の表（voice_check.py の答え）。区切り型の人物の台詞の読点を外すのに使う。"""
    profile = profile or load_profile(None)
    speakers = speakers or {}
    rhythm = {**RHYTHMS[profile.rhythm], **profile.rhythms.get(profile.rhythm, {})}
    rows = rows_of(text)
    prose = [(i, k, l) for i, k, l in rows if k in ("narration", "dialogue")]
    findings = []

    def add(kind, line, message, match=""):
        findings.append(Finding(kind, line, message, match))

    if prose:
        i, _, line = prose[0]
        first = (sentences(line) or [line])[0]
        main_clause = first.split("、")[-1]
        if OPENING.search(main_clause):
            add("冒頭", i, "天気・目覚め・通学路で始まっています。視点人物の欠落かフックが見える場面から入ってください。", first)
        i, _, line = prose[-1]
        if SUMMARY_END.search(line):
            add("章末", i, "要約で締めています。未解決を1つ残して切ってください。", line)

    cliche_seen = Counter()
    simile_count = 0
    blank_run = 0
    ending_key, ending_run = None, 0
    short_run = 0
    run = []  # 会話を挟まずに続く地の文の文 (行, 文, 字数, 語)
    uniform_from = 0
    lead_flagged = None
    negation_flagged = -NEGATION_WINDOW
    exempt = list(profile.comma_exempt) + [p for ps in profile.catchphrases.values() for p in ps]
    catch_lines = defaultdict(list)
    narr_total = topic_lines = ta_count = ended = 0
    voice, voice_total, voice_count = voice_runs(rows, profile.voice_run)
    for vr in voice:
        first, last = vr[0][0], vr[-1][0]
        add(
            "声なし", first,
            f"語り手の声が薄い地の文が{len(vr)}文続いています（{first}〜{last}行目、うち声あり{sum(r[2] for r in vr)}文）。"
            "ツッコミかボヤキを一つ入れるか、語りを話し言葉に寄せてください。山場で静かにしているなら残してかまいません。",
            vr[0][1],
        )
    topic_hits = []

    def reset_run():
        nonlocal run, uniform_from, lead_flagged, negation_flagged
        run, uniform_from, lead_flagged, negation_flagged = [], 0, None, -NEGATION_WINDOW

    for i, kind, line in rows:
        if kind == "meta":
            continue
        if kind == "blank":
            blank_run += 1
            if blank_run >= 2:
                simile_count = 0
            continue
        blank_run = 0
        if kind in ("heading", "break"):
            simile_count = 0
            ending_key, ending_run = None, 0
            short_run = 0
            reset_run()
            continue

        for limit, pattern, label in profile.cliches:
            for m in pattern.finditer(line):
                cliche_seen[label] += 1
                n = cliche_seen[label]
                if n > limit:
                    allowed = f"一章{limit}回までです" if limit else "使わない語です"
                    add(
                        "決まり文句", i, f"「{label}」が{n}回目です（{allowed}）。その場の動作か物に置き換えてください。",
                        sentence_at(line, m.start()),
                    )

        m = re.search(r"。[」』]", line)
        if m:
            quote = QUOTE_WITH_PERIOD.search(line)
            add("句点", i, "閉じ括弧の前に句点があります。句点を取ってください。", quote.group() if quote else line)
        m = MARKUP.search(line)
        if m:
            add("記号", i, "本文に太字記法か絵文字があります。外してください。", sentence_at(line, m.start()))

        if kind == "dialogue":
            ending_key, ending_run = None, 0
            short_run = 0
            reset_run()
            names = profile.comma_exempt_speakers
            speaker = speakers.get(i) or (tagged_speaker(line, names) if names else None)
            skip_commas = exempt_speaker(speaker, names)
            for q in SPEECH.finditer(line):
                content = q.group(1)
                for name, phrases in profile.catchphrases.items():
                    for phrase in phrases:
                        for _ in range(content.count(phrase)):
                            catch_lines[(name, phrase)].append(i)
                for word, _ in ([] if skip_commas else speech_commas(content, exempt)):
                    add("台詞の読点", i, f"台詞の「{word}、」に読点があります。間を聞かせたい所でなければ取ってください。", f"「{content}」")

        part = narration_part(kind, line)
        if not part:
            continue
        sents = sentences(part)

        if kind == "narration":
            if len(part) > LONG_PARAGRAPH:
                add("説明", i, f"段落が{len(part)}字あります。会話か動作で割ってください。", part)
            for s in sents:
                if not s.endswith("。"):
                    ending_key, ending_run = None, 0
                    continue
                key = body(s)[-2:]
                ending_run = ending_run + 1 if key == ending_key else 1
                ending_key = key
                if ending_run == 3:
                    add("文末", i, f"地の文の文末「{key}」が3回続いています。1つ変えてください。", s)
            for s in sents:
                short_run = short_run + 1 if len(body(s)) < SHORT_SENTENCE else 0
                if short_run == rhythm["choppy"]:
                    add(
                        "細切れ", i,
                        f"{SHORT_SENTENCE}字未満の地の文が{rhythm['choppy']}文続いています。つなぐか、情景や動きを足してください。", s,
                    )
            for s in sents:
                toks = tokenize(s)
                narr_total += 1
                if topic_comma(toks):
                    topic_lines += 1
                    topic_hits.append(i)
                if s.endswith("。"):
                    ended += 1
                    ta_count += ends_with_ta(toks)
                run.append((i, s, len(body(s)), toks))
                n = len(run)
                # 文長が揃う
                if n - uniform_from >= UNIFORM_RUN:
                    window = [r[2] for r in run[-UNIFORM_RUN:]]
                    lo, hi = min(window), max(window)
                    if lo >= UNIFORM_MIN and hi <= lo * UNIFORM_SPREAD:
                        add(
                            "文長", i,
                            f"地の文の{UNIFORM_RUN}文が{lo}〜{hi}字で揃っています。つなぐか割って長短をつけてください。", s,
                        )
                        uniform_from = n
                # 文頭の反復
                if n >= LEAD_RUN:
                    leads = {lead_of(r[3]) for r in run[-LEAD_RUN:]}
                    lead = lead_of(toks)
                    if len(leads) == 1 and len(lead) >= 2 and lead != lead_flagged:
                        add("文頭", i, f"地の文が「{lead}」で{LEAD_RUN}文続けて始まっています。主語を省くか語順を変えてください。", s)
                        lead_flagged = lead
                    elif len(leads) > 1:
                        lead_flagged = None
                # 打ち消しの報告
                if NEGATION_END.search(s) and n - negation_flagged >= NEGATION_WINDOW:
                    recent = [r for r in run[-NEGATION_WINDOW:] if NEGATION_END.search(r[1])]
                    if len(recent) >= NEGATION_LIMIT:
                        add(
                            "打ち消し", i,
                            f"地の文の{NEGATION_WINDOW}文に「〜なかった。」が{len(recent)}つあります。起きたことを書いてください。", s,
                        )
                        negation_flagged = n

        if sents and EMOTION_END.search(sents[-1]):
            add("感情ラベル", i, "感情の名前で段落を終えています。動作か身体に置き換えてください。", sents[-1])
        if sents and SIMILE_END.search(sents[-1]):
            add("比喩", i, "段落を比喩で締めています。締めは事実か動作にしてください。", sents[-1])
        for s in sents:
            if len(body(s)) > rhythm["long"]:
                add("長文", i, f"1文が{len(body(s))}字あります。山場でなければ割ってください。", s)
            if SIMILE.search(s):
                simile_count += 1
                if simile_count == SIMILE_LIMIT + 1:
                    add("比喩", i, f"この場面で比喩が{simile_count}つ目です。1場面{SIMILE_LIMIT}つまでにしてください。", s)
        m = NO_CHAIN.search(part)
        if m:
            add("の連続", i, "「の」が3つ以上続いています。語順を変えて切ってください。", m.group())

    if voice_total >= MIN_SENTENCES and voice_count / voice_total < profile.voice_min:
        add(
            "声なし", 0,
            f"語り手の声がある地の文が{voice_count / voice_total:.0%}（{voice_count}/{voice_total}文）です。"
            f"目安は{profile.voice_min:.0%}以上です。声なしの区間にツッコミかボヤキを足してください。",
            "声の割合",
        )

    check_pov(rows, profile, add)

    dropped = drops(rows)
    if len(dropped) > profile.drop_limit:
        shown = ", ".join(str(n) for n, _ in dropped)
        add(
            "落とし", dropped[profile.drop_limit][0],
            f"前振りのあと一語で落とす型（短い一文段落、読点のあとの一語、「〜のは、〜だった」）が章内に{len(dropped)}個あります"
            f"（{shown}行目）。一章{profile.drop_limit}個までです。効く所だけ残し、ほかは前の段落につなぐか言い切りを変えてください。",
            dropped[profile.drop_limit][1],
        )

    flats, short_scenes = waves(rows, profile.thick, profile.flat_gap, profile.scene_min)
    for start, end, size in flats:
        add(
            "平ら", start,
            f"{profile.thick}字以上の地の文の段落がないまま、本文が{size}字続いています（{start}〜{end}行目）。"
            "大事な所なら情景・体・間を一段落厚く書いて滞在してください。薄く流してよい区間なら残してかまいません。",
            "厚い段落なし",
        )
    for start, size in short_scenes:
        add(
            "短い場面", start,
            f"この場面は{size}字です（目安は{profile.scene_min}字以上）。入りと出の一拍があるか、前後の場面とつなげられないかを見てください。"
            "幕切れの短い場面として狙ったなら残してかまいません。",
            "場面の字数",
        )

    for (name, phrase), lines in catch_lines.items():
        limit = profile.catchphrase_limit
        if len(lines) > limit:
            shown = ", ".join(str(n) for n in lines)
            add(
                "口癖", lines[limit],
                f"{name}の口癖「{phrase}」が章内に{len(lines)}回あります（{shown}行目）。一章{limit}回までです。効く所だけ残してください。",
                phrase,
            )

    if narr_total >= MIN_SENTENCES:
        s = stats(text)
        lo, hi = rhythm["avg"]
        name = profile.rhythm
        if not lo <= s["avg_sentence_len"] <= hi:
            add("文長", 0, f"地の文の平均文長が{s['avg_sentence_len']}字です。{name}の目安は{lo}〜{hi}字です。", "平均文長")
        if s["single_sentence_ratio"] > rhythm["single"]:
            add(
                "文長", 0, f"一文だけの段落が{s['single_sentence_ratio']:.0%}です。{name}の目安は{rhythm['single']:.0%}までです。",
                "一文段落",
            )
        if s["sentence_len_cv"] < rhythm["cv"]:
            add(
                "文長", 0, f"文長のばらつき（変動係数）が{s['sentence_len_cv']}です。{name}の目安は{rhythm['cv']}以上です。長短を混ぜてください。",
                "ばらつき",
            )
        if topic_lines / narr_total > TOPIC_COMMA_MAX:
            shown = ", ".join(str(n) for n in topic_hits[:8]) + ("…" if len(topic_hits) > 8 else "")
            add(
                "読点", 0,
                f"「〇〇は、」で始まる地の文が{topic_lines}文（{topic_lines / narr_total:.0%}）あります。目安は{TOPIC_COMMA_MAX:.0%}までです。"
                f"主語のあとの読点を取ってください（{shown}行目）。",
                "主語の読点",
            )
        if ended and ta_count / ended > TA_MAX:
            add(
                "文末", 0,
                f"地の文の{ta_count / ended:.0%}が「〜た。」で終わっています。目安は{TA_MAX:.0%}までです。描写と内心の文を現在形にしてください。",
                "タ形",
            )

    findings.sort(key=lambda f: f.line)
    return findings


def stats(text):
    dialogue = narration = 0
    lengths = []
    paragraphs = single = 0
    for _, kind, line in rows_of(text):
        if kind == "dialogue":
            dialogue += len(line)
        elif kind == "narration":
            narration += len(line)
            sents = sentences(line)
            lengths += [len(body(s)) for s in sents]
            paragraphs += 1
            single += len(sents) == 1
    total = dialogue + narration
    mean = sum(lengths) / len(lengths) if lengths else 0.0
    cv = statistics.pstdev(lengths) / mean if len(lengths) > 1 and mean else 0.0
    return {
        "dialogue_ratio": dialogue / total if total else 0.0,
        "avg_sentence_len": round(mean, 1),
        "sentence_len_cv": round(cv, 2),
        "single_sentence_ratio": single / paragraphs if paragraphs else 0.0,
    }


def paragraphs(text, profile=None):
    """段落（地の文か会話行の地の文の部分）ごとの文の数と声ありの文の数。syuki style が読む。
    run は段落が入っている声なし区間（始まりの行と文の数）か None、drop は落としの段落か。"""
    profile = profile or load_profile(None)
    rows = rows_of(text)
    run_of = {}
    for vr in voice_runs(rows, profile.voice_run)[0]:
        for i, _, _ in vr:
            run_of[i] = {"start": vr[0][0], "sentences": len(vr)}
    dropped = {n for n, _ in drops(rows)}
    out = []
    for i, kind, line in rows:
        sents = sentences(narration_part(kind, line))
        if sents:
            out.append({"line": i, "kind": kind, "sentences": len(sents), "voiced": sum(voiced(s, tokenize(s)) for s in sents),
                        "run": run_of.get(i), "drop": i in dropped})
    return out


def fix(text):
    """機械的に直せる句点と記号だけを直す。行数、見出し、改行コードは変えない。"""
    out = []
    for raw in text.splitlines(keepends=True):
        content = raw.splitlines()[0]
        ending = raw[len(content):]
        kind, line = classify(content)
        if kind in ("narration", "dialogue"):
            closed_by_emoji = TRAILING_EMOJI.search(narration_part(kind, line))
            if closed_by_emoji:
                content = TRAILING_EMOJI.sub("", content)
            content = PERIOD_BEFORE_CLOSE.sub("", MARKUP.sub("", content))
            if closed_by_emoji and content and content[-1] not in TERMINATORS + "」』…―":
                content += "。"
        out.append(content + ending)
    return "".join(out)


def quotes(text):
    """本文中の「」と『』の中身を (行番号, 中身) で返す。行をまたぐセリフは拾わない。"""
    found = []
    for i, kind, line in rows_of(text):
        if kind in ("narration", "dialogue"):
            found += [(i, m.group(1) if m.group(1) is not None else m.group(2)) for m in QUOTE.finditer(line)]
    return found


def prose_chars(text):
    return sum(len(line) for _, kind, line in rows_of(text) if kind in ("narration", "dialogue"))


def length_change(chars):
    """字数の増減率と、許容内かを返す。元が0字なら、後も0字のときだけ許容内。"""
    if not chars["before"]:
        return None, not chars["after"]
    rate = chars["after"] / chars["before"] - 1
    return rate, abs(rate) <= LENGTH_TOLERANCE


def compare(before, after, profile=None, path=None, speakers=None):
    """書き換え前後を比べる。違反の増減、セリフの変更、字数、残す文の消失を返す。

    違反は種別と該当箇所の組で突き合わせる。同じ種別でも箇所が違えば新規に数える。
    """
    old_findings, new_findings = check(before, profile, speakers), check(after, profile, speakers)
    old = Counter((f.kind, f.match) for f in old_findings)
    new = Counter((f.kind, f.match) for f in new_findings)
    added = new - old
    kept = old & new
    listed = []
    for f in new_findings:
        key = (f.kind, f.match)
        if kept[key]:
            kept[key] -= 1
        else:
            listed.append(asdict(f))
    old_q, new_q = quotes(before), quotes(after)
    matcher = difflib.SequenceMatcher(
        a=[QUOTE_PUNCT.sub("", q) for _, q in old_q],
        b=[QUOTE_PUNCT.sub("", q) for _, q in new_q],
        autojunk=False,
    )
    changes = []
    for tag, a1, a2, b1, b2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        olds, news = old_q[a1:a2], new_q[b1:b2]
        for k in range(max(len(olds), len(news))):
            o = olds[k] if k < len(olds) else (None, None)
            n = news[k] if k < len(news) else (None, None)
            changes.append({"before_line": o[0], "before": o[1], "after_line": n[0], "after": n[1]})
    chars = {"before": prose_chars(before), "after": prose_chars(after)}
    _, within = length_change(chars)
    keep_lost = []
    if path:
        keep_path = keep_check.find_keep(os.path.dirname(os.path.abspath(path)))
        if keep_path:
            keep_lost = keep_check.check(keep_check.load(keep_path), path, after, before)

    def by_kind(counter):
        kinds = Counter()
        for (kind, _), n in counter.items():
            kinds[kind] += n
        return dict(kinds)

    return {
        "resolved": by_kind(old - new),
        "remaining": by_kind(old & new),
        "new": by_kind(added),
        "new_findings": listed,
        "dialogue_changes": changes,
        "chars": chars,
        "keep_lost": keep_lost,
        "ok": not any(k not in JUDGMENT_KINDS for k, _ in added) and not changes and within and not keep_lost,
    }


def counts(counter):
    return ", ".join(f"{k} {v}" for k, v in counter.items()) or "none"


def where(line):
    return "whole chapter" if line == 0 else f"line {line}"


def print_compare(result):
    print("Comparison")
    print(f"- resolved: {counts(result['resolved'])}")
    print(f"- remaining: {counts(result['remaining'])}")
    new = counts(result["new"])
    if result["new_findings"]:
        new += " (" + ", ".join(where(f["line"]) for f in result["new_findings"]) + ")"
    print(f"- new: {new}")
    if result["dialogue_changes"]:
        for c in result["dialogue_changes"]:
            old = f"line {c['before_line']} 「{c['before']}」" if c["before"] is not None else "none"
            new = f"line {c['after_line']} 「{c['after']}」" if c["after"] is not None else "deleted"
            print(f"- dialogue: {old} → {new}" if c["before"] is not None else f"- dialogue: added {new}")
    else:
        print("- dialogue: unchanged")
    before, after = result["chars"]["before"], result["chars"]["after"]
    rate, within = length_change(result["chars"])
    shown = f" ({rate:+.0%})" if rate is not None else ""
    mark = "" if within else " (to confirm)"
    print(f"- characters: {before} → {after}{shown}{mark}")
    for e in result["keep_lost"]:
        print(f"- kept line {e['reason']}: 「{e['text']}」 (keep.md line {e['line']})")


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def main(argv):
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Mechanical style check for light-novel prose")
    parser.add_argument("file", nargs="?", help="manuscript file (default: stdin)")
    parser.add_argument("--json", action="store_true", help="output JSON")
    parser.add_argument("--fix", action="store_true", help="fix periods and symbols and write the file back")
    parser.add_argument("--baseline", metavar="BEFORE", help="compare with the text before rewriting")
    parser.add_argument("--rhythm", choices=list(RHYTHMS), help="rhythm type")
    parser.add_argument("--profile", help="the work's style settings (style/profile.toml)")
    parser.add_argument("--paragraphs", action="store_true", help="output sentence and voiced-sentence counts per paragraph as JSON")
    parser.add_argument("--speakers", metavar="SPEAKERS.json", help="{line: speaker} table; skips commas in dialogue of characters whose voice uses them")
    args = parser.parse_args(argv[1:])
    if args.fix and not args.file:
        parser.error("--fix needs a manuscript file")

    start = os.path.dirname(os.path.abspath(args.file)) if args.file else os.getcwd()
    profile = load_profile(args.profile or find_profile(start), args.rhythm)
    if args.file and any(x in os.path.basename(args.file) for x in profile.pov_exclude):
        profile.pov_mode = ""
    text = read(args.file) if args.file else sys.stdin.read()
    if args.paragraphs:
        print(json.dumps(paragraphs(text, profile), ensure_ascii=False))
        return 0
    speakers = {}
    if args.speakers:
        with open(args.speakers, encoding="utf-8") as f:
            speakers = {int(k): v for k, v in json.load(f).items()}
    fixed = None
    if args.fix:
        before = Counter(f.kind for f in check(text, profile, speakers))
        text, original = fix(text), text
        if text != original:
            tmp = args.file + ".tmp"
            with open(tmp, "w", encoding="utf-8", newline="") as f:
                f.write(text)
            os.replace(tmp, args.file)
        gone = before - Counter(f.kind for f in check(text, profile, speakers))
        fixed = {k: gone[k] for k in ("句点", "記号") if gone[k]}
    findings = check(text, profile, speakers)
    violations = [f for f in findings if not f.judgment]
    s = stats(text)
    result = compare(read(args.baseline), text, profile, args.file, speakers) if args.baseline else None

    if args.json:
        data = {
            "findings": [{**asdict(f), "judgment": f.judgment} for f in findings],
            "stats": s,
            "rhythm": profile.rhythm,
        }
        if fixed is not None:
            data["fixed"] = fixed
        if result is not None:
            data["compare"] = result
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        if fixed is not None:
            print("Auto-fixed: " + (", ".join(f"{k} {v}" for k, v in fixed.items()) or "none"))
        for f in findings:
            label = f"{f.kind}, judgment" if f.judgment else f.kind
            print(f"- [{label}] {where(f.line)}: {f.message}")
        if result is not None:
            print_compare(result)
        summary = (
            f"rhythm {profile.rhythm} / dialogue {s['dialogue_ratio']:.0%} / avg narration sentence {s['avg_sentence_len']} chars"
            f" / sentence length CV {s['sentence_len_cv']} / one-sentence paragraphs {s['single_sentence_ratio']:.0%}"
            f" / {len(violations)} violations / {len(findings) - len(violations)} judgments"
        )
        if result is not None and not result["ok"]:
            summary += " / comparison: to confirm"
        print(summary)
    return 1 if violations or (result is not None and not result["ok"]) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
