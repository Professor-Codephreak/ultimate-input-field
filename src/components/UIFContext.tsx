import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { HubLayoutHandle, LayoutApi, OutputField, OutputMessage, OutputsApi, Rect, SpawnTarget, UIFProviderOptions } from '../types';
import { createActionRegistry, type Action, type ActionRegistry } from '../core/actions';
import { builtinActions } from '../core/builtins';
import { createBus, KEY_PARAM, OUTPUT_PARAM, type Bus, type BusMessage } from '../core/bus';
import { loadJSON, saveJSON } from '../core/storage';
import { parseProfile, profileFileName, serializeProfile, STANDARD_PROFILE, type UIFProfile } from '../core/profile';
import { OutputField as OutputPanel } from './OutputField';
import { Tethers } from './Tethers';
import { CONTEXT_KINDS, type ContextKind } from '../core/windows';
import { ContextWindows } from './ContextWindows';
import { useContextStore, type ContextApi } from './contextStore';
import { WINDOW_SIZE } from './ContextWindow';

const COLORS = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24', '#a78bfa', '#fb923c'];
const OUTPUT_SIZE = { width: 360, height: 240 };
const MAX_SAVED_MESSAGES = 200;

/* Window Management API: not in the DOM lib yet. */
interface ScreenInfo {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  label?: string;
  isPrimary?: boolean;
}
/* Presentation API: not in the DOM lib everywhere yet. */
interface PresentationConnectionLike {
  state: string;
  send(data: string): void;
  terminate(): void;
  close(): void;
  addEventListener(type: string, fn: (e: { data?: unknown }) => void): void;
}
type WindowWithPresentation = Window & {
  PresentationRequest?: new (urls: string[]) => { start(): Promise<PresentationConnectionLike> };
};
interface ScreenDetails {
  screens: ScreenInfo[];
  currentScreen: ScreenInfo;
}
type WindowWithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetails> };

export interface UIFContextValue {
  registry: ActionRegistry;
  outputs: OutputsApi;
  fields: OutputField[];
  strings: boolean;
  setStrings(on: boolean | 'toggle'): void;
  /** The hub (input field) element; tethers start here and outputs spawn beside it. */
  hubRef: React.MutableRefObject<HTMLElement | null>;
  flashes: Record<string, number>;
  setRect(id: string, rect: Rect): void;
  requestScreens(): Promise<string>;
  bus: Bus;
  storageKey: string;
  /** Bring a panel to the front: an output id, or HUB_KEY for the input field. */
  raise(key: string): void;
  /** Stacking order for a panel; the most recently raised panel is on top. */
  zIndexOf(key: string): number;
  /** Send text as a chat message into a given output (used by the outputs' reply boxes). */
  sendTo(text: string, outputId: string): void;
  /** The input field registers how chat messages are sent; returns an unregister function. */
  registerSender(fn: (text: string, outputId: string) => void): () => void;
  layout: LayoutApi;
  /** The context windows (.history, .memory, .prompt, .persona, .model). */
  windows: WindowsApi;
  /** The content of those five context files. */
  context: ContextApi;
  /** The input field registers its layout so profiles can read and apply it. */
  registerHubLayout(handle: HubLayoutHandle): () => void;
}

export interface WindowsApi {
  open: Partial<Record<ContextKind, Rect>>;
  isOpen(kind: ContextKind): boolean;
  show(kind: ContextKind): void;
  hide(kind: ContextKind): void;
  toggle(kind: ContextKind): void;
  setRect(kind: ContextKind, rect: Rect): void;
}

export const HUB_KEY = '__hub';
const Z_BASE = 1000;

const UIFContext = createContext<UIFContextValue | null>(null);

export function useUIF(): UIFContextValue {
  const ctx = useContext(UIFContext);
  if (!ctx) throw new Error('useUIF must be used inside <UIFProvider> or <UltimateBar>');
  return ctx;
}

export function useOptionalUIF(): UIFContextValue | null {
  return useContext(UIFContext);
}

/** Re-renders when the registry changes. */
export function useRegistryVersion(registry: ActionRegistry): number {
  return useSyncExternalStore(registry.subscribe, registry.version, registry.version);
}

