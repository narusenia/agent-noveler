// 声の色: syuki style heat（判定は check_style）の段落ごとの答えを、行ごとの色に直す。
export interface HeatPar {
  /** 1 始まりの行番号（frontmatter を含む） */
  line: number;
  /** 段落が入っている声なし区間（始まりの行と文の数） */
  run: { start: number; sentences: number } | null;
  /** 前振りのあと一語で落とす段落か */
  drop: boolean;
}

export interface Tint {
  cls: string;
  title: string;
}

export function tints(pars: HeatPar[]): Map<number, Tint> {
  const out = new Map<number, Tint>();
  for (const p of pars) {
    const cls: string[] = [];
    const title: string[] = [];
    if (p.run) {
      cls.push("heat-run");
      title.push(`声なし区間（${p.run.start}行目から${p.run.sentences}文）`);
    }
    if (p.drop) {
      cls.push("heat-drop");
      title.push("落とし");
    }
    if (cls.length) out.set(p.line, { cls: cls.join(" "), title: title.join("・") });
  }
  return out;
}
