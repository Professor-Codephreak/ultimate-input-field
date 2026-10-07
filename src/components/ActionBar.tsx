import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Action, ActionRegistry } from '../core/actions';
import { usePressHoldDrag } from '../hooks/usePressHoldDrag';
import { useRegistryVersion } from './UIFContext';

interface ActionBarProps {
  registry: ActionRegistry;
  onRun(action: Action): void;
  /** Actions shown as switched on, such as strings while they are visible. */
  pressed?: Record<string, boolean>;
}

function ActionIcon({ action }: { action: Action }) {
  return <span className="uif-action-icon">{action.icon ?? action.label.slice(0, 1).toUpperCase()}</span>;
}

/** The row of action buttons. Hold a button to rearrange; "+" adds actions. */
export function ActionBar({ registry, onRun, pressed = {} }: ActionBarProps) {
  useRegistryVersion(registry);
  const actions = registry.visible();
  const containerRef = useRef<HTMLDivElement>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { arranging, setArranging, drag, onPointerDown, onKeyDown, guardClick } = usePressHoldDrag({
    containerRef,
    onReorder: (from, to) => registry.reorder(from, to),
    onRemove: index => {
      const action = actions[index];
      if (action) registry.hide(action.id);
    },
  });

  const items: React.ReactNode[] = actions.map((action, index) => (
    <button
      key={action.id}
      type="button"
      data-uif-item={index}
      className={`uif-action ${arranging ? 'is-arranging' : ''} ${drag?.index === index ? 'is-dragged' : ''} ${pressed[action.id] ? 'is-pressed' : ''}`}
      aria-pressed={action.id in pressed ? !!pressed[action.id] : undefined}
      title={`${action.label}  (${action.command})${arranging ? '' : ' - hold to rearrange'}`}
      aria-label={action.label}
      onPointerDown={e => onPointerDown(e, index)}
      onKeyDown={e => onKeyDown(e, index, actions.length)}
      onClick={() => guardClick(() => onRun(action))}
      onContextMenu={e => e.preventDefault()}
    >
      <ActionIcon action={action} />
    </button>
  ));
  if (drag && !drag.outside) {
    // Placeholder at the drop position, counted among the items that are not being dragged.
    const others = items.filter((_, i) => i !== drag.index);
    const at = others[drag.target];
    const slot = at ? items.indexOf(at) : items.length;
    items.splice(slot, 0, <span key="__slot" className="uif-action-slot" style={{ width: drag.width }} />);
  }

  const dragged = drag ? actions[drag.index] : undefined;

  return (
    <div className={`uif-actionbar ${arranging ? 'is-arranging' : ''}`} ref={containerRef} role="toolbar" aria-label="Actions">
      {items}
      {arranging ? (
        <button type="button" className="uif-action uif-action-done" onClick={() => setArranging(false)}>
          Done
        </button>
      ) : (
        <button
          type="button"
          className="uif-action uif-action-add"
          title="Add or arrange actions"
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen(o => !o)}
        >
          +
        </button>
      )}
      {arranging && <span className="uif-arrange-hint">{drag?.outside ? 'release to hide' : 'drag to move · drag off to hide'}</span>}
      {dragged &&
        drag &&
        // Portaled: the field's backdrop-filter would make `position: fixed` relative to the field.
        createPortal(
          <div
            className={`uif-action uif-action-ghost ${drag.outside ? 'is-removing' : ''}`}
            style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width, height: drag.height }}
          >
            <ActionIcon action={dragged} />
          </div>,
        document.body,
      )}
      {paletteOpen && !arranging && (
        <ActionPalette
          registry={registry}
          onArrange={() => {
            setPaletteOpen(false);
            setArranging(true);
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}

function ActionPalette({ registry, onArrange, onClose }: { registry: ActionRegistry; onArrange(): void; onClose(): void }) {
  const hidden = registry.hidden();
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('');
  const [kind, setKind] = useState<'command' | 'send'>('command');
  const [payload, setPayload] = useState('');

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !payload.trim()) return;
    registry.addCustom({ label, icon: icon.trim(), kind, payload: payload.trim() });
    setLabel('');
    setIcon('');
    setPayload('');
  };

  return (
    <div className="uif-palette" onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="uif-palette-row">
        <strong>Actions</strong>
        <button type="button" className="uif-link" onClick={onArrange}>Arrange…</button>
      </div>
      {hidden.length > 0 ? (
        <ul className="uif-palette-list">
          {hidden.map(a => (
            <li key={a.id}>
              <button type="button" className="uif-palette-item" onClick={() => registry.show(a.id)} title="Add to the bar">
                <ActionIcon action={a} />
                <span>{a.label}</span>
                <code>{a.command}</code>
              </button>
              {registry.isCustom(a.id) && (
                <button type="button" className="uif-link" title="Delete this action" onClick={() => registry.removeCustom(a.id)}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="uif-palette-note">Every action is on the bar.</p>
      )}
      <form className="uif-palette-form" onSubmit={add}>
        <strong>New action</strong>
        <div className="uif-palette-fields">
          <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="★" maxLength={2} aria-label="Icon" className="uif-input uif-input-icon" />
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label" aria-label="Label" className="uif-input" autoFocus />
        </div>
        <div className="uif-palette-fields">
          <select value={kind} onChange={e => setKind(e.target.value as 'command' | 'send')} aria-label="Kind" className="uif-input">
            <option value="command">runs command</option>
            <option value="send">sends text</option>
          </select>
          <input
            value={payload}
            onChange={e => setPayload(e.target.value)}
            placeholder={kind === 'command' ? 'spawn logs; strings on' : 'Summarize the last reply'}
            aria-label={kind === 'command' ? 'Command' : 'Text'}
            className="uif-input"
          />
        </div>
        <button type="submit" className="uif-button" disabled={!label.trim() || !payload.trim()}>Add to bar</button>
      </form>
    </div>
  );
}
