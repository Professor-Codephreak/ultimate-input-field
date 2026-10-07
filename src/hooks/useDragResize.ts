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

/** Pointer-driven move and corner resize for a fixed-position panel. */
export function useDragResize(opts: Options) {
  const [position, setPosition] = useState(opts.initialPosition);
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
      if (gesture.kind === 'drag') {
        setPosition({ x: gesture.x + dx, y: gesture.y + dy });
        return;
      }
      const { minWidth, maxWidth, minHeight, maxHeight } = live.current.opts;
      const left = gesture.corner === 'tl' || gesture.corner === 'bl';
      const top = gesture.corner === 'tl' || gesture.corner === 'tr';
      const width = clamp(gesture.width + (left ? -dx : dx), minWidth, maxWidth);
      const height = clamp(gesture.height + (top ? -dy : dy), minHeight, maxHeight);
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
