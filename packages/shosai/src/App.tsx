import { Toast } from "@base-ui/react/toast";
import { Tooltip } from "@base-ui/react/tooltip";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import { Desk } from "./Desk";
import { type Command, Palette } from "./Palette";
import * as prefs from "./prefs";
import { fileOf, fromHash, parseRoute, type Route, routeUrl } from "./route";
import { Shelf } from "./Shelf";
import type { Work } from "./types";
import { Toaster, toasts } from "./ui";

/** メディアクエリの今の値。変わったら描き直す */
export const useMedia = (q: string) =>
  useSyncExternalStore(
    (cb) => {
      const m = matchMedia(q);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia(q).matches,
  );

export interface Nav {
  /** URL を変える。既定は履歴に積む */
  go: (r: Route, replace?: boolean) => void;
  /** シート・パレットなどの重ね物を開く（戻るボタンで閉じる） */
  open: (s: string) => void;
  close: () => void;
}

export const THEMES: [prefs.Theme, string][] = [
  ["system", "端末に従う"],
  ["light", "ライト"],
  ["dark", "ダーク"],
];
export const themeCommands = (set: (t: prefs.Theme) => void): Command[] =>
  THEMES.map(([t, label]) => ({ id: `theme-${t}`, group: "表示", label: `テーマ: ${label}`, run: () => set(t) }));

function initialRoute(): Route {
  const old = fromHash(location.hash);
  if (old) history.replaceState(null, "", routeUrl(old));
  return parseRoute(location.pathname, location.search);
}

export function App() {
  const [route, setRoute] = useState(initialRoute);
  const [works, setWorks] = useState<Work[] | null>(null);
  const [worksErr, setWorksErr] = useState<string | null>(null);
  const [theme, setThemeState] = useState(prefs.theme);
  const sysDark = useMedia("(prefers-color-scheme: dark)");
  const dark = theme === "dark" || (theme === "system" && sysDark);

  useEffect(() => void document.documentElement.classList.toggle("dark", dark), [dark]);
  const setTheme = useCallback((t: prefs.Theme) => {
    prefs.set("shosai.theme", t);
    setThemeState(t);
  }, []);

  const loadWorks = useCallback(() => {
    setWorksErr(null);
    api.works().then(setWorks, (e) => setWorksErr(`作品の一覧を読めなかった: ${(e as Error).message}`));
  }, []);
  useEffect(() => {
    prefs.cleanup();
    loadWorks();
    const onPop = () => setRoute(parseRoute(location.pathname, location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const here = () => parseRoute(location.pathname, location.search);
  // 重ね物（シート・パレット）の中から移ったり別の重ね物を開いたりした時は、重ね物の履歴を置き換える。
  // 戻るボタン一回で重ね物の前の画面に戻るように
  const nav: Nav = {
    go: (r, replace) => {
      // 作品の中を移る時は、組版の表示を持ち越す（view を書けばそれに従う）
      const next = { view: r.work ? here().view : undefined, mode: r.work ? here().mode : undefined, ...r, s: undefined };
      const url = routeUrl(next);
      if (url === location.pathname + location.search) return;
      history[replace || history.state?.overlay ? "replaceState" : "pushState"](null, "", url);
      setRoute(next);
    },
    open: (s) => {
      const r = { ...here(), s };
      history[history.state?.overlay ? "replaceState" : "pushState"]({ overlay: true }, "", routeUrl(r));
      setRoute(r);
    },
    close: () => {
      if (!here().s) return;
      if (history.state?.overlay) history.back();
      else {
        const r = { ...here(), s: undefined };
        history.replaceState(null, "", routeUrl(r));
        setRoute(r);
      }
    },
  };

  // `/<作品>` は最後に読んだ位置（なければ最初の章）に読み替える
  useEffect(() => {
    if (!works || !route.work || (route.vol && route.chap)) return;
    const w = works.find((x) => x.name === route.work);
    if (!w) return;
    const p = prefs.readPos()[w.name];
    const v = w.vols.find((x) => x.name === (route.vol ?? p?.vol)) ?? w.vols[0];
    const c = v.chapters.find((x) => !route.vol && p && x.file === fileOf(p.chap)) ?? v.chapters[0];
    nav.go({ ...route, vol: v.name, chap: c.file.replace(/\.kym\.txt$/, "") }, true);
  }, [works, route]);

  const work = works?.find((w) => w.name === route.work);
  let body;
  if (worksErr)
    body = (
      <div role="alert" className="m-auto flex flex-col items-center gap-3 p-8 text-center">
        <p>{worksErr}</p>
        <button className="raised rounded-lg px-4 py-1.5" onClick={loadWorks}>
          再試行
        </button>
      </div>
    );
  else if (!works) body = null;
  else if (!route.work || !work)
    body = (
      <>
        <Shelf works={works} open={(w) => nav.go({ work: w })} palette={() => nav.open("k")} />
        <Palette
          open={route.s === "k"}
          onClose={nav.close}
          commands={[
            ...works.map((w) => ({ id: `work-${w.name}`, group: "作品", label: w.title, run: () => nav.go({ work: w.name }) })),
            ...themeCommands(setTheme),
          ]}
        />
      </>
    );
  else if (route.vol && route.chap) body = <Desk key={work.name} works={works} work={work} route={route} nav={nav} theme={theme} setTheme={setTheme} dark={dark} />;

  return (
    <Toast.Provider toastManager={toasts}>
      <Tooltip.Provider delay={400}>
        {body}
        <Toaster />
      </Tooltip.Provider>
    </Toast.Provider>
  );
}
