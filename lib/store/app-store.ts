/**
 * lib/store/app-store.ts
 *
 * WHAT   The global (cross-project) client state: profile, settings and the unapplied settings draft, AI agents
 *        and the active agent, seat, team members, command-line history, toasts, open document tabs and unsaved
 *        flags, and the guided tour (`tour`, the step on screen) and a one-off `spotlight` on a control (the Button
 *        Guide's "show me where"). Both live here, not in a project, so Settings can start them for the workspace.
 * FOR    Created once per browser by <AppStoreProvider>, never as a module singleton, so the server never
 *        shares state between requests. Only the non-secret settings are saved (localStorage, key bs.settings);
 *        keys, agents and project data never are.
 * DEBUG  - Saved settings overwritten by defaults: persistence uses skipHydration and a write guard (`ready`);
 *          writes are dropped until rehydrate() has finished (this fixed settings being clobbered when a
 *          Settings page was opened directly).
 *        - A draft shows defaults after a direct load: merge() re-seeds the draft from the loaded settings.
 *        - Storage blocked (private window): getItem throws and the store keeps the defaults; `hydrated` still
 *          becomes true.
 *        - selectEffective returns the draft while Settings is open, so previews (theme, accent, UI scale) show
 *          live.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import { persist, createJSONStorage } from "zustand/middleware";
import { AGENT_META, initialAgents } from "../agents";
import { COTTAGE_PROJECT_ID, DEMO_PROJECT_ID, INITIAL_MEMBERS } from "../mock-data";
import {
  cloneSettings,
  DEFAULT_SETTINGS,
  mergeSettings,
  SETTINGS_STORAGE_KEY,
  type Settings,
} from "../settings";
import type { Agent, AgentId, AuthMethod, HistoryKind, HistoryLine, Member, RibbonTabId, Role, Seat, Toast } from "../types";
import { uid } from "../utils";

/* Global (cross-project) client state: settings, agents, activity log, toasts, open tabs.
 * Created once per client through <AppStoreProvider>, never as a module singleton, so the
 * server never shares state between requests. */

/** The user's profile and PE credentials. */
export interface Profile {
  name: string;
  email: string;
  /** PE credentials: optional, needed to sign. A license number makes the seat "verified". */
  peLicense: string;
  peJurisdiction: string;
  peExpiry: string;
  twoFactor: boolean;
}

/** State and actions of the global store. */
export interface AppState {
  profile: Profile;
  settings: Settings;
  /** Unapplied edits made inside the settings frame; null when not editing. */
  draft: Settings | null;
  agents: Agent[];
  activeAgentId: AgentId;
  seat: Seat;
  members: Member[];
  history: HistoryLine[];
  toasts: Toast[];
  tabs: string[];
  dirty: Record<string, boolean>;
  untitledCounter: number;
  hydrated: boolean;
  /** the guided tour (lib/tour.ts): the step on screen, or null when it is not running */
  tour: { step: number } | null;
  /** one control highlighted on screen with a note (the Button Guide's "show me where"); null = none */
  spotlight: Spotlight | null;

  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
  log: (kind: HistoryKind, text: string) => void;
  clearHistory: () => void;

  beginEdit: () => void;
  updateDraft: (fn: (d: Settings) => void) => void;
  applyDraft: () => void;
  discardDraft: () => void;
  resetSettings: () => void;
  patchSettings: (fn: (s: Settings) => void) => void;

  openTab: (id: string) => void;
  closeTab: (id: string) => string | null;
  newUntitled: () => string;
  setDirty: (id: string, v: boolean) => void;

  /** start the tour at a step (0 = the welcome) */
  startTour: (step?: number) => void;
  setTourStep: (step: number) => void;
  /** end the tour; `how` is remembered so the first-run question is not asked again */
  endTour: (how: "done" | "skipped") => void;
  setSpotlight: (s: Spotlight | null) => void;

  setActiveAgent: (id: AgentId) => void;
  connectAgent: (id: AgentId, data: { maskedKey?: string; model: string; method: AuthMethod; baseUrl?: string; scopes: string[]; name?: string }) => void;
  disconnectAgent: (id: AgentId) => void;
  setSeat: (s: Seat) => void;
  setProfile: (patch: Partial<Profile>) => void;

  addMember: (m: Omit<Member, "id">) => void;
  removeMember: (id: string) => void;
  setMemberRole: (id: string, role: Role) => void;
}

/** A control to highlight: a CSS selector, the ribbon tab to show first, and the note beside it. */
export interface Spotlight {
  selector: string;
  /** a selector to try when the first one is not on screen (a ribbon panel folded into a flyout) */
  fallback?: string;
  tab?: RibbonTabId;
  title: string;
  body: string;
}

/** localStorage key that remembers the tour was taken or skipped. */
export const TOUR_KEY = "bs.tour";

/** The global store. */
export type AppStore = StoreApi<AppState>;

