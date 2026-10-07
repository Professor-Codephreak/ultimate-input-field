import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createActionRegistry, type Action } from '../actions';
import { parseCommand, tokenize } from '../commands';

const action = (id: string, extra: Partial<Action> = {}): Action => ({ id, label: id, command: id, run: () => {}, ...extra });

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: fakeStorage() });
});

describe('tokenize', () => {
  it('splits on whitespace and keeps quoted runs', () => {
    expect(tokenize(`spawn "my notes"  'a b' c`)).toEqual(['spawn', 'my notes', 'a b', 'c']);
  });
  it('unescapes inside quotes', () => {
    expect(tokenize(`say "he said \\"hi\\""`)).toEqual(['say', 'he said "hi"']);
  });
});

describe('parseCommand', () => {
  const registry = createActionRegistry({ actions: [action('home', { aliases: ['h'] }), action('spawn')] });

  it('resolves commands and aliases case-insensitively', () => {
    expect(parseCommand('HOME all', registry)).toMatchObject({ name: 'HOME', args: ['all'], action: { id: 'home' } });
    expect(parseCommand('h', registry)?.action?.id).toBe('home');
  });
  it('accepts a leading slash', () => {
    expect(parseCommand('/spawn "a b"', registry)).toMatchObject({ args: ['a b'], action: { id: 'spawn' } });
  });
  it('leaves unknown commands without an action', () => {
    const parsed = parseCommand('nope 1', registry);
    expect(parsed).toMatchObject({ name: 'nope', args: ['1'] });
    expect(parsed?.action).toBeUndefined();
  });
  it('returns null for blank lines', () => {
    expect(parseCommand('   ', registry)).toBeNull();
  });
});

describe('action registry', () => {
  it('reorders the visible actions', () => {
    const r = createActionRegistry({ actions: ['a', 'b', 'c', 'd'].map(id => action(id)) });
    r.reorder(0, 2);
    expect(r.visible().map(a => a.id)).toEqual(['b', 'c', 'a', 'd']);
    r.reorder(3, 0);
    expect(r.visible().map(a => a.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('hides and shows actions, honouring defaultHidden', () => {
    const r = createActionRegistry({ actions: [action('a'), action('b'), action('x', { defaultHidden: true })] });
    expect(r.hidden().map(a => a.id)).toEqual(['x']);
    r.hide('a');
    expect(r.visible().map(a => a.id)).toEqual(['b']);
    r.show('x', 0);
    expect(r.visible().map(a => a.id)).toEqual(['x', 'b']);
    expect(r.hidden().map(a => a.id)).toEqual(['a']);
  });

  it('persists order, hidden actions and custom actions across instances', () => {
    const actions = ['a', 'b', 'c'].map(id => action(id));
    const r1 = createActionRegistry({ actions, storageKey: 't' });
    r1.reorder(2, 0);
    r1.hide('b');
    const custom = r1.addCustom({ label: 'Say Hi', payload: 'hello', kind: 'send' });
    expect(custom.command).toBe('say-hi');

    const r2 = createActionRegistry({ actions, storageKey: 't' });
    expect(r2.visible().map(a => a.id)).toEqual(['c', 'a', custom.id]);
    expect(r2.hidden().map(a => a.id)).toEqual(['b']);
    expect(r2.find('say-hi')?.label).toBe('Say Hi');
  });

  it('keeps the place of actions registered after a restore', () => {
    const r1 = createActionRegistry({ actions: [action('a'), action('late')], storageKey: 'k' });
    r1.reorder(1, 0);
    const r2 = createActionRegistry({ actions: [action('a')], storageKey: 'k' });
    r2.register(action('late'));
    expect(r2.visible().map(a => a.id)).toEqual(['late', 'a']);
  });

  it('gives custom actions unique commands', () => {
    const r = createActionRegistry({ actions: [action('notes')] });
    expect(r.addCustom({ label: 'Notes', payload: 'spawn notes' }).command).toBe('notes-2');
  });

  it('runs custom command actions line by line with extra args', () => {
    const r = createActionRegistry();
    const a = r.addCustom({ label: 'Setup', payload: 'spawn logs; strings on' });
    const lines: string[] = [];
    a.run({ args: [], runCommand: (l: string) => lines.push(l) } as never);
    expect(lines).toEqual(['spawn logs', 'strings on']);
  });
});
