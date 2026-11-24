#!/usr/bin/env python3
"""役（と手伝い）の担い手を roles.toml から引く。

  role.py <役> [--work 作品のフォルダ] [--field runner|model|fallback.runner|fallback.model]
  role.py --list [--work 作品のフォルダ]
  role.py --setting agy.allow_print [--work 作品のフォルダ]   役でない設定を引く（true/false は小文字で出す）

既定は .agents/roles.toml。--work を渡すと、その作品の roles.toml の項目で上書きする。
役でも手伝いでもない名前は [defaults] を返す。
"""
from __future__ import annotations

import argparse
import sys
import tomllib
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / "roles.toml"


def merge(a: dict, b: dict) -> dict:
    out = dict(a)
    for k, v in b.items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load(work: str | None) -> dict:
    cfg = tomllib.loads(BASE.read_text())
    if work and (p := Path(work) / "roles.toml").is_file():
        cfg = merge(cfg, tomllib.loads(p.read_text()))
    return cfg


def resolve(cfg: dict, name: str) -> dict:
    """役なら roles、手伝いなら helpers から。どちらも [defaults] の上に重ねる"""
    own = cfg.get("roles", {}).get(name) or cfg.get("helpers", {}).get(name) or {}
    return merge(cfg.get("defaults", {}), own)


def field(entry: dict, path: str) -> str:
    v: object = entry
    for k in path.split("."):
        v = v.get(k, "") if isinstance(v, dict) else ""
    return "" if isinstance(v, dict) else str(v)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("name", nargs="?")
    ap.add_argument("--work")
    ap.add_argument("--field", default="runner")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--setting")
    a = ap.parse_args()
    cfg = load(a.work)
    if a.setting:
        v = field(cfg, a.setting)
        print(v.lower() if v in ("True", "False") else v)
        return 0
    if a.list:
        agents = Path(__file__).resolve().parent.parent / "agents"
        names = sorted({p.stem for p in agents.glob("*.md")} | set(cfg.get("roles", {}))) + sorted(cfg.get("helpers", {}))
        for n in names:
            e = resolve(cfg, n)
            fb = f"  fallback: {field(e, 'fallback.runner')} {field(e, 'fallback.model')}".rstrip() if "fallback" in e else ""
            print(f"{n}\t{e.get('runner', '')} {e.get('model', '')}".rstrip() + fb)
        return 0
    if not a.name:
        ap.error("give a role name or --list")
    print(field(resolve(cfg, a.name), a.field))
    return 0


if __name__ == "__main__":
    sys.exit(main())
