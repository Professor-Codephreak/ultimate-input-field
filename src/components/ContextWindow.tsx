import React, { useEffect } from 'react';
import type { Rect } from '../types';
import { CONTEXT_INFO, type ContextKind } from '../core/windows';
import { KEYBOARD_HINT, useDragResize } from '../hooks/useDragResize';
import { ResizeCorners } from './ResizeCorners';
import { useUIF } from './UIFContext';

export const WINDOW_SIZE = { width: 420, height: 360 };

interface Props {
  kind: ContextKind;
  rect: Rect;
  onRect(rect: Rect): void;
  onClose(): void;
  /** Extra controls in the title bar (right side). */
  tools?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A window for one context file (.history, .memory, …), built on the drag/resize
 * template: move by the title bar, resize from any corner, arrow keys on the
 * focused title bar, and it comes to the front when pressed.
 */
export function ContextWindow({ kind, rect, onRect, onClose, tools, children }: Props) {
  const { raise, zIndexOf } = useUIF();
  const key = `win:${kind}`;
  const info = CONTEXT_INFO[kind];
  const { position, size, setPosition, setSize, startDrag, startResize, onHandleKeyDown, isDragging } = useDragResize({
    initialPosition: { x: rect.x, y: rect.y },
    initialSize: { width: rect.width, height: rect.height },
    minWidth: 280,
    maxWidth: 1400,
    minHeight: 180,
    maxHeight: 1200,
    onCommit: onRect,
  });

  // Follow rect changes made elsewhere (a profile, or reopening at a new spot).
  useEffect(() => {
    setPosition({ x: rect.x, y: rect.y });
    setSize({ width: rect.width, height: rect.height });
  }, [rect, setPosition, setSize]);

  return (
    <section
      className={`uif-window uif-window-${kind} ${isDragging ? 'is-dragging' : ''}`}
      data-uif-window={kind}
      aria-label={info.file}
      style={{ left: position.x, top: position.y, width: size.width, height: size.height, zIndex: zIndexOf(key) }}
      onPointerDownCapture={() => raise(key)}
      onKeyDown={e => {
        if (e.key === 'Escape' && e.target === e.currentTarget.querySelector('.uif-window-title')) onClose();
      }}
    >
      <header
        className="uif-window-title"
        onPointerDown={startDrag}
        onKeyDown={onHandleKeyDown}
        tabIndex={0}
        aria-label={`${info.file} window. ${KEYBOARD_HINT}. Escape closes.`}
      >
        <span className="uif-window-icon" aria-hidden="true">{info.icon}</span>
        <span className="uif-window-name">{info.file}</span>
        <span className="uif-window-summary">{info.summary}</span>
        <span className="uif-window-tools" onPointerDown={e => e.stopPropagation()}>
          {tools}
          <button type="button" title="Close" aria-label={`Close ${info.file}`} onClick={onClose}>
            ✕
          </button>
        </span>
      </header>
      <div className="uif-window-body">{children}</div>
      <ResizeCorners onStart={startResize} />
    </section>
  );
}
