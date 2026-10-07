import React, { useEffect, useRef } from 'react';
import type { OutputField as OutputFieldData } from '../types';
import { useDragResize } from '../hooks/useDragResize';
import { useUIF } from './UIFContext';
import { ResizeCorners } from './ResizeCorners';

interface ViewProps {
  field: OutputFieldData;
  active: boolean;
  flash: number;
  popped?: boolean;
  onHeaderPointerDown?: (e: React.PointerEvent) => void;
  onPopOut?: () => void;
  onHome?: () => void;
  onClose: () => void;
}

/** Header and message list, shared by the in-page panel and the pop-out window. */
export function OutputView({ field, active, flash, popped, onHeaderPointerDown, onPopOut, onHome, onClose }: ViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const last = field.messages[field.messages.length - 1];

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [field.messages.length, last?.text]);

  return (
    <>
      {flash > 0 && <div key={flash} className="uif-flash" style={{ '--uif-color': field.color } as React.CSSProperties} />}
      <div className="uif-output-header" onPointerDown={onHeaderPointerDown}>
        <span className="uif-output-dot" style={{ background: field.color }} />
        <span className="uif-output-title">{field.title}</span>
        {active && <span className="uif-output-badge">active</span>}
        <span className="uif-output-buttons" onPointerDown={e => e.stopPropagation()}>
          {onPopOut && (
            <button type="button" title="Pop out to a window" onClick={onPopOut}>⧉</button>
          )}
          {onHome && (
            <button type="button" title={popped ? 'Call home' : 'Back beside the field'} onClick={onHome}>⌂</button>
          )}
          <button type="button" title="Close" onClick={onClose}>✕</button>
        </span>
      </div>
      <div className="uif-output-body" ref={listRef}>
        {field.messages.length === 0 && <div className="uif-output-empty">No messages yet.</div>}
        {field.messages.map(m => (
          <div key={m.id} className={`uif-msg uif-msg-${m.role}`}>
            {m.text}
            {m.pending && <span className="uif-caret">▍</span>}
          </div>
        ))}
      </div>
    </>
  );
}

/** A floating, draggable output panel inside the hub page. */
export function OutputField({ field }: { field: OutputFieldData }) {
  const { outputs, setRect, flashes, raise, zIndexOf } = useUIF();
  const { position, size, setPosition, setSize, startDrag, startResize, isDragging } = useDragResize({
    initialPosition: { x: field.rect.x, y: field.rect.y },
    initialSize: { width: field.rect.width, height: field.rect.height },
    minWidth: 220,
    maxWidth: 1200,
    minHeight: 120,
    maxHeight: 1000,
    onCommit: rect => setRect(field.id, rect),
  });

  // Follow rect changes made elsewhere (call home restacks the panels).
  useEffect(() => {
    setPosition({ x: field.rect.x, y: field.rect.y });
    setSize({ width: field.rect.width, height: field.rect.height });
  }, [field.rect, setPosition, setSize]);

  const active = outputs.activeId === field.id;
  return (
    <div
      className={`uif-output ${active ? 'is-active' : ''} ${isDragging ? 'is-dragging' : ''}`}
      data-uif-output={field.id}
      style={
        {
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
          zIndex: zIndexOf(field.id),
          '--uif-color': field.color,
        } as React.CSSProperties
      }
      onPointerDownCapture={() => {
        outputs.setActive(field.id);
        raise(field.id);
      }}
    >
      <OutputView
        field={field}
        active={active}
        flash={flashes[field.id] ?? 0}
        onHeaderPointerDown={startDrag}
        onPopOut={() => outputs.popOut(field.id)}
        onClose={() => outputs.close(field.id)}
      />
      <ResizeCorners onStart={startResize} />
    </div>
  );
}
