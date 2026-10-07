import { useEffect, useRef, useState } from 'react';
import { CONTEXT_INFO, CONTEXT_KINDS } from '../core/windows';
import { useUIF } from './UIFContext';

/** The field's Windows menu: opens .history, .memory, .prompt, .persona and .model. */
export function WindowsMenu() {
  const { windows, context } = useUIF();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const detail: Record<string, string> = {
    history: `${context.history.length} exchange${context.history.length === 1 ? '' : 's'}`,
    memory: `${context.memory.length} note${context.memory.length === 1 ? '' : 's'}`,
    prompt: context.prompt.trim() ? `${context.prompt.trim().length} chars` : 'empty',
    persona: context.persona ? String(context.persona.name ?? context.persona.persona ?? 'set') : 'none',
    model: String(context.model.logical_model ?? 'auto'),
  };

  return (
    <div className="uif-windows-menu" ref={ref}>
      <button
        type="button"
        className={`uif-windows-toggle ${open ? 'is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Windows"
        title="Windows: .history .memory .prompt .persona .model"
        onClick={() => setOpen(o => !o)}
      >
        ▤
      </button>
      {open && (
        <div className="uif-windows-list" role="menu" aria-label="Windows" onKeyDown={e => e.key === 'Escape' && setOpen(false)}>
          {CONTEXT_KINDS.map(kind => (
            <button
              key={kind}
              type="button"
              role="menuitemcheckbox"
              aria-checked={windows.isOpen(kind)}
              className={`uif-windows-item ${windows.isOpen(kind) ? 'is-open' : ''}`}
              onClick={() => {
                windows.toggle(kind);
                setOpen(false);
              }}
            >
              <span className="uif-windows-icon" aria-hidden="true">{CONTEXT_INFO[kind].icon}</span>
              <span className="uif-windows-file">{CONTEXT_INFO[kind].file}</span>
              <span className="uif-windows-detail">{detail[kind]}</span>
              <span className="uif-windows-check" aria-hidden="true">{windows.isOpen(kind) ? '●' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
