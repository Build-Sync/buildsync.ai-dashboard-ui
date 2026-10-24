"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { hasWorkspaceParams, parseQuery, sameQuery, serializeQuery, type WorkspaceQuery } from "../workspace-query";
import { useAppApi } from "./app-provider";
import { getWorkspaceStore, type WsInit, type WsState, type WsStore } from "./workspace-store";

const WsContext = createContext<WsStore | null>(null);

export function WorkspaceProvider({ init, basePath, children }: { init: WsInit; basePath: string; children: ReactNode }) {
  const app = useAppApi();
  const [store] = useState(() =>
    getWorkspaceStore(init, {
      toast: (text, tone) => app.getState().toast(text, tone),
      log: (kind, text) => app.getState().log(kind, text),
      setDirty: (id, v) => app.getState().setDirty(id, v),
    }),
  );
  return (
    <WsContext.Provider value={store}>
      <UrlMirror store={store} basePath={basePath} />
      {children}
    </WsContext.Provider>
  );
}

export function useWsApi(): WsStore {
  const s = useContext(WsContext);
  if (!s) throw new Error("useWsApi must be used inside <WorkspaceProvider>");
  return s;
}

export function useWs<T>(selector: (s: WsState) => T): T {
  return useStore(useWsApi(), selector);
}

export function useWsShallow<T>(selector: (s: WsState) => T): T {
  return useStore(useWsApi(), useShallow(selector));
}

export function pickQuery(s: WsState): WorkspaceQuery {
  return { tab: s.tab, panel: s.panel, explorer: s.explorer, view: s.view, section: s.section, doc: s.doc, project: s.demoProject };
}

/** how long a written query is recognised as our own echo */
const ECHO_WINDOW_MS = 2000;

interface Written {
  q: string;
  at: number;
}

function writeUrl(written: Written[], basePath: string, s: WsState) {
  const q = serializeQuery(pickQuery(s));
  const now = performance.now();
  written.push({ q, at: now });
  while (written.length && now - written[0].at > ECHO_WINDOW_MS) written.shift();
  const next = basePath + q;
  if (window.location.pathname + window.location.search !== next) window.history.replaceState(null, "", next);
}

/**
 * Keeps tab / panel / explorer / view / section in sync with the URL query.
 *
 * - URL → store on mount and on back/forward. A URL with workspace params wins; an empty
 *   URL adopts the store's state (so returning to a document tab restores where you were).
 * - store → URL via history.replaceState (Next syncs useSearchParams; no server round trip).
 * - Idle while a settings modal is open: the intercepted route changes the browser URL
 *   (usePathname is /settings/…), but the workspace underneath must not reset.
 * - Next hands every replaceState back through useSearchParams, asynchronously and possibly
 *   late or batched. Such an echo can be older than the store (tab clicked, then a toggle a few
 *   ms later), so applying it would silently undo the newer change. Queries this mirror wrote
 *   in the last couple of seconds are ignored when they come back; anything else is a real navigation.
 */
function UrlMirror({ store, basePath }: { store: WsStore; basePath: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = pathname === basePath;
  const mounted = useRef(false);
  const written = useRef<Written[]>([]);

  useEffect(() => {
    if (!active) return;
    if (!mounted.current) {
      mounted.current = true;
      if (!hasWorkspaceParams(sp)) {
        // keep the demo `project` param, adopt everything else from the store
        writeUrl(written.current, basePath, store.getState());
        return;
      }
    }
    const fromUrl = parseQuery(sp);
    const echo = serializeQuery(fromUrl);
    const now = performance.now();
    if (written.current.some((w) => w.q === echo && now - w.at < ECHO_WINDOW_MS)) return;
    if (!sameQuery(pickQuery(store.getState()), fromUrl)) store.getState().applyQuery(fromUrl);
  }, [sp, active, store, basePath]);

  useEffect(() => {
    if (!active) return;
    return store.subscribe((s, prev) => {
      if (s.tab === prev.tab && s.panel === prev.panel && s.explorer === prev.explorer && s.view === prev.view && s.section === prev.section && s.doc === prev.doc) return;
      writeUrl(written.current, basePath, s);
    });
  }, [active, store, basePath]);

  return null;
}
