import type { DockEdge } from '../types';
import type { Action } from './actions';

const EDGES: DockEdge[] = ['top', 'bottom', 'left', 'right'];

function needOutput(ctx: Parameters<Action['run']>[0], verb: string): string | undefined {
  const id = ctx.outputs.resolve(ctx.args[0]);
  if (!id) ctx.print(`${verb}: no output ${ctx.args[0] ? `"${ctx.args[0]}"` : 'is active'}`, 'err');
  return id;
}

export const builtinActions: Action[] = [
  {
    id: 'spawn',
    label: 'Spawn output',
    command: 'spawn',
    aliases: ['new'],
    icon: '⊞',
    description: 'spawn [title] - open a new output field',
    builtin: true,
    run(ctx) {
      const id = ctx.outputs.spawn(ctx.args.join(' ') || undefined);
      ctx.print(`spawned ${id}`);
    },
  },
  {
    id: 'strings',
    label: 'Strings',
    command: 'strings',
    aliases: ['find'],
    icon: '〰',
    description: 'strings [on|off] - show lines to every output',
    builtin: true,
    run(ctx) {
      const arg = ctx.args[0];
      ctx.setStrings(arg === 'on' ? true : arg === 'off' ? false : 'toggle');
    },
  },
  {
    id: 'home',
    label: 'Call home',
    command: 'home',
    icon: '⌂',
    description: 'home [output|all] - bring outputs back beside the field',
    builtin: true,
    run(ctx) {
      const ref = ctx.args[0];
      if (!ref || ref === 'all') {
        ctx.outputs.callHome('all');
        ctx.print('called all outputs home');
        return;
      }
      const id = needOutput(ctx, 'home');
      if (id) ctx.outputs.callHome(id);
    },
  },
  {
    id: 'dock',
    label: 'Dock',
    command: 'dock',
    icon: '▁',
    description: 'dock [top|bottom|left|right|off] - pin the field to an edge',
    builtin: true,
    run(ctx) {
      const arg = ctx.args[0] as DockEdge | 'off' | undefined;
      if (arg === 'off') return ctx.dock(null);
      if (arg && !EDGES.includes(arg)) return ctx.print(`dock: unknown edge "${arg}"`, 'err');
      ctx.dock(arg ?? (ctx.docked ? null : 'bottom'));
    },
  },
  {
    id: 'popout',
    label: 'Pop out',
    command: 'popout',
    aliases: ['pop'],
    icon: '⧉',
    description: 'popout [output] - move an output into its own window',
    builtin: true,
    defaultHidden: true,
    run(ctx) {
      const id = needOutput(ctx, 'popout');
      if (id) ctx.outputs.popOut(id);
    },
  },
  {
    id: 'close',
    label: 'Close output',
    command: 'close',
    icon: '⊠',
    description: 'close [output] - close an output field',
    builtin: true,
    defaultHidden: true,
    run(ctx) {
      const id = needOutput(ctx, 'close');
      if (id) ctx.outputs.close(id);
    },
  },
  {
    id: 'rename',
    label: 'Rename output',
    command: 'rename',
    icon: '✎',
    description: 'rename <output> <new title> - rename an output field',
    builtin: true,
    defaultHidden: true,
    run(ctx) {
      const [ref, ...rest] = ctx.args;
      const title = rest.join(' ').trim();
      if (!ref || !title) return ctx.print('rename: usage rename <output> <new title>', 'err');
      const id = ctx.outputs.resolve(ref);
      if (!id) return ctx.print(`rename: no output "${ref}"`, 'err');
      ctx.outputs.rename(id, title);
      ctx.print(`renamed ${ref} to ${title}`);
    },
  },
  {
    id: 'ping',
    label: 'Ping output',
    command: 'ping',
    icon: '◎',
    description: 'ping [output] - flash an output so you can find it',
    builtin: true,
    defaultHidden: true,
    run(ctx) {
      const id = needOutput(ctx, 'ping');
      if (id) ctx.outputs.ping(id);
    },
  },
  {
    id: 'outputs',
    label: 'List outputs',
    command: 'outputs',
    aliases: ['ls'],
    icon: '☷',
    description: 'outputs - list output fields',
    builtin: true,
    defaultHidden: true,
    run(ctx) {
      const list = ctx.outputs.list();
      if (!list.length) return ctx.print('no outputs');
      list.forEach((o, i) =>
        ctx.print(`${i + 1}  ${o.id}  ${o.title}  [${o.placement}]${o.id === ctx.outputs.activeId ? '  *' : ''}`),
      );
    },
  },
  {
    id: 'screens',
    label: 'Screens',
    command: 'screens',
    icon: '▭',
    description: 'screens - allow pop-outs to open on other monitors',
    builtin: true,
    defaultHidden: true,
    async run(ctx) {
      await ctx.requestScreens();
    },
  },
  {
    id: 'mode',
    label: 'Toggle mode',
    command: 'mode',
    aliases: ['chat', 't'],
    icon: 'T',
    description: 'mode [chat|terminal] - switch between chat and terminal',
    builtin: true,
    defaultHidden: true,
    run(ctx) {
      const arg = ctx.args[0];
      ctx.setMode(arg === 'chat' ? 'chat' : arg === 'terminal' ? 'terminal' : 'toggle');
    },
  },
  {
    id: 'clear',
    label: 'Clear',
    command: 'clear',
    aliases: ['cls'],
    icon: '⌫',
    description: 'clear [output] - clear the terminal log, or an output',
    builtin: true,
    defaultHidden: true,
    run(ctx) {
      if (!ctx.args[0]) return ctx.clearLog();
      const id = needOutput(ctx, 'clear');
      if (id) ctx.outputs.clear(id);
    },
  },
  {
    id: 'profile',
    label: 'Layouts',
    command: 'profile',
    aliases: ['layout'],
    icon: '▦',
    description: 'profile [list|save <name>|load <name>|delete <name>|export [name]] - saved layouts (.profile)',
    builtin: true,
    defaultHidden: true,
    run(ctx) {
      const [sub = 'list', ...rest] = ctx.args;
      const name = rest.join(' ').trim();
      const { layout } = ctx;
      switch (sub) {
        case 'list': {
          const names = layout.list();
          ctx.print(names.length ? names.map(n => (n === layout.active ? `* ${n}` : `  ${n}`)).join('\n') : 'no saved layouts');
          return;
        }
        case 'save':
          if (!name) return ctx.print('profile: usage profile save <name>', 'err');
          ctx.print(`saved "${layout.save(name).name}"`);
          return;
        case 'load':
          if (!name) return ctx.print('profile: usage profile load <name>', 'err');
          return layout.load(name) ? ctx.print(`loaded "${name}"`) : ctx.print(`profile: no layout "${name}"`, 'err');
        case 'delete':
          return layout.remove(name) ? ctx.print(`deleted "${name}"`) : ctx.print(`profile: no layout "${name}"`, 'err');
        case 'export':
          layout.exportProfile(name || undefined);
          ctx.print(`exported ${name || 'the current layout'}`);
          return;
        default:
          // "profile work" is short for "profile load work".
          return layout.load(ctx.args.join(' ')) ? ctx.print(`loaded "${ctx.args.join(' ')}"`) : ctx.print(`profile: unknown "${sub}"`, 'err');
      }
    },
  },
  {
    id: 'reset',
    label: 'Reset layout',
    command: 'reset',
    icon: '↺',
    description: 'reset - back to the standard layout (saved layouts are kept)',
    builtin: true,
    defaultHidden: true,
    run(ctx) {
      ctx.layout.reset();
      ctx.print('reset to the standard layout');
    },
  },
  {
    id: 'actions',
    label: 'List actions',
    command: 'actions',
    icon: '≡',
    description: 'actions - list every action and its command',
    builtin: true,
    defaultHidden: true,
    run(ctx) {
      const visible = new Set(ctx.registry.visible().map(a => a.id));
      ctx.registry.all().forEach(a =>
        ctx.print(`${visible.has(a.id) ? '●' : '○'} ${a.command.padEnd(10)} ${a.label}`),
      );
    },
  },
  {
    id: 'help',
    label: 'Help',
    command: 'help',
    aliases: ['?'],
    icon: '?',
    description: 'help - list commands',
    builtin: true,
    defaultHidden: true,
    run(ctx) {
      ctx.registry.all().forEach(a => ctx.print(a.description ?? `${a.command} - ${a.label}`));
      ctx.print('hold any button to rearrange; drag it off the bar to hide it');
    },
  },
];
