import type { ReactNode } from 'react';
import type { Action, ActionRegistry } from './core/actions';

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
}

export interface OutputsApi {
  list(): OutputField[];
  activeId: string | null;
  setActive(id: string): void;
  spawn(title?: string): string;
  close(id: string): void;
  popOut(id: string): void;
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
  requestScreens(): Promise<void>;
}

export interface SendMeta {
  outputId: string;
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