/** Create the global store (call once per browser). */
export function createAppStore(): AppStore {
  // `persist` writes on every update. With skipHydration the saved settings are only read once the
  // provider mounts, so any earlier update (e.g. the settings frame's beginEdit) would overwrite
  // them with defaults first. Writes are therefore dropped until rehydrate() has finished.
  let ready = false;
  const storage = createJSONStorage<{ settings: Settings }>(() => {
    const ls = localStorage; // throws when storage is blocked: createJSONStorage then runs without it
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => {
        if (!ready) return;
        try {
          ls.setItem(k, v);
        } catch {
          /* quota or private mode: settings simply won't persist */
        }
      },
      removeItem: (k) => ls.removeItem(k),
    };
  });

  return createStore<AppState>()(
    persist(
      (set, get) => ({
        profile: { name: "Demo User", email: "demo@buildsync.example", peLicense: "", peJurisdiction: "Florida", peExpiry: "", twoFactor: false },
        settings: cloneSettings(DEFAULT_SETTINGS),
        draft: null,
        agents: initialAgents(),
        activeAgentId: "claude",
        seat: "engineer",
        members: INITIAL_MEMBERS,
        history: [
          { id: "h0", kind: "info", text: "BuildSync AI ready. Type a command (SECTION, 2D, STRESS, SETTINGS…) or ask in plain English." },
        ],
        toasts: [],
        // the two sample houses open side by side; the clinic is on the Start tab
        tabs: [DEMO_PROJECT_ID, COTTAGE_PROJECT_ID],
        dirty: {},
        untitledCounter: 0,
        hydrated: false,
        tour: null,
        spotlight: null,

        toast: (text, tone = "ok") =>
          set((s) => ({ toasts: [...s.toasts.slice(-3), { id: uid("toast"), text, tone }] })),
        dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
        log: (kind, text) => set((s) => ({ history: [...s.history.slice(-199), { id: uid("h"), kind, text }] })),
        clearHistory: () => set({ history: [] }),

        beginEdit: () => {
          if (!get().draft) set((s) => ({ draft: cloneSettings(s.settings) }));
        },
        updateDraft: (fn) =>
          set((s) => {
            const d = cloneSettings(s.draft ?? s.settings);
            fn(d);
            return { draft: d };
          }),
        applyDraft: () =>
          set((s) => {
            if (!s.draft) return {};
            const next = cloneSettings(s.draft);
            const agent = s.agents.find((a) => a.id === next.ai.defaultAgent);
            return {
              settings: next,
              activeAgentId: agent?.connected ? next.ai.defaultAgent : s.activeAgentId,
            };
          }),
        discardDraft: () => set({ draft: null }),
        resetSettings: () => set({ settings: cloneSettings(DEFAULT_SETTINGS), draft: cloneSettings(DEFAULT_SETTINGS) }),
        patchSettings: (fn) =>
          set((s) => {
            const next = cloneSettings(s.settings);
            fn(next);
            return { settings: next, draft: s.draft ? cloneSettings(next) : null };
          }),

        openTab: (id) => set((s) => (s.tabs.includes(id) ? {} : { tabs: [...s.tabs, id] })),
        closeTab: (id) => {
          const { tabs } = get();
          const i = tabs.indexOf(id);
          if (i < 0) return null;
          const next = tabs.filter((t) => t !== id);
          set({ tabs: next });
          return next[Math.min(i, next.length - 1)] ?? null;
        },
        newUntitled: () => {
          const n = get().untitledCounter + 1;
          const id = `untitled-${n}`;
          set((s) => ({ untitledCounter: n, tabs: [...s.tabs, id] }));
          return id;
        },
        setDirty: (id, v) => set((s) => (!!s.dirty[id] === v ? {} : { dirty: { ...s.dirty, [id]: v } })),

        startTour: (step = 0) => set({ tour: { step }, spotlight: null }),
        setTourStep: (step) => set({ tour: { step } }),
        endTour: (how) => {
          try {
            localStorage.setItem(TOUR_KEY, how);
          } catch {
            /* blocked storage: the first-run question may be asked again next time */
          }
          set({ tour: null });
        },
        setSpotlight: (spotlight) => set({ spotlight }),

        setActiveAgent: (id) => set({ activeAgentId: id }),
        connectAgent: (id, data) =>
          set((s) => ({
            agents: s.agents.map((a) =>
              a.id === id
                ? { ...a, name: data.name?.trim() || a.name, connected: true, maskedKey: data.maskedKey, model: data.model, method: data.method, baseUrl: data.baseUrl ?? a.baseUrl, scopes: data.scopes }
                : a,
            ),
          })),
        disconnectAgent: (id) =>
          set((s) => {
            const agents = s.agents.map((a) =>
              a.id === id ? { ...a, name: AGENT_META[id].name, connected: false, maskedKey: undefined, model: undefined, method: undefined, scopes: [], baseUrl: AGENT_META[id].baseUrl } : a,
            );
            let active = s.activeAgentId;
            if (active === id) active = agents.find((a) => a.connected)?.id ?? active;
            return { agents, activeAgentId: active };
          }),
        setSeat: (seat) => set({ seat }),
        setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),

        addMember: (m) => set((s) => ({ members: [...s.members, { ...m, id: uid("m") }] })),
        removeMember: (id) => set((s) => ({ members: s.members.filter((m) => m.id !== id) })),
        setMemberRole: (id, role) => set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, role } : m)) })),
      }),
      {
        name: SETTINGS_STORAGE_KEY,
        version: 1,
        storage,
        // only non-secret user settings are persisted; never keys, agents or project data
        partialize: (s) => ({ settings: s.settings }),
        skipHydration: true,
        onRehydrateStorage: () => () => {
          ready = true;
        },
        merge: (persisted, current) => {
          const settings = mergeSettings((persisted as { settings?: unknown } | undefined)?.settings);
          // a draft opened before hydration (settings page loaded directly) was cloned from defaults
          return { ...current, settings, draft: current.draft ? cloneSettings(settings) : null, hydrated: true };
        },
      },
    ),
  );
}

/** Effective settings: the live draft while the settings frame is open, else the committed copy. */
export const selectEffective = (s: AppState): Settings => s.draft ?? s.settings;
/** A seat is verified once a PE license number is on file; unverified seats can't hide the advisory banner. */
export const selectVerified = (s: AppState): boolean => s.seat !== "student" && s.profile.peLicense.trim().length >= 4;
/** The connected agents. */
export const selectConnected = (s: AppState): Agent[] => s.agents.filter((a) => a.connected);
