"""章で基準より出すぎた語の並び。Sudachi の原形の 1〜3 語の並びを、事前分布つきの対数オッズで比べる（Monroe ら 2008）。"""
import math
import re
from collections import Counter

NOUN_WEIGHT = 0.5  # 名詞だけの並びは場面の物で増えるので、重みを下げる
SKIP_POS = {"補助記号", "空白"}


def tokenizer():
    """Sudachi の (分割, モード)。無ければ ImportError。"""
    from sudachipy import dictionary, tokenizer as t
    d = dictionary.Dictionary()
    return (d.tokenizer() if hasattr(d, "tokenizer") else d.create()), t.Tokenizer.SplitMode.C


def tokens(lines: list[str], names: list[str], tok) -> list[list[tuple[str, bool]]]:
    """行ごとの (原形, 名詞か) の列。記号と、台帳の名前にかかる語のところで列を切る。"""
    split, mode = tok
    pat = re.compile("|".join(re.escape(n) for n in sorted(names, key=len, reverse=True) if n)) if names else None
    runs = []
    for line in lines:
        spans = [m.span() for m in pat.finditer(line)] if pat else []
        cur = []
        for m in split.tokenize(line, mode):
            pos = m.part_of_speech()[0]
            named = any(m.begin() < e and s < m.end() for s, e in spans)
            if pos in SKIP_POS or named:
                if cur:
                    runs.append(cur)
                cur = []
                continue
            cur.append((m.dictionary_form(), pos == "名詞"))
        if cur:
            runs.append(cur)
    return runs


def grams(runs, n_max: int = 3) -> tuple[Counter, set]:
    """1〜n_max 語の並びの数と、名詞だけの並び。"""
    c, nouns = Counter(), set()
    for run in runs:
        for n in range(1, n_max + 1):
            for i in range(len(run) - n + 1):
                g = tuple(w for w, _ in run[i:i + n])
                c[g] += 1
                if all(x for _, x in run[i:i + n]):
                    nouns.add(g)
    return c, nouns


def score(target: Counter, base: Counter, nouns: set, alpha: float = 1000.0, min_count: int = 3, top: int = 20) -> list[dict]:
    """target で base より出すぎた並びを z の大きい順に。事前分布は二つを合わせた頻度に alpha を掛けたもの。"""
    out = []
    for n in {len(g) for g in target}:
        t = {g: k for g, k in target.items() if len(g) == n}
        b = {g: k for g, k in base.items() if len(g) == n}
        nt, nb = sum(t.values()), sum(b.values())
        if not nt or not nb:
            continue
        for g, yt in t.items():
            if yt < min_count:
                continue
            yb = b.get(g, 0)
            a = alpha * (yt + yb) / (nt + nb)
            delta = math.log((yt + a) / (nt + alpha - yt - a)) - math.log((yb + a) / (nb + alpha - yb - a))
            z = delta / math.sqrt(1 / (yt + a) + 1 / (yb + a)) * (NOUN_WEIGHT if g in nouns else 1)
            if z > 0:
                out.append({"gram": "".join(g), "words": list(g), "z": round(z, 2), "count": yt,
                            "per_10k": round(yt / nt * 1e4, 1), "base_per_10k": round(yb / nb * 1e4, 1)})
    out.sort(key=lambda x: -x["z"])
    # 長い並びに含まれる短い並びで、数が同じものは長いほうに任せる
    kept = []
    for x in out:
        if any(len(y["words"]) > len(x["words"]) and y["count"] == x["count"] and x["gram"] in y["gram"] for y in out):
            continue
        kept.append(x)
    return kept[:top]
