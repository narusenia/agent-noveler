// 書き込みの取り消しの履歴。新しいものから戻す。戻すのに失敗したものは履歴に戻さない（もう戻せないため）。
export interface Step {
  label: string;
  undo: () => Promise<unknown>;
}

export class History {
  private steps: Step[] = [];
  constructor(private limit = 50) {}
  push(s: Step) {
    this.steps.push(s);
    if (this.steps.length > this.limit) this.steps.shift();
  }
  get size() {
    return this.steps.length;
  }
  /** いちばん新しい書き込みを戻し、その名前を返す。何も無ければ null */
  async undo(): Promise<string | null> {
    const s = this.steps.pop();
    if (!s) return null;
    await s.undo();
    return s.label;
  }
  /** 指定の一件を戻す（トーストの「取り消す」から）。もう履歴に無ければ null */
  async undoStep(s: Step): Promise<string | null> {
    const i = this.steps.indexOf(s);
    if (i < 0) return null;
    this.steps.splice(i, 1);
    await s.undo();
    return s.label;
  }
}