let seq = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

function loadFields(key: string): OutputField[] {
  return loadJSON<OutputField[]>(`uif:${key}:outputs`, []).map(f => ({
    ...f,
    messages: f.messages.map(m => ({ ...m, pending: false })),
  }));
}

export function UIFProvider({
  children,
  storageKey = 'default',
  popoutUrl,
  defaultStrings = false,
  actions,
}: UIFProviderOptions & { children?: React.ReactNode; actions?: Action[] }) {
  const registry = useMemo(
    () => createActionRegistry({ actions: [...builtinActions, ...(actions ?? [])], storageKey }),
    // The registry lives for the provider's lifetime; later action changes go through register().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
  );
  const bus = useMemo(() => createBus(storageKey), [storageKey]);
  useEffect(() => () => bus.close(), [bus]);

  const [fields, setFields] = useState<OutputField[]>(() => loadFields(storageKey));
  const fieldsRef = useRef(fields);
  const commit = useCallback((next: OutputField[] | ((prev: OutputField[]) => OutputField[])) => {
    fieldsRef.current = typeof next === 'function' ? next(fieldsRef.current) : next;
    setFields(fieldsRef.current);
  }, []);
  const patch = useCallback(
    (id: string, fn: (f: OutputField) => OutputField) => commit(prev => prev.map(f => (f.id === id ? fn(f) : f))),
    [commit],
  );

  const [activeId, setActiveId] = useState<string | null>(() => fields[fields.length - 1]?.id ?? null);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const [strings, setStringsState] = useState<boolean>(() => loadJSON(`uif:${storageKey}:strings`, defaultStrings));
  const setStrings = useCallback(
    (on: boolean | 'toggle') =>
      setStringsState(prev => {
        const next = on === 'toggle' ? !prev : on;
        saveJSON(`uif:${storageKey}:strings`, next);
        return next;
      }),
    [storageKey],
  );

  const [flashes, setFlashes] = useState<Record<string, number>>({});
  // Last entry is the top panel. Outputs restored from storage start below the hub.
  const [zOrder, setZOrder] = useState<string[]>(() => [...fields.map(f => f.id), HUB_KEY]);
  const raise = useCallback(
    (key: string) => setZOrder(prev => (prev[prev.length - 1] === key ? prev : [...prev.filter(k => k !== key), key])),
    [],
  );
  const zIndexOf = useCallback((key: string) => Z_BASE + Math.max(0, zOrder.indexOf(key)), [zOrder]);
  const hubRef = useRef<HTMLElement | null>(null);
  const windows = useRef(new Map<string, Window>());
  const screens = useRef<ScreenDetails | null>(null);
  const presentations = useRef(new Map<string, PresentationConnectionLike>());
  /** Replies already read aloud (or there before speaking was turned on). */
  const spoken = useRef(new Set<string>());

  /** Where the n-th output beside the hub goes: tiled in columns, right of the hub first. */
  const slotBeside = useCallback((n: number): Rect => {
    const hub = hubRef.current?.getBoundingClientRect() ?? {
      left: window.innerWidth / 2 - 300,
      right: window.innerWidth / 2 + 300,
    };
    const { width, height } = OUTPUT_SIZE;
    const gap = 12;
    const perColumn = Math.max(1, Math.floor((window.innerHeight - gap) / (height + gap)));
    const col = Math.floor(n / perColumn);
    const row = n % perColumn;
    const rightCols = Math.max(0, Math.floor((window.innerWidth - hub.right - 24) / (width + gap)));
    let x =
      col < rightCols
        ? hub.right + 24 + col * (width + gap)
        : hub.left - 24 - width - (col - rightCols) * (width + gap);
    x = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const y = Math.max(8, Math.min(gap + row * (height + gap), window.innerHeight - height - 8));
    return { x, y, width, height };
  }, []);

  const callHome = useCallback(
    (ref: string | 'all') => {
      const ids = ref === 'all' ? fieldsRef.current.map(f => f.id) : [ref];
      // Calling one output home slots it after the ones already beside the hub.
      const base = ref === 'all' ? 0 : fieldsRef.current.filter(f => f.placement === 'inline' && f.id !== ref).length;
      ids.forEach((id, i) => {
        const n = base + i;
        bus.post({ type: 'out:home', id });
        windows.current.get(id)?.close();
        windows.current.delete(id);
        const conn = presentations.current.get(id);
        presentations.current.delete(id);
        if (conn && conn.state !== 'terminated') conn.terminate();
        patch(id, f => ({ ...f, placement: 'inline', presented: false, screenGeom: undefined, rect: slotBeside(n) }));
      });
      setFlashes(prev => Object.fromEntries([...Object.entries(prev), ...ids.map(id => [id, (prev[id] ?? 0) + 1])]));
    },
    [bus, patch, slotBeside],
  );

  const outputsRef = useRef<OutputsApi | null>(null);
  /** Messages from a presentation connection (a cast device has no BroadcastChannel to this page). */
  const busFromRemote = useRef<((msg: BusMessage) => void) | null>(null);
  const outputs = useMemo<OutputsApi>(
    () => ({
      list: () => fieldsRef.current,
      get activeId() {
        return activeRef.current;
      },
      setActive: id => setActiveId(id),
      spawn(title, target?: SpawnTarget) {
        const n = fieldsRef.current.length;
        const id = newId('o');
        commit(prev => [
          ...prev,
          {
            id,
            title: title || `Output ${n + 1}`,
            color: COLORS[n % COLORS.length],
            placement: 'inline',
            rect: slotBeside(prev.filter(f => f.placement === 'inline').length),
            messages: [],
          },
        ]);
        setActiveId(id);
        activeRef.current = id;
        raise(id);
        if (target) {
          // after the field exists (the next microtask), send it where it was asked to go
          queueMicrotask(() => {
            if (target.speak) outputsRef.current?.setSpeak(id, true);
            if (target.present) void outputsRef.current?.present(id);
            else if (target.screen !== undefined || target.window) outputsRef.current?.popOut(id, { screen: target.screen });
          });
        }
        return id;
      },
      close(id) {
        bus.post({ type: 'out:home', id });
        windows.current.get(id)?.close();
        windows.current.delete(id);
        const conn = presentations.current.get(id);
        presentations.current.delete(id);
        if (conn && conn.state !== 'terminated') conn.terminate();
        commit(prev => prev.filter(f => f.id !== id));
        setZOrder(prev => prev.filter(k => k !== id));
        if (activeRef.current === id) {
          const rest = fieldsRef.current;
          setActiveId(rest[rest.length - 1]?.id ?? null);
        }
      },
      popOut(id, opts) {
        const field = fieldsRef.current.find(f => f.id === id);
        if (!field) return;
        const k = fieldsRef.current.filter(f => f.placement === 'popout').length;
        const { width, height } = OUTPUT_SIZE;
        let left = window.screenX + window.outerWidth + 20 + k * 30;
        let top = window.screenY + 60 + k * 30;
        const sd = screens.current;
        let note: string | undefined;
        if (opts?.screen !== undefined) {
          const chosen = sd?.screens[opts.screen - 1];
          if (chosen) {
            left = chosen.availLeft + 40 + k * 30;
            top = chosen.availTop + 40 + k * 30;
          } else {
            note = sd
              ? `there is no screen ${opts.screen} (this machine has ${sd.screens.length}); it opened beside this window`
              : `screen ${opts.screen} needs screen access first (run "screens"); it opened beside this window`;
          }
        } else if (sd) {
          const cur = sd.currentScreen;
          const others = sd.screens.filter(s => s.availLeft !== cur.availLeft || s.availTop !== cur.availTop);
          const target = others[k % Math.max(others.length, 1)] ?? cur;
          left = target.availLeft + 40 + k * 30;
          top = target.availTop + 40 + k * 30;
        }
        const url = new URL(popoutUrl ?? window.location.href, window.location.href);
        url.searchParams.set(OUTPUT_PARAM, id);
        url.searchParams.set(KEY_PARAM, storageKey);
        const win = window.open(
          url.toString(),
          `uif-${storageKey}-${id}`,
          `popup,width=${width + 40},height=${height + 120},left=${Math.round(left)},top=${Math.round(top)}`,
        );
        if (!win) return 'the browser blocked the window (allow pop-ups for this page)';
        windows.current.set(id, win);
        patch(id, f => ({ ...f, placement: 'popout' }));
        return note;
      },
      async present(id) {
        const P = (window as WindowWithPresentation).PresentationRequest;
        if (!P) return 'this browser cannot present to another display (the Presentation API is missing; Chrome has it)';
        if (!fieldsRef.current.some(f => f.id === id)) return 'no such output';
        const url = new URL(popoutUrl ?? window.location.href, window.location.href);
        url.searchParams.set(OUTPUT_PARAM, id);
        url.searchParams.set(KEY_PARAM, storageKey);
        try {
          const conn = await new P([url.toString()]).start();
          presentations.current.set(id, conn);
          patch(id, f => ({ ...f, placement: 'popout', presented: true }));
          const gone = () => {
            if (presentations.current.get(id) === conn) {
              presentations.current.delete(id);
              callHome(id);
            }
          };
          conn.addEventListener('terminate', gone);
          conn.addEventListener('close', gone);
          // a cast device has no BroadcastChannel to this page: its messages come over the connection
          conn.addEventListener('message', e => {
            try {
              busFromRemote.current?.(JSON.parse(String(e.data)));
            } catch {
              /* not ours */
            }
          });
          return 'presented on the chosen display';
        } catch (err) {
          return `not presented: ${(err as Error).message || err}`;
        }
      },
      setSpeak(id, on) {
        if (on && !('speechSynthesis' in window)) return 'this browser cannot speak (no speech synthesis)';
        const field = fieldsRef.current.find(f => f.id === id);
        if (!field) return 'no such output';
        if (on) field.messages.forEach(m => spoken.current.add(m.id));
        else window.speechSynthesis?.cancel();
        patch(id, f => ({ ...f, speak: on }));
        return on ? `replies in ${field.title} will be read aloud` : `${field.title} is quiet`;
      },
      screens() {
        const sd = screens.current;
        if (!sd) return null;
        return sd.screens.map((sc, i) => ({
          index: i + 1,
          label: sc.label || `screen ${i + 1}`,
          primary: !!sc.isPrimary,
          current: sc.availLeft === sd.currentScreen.availLeft && sc.availTop === sd.currentScreen.availTop,
          width: sc.availWidth,
          height: sc.availHeight,
        }));
      },
      callHome,
      ping(id) {
        setFlashes(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
        bus.post({ type: 'out:ping', id });
        windows.current.get(id)?.focus();
      },
      clear(id) {
        patch(id, f => ({ ...f, messages: [] }));
      },
      rename(id, title) {
        const t = title.trim();
        if (t) patch(id, f => ({ ...f, title: t }));
      },
      append(id, message) {
        const mid = newId('m');
        patch(id, f => ({ ...f, messages: [...f.messages, { ...message, id: mid }] }));
        return mid;
      },
      update(id, messageId, change: Partial<OutputMessage>) {
        patch(id, f => ({ ...f, messages: f.messages.map(m => (m.id === messageId ? { ...m, ...change } : m)) }));
      },
      resolve(ref) {
        const list = fieldsRef.current;
        if (!ref) return activeRef.current ?? list[list.length - 1]?.id;
        if (/^\d+$/.test(ref)) return list[Number(ref) - 1]?.id;
        const lower = ref.toLowerCase();
        return (list.find(f => f.id === ref) ?? list.find(f => f.title.toLowerCase() === lower))?.id;
      },
    }),
    [bus, callHome, commit, patch, popoutUrl, raise, slotBeside, storageKey],
  );
  outputsRef.current = outputs;

  const sender = useRef<((text: string, outputId: string) => void) | null>(null);
  const registerSender = useCallback((fn: (text: string, outputId: string) => void) => {
    sender.current = fn;
    return () => {
      if (sender.current === fn) sender.current = null;
    };
  }, []);
  const sendTo = useCallback(
    (text: string, outputId: string) => {
      if (!text.trim()) return;
      // Without an input field there is nothing to answer, so just record the message.
      if (sender.current) sender.current(text, outputId);
      else outputs.append(outputId, { role: 'user', text });
    },
    [outputs],
  );

  // ---- Context windows ------------------------------------------------------
  const contextStore = useContextStore(storageKey);
  const [openWindows, setOpenWindows] = useState<Partial<Record<ContextKind, Rect>>>(() => {
    const saved = loadJSON<Partial<Record<string, Rect>>>(`uif:${storageKey}:windows`, {});
    return Object.fromEntries(Object.entries(saved).filter(([k]) => (CONTEXT_KINDS as readonly string[]).includes(k)));
  });
  useEffect(() => saveJSON(`uif:${storageKey}:windows`, openWindows), [openWindows, storageKey]);
  const openWindowsRef = useRef(openWindows);
  openWindowsRef.current = openWindows;
  /**
   * Where a window opens: the first free cell of a grid over the viewport, so a
   * new window does not cover the open ones. When every cell is taken, it cascades.
   */
  const windowSlot = useCallback((taken: Rect[]): Rect => {
    const { width, height } = WINDOW_SIZE;
    const gap = 12;
    const cols = Math.max(1, Math.floor((window.innerWidth - gap) / (width + gap)));
    const rows = Math.max(1, Math.floor((window.innerHeight - gap) / (height + gap)));
    const overlaps = (r: Rect) =>
      taken.some(t => r.x < t.x + t.width && t.x < r.x + r.width && r.y < t.y + t.height && t.y < r.y + r.height);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = { x: gap + col * (width + gap), y: gap + row * (height + gap), width, height };
        if (!overlaps(cell)) return cell;
      }
    }
    const n = taken.length;
    return {
      x: Math.min(gap + n * 32, window.innerWidth - width - gap),
      y: Math.min(gap + n * 32, window.innerHeight - height - gap),
      width,
      height,
    };
  }, []);
  const contextWindows = useMemo<WindowsApi>(
    () => ({
      open: openWindows,
      isOpen: kind => !!openWindows[kind],
      // Opening (or re-showing) a window brings it to the front; restoring after a reload does not.
      show: kind => {
        raise(`win:${kind}`);
        setOpenWindows(prev => (prev[kind] ? prev : { ...prev, [kind]: windowSlot(Object.values(prev) as Rect[]) }));
      },
      hide: kind =>
        setOpenWindows(prev => {
          if (!prev[kind]) return prev;
          const next = { ...prev };
          delete next[kind];
          return next;
        }),
      toggle: kind => {
        if (!openWindows[kind]) raise(`win:${kind}`);
        setOpenWindows(prev => {
          if (prev[kind]) {
            const next = { ...prev };
            delete next[kind];
            return next;
          }
          return { ...prev, [kind]: windowSlot(Object.values(prev) as Rect[]) };
        });
      },
      setRect: (kind, rect) => setOpenWindows(prev => (prev[kind] ? { ...prev, [kind]: rect } : prev)),
    }),
    [openWindows, raise, windowSlot],
  );

  // ---- Layout profiles (.profile) -------------------------------------------
  const hubLayout = useRef<HubLayoutHandle | null>(null);
  const registerHubLayout = useCallback((handle: HubLayoutHandle) => {
    hubLayout.current = handle;
    return () => {
      if (hubLayout.current === handle) hubLayout.current = null;
    };
  }, []);
  const [profiles, setProfiles] = useState<Record<string, UIFProfile>>(() =>
    loadJSON(`uif:${storageKey}:profiles`, {}),
  );
  const [activeProfile, setActiveProfile] = useState<string | null>(() =>
    loadJSON(`uif:${storageKey}:profile`, null),
  );
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const stringsRef = useRef(strings);
  stringsRef.current = strings;

  const storeProfiles = useCallback(
    (next: Record<string, UIFProfile>) => {
      profilesRef.current = next;
      setProfiles(next);
      saveJSON(`uif:${storageKey}:profiles`, next);
    },
    [storageKey],
  );
  const markActive = useCallback(
    (name: string | null) => {
      setActiveProfile(name);
      saveJSON(`uif:${storageKey}:profile`, name);
    },
    [storageKey],
  );

  const layout = useMemo<LayoutApi>(() => {
    const capture = (name: string): UIFProfile => ({
      'uif.profile': 1,
      name,
      savedAt: new Date().toISOString(),
      actions: registry.snapshot(),
      hub: hubLayout.current?.get() ?? { x: 0, y: 0, width: 600, height: 120, mode: 'chat', docked: null },
      strings: stringsRef.current,
      windows: openWindowsRef.current,
    });
    const apply = (p: UIFProfile) => {
      registry.restore(p.actions);
      hubLayout.current?.set(p.hub);
      setStrings(p.strings);
      setOpenWindows(p.windows ?? {});
    };
    const reset = () => {
      registry.reset();
      hubLayout.current?.set(null);
      setStrings(defaultStrings);
      setOpenWindows({});
      markActive(STANDARD_PROFILE);
    };
    const download = (p: UIFProfile) => {
      const url = URL.createObjectURL(new Blob([serializeProfile(p)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = profileFileName(p.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return {
      list: () => Object.keys(profilesRef.current).sort(),
      active: activeProfile,
      capture,
      save(name) {
        const clean = name.trim();
        if (!clean || clean === STANDARD_PROFILE) throw new Error(`"${STANDARD_PROFILE}" is the built-in layout; pick another name`);
        const p = capture(clean);
        storeProfiles({ ...profilesRef.current, [clean]: p });
        markActive(clean);
        return p;
      },
      load(name) {
        if (name === STANDARD_PROFILE) {
          reset();
          return true;
        }
        const p = profilesRef.current[name];
        if (!p) return false;
        apply(p);
        markActive(name);
        return true;
      },
      remove(name) {
        if (!profilesRef.current[name]) return false;
        const { [name]: _gone, ...rest } = profilesRef.current;
        storeProfiles(rest);
        if (activeProfile === name) markActive(null);
        return true;
      },
      reset,
      exportProfile(name) {
        const saved = name ? profilesRef.current[name] : undefined;
        if (name && !saved && name !== activeProfile) throw new Error(`no profile "${name}"`);
        download(saved ?? capture(name ?? activeProfile ?? 'layout'));
      },
      importProfile(text, fileName) {
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('not a valid .profile file: it is not JSON');
        }
        const fallback = fileName?.replace(/\.profile$|\.json$/i, '') || 'imported';
        const p = parseProfile(data, fallback);
        const name = p.name === STANDARD_PROFILE ? `${STANDARD_PROFILE}-imported` : p.name;
        const stored = { ...p, name };
        storeProfiles({ ...profilesRef.current, [name]: stored });
        apply(stored);
        markActive(name);
        return name;
      },
    };
  }, [activeProfile, defaultStrings, markActive, registry, setStrings, storeProfiles]);

  const setRect = useCallback((id: string, rect: Rect) => patch(id, f => ({ ...f, rect })), [patch]);

  const requestScreens = useCallback(async () => {
    const w = window as WindowWithScreens;
    if (!w.getScreenDetails) return 'this browser cannot place windows on other screens';
    try {
      screens.current = await w.getScreenDetails();
      return `${screens.current.screens.length} screen(s) available for pop-outs`;
    } catch {
      return 'screen access was denied';
    }
  }, []);

  // Use screen details silently when permission was granted earlier.
  useEffect(() => {
    const w = window as WindowWithScreens;
    if (!w.getScreenDetails || !navigator.permissions) return;
    navigator.permissions
      .query({ name: 'window-management' as PermissionName })
      .then(s => {
        if (s.state === 'granted') void requestScreens();
      })
      .catch(() => {});
  }, [requestScreens]);

  // Persist fields (debounced: streaming replies update them many times a second).
  useEffect(() => {
    const t = setTimeout(
      () =>
        saveJSON(
          `uif:${storageKey}:outputs`,
          fields.map(f => ({ ...f, messages: f.messages.slice(-MAX_SAVED_MESSAGES) })),
        ),
      300,
    );
    return () => clearTimeout(t);
  }, [fields, storageKey]);

  // Mirror pop-out fields to their windows (and to presentation connections: a cast device has no BroadcastChannel).
  useEffect(() => {
    fields
      .filter(f => f.placement === 'popout')
      .forEach(f => {
        const msg: BusMessage = { type: 'out:state', id: f.id, field: f, active: f.id === activeId };
        bus.post(msg);
        const conn = presentations.current.get(f.id);
        if (conn?.state === 'connected') conn.send(JSON.stringify(msg));
      });
  }, [fields, activeId, bus]);

  // Outputs with speak on read new, finished replies aloud through the system's audio output.
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;
    for (const f of fields) {
      if (!f.speak) continue;
      for (const m of f.messages) {
        if (m.role !== 'assistant' || m.pending || m.silent || !m.text.trim() || spoken.current.has(m.id)) continue;
        spoken.current.add(m.id);
        synth.speak(new SpeechSynthesisUtterance(m.text));
      }
    }
  }, [fields]);

  // Messages from pop-out windows.
  useEffect(() => {
    const heard = new Set<string>();
    const handle = (msg: BusMessage) => {
      if (!('id' in msg)) return;
      const field = fieldsRef.current.find(f => f.id === msg.id);
      switch (msg.type) {
        case 'out:hello': {
          heard.add(msg.id);
          const reply: BusMessage =
            field?.placement === 'popout'
              ? { type: 'out:state', id: msg.id, field, active: msg.id === activeRef.current }
              : { type: 'out:home', id: msg.id };
          bus.post(reply);
          const conn = presentations.current.get(msg.id);
          if (conn?.state === 'connected') conn.send(JSON.stringify(reply));
          break;
        }
        case 'out:geom': {
          heard.add(msg.id);
          const g = field?.screenGeom;
          if (field && (!g || g.x !== msg.geom.x || g.y !== msg.geom.y || g.width !== msg.geom.width || g.height !== msg.geom.height))
            patch(msg.id, f => ({ ...f, screenGeom: msg.geom }));
          break;
        }
        case 'out:bye':
          // The window went away on its own (closed by the user): bring the field home.
          setTimeout(() => {
            const f = fieldsRef.current.find(x => x.id === msg.id);
            const win = windows.current.get(msg.id);
            if (f?.placement === 'popout' && (!win || win.closed)) callHome(msg.id);
          }, 300);
          break;
        case 'out:request-home':
          callHome(msg.id);
          break;
        case 'out:request-close':
          outputs.close(msg.id);
          break;
        case 'out:request-rename':
          outputs.rename(msg.id, msg.title);
          break;
        case 'out:input':
          sendTo(msg.text, msg.id);
          break;
        case 'out:remember':
          void contextStore.remember(msg.text, 'response');
          break;
      }
    };
    const off = bus.on(handle);
    busFromRemote.current = handle;
    // After a reload, pop-outs that are still open answer this; the rest come home.
    bus.post({ type: 'hub:hello' });
    const t = setTimeout(() => {
      fieldsRef.current
        .filter(f => f.placement === 'popout' && !heard.has(f.id) && !windows.current.has(f.id))
        .forEach(f => callHome(f.id));
    }, 1500);
    return () => {
      off();
      clearTimeout(t);
    };
  }, [bus, callHome, outputs, patch, sendTo, contextStore]);

  const value = useMemo<UIFContextValue>(
    () => ({
      registry,
      outputs,
      fields,
      strings,
      setStrings,
      hubRef,
      flashes,
      setRect,
      requestScreens,
      bus,
      storageKey,
      raise,
      zIndexOf,
      sendTo,
      registerSender,
      layout,
      windows: contextWindows,
      context: contextStore,
      registerHubLayout,
    }),
    [
      registry,
      outputs,
      fields,
      strings,
      setStrings,
      flashes,
      setRect,
      requestScreens,
      bus,
      storageKey,
      raise,
      zIndexOf,
      sendTo,
      registerSender,
      layout,
      contextWindows,
      contextStore,
      registerHubLayout,
    ],
  );

  return (
    <UIFContext.Provider value={value}>
      {children}
      {fields
        .filter(f => f.placement === 'inline')
        .map(f => (
          <OutputPanel key={f.id} field={f} />
        ))}
      <ContextWindows />
      {strings && <Tethers />}
    </UIFContext.Provider>
  );
}
