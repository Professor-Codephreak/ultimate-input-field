import type { ReactNode } from 'react';
import type { Action, ActionRegistry } from './core/actions';
import type { HubArrangement, HubLayout, UIFProfile } from './core/profile';
import type { SendContext } from './core/context';
import type { ContextKind } from './core/windows';

export type UIFMode = 'chat' | 'terminal';
export type DockEdge = 'top' | 'bottom' | 'left' | 'right';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OutputMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  pending?: boolean;
  /** Never read aloud, even in an output with speak on (an engine marks a reply it does not vouch for). */
  silent?: boolean;
}

export interface OutputField {
  id: string;
  title: string;
  color: string;
  placement: 'inline' | 'popout';
  rect: Rect;
  messages: OutputMessage[];
  /** Last reported screen geometry of a popped-out window. */
  screenGeom?: Rect;
  /** Replies in this output are read aloud (speech synthesis, the system's audio output). */
  speak?: boolean;
  /** Shown on another display through the Presentation API (a second screen, a cast device). */
  presented?: boolean;
}

/** Where a spawned output goes besides this page: its own window, a given monitor, a display, the speakers. */
export interface SpawnTarget {
  window?: boolean;
  /** 1-based monitor number (needs screen access: the `screens` command). */
  screen?: number;
  present?: boolean;
  speak?: boolean;
}

export interface ScreenInfoLine {
  index: number;
  label: string;
  primary: boolean;
  current: boolean;
  width: number;
  height: number;
}

export interface OutputsApi {
  list(): OutputField[];
  activeId: string | null;
  setActive(id: string): void;
  spawn(title?: string, target?: SpawnTarget): string;
  close(id: string): void;
  /** Open the output in its own window; with `screen`, on that monitor. Returns a note when something fell back. */
  popOut(id: string, opts?: { screen?: number }): string | void;
  /** Show the output on another display or cast device (Presentation API). Resolves with what happened. */
  present(id: string): Promise<string>;
  /** Read this output's replies aloud, or stop. Returns what happened. */
  setSpeak(id: string, on: boolean): string;
  /** The monitors, once screen access was granted (`screens`); null before. */
  screens(): ScreenInfoLine[] | null;
  callHome(id: string | 'all'): void;
  ping(id: string): void;
  clear(id: string): void;
  rename(id: string, title: string): void;
  append(id: string, message: Omit<OutputMessage, 'id'>): string;
  update(id: string, messageId: string, patch: Partial<OutputMessage>): void;
  /** Resolve an id, a 1-based index or a title to an output id. */
  resolve(ref: string | undefined): string | undefined;
}

export type LogKind = 'cmd' | 'out' | 'err';

/** Named layouts (`.profile`) and the reset to the standard layout. */
export interface LayoutApi {
  /** Saved profile names, sorted. */
  list(): string[];
  /** The profile last saved or loaded, or 'standard' after a reset. */
  active: string | null;
  /** The current layout as a profile, without saving it. */
  capture(name: string): UIFProfile;
  save(name: string): UIFProfile;
  /** Apply a saved profile; 'standard' resets. Returns false when there is no such profile. */
  load(name: string): boolean;
  remove(name: string): boolean;
  /** Back to the standard layout. Saved profiles are kept. */
  reset(): void;
  /** Download a profile as `<name>.profile` (the current layout when no saved name is given). */
  exportProfile(name?: string): void;
  /** Read a `.profile` file's text, save it and apply it. Returns its name; throws when the file is invalid. */
  importProfile(text: string, fileName?: string): string;
}

/** The input field registers this so profiles can read and set its layout. */
export interface HubLayoutHandle {
  get(): HubLayout;
  /** Apply a layout; null means the standard (default) layout. */
  set(layout: HubLayout | null): void;
}

export interface ActionContext {
  args: string[];
  print(text: string, kind?: LogKind): void;
  clearLog(): void;
  send(text: string): void;
  runCommand(line: string): void;
  mode: UIFMode;
  setMode(mode: UIFMode | 'toggle'): void;
  docked: DockEdge | null;
  dock(edge: DockEdge | null): void;
  strings: boolean;
  setStrings(on: boolean | 'toggle'): void;
  outputs: OutputsApi;
  registry: ActionRegistry;
  layout: LayoutApi;
  /** Open, close or toggle the context windows (.history, .memory, .prompt, .persona, .model). */
  windows: { isOpen(kind: ContextKind): boolean; show(kind: ContextKind): void; hide(kind: ContextKind): void; toggle(kind: ContextKind): void };
  /** Add a note to .memory. */
  remember(text: string): Promise<void>;
  /** The button row: part of the field, or isolated as its own floating bar; and how the field is arranged. */
  bar: {
    isolated: boolean;
    isolate(opts?: { vertical?: boolean }): void;
    join(): void;
    arrangement: HubArrangement;
    arrange(a: HubArrangement): void;
  };
  requestScreens(): Promise<void>;
}

export interface SendMeta {
  outputId: string;
  /**
   * The context to call a model with: the composed system prompt
   * (.prompt or the persona's, plus persona lines and the .memory block),
   * ready-made chat `messages` (system, this output's recent exchanges, the
   * new message), and the parsed .persona, .memory and .model.
   */
  context: SendContext;
  /**
   * Add fields to this exchange's .history record, e.g. `{ receipt }` from a
   * verifying engine (bankML's savante.history keeps one per answer). Later
   * calls merge; a field named like a standard one (model, prompt) replaces it.
   */
  annotate(fields: Record<string, unknown>): void;
  /**
   * Change this exchange's reply message while (or after) it streams, e.g. `{ silent: true }` so an output with
   * speak on does not read a reply the engine could not verify. Calls before the reply exists are kept for it.
   */
  markReply(patch: Pick<Partial<OutputMessage>, 'silent'>): void;
}

export type SendResult = void | string | Promise<string | void> | AsyncIterable<string>;

export interface UltimateInputFieldProps extends UIFProviderOptions {
  /** Controlled value. Omit to let the field manage its own text. */
  value?: string;
  onChange?: (value: string) => void;
  /**
   * Called in chat mode. A returned string, promise or async iterable is
   * written (or streamed) into the active output field.
   */
  onSend?: (text: string, meta: SendMeta) => SendResult;
  /** Called for terminal commands that match no action. A returned string is printed. */
  onCommand?: (name: string, args: string[], ctx: ActionContext) => string | void;
  /** Called after any action runs, from a button or a command. */
  onAction?: (action: Action, args: string[]) => void;
  onModeChange?: (mode: UIFMode) => void;
  /** Extra actions to register alongside the built-ins. */
  actions?: Action[];
  isLoading?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Initial mode. `'text'` is accepted as an alias for `'chat'`. */
  mode?: UIFMode | 'text';
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  draggable?: boolean;
  resizable?: boolean;
  dockable?: boolean;
  glowEffect?: boolean;
  glassEffect?: boolean;
  /** Modules rendered on either side of the field (see UltimateBar). */
  left?: ReactNode;
  right?: ReactNode;
}

export interface UIFProviderOptions {
  /** Namespaces localStorage keys and the BroadcastChannel. */
  storageKey?: string;
  /** URL the pop-out windows load. Defaults to the current page. */
  popoutUrl?: string;
  /** Whether tethers and beacons start visible. */
  defaultStrings?: boolean;
}
