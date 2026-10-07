import React, { useEffect, useMemo, useState } from 'react';
import type { OutputField } from '../types';
import { createBus, KEY_PARAM, OUTPUT_PARAM } from '../core/bus';
import { OutputView } from './OutputField';

/**
 * The page a popped-out output loads (the hub opens `?uif-output=<id>`).
 * Render it instead of your app when `isOutputWindow()` is true.
 */
export function OutputWindow() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const id = params.get(OUTPUT_PARAM) ?? '';
  const bus = useMemo(() => createBus(params.get(KEY_PARAM) ?? 'default'), [params]);
  const [field, setField] = useState<OutputField | null>(null);
  const [active, setActive] = useState(false);
  const [flash, setFlash] = useState(0);
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const off = bus.on(msg => {
      if (msg.type === 'hub:hello') return bus.post({ type: 'out:hello', id });
      if (!('id' in msg) || msg.id !== id) return;
      if (msg.type === 'out:state') {
        setField(msg.field);
        setActive(msg.active);
        setLost(false);
      } else if (msg.type === 'out:home') {
        window.close();
      } else if (msg.type === 'out:ping') {
        setFlash(n => n + 1);
        window.focus();
      }
    });
    bus.post({ type: 'out:hello', id });
    // No event fires when a window moves, so report geometry on a timer.
    let last = '';
    const report = () => {
      const geom = { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight };
      const key = JSON.stringify(geom);
      if (key !== last) {
        last = key;
        bus.post({ type: 'out:geom', id, geom });
      }
    };
    report();
    const timer = setInterval(report, 500);
    const noHub = setTimeout(() => setLost(true), 2000);
    const bye = () => bus.post({ type: 'out:bye', id });
    window.addEventListener('pagehide', bye);
    return () => {
      off();
      clearInterval(timer);
      clearTimeout(noHub);
      window.removeEventListener('pagehide', bye);
      bus.close();
    };
  }, [bus, id]);

  useEffect(() => {
    if (field) document.title = field.title;
  }, [field?.title]);

  if (!field) {
    return (
      <div className="uif-output uif-output-window">
        <div className="uif-output-empty">{lost ? 'The input field this output belongs to is not open.' : 'Connecting…'}</div>
      </div>
    );
  }

  return (
    <div className={`uif-output uif-output-window ${active ? 'is-active' : ''}`} style={{ '--uif-color': field.color } as React.CSSProperties}>
      <OutputView
        field={field}
        active={active}
        flash={flash}
        popped
        onRename={title => bus.post({ type: 'out:request-rename', id, title })}
        onSubmit={text => bus.post({ type: 'out:input', id, text })}
        onRemember={text => bus.post({ type: 'out:remember', id, text })}
        onHome={() => bus.post({ type: 'out:request-home', id })}
        onClose={() => bus.post({ type: 'out:request-close', id })}
      />
    </div>
  );
}
