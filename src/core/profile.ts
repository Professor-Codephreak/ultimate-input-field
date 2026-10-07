import type { DockEdge, UIFMode } from '../types';
import type { ActionsLayout, CustomActionDef, Point } from './actions';

/** Where the input field sits and how it is set up. */
export interface HubLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  mode: UIFMode;
  docked: DockEdge | null;
}

/**
 * A saved layout: the `.profile` file. It covers the bar (button order,
 * floating buttons, custom buttons), the input field and the strings toggle.
 * Output panels and their messages are content, not layout, and are left out.
 */
export interface UIFProfile {
  'uif.profile': 1;
  name: string;
  savedAt: string;
  actions: ActionsLayout;
  hub: HubLayout;
  strings: boolean;
}

export const STANDARD_PROFILE = 'standard';
export const PROFILE_EXTENSION = '.profile';

const MODES: UIFMode[] = ['chat', 'terminal'];
const EDGES: DockEdge[] = ['top', 'bottom', 'left', 'right'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function readCustom(v: unknown): CustomActionDef | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.label) || !isStr(v.payload)) return null;
  if (v.kind !== 'command' && v.kind !== 'send') return null;
  return {
    id: v.id,
    label: v.label,
    payload: v.payload,
    kind: v.kind,
    command: isStr(v.command) ? v.command : undefined,
    icon: isStr(v.icon) ? v.icon : undefined,
  };
}

/** Check and normalise untrusted profile data (an imported file). Throws with a reason. */
export function parseProfile(data: unknown, fallbackName = 'imported'): UIFProfile {
  const fail = (why: string): never => {
    throw new Error(`not a valid ${PROFILE_EXTENSION} file: ${why}`);
  };
  if (!isObj(data)) return fail('expected a JSON object');
  if (data['uif.profile'] !== 1) return fail('missing "uif.profile": 1');

  const a = isObj(data.actions) ? data.actions : fail('missing "actions"');
  if (!isStrArray(a.order) || !isStrArray(a.hidden)) return fail('"actions.order" and "actions.hidden" must be string lists');
  const custom = Array.isArray(a.custom) ? a.custom.map(readCustom) : [];
  if (custom.some(c => c === null)) return fail('a custom action is malformed');
  const floating: Record<string, Point> = {};
  if (isObj(a.floating)) {
    for (const [id, p] of Object.entries(a.floating)) {
      if (!isObj(p) || !isNum(p.x) || !isNum(p.y)) return fail(`floating position for "${id}" is malformed`);
      floating[id] = { x: p.x, y: p.y };
    }
  }

  const h = isObj(data.hub) ? data.hub : fail('missing "hub"');
  if (![h.x, h.y, h.width, h.height].every(isNum)) return fail('"hub" needs numeric x, y, width, height');
  const mode = MODES.includes(h.mode as UIFMode) ? (h.mode as UIFMode) : 'chat';
  const docked = EDGES.includes(h.docked as DockEdge) ? (h.docked as DockEdge) : null;

  return {
    'uif.profile': 1,
    name: isStr(data.name) && data.name.trim() ? data.name.trim() : fallbackName,
    savedAt: isStr(data.savedAt) ? data.savedAt : new Date().toISOString(),
    actions: { order: a.order, hidden: a.hidden, custom: custom as CustomActionDef[], floating },
    hub: { x: h.x as number, y: h.y as number, width: h.width as number, height: h.height as number, mode, docked },
    strings: data.strings === true,
  };
}

/** A file name for a profile: `<name>.profile`, safe on every OS. */
export function profileFileName(name: string): string {
  const safe = name.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'layout';
  return safe + PROFILE_EXTENSION;
}

export function serializeProfile(profile: UIFProfile): string {
  return JSON.stringify(profile, null, 2) + '\n';
}
