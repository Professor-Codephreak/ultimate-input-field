import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface Options {
  initialPosition: { x: number; y: number };
  initialSize: { width: number; height: number };
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  draggable?: boolean;
  resizable?: boolean;
  /** Called once when a drag or resize ends. */
  onCommit?: (rect: { x: number; y: number; width: number; height: number }) => void;
}

interface Gesture {
  kind: 'drag' | 'resize';
  corner?: Corner;
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Pixels of a dragged panel that always stay inside the viewport. */
const KEEP_VISIBLE = 60;

/** Pull a position back so the panel can still be grabbed. */
function keepReachable(p: { x: number; y: number }, width: number) {
  return {
    x: clamp(p.x, KEEP_VISIBLE - width, window.innerWidth - KEEP_VISIBLE),
    y: clamp(p.y, 0, window.innerHeight - KEEP_VISIBLE / 2),
  };
}

/** Pointer-driven move and corner resize for a fixed-position panel. */
export function useDragResize(opts: Options) {
  // A saved position may come from a larger window.
  const [position, setPosition] = useState(() => keepReachable(opts.initialPosition, opts.initialSize.width));
  const [size, setSize] = useState(opts.initialSize);
  const [gesture, setGesture] = useState<Gesture | null>(null);

  // The listeners read the latest values through refs, so they subscribe once per gesture.
  const live = useRef({ opts, position, size });
  live.current = { opts, position, size };

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (live.current.opts.draggable === false || e.button !== 0) return;
    const { position: p, size: s } = live.current;
    setGesture({ kind: 'drag', startX: e.clientX, startY: e.clientY, ...p, ...s });
    e.preventDefault();
  }, []);

  const startResize = useCallback((e: React.PointerEvent, corner: Corner) => {
    if (live.current.opts.resizable === false) return;
    const { position: p, size: s } = live.current;
    setGesture({ kind: 'resize', corner, startX: e.clientX, startY: e.clientY, ...p, ...s });
    e.stopPropagation();
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!gesture) return;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - gesture.startX;
      const dy = e.clientY - gesture.startY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (gesture.kind === 'drag') {
        // Keep enough of the panel on screen to grab it again.
        setPosition(keepReachable({ x: gesture.x + dx, y: gesture.y + dy }, gesture.width));
        return;
      }
      const { minWidth, maxWidth, minHeight, maxHeight } = live.current.opts;
      const left = gesture.corner === 'tl' || gesture.corner === 'bl';
      const top = gesture.corner === 'tl' || gesture.corner === 'tr';
      // The edge being moved stops at the viewport edge; the opposite corner stays put.
      const roomX = left ? gesture.x + gesture.width : vw - gesture.x;
      const roomY = top ? gesture.y + gesture.height : vh - gesture.y;
      const width = clamp(gesture.width + (left ? -dx : dx), minWidth, Math.max(minWidth, Math.min(maxWidth, roomX)));
      const height = clamp(gesture.height + (top ? -dy : dy), minHeight, Math.max(minHeight, Math.min(maxHeight, roomY)));
      setSize({ width, height });
      setPosition({
        x: left ? gesture.x + gesture.width - width : gesture.x,
        y: top ? gesture.y + gesture.height - height : gesture.y,
      });
    };
    const up = () => {
      setGesture(null);
      const { position: p, size: s, opts } = live.current;
      opts.onCommit?.({ ...p, ...s });
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
  }, [gesture]);

  // When the window shrinks, bring panels that fell outside it back within reach.
  useEffect(() => {
    const onResize = () =>
      setPosition(p => {
        const next = keepReachable(p, live.current.size.width);
        return next.x === p.x && next.y === p.y ? p : next;
      });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return {
    position,
    size,
    setPosition,
    setSize,
    isDragging: gesture?.kind === 'drag',
    isResizing: gesture?.kind === 'resize',
    startDrag,
    startResize,
  };
}
