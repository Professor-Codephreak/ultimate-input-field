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
import type { OutputField, OutputMessage, OutputsApi, Rect, UIFProviderOptions } from '../types';
import { createActionRegistry, type Action, type ActionRegistry } from '../core/actions';
import { builtinActions } from '../core/builtins';
import { createBus, KEY_PARAM, OUTPUT_PARAM, type Bus } from '../core/bus';
import { loadJSON, saveJSON } from '../core/storage';
import { OutputField as OutputPanel } from './OutputField';
import { Tethers } from './Tethers';

const COLORS = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24', '#a78bfa', '#fb923c'];
const OUTPUT_SIZE = { width: 360, height: 240 };
const MAX_SAVED_MESSAGES = 200;

/* Window Management API: not in the DOM lib yet. */
interface ScreenInfo {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
}
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
        patch(id, f => ({ ...f, placement: 'inline', screenGeom: undefined, rect: slotBeside(n) }));
      });
      setFlashes(prev => Object.fromEntries([...Object.entries(prev), ...ids.map(id => [id, (prev[id] ?? 0) + 1])]));
    },
    [bus, patch, slotBeside],
  );

  const outputs = useMemo<OutputsApi>(
    () => ({
      list: () => fieldsRef.current,
      get activeId() {
        return activeRef.current;
      },
      setActive: id => setActiveId(id),
      spawn(title) {
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
        return id;
      },
      close(id) {
        bus.post({ type: 'out:home', id });
        windows.current.get(id)?.close();
        windows.current.delete(id);
        commit(prev => prev.filter(f => f.id !== id));
        setZOrder(prev => prev.filter(k => k !== id));
        if (activeRef.current === id) {
          const rest = fieldsRef.current;
          setActiveId(rest[rest.length - 1]?.id ?? null);
        }
      },
      popOut(id) {
        const field = fieldsRef.current.find(f => f.id === id);
        if (!field) return;
        const k = fieldsRef.current.filter(f => f.placement === 'popout').length;
        const { width, height } = OUTPUT_SIZE;
        let left = window.screenX + window.outerWidth + 20 + k * 30;
        let top = window.screenY + 60 + k * 30;
        const sd = screens.current;
        if (sd) {
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
        if (!win) return;
        windows.current.set(id, win);
        patch(id, f => ({ ...f, placement: 'popout' }));
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

  // Mirror pop-out fields to their windows.
  useEffect(() => {
    fields
      .filter(f => f.placement === 'popout')
      .forEach(f => bus.post({ type: 'out:state', id: f.id, field: f, active: f.id === activeId }));
  }, [fields, activeId, bus]);

  // Messages from pop-out windows.
  useEffect(() => {
    const heard = new Set<string>();
    const off = bus.on(msg => {
      if (!('id' in msg)) return;
      const field = fieldsRef.current.find(f => f.id === msg.id);
      switch (msg.type) {
        case 'out:hello':
          heard.add(msg.id);
          if (field?.placement === 'popout') bus.post({ type: 'out:state', id: msg.id, field, active: msg.id === activeRef.current });
          else bus.post({ type: 'out:home', id: msg.id });
          break;
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
      }
    });
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
  }, [bus, callHome, outputs, patch, sendTo]);

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
      {strings && <Tethers />}
    </UIFContext.Provider>
  );
}
