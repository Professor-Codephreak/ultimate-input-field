import { useEffect, useState } from 'react';
import { UltimateBar } from './components/UltimateBar';
import './demo.css';
import { useUIF } from './components/UIFContext';
import type { Action } from './core/actions';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** A stand-in for a model: streams the reply back word by word. */
async function* echoBot(text: string) {
  await sleep(250);
  for (const word of `You said: ${text}`.split(/(\s+)/)) {
    await sleep(40);
    yield word;
  }
}

const demoActions: Action[] = [
  {
    id: 'demo-time',
    label: 'Time',
    command: 'time',
    icon: '◷',
    description: 'time - print the current time',
    run: ctx => ctx.print(new Date().toLocaleTimeString()),
  },
  {
    id: 'demo-roll',
    label: 'Roll dice',
    command: 'roll',
    icon: '⚄',
    description: 'roll [sides] - roll a die into the active output',
    run(ctx) {
      const sides = Number(ctx.args[0]) || 6;
      const id = ctx.outputs.resolve(undefined) ?? ctx.outputs.spawn('Dice');
      ctx.outputs.append(id, { role: 'system', text: `d${sides} → ${1 + Math.floor(Math.random() * sides)}` });
    },
  },
];

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="demo-module">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>;
}

function OutputCount() {
  const { fields, outputs } = useUIF();
  const away = fields.filter(f => f.placement === 'popout').length;
  return (
    <button type="button" className="demo-module" title="Ping the active output" onClick={() => outputs.activeId && outputs.ping(outputs.activeId)}>
      {fields.length} out{away ? ` · ${away} away` : ''}
    </button>
  );
}

export function App() {
  return (
    <div className="demo-page">
      <p className="demo-hint">
        Hold any action button to rearrange it, or drag it off the bar to hide it. Press <b>T</b> for terminal mode and
        try <code>spawn notes</code>, <code>strings on</code>, <code>popout notes</code>, <code>home all</code>.
      </p>
      <UltimateBar
        storageKey="demo"
        actions={demoActions}
        onSend={text => echoBot(text)}
        left={<Clock />}
        right={<OutputCount />}
        initialSize={{ width: 640, height: 130 }}
      />
    </div>
  );
}
