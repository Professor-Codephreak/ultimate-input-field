import type { ReactNode } from 'react';
import type { ActionContext } from '../types';
import { loadJSON, saveJSON } from './storage';

export interface Action {
  id: string;
  label: string;
  /** Terminal command name that fires this action. */
  command: string;
  aliases?: string[];
  icon?: ReactNode;
  description?: string;
  builtin?: boolean;
  /** Start hidden from the bar (still reachable as a command and from "+"). */
  defaultHidden?: boolean;
  run(ctx: ActionContext): void | Promise<void>;
}

/** A user-made action. Serializable, so it survives reloads. */
export interface CustomActionDef {
  id: string;
  label: string;
  command?: string;
  icon?: string;
  kind: 'command' | 'send';
  /** A terminal line to run, or text to send in chat. */
  payload: string;
}

interface Persisted {
  order: string[];
  hidden: string[];
  custom: CustomActionDef[];
}

export interface ActionRegistry {
  register(action: Action): void;
  unregister(id: string): void;
  get(id: string): Action | undefined;
  /** Look up by command name or alias, case-insensitively. */
  find(command: string): Action | undefined;
  all(): Action[];
  visible(): Action[];
  hidden(): Action[];
  /** Move within the visible list. */
  reorder(from: number, to: number): void;
  hide(id: string): void;
  show(id: string, at?: number): void;
  addCustom(def: Omit<CustomActionDef, 'id' | 'kind' | 'command'> & { kind?: CustomActionDef['kind'] }): Action;
  removeCustom(id: string): void;
  isCustom(id: string): boolean;
  subscribe(listener: () => void): () => void;
  /** Changes on every mutation; for useSyncExternalStore. */
  version(): number;
}

export function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'action';
}

export function customToAction(def: CustomActionDef): Action {
  return {
    id: def.id,
    label: def.label,
    icon: def.icon,
    command: def.command ?? slugify(def.label),
    description: def.kind === 'send' ? `send "${def.payload}"` : `run "${def.payload}"`,
    run(ctx) {
      const extra = ctx.args.length ? ' ' + ctx.args.join(' ') : '';
      if (def.kind === 'send') ctx.send(def.payload + extra);
      else def.payload.split(';').forEach(line => line.trim() && ctx.runCommand(line.trim() + extra));
    },
  };
}

export function createActionRegistry(options: { actions?: Action[]; storageKey?: string } = {}): ActionRegistry {
  const key = options.storageKey ? `uif:${options.storageKey}:actions` : null;
  const saved: Persisted = key ? loadJSON(key, { order: [], hidden: [], custom: [] }) : { order: [], hidden: [], custom: [] };

  const actions = new Map<string, Action>();
  // `order` holds visible ids, including ones whose action is not registered yet.
  let order = [...saved.order];
  let hiddenIds = [...saved.hidden];
  let custom = [...saved.custom];
  const listeners = new Set<() => void>();
  let ver = 0;

  const persist = () => {
    if (key) saveJSON(key, { order, hidden: hiddenIds, custom } satisfies Persisted);
  };
  const emit = () => {
    ver++;
    persist();
    listeners.forEach(l => l());
  };

  const place = (action: Action) => {
    if (order.includes(action.id) || hiddenIds.includes(action.id)) return;
    if (action.defaultHidden) hiddenIds.push(action.id);
    else order.push(action.id);
  };

  const registry: ActionRegistry = {
    register(action) {
      actions.set(action.id, action);
      place(action);
      emit();
    },
    unregister(id) {
      actions.delete(id);
      emit();
    },
    get: id => actions.get(id),
    find(command) {
      const name = command.toLowerCase();
      for (const a of actions.values()) {
        if (a.command.toLowerCase() === name || a.aliases?.some(al => al.toLowerCase() === name)) return a;
      }
      return undefined;
    },
    all: () => [...actions.values()],
    visible: () => order.map(id => actions.get(id)).filter((a): a is Action => !!a),
    hidden: () => hiddenIds.map(id => actions.get(id)).filter((a): a is Action => !!a),
    reorder(from, to) {
      const vis = registry.visible().map(a => a.id);
      if (from < 0 || from >= vis.length || to < 0 || to >= vis.length || from === to) return;
      const [moved] = vis.splice(from, 1);
      vis.splice(to, 0, moved);
      // Keep ids for unregistered actions where they were.
      const pending = order.filter(id => !actions.has(id));
      order = [...vis, ...pending];
      emit();
    },
    hide(id) {
      if (!order.includes(id)) return;
      order = order.filter(o => o !== id);
      hiddenIds = [...hiddenIds.filter(h => h !== id), id];
      emit();
    },
    show(id, at) {
      hiddenIds = hiddenIds.filter(h => h !== id);
      const vis = registry.visible().map(a => a.id).filter(v => v !== id);
      vis.splice(at ?? vis.length, 0, id);
      order = [...vis, ...order.filter(o => !actions.has(o) && o !== id)];
      emit();
    },
    addCustom(input) {
      const base = slugify(input.label);
      let command = base;
      for (let n = 2; registry.find(command); n++) command = `${base}-${n}`;
      const def: CustomActionDef = {
        id: `custom-${command}-${Date.now().toString(36)}`,
        label: input.label.trim(),
        command,
        icon: input.icon || undefined,
        kind: input.kind ?? 'command',
        payload: input.payload,
      };
      custom = [...custom, def];
      const action = customToAction(def);
      actions.set(action.id, action);
      order.push(action.id);
      emit();
      return action;
    },
    removeCustom(id) {
      custom = custom.filter(c => c.id !== id);
      actions.delete(id);
      order = order.filter(o => o !== id);
      hiddenIds = hiddenIds.filter(h => h !== id);
      emit();
    },
    isCustom: id => custom.some(c => c.id === id),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => ver,
  };

  for (const def of custom) actions.set(def.id, customToAction(def));
  for (const action of options.actions ?? []) {
    actions.set(action.id, action);
    place(action);
  }
  return registry;
}
