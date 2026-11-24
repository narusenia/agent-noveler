export type Kind =
  | "replace"
  | "insert"
  | "delete"
  | "ruby"
  | "emphasis"
  | "suggest"
  | "comment"
  | "keep";

export type Status =
  | "applied" // 前の版で原稿にすぐ書き込んだ赤（もう作らない）
  | "reverted" // イキで戻した赤
  | "open" // 未適用の赤、未処理の提案・コメント
  | "done" // 適用済みの赤、処理済みの提案・コメント
  | "declined"
  | "question";

export interface Entry {
  id: string;
  kind: Kind;
  status: Status;
  /** manuscript/ からのパス（例: vol1/01.kym.txt） */
  file: string;
  /** 1 始まりの行番号（frontmatter を含む） */
  line: number;
  quote: string;
  prefix: string;
  suffix: string;
  before?: string;
  after?: string;
  body: string;
  /** エージェントの最新の一言（古い JSON との互換で残す） */
  reply: string | null;
  /** 作者とエージェントのやり取り。最後が作者なら、エージェントはそれを読んでから処理する */
  thread?: Message[];
  created: string;
  updated: string;
}

export interface Message {
  by: "author" | "agent";
  body: string;
  at: string;
}

export interface Review {
  work: string;
  vol: string;
  entries: Entry[];
}

export interface Chapter {
  file: string;
  title: string;
}

export interface Work {
  name: string;
  title: string;
  vols: { name: string; chapters: Chapter[] }[];
  /** syuki.yml がある作品だけ true */
  syuki?: boolean;
  /** 設定集（syuki.yml の render のうちファイルがあるもの）の名前: characters・details・map・documents など */
  docs?: string[];
}

export interface ChapterData {
  text: string;
}

/** 検索の当たり。start / end は原稿の行の中の位置、before / hit / after は見た目の文字列 */
export interface SearchHit {
  file: string;
  title: string;
  line: number;
  start: number;
  end: number;
  before: string;
  hit: string;
  after: string;
}
