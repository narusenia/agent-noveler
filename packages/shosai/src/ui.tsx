// 画面のあちこちで使う小さな部品。アイコンには aria-label とツールチップを付ける。
import { Dialog } from "@base-ui/react/dialog";
import { Toast } from "@base-ui/react/toast";
import { Tooltip } from "@base-ui/react/tooltip";
import clsx from "clsx";
import { X } from "lucide-react";
import { type ComponentProps, type ReactElement, type ReactNode, useState } from "react";

export const toasts = Toast.createToastManager();

/** 短い知らせ。undo を渡すと「取り消す」を付け、長めに出す */
export function toast(title: string, undo?: () => void) {
  const id = toasts.add({
    title,
    timeout: undo ? 8000 : 4000,
    actionProps: undo
      ? {
          children: "取り消す",
          onClick: () => {
            toasts.close(id);
            undo();
          },
        }
      : undefined,
  });
}

export function Toaster() {
  const { toasts: list } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed bottom-[calc(96px+env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2 md:bottom-6">
        {list.map((t) => (
          <Toast.Root
            key={t.id}
            toast={t}
            className="toast raised flex items-center gap-3 rounded-[10px] px-4 py-2.5 transition-[opacity,transform] duration-200 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0"
          >
            <Toast.Title className="min-w-0 flex-1 text-[13px]" />
            <Toast.Action className="ghost shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-pen-text" />
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

/** ツールチップつきの物。render に別の部品（Menu.Trigger など）を渡せる */
export function Tip({ label, keys, children }: { label: string; keys?: string; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-50">
          <Tooltip.Popup className="raised flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
            {label}
            {keys && <Kbd>{keys}</Kbd>}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="well rounded px-1.5 font-sans text-[11px] text-sub">{children}</kbd>
);

/** アイコンだけのボタン */
export function IconButton({
  label,
  keys,
  className,
  size = 32,
  ...rest
}: ComponentProps<"button"> & { label: string; keys?: string; size?: number }) {
  return (
    <Tip label={label} keys={keys}>
      <button
        type="button"
        aria-label={label}
        className={clsx("ghost grid shrink-0 place-items-center rounded-lg disabled:opacity-40", className)}
        style={{ width: size, height: size }}
        {...rest}
      />
    </Tip>
  );
}

export function Modal(props: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
  /** 上に寄せる（スマホのキーボードに隠れないように） */
  top?: boolean;
}) {
  return (
    <Dialog.Root open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/25 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-black/60" />
        <Dialog.Viewport
          className={clsx("fixed inset-0 z-40 flex justify-center px-2", props.top ? "items-start pt-[max(8px,env(safe-area-inset-top))] md:pt-[12vh]" : "items-center")}
        >
          <Dialog.Popup
            aria-label={props.label}
            className={clsx(
              "panel flex max-h-[85dvh] w-full max-w-md flex-col outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
              props.className,
            )}
          >
            {props.children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface AskSpec {
  title: string;
  /** 選んだ所の見た目（文脈として出す） */
  context?: string;
  value: string;
  multiline?: boolean;
  /** 空でも決定できるか（差替は空でトル、ルビは空で外す） */
  allowEmpty?: boolean;
  /** 押すと記法を差し込むボタンを出す */
  markup?: boolean;
  onOk: (value: string) => void;
}

/** 一行か数行を入力させる。空を許さないものは、空の間は決定を押せない */
export function Ask({ spec, onClose }: { spec: AskSpec | null; onClose: () => void }) {
  return (
    <Modal open={!!spec} onClose={onClose} label={spec?.title ?? ""} top>
      {spec && <AskBody key={spec.title + spec.value} spec={spec} onClose={onClose} />}
    </Modal>
  );
}

function AskBody({ spec, onClose }: { spec: AskSpec; onClose: () => void }) {
  const [value, setValue] = useState(spec.value);
  const ok = !spec.allowEmpty && !value.trim() ? null : () => (spec.onOk(value), onClose());
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && (!spec.multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      ok?.();
    }
  };
  const wrap = (a: string, b: string) => (ev: React.MouseEvent) => {
    const f = (ev.currentTarget.closest("form")!.querySelector("input,textarea") as HTMLInputElement)!;
    const s = f.selectionStart ?? value.length;
    const t = f.selectionEnd ?? value.length;
    const next = value.slice(0, s) + a + value.slice(s, t) + b + value.slice(t);
    setValue(next);
    requestAnimationFrame(() => {
      f.focus();
      f.setSelectionRange(s + a.length, t + a.length);
    });
  };
  const field = "well w-full rounded-lg px-3 py-2 text-[15px] outline-none focus-visible:outline-2 focus-visible:outline-pen";
  return (
    <form className="flex flex-col gap-3 p-4" onSubmit={(e) => (e.preventDefault(), ok?.())}>
      <div className="flex items-center gap-2">
        <Dialog.Title className="flex-1 truncate text-sm font-semibold">{spec.title}</Dialog.Title>
        <Dialog.Close aria-label="閉じる" className="ghost grid size-7 place-items-center rounded-md">
          <X size={16} />
        </Dialog.Close>
      </div>
      {spec.context && <p className="truncate font-mincho text-sub">「{spec.context}」</p>}
      {spec.multiline ? (
        <textarea autoFocus rows={4} className={field} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} aria-label={spec.title} />
      ) : (
        <input
          autoFocus
          className={clsx(field, "font-mincho")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={onKeyDown}
          aria-label={spec.title}
        />
      )}
      <div className="flex items-center gap-1">
        {spec.markup && (
          <>
            <button type="button" className="ghost rounded-md px-2 py-1 text-xs" onClick={wrap("｜", "《》")}>
              ルビ
            </button>
            <button type="button" className="ghost rounded-md px-2 py-1 text-xs" onClick={wrap("《《", "》》")}>
              傍点
            </button>
          </>
        )}
        <span className="flex-1" />
        <Dialog.Close className="ghost rounded-lg px-3 py-1.5">やめる</Dialog.Close>
        <button type="submit" disabled={!ok} className="primary rounded-lg px-4 py-1.5 font-medium disabled:opacity-40">
          決定
        </button>
      </div>
    </form>
  );
}

export interface ConfirmSpec {
  title: string;
  ok: string;
  onOk: () => void;
}

export function Confirm({ spec, onClose }: { spec: ConfirmSpec | null; onClose: () => void }) {
  return (
    <Modal open={!!spec} onClose={onClose} label={spec?.title ?? ""}>
      {spec && (
        <div className="flex flex-col gap-4 p-4">
          <Dialog.Title className="text-sm font-semibold">{spec.title}</Dialog.Title>
          <div className="flex justify-end gap-1">
            <Dialog.Close className="ghost rounded-lg px-3 py-1.5">やめる</Dialog.Close>
            <button autoFocus className="primary rounded-lg px-4 py-1.5 font-medium" onClick={() => (onClose(), spec.onOk())}>
              {spec.ok}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
