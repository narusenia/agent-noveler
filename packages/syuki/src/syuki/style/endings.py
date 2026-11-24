"""台詞の文末を人物ごとに数え、台帳の口調サンプルの文末とのずれを出す。"""
from collections import Counter


def tally(rows: list[dict], who=lambda r: r["speaker"]) -> dict[str, Counter]:
    out: dict[str, Counter] = {}
    for r in rows:
        k = who(r)
        if k:
            out.setdefault(k, Counter()).update(e for e in r["endings"] if e)
    return out


def compare(spoken: dict[str, Counter], samples: dict[str, Counter], top: int = 5) -> list[dict]:
    """人物ごとに、本文の文末の上位と、見本に無い文末の割合。見本の無い人物は割合を出さない。"""
    out = []
    for who, c in sorted(spoken.items(), key=lambda x: -sum(x[1].values())):
        n = sum(c.values())
        s = samples.get(who, Counter())
        off = {e: k for e, k in c.items() if e not in s}
        out.append({
            "speaker": who, "sentences": n,
            "top": [[e, k] for e, k in c.most_common(top)],
            "sample_top": [[e, k] for e, k in s.most_common(top)],
            "off_sample": round(sum(off.values()) / n, 2) if s else None,
            "off_top": [[e, k] for e, k in Counter(off).most_common(top)] if s else [],
            "sample_unused": [e for e in s if e not in c],
        })
    return out
