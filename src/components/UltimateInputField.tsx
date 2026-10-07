import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionContext, DockEdge, LogKind, OutputMessage, UIFMode, UltimateInputFieldProps } from '../types';
import type { Action } from '../core/actions';
import { parseCommand } from '../core/commands';
import { KEYBOARD_HINT, useDragResize } from '../hooks/useDragResize';
import { Button } from './ui/Button';
import { IconSend, IconTerminal, IconType } from './ui/Icons';
import { ActionBar } from './ActionBar';
import { ResizeCorners } from './ResizeCorners';
import { WindowsMenu } from './WindowsMenu';
import { HUB_KEY, UIFProvider, useOptionalUIF, useUIF } from './UIFContext';
import { loadJSON, saveJSON } from '../core/storage';
import type { HubArrangement, HubLayout, IsolatedBar as IsolatedBarState } from '../core/profile';
import { useHoldDrag } from '../hooks/useHoldDrag';
import { IsolatedBar } from './IsolatedBar';
import { createPortal } from 'react-dom';
import { modelLabel } from '../core/context';
import { CONTEXT_KINDS } from '../core/windows';
import '../styles/UltimateInputField.css';

interface LogLine {
  id: number;
  kind: LogKind;
  text: string;
}

const MAX_LOG = 300;

/** Below this height the input and the button row cannot both have a full row: the field goes sideways. */
const STACK_MIN = 104;
/** A narrow viewport, or a touch screen that is not wide: a handheld. */
const HANDHELD_QUERY = '(max-width: 640px), (pointer: coarse) and (max-width: 900px)';

function useViewport() {
  const read = () => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    handheld: typeof window !== 'undefined' && !!window.matchMedia?.(HANDHELD_QUERY).matches,
  });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}


function isAsyncIterable(v: unknown): v is AsyncIterable<string> {
  return !!v && typeof (v as AsyncIterable<string>)[Symbol.asyncIterator] === 'function';
}

/**
 * The hub of the bar: chat input, T terminal, extensible action buttons.
 * Works on its own, or inside <UltimateBar>/<UIFProvider> to share outputs.
 */
export const UltimateInputField: React.FC<UltimateInputFieldProps> = props => {
  const ctx = useOptionalUIF();
  if (ctx) return <HubField {...props} />;
  return (
    <UIFProvider storageKey={props.storageKey} popoutUrl={props.popoutUrl} defaultStrings={props.defaultStrings}>
      <HubField {...props} />
    </UIFProvider>
  );
};

const HubField: React.FC<UltimateInputFieldProps> = ({
  value: controlledValue,
  onChange,
  onSend,
  onCommand,
  onAction,
  onModeChange,
  actions: extraActions,
  isLoading: externalLoading = false,
  className = '',
  placeholder,
  disabled = false,
  mode: initialMode = 'chat',
  initialPosition,
  initialSize = { width: 600, height: 120 },
  minWidth = 300,
  maxWidth = 800,
  minHeight = 60,
  maxHeight = 400,
  draggable = true,
  resizable = true,
  dockable = true,
  glowEffect = true,
  glassEffect = true,
  left,
  right,
}) => {
  const uif = useUIF();
  const {
    registry,
    outputs,
    strings,
    setStrings,
    hubRef,
    requestScreens,
    storageKey,
    raise,
    zIndexOf,
    registerSender,
    layout,
    registerHubLayout,
    context: contextStore,
  } = uif;
  const hubKey = `uif:${storageKey}:hub`;
  const [saved] = useState(() => loadJSON<Partial<HubLayout>>(hubKey, {}));

  const [innerValue, setInnerValue] = useState('');
  const value = controlledValue ?? innerValue;
  const setValue = useCallback(
    (v: string) => {
      if (controlledValue === undefined) setInnerValue(v);
      onChange?.(v);
    },
    [controlledValue, onChange],
  );

  const [mode, setModeState] = useState<UIFMode>(saved.mode ?? (initialMode === 'text' ? 'chat' : initialMode));
  // a handheld with nothing saved starts docked at the bottom, full width
  const [docked, setDocked] = useState<DockEdge | null>(
    saved.docked !== undefined ? saved.docked : typeof window !== 'undefined' && window.matchMedia?.(HANDHELD_QUERY).matches && dockable ? 'bottom' : null,
  );
  const [arrangement, setArrangement] = useState<HubArrangement>(saved.arrange ?? 'auto');
  const [isolated, setIsolated] = useState<IsolatedBarState | null>(saved.isolated ?? null);
  const viewport = useViewport();
  const [isGlowing, setIsGlowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<LogLine | null>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const logSeq = useRef(0);

  const { position, size, setPosition, setSize, isDragging, isResizing, startDrag, startResize, onHandleKeyDown } = useDragResize({
    initialPosition:
      saved.x !== undefined && saved.y !== undefined
        ? { x: saved.x, y: saved.y }
        : initialPosition ?? {
            x: window.innerWidth / 2 - initialSize.width / 2,
            y: window.innerHeight / 2 - initialSize.height / 2,
          },
    initialSize: saved.width && saved.height ? { width: saved.width, height: saved.height } : initialSize,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    draggable: draggable && !docked,
    resizable,
  });

  // Remember where the field is and how it is set up. Skipped while a gesture is in progress.
  useEffect(() => {
    if (isDragging || isResizing) return;
    saveJSON(hubKey, { x: position.x, y: position.y, width: size.width, height: size.height, mode, docked, arrange: arrangement, isolated } satisfies HubLayout);
  }, [hubKey, position, size, mode, docked, arrangement, isolated, isDragging, isResizing]);

  // Actions passed as props join the shared registry while this field is mounted.
  useEffect(() => {
    extraActions?.forEach(a => registry.register(a));
    return () => extraActions?.forEach(a => registry.unregister(a.id));
  }, [extraActions, registry]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(t);
  }, [status]);

  const print = useCallback((text: string, kind: LogKind = 'out') => {
    const line = { id: logSeq.current++, kind, text };
    setLog(prev => [...prev.slice(-MAX_LOG + 1), line]);
    if (kind !== 'cmd') setStatus(line);
  }, []);

  const triggerGlow = useCallback(() => {
    if (!glowEffect) return;
    setIsGlowing(true);
    setTimeout(() => setIsGlowing(false), 500);
  }, [glowEffect]);

  const setMode = useCallback(
    (next: UIFMode | 'toggle') => {
      setModeState(prev => {
        const m = next === 'toggle' ? (prev === 'chat' ? 'terminal' : 'chat') : next;
        if (m !== prev) onModeChange?.(m);
        return m;
      });
    },
    [onModeChange],
  );

  const dock = useCallback(
    (edge: DockEdge | null) => {
      if (!dockable) return;
      setDocked(edge);
      if (edge === null) {
        setPosition({ x: window.innerWidth / 2 - size.width / 2, y: window.innerHeight / 2 - size.height / 2 });
      }
    },
    [dockable, setPosition, size.width, size.height],
  );

  const send = useCallback(
    async (text: string, target?: string) => {
      if (!text.trim()) return;
      // "@notes hello" goes to the output called notes, which is opened if it does not exist yet.
      const routed = target ? null : /^@(\S+)\s+([\s\S]+)$/.exec(text);
      let id: string | undefined = target;
      if (id) {
        outputs.setActive(id);
      } else if (routed) {
        text = routed[2];
        id = outputs.resolve(routed[1]) ?? outputs.spawn(routed[1]);
        outputs.setActive(id);
        raise(id);
      } else {
        id = outputs.resolve(undefined) ?? outputs.spawn();
      }
      outputs.append(id, { role: 'user', text });
      triggerGlow();
      const context = contextStore.forSend(text, id);
      const outputId = id;
      const extra: Record<string, unknown> = {};
      // Each finished exchange goes into .history (bankml's record shape, plus the output it was in).
      const record = (reply: string) =>
        reply &&
        contextStore.appendHistory({
          ts: Date.now() / 1000,
          session: storageKey,
          output: outputs.list().find(f => f.id === outputId)?.title,
          output_id: outputId,
          user: text,
          assistant: reply,
          prompt: context.promptSource,
          model: modelLabel(context.model),
          ...extra,
        });
      // what the engine says about its own reply (e.g. silent), applied when the reply message exists
      const replyMarks: Pick<Partial<OutputMessage>, 'silent'> = {};
      let replyId: string | null = null;
      const markReply = (patch: Pick<Partial<OutputMessage>, 'silent'>) => {
        Object.assign(replyMarks, patch);
        if (replyId) outputs.update(outputId, replyId, patch);
      };
      const result = onSend?.(text, { outputId: id, context, annotate: fields => Object.assign(extra, fields), markReply });
      if (result === undefined) return;
      if (typeof result === 'string') {
        outputs.append(id, { role: 'assistant', text: result, ...replyMarks });
        record(result);
        return;
      }
      const mid = outputs.append(id, { role: 'assistant', text: '', pending: true, ...replyMarks });
      replyId = mid;
      setBusy(true);
      try {
        if (isAsyncIterable(result)) {
          let acc = '';
          for await (const chunk of result) {
            acc += chunk;
            outputs.update(id, mid, { text: acc });
          }
          outputs.update(id, mid, { pending: false });
          record(acc);
        } else {
          const reply = await result;
          outputs.update(id, mid, { text: reply ?? '', pending: false });
          record(reply ?? '');
        }
      } catch (err) {
        outputs.update(id, mid, { text: `Error: ${(err as Error).message ?? err}`, pending: false });
      } finally {
        setBusy(false);
      }
    },
    [onSend, outputs, raise, triggerGlow, contextStore, storageKey],
  );

  // Reply boxes on the outputs (in-page and popped out) send through this field.
  useEffect(() => registerSender((text, outputId) => void send(text, outputId)), [registerSender, send]);

  // Profiles read and apply the field's layout through this handle.
  const hubLive = useRef({ position, size, mode, docked, arrangement, isolated });
  hubLive.current = { position, size, mode, docked, arrangement, isolated };
  const standardMode: UIFMode = initialMode === 'text' ? 'chat' : initialMode;
  useEffect(
    () =>
      registerHubLayout({
        get: () => {
          const h = hubLive.current;
          return { ...h.position, ...h.size, mode: h.mode, docked: h.docked, arrange: h.arrangement, isolated: h.isolated };
        },
        set: next => {
          const l = next ?? {
            ...(initialPosition ?? {
              x: window.innerWidth / 2 - initialSize.width / 2,
              y: window.innerHeight / 2 - initialSize.height / 2,
            }),
            ...initialSize,
            mode: standardMode,
            docked: null,
            arrange: 'auto' as HubArrangement,
            isolated: null,
          };
          setSize({ width: l.width, height: l.height });
          setPosition({
            x: Math.max(60 - l.width, Math.min(l.x, window.innerWidth - 60)),
            y: Math.max(0, Math.min(l.y, window.innerHeight - 30)),
          });
          setDocked(dockable ? l.docked : null);
          setMode(l.mode);
          setArrangement(l.arrange ?? 'auto');
          setIsolated(l.isolated ?? null);
        },
      }),
    [registerHubLayout, initialPosition, initialSize, standardMode, setPosition, setSize, setMode, dockable],
  );

  /** Take the button row out of the field; it floats just above the field unless told where. */
  const barRef = useRef<HTMLDivElement>(null);
  const isolateBar = useCallback(
    (vertical: boolean, at?: { x: number; y: number }) => {
      const hub = hubRef.current?.getBoundingClientRect();
      const x = at?.x ?? (hub ? hub.left : 16);
      const y = at?.y ?? (hub ? Math.max(8, hub.top - 56) : 16);
      setIsolated({ x: Math.round(Math.max(0, x)), y: Math.round(Math.max(0, y)), vertical });
    },
    [hubRef],
  );
  // press and hold the grip, drag the row out of the field and drop it anywhere: it floats there
  const grip = useHoldDrag({
    onDrop: p => {
      const hub = hubRef.current?.getBoundingClientRect();
      const inside = hub && p.x >= hub.left - 24 && p.x <= hub.right + 24 && p.y >= hub.top - 24 && p.y <= hub.bottom + 24;
      if (!inside) isolateBar(false, { x: p.x - p.offsetX, y: p.y - p.offsetY });
    },
    onTap: () => print('hold the grip, then drag the button row out of the field (or type: isolate)'),
  });

  // runCommand and runAction call each other (custom actions run command lines).
  const runCommandRef = useRef<(line: string) => void>(() => {});

  const makeContext = useCallback(
    (args: string[]): ActionContext => ({
      args,
      print,
      clearLog: () => setLog([]),
      send: text => void send(text),
      runCommand: line => runCommandRef.current(line),
      mode,
      setMode,
      docked,
      dock,
      strings,
      setStrings,
      outputs,
      registry,
      layout,
      windows: uif.windows,
      remember: text => contextStore.remember(text),
      bar: {
        isolated: !!isolated,
        isolate: opts => isolateBar(opts?.vertical ?? false),
        join: () => setIsolated(null),
        arrangement,
        arrange: setArrangement,
      },
      requestScreens: async () => print(await requestScreens()),
    }),
    [print, send, mode, setMode, docked, dock, strings, setStrings, outputs, registry, layout, uif.windows, contextStore, requestScreens, isolated, arrangement, isolateBar],
  );

  const runAction = useCallback(
    async (action: Action, args: string[] = []) => {
      try {
        await action.run(makeContext(args));
        onAction?.(action, args);
      } catch (err) {
        print(`${action.command}: ${(err as Error).message ?? err}`, 'err');
      }
    },
    [makeContext, onAction, print],
  );

  const runCommand = useCallback(
    (line: string) => {
      print(`❯ ${line}`, 'cmd');
      const parsed = parseCommand(line, registry);
      if (!parsed) return;
      if (parsed.action) return void runAction(parsed.action, parsed.args);
      const handled = onCommand?.(parsed.name, parsed.args, makeContext(parsed.args));
      if (typeof handled === 'string') print(handled);
      else if (!onCommand) print(`unknown command: ${parsed.name} (try help)`, 'err');
    },
    [makeContext, onCommand, print, registry, runAction],
  );
  runCommandRef.current = runCommand;

  const submit = () => {
    const text = value;
    if (!text.trim()) return;
    if (mode === 'terminal' || text.startsWith('/')) {
      history.current = [...history.current.filter(h => h !== text), text].slice(-100);
      historyIndex.current = -1;
      runCommand(text.trim());
      triggerGlow();
    } else {
      void send(text);
    }
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    if (mode !== 'terminal' || value.includes('\n') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const h = history.current;
    if (!h.length) return;
    e.preventDefault();
    let i = historyIndex.current;
    if (e.key === 'ArrowUp') i = i === -1 ? h.length - 1 : Math.max(0, i - 1);
    else i = i === -1 ? -1 : i + 1 >= h.length ? -1 : i + 1;
    historyIndex.current = i;
    setValue(i === -1 ? '' : h[i]);
  };

  const setHub = useCallback(
    (el: HTMLDivElement | null) => {
      hubRef.current = el;
    },
    [hubRef],
  );

  let dockStyle: React.CSSProperties = { left: position.x, top: position.y };
  if (docked === 'top') dockStyle = { top: 0, left: '50%', transform: 'translateX(-50%)' };
  if (docked === 'bottom') dockStyle = { bottom: 0, left: '50%', transform: 'translateX(-50%)' };
  if (docked === 'left') dockStyle = { left: 0, top: '50%', transform: 'translateY(-50%)' };
  if (docked === 'right') dockStyle = { right: 0, top: '50%', transform: 'translateY(-50%)' };

  const isLoading = externalLoading || busy;
  const terminal = mode === 'terminal';
  const sideways = arrangement === 'sideways' || (arrangement === 'auto' && size.height < STACK_MIN);
  const fitW = Math.max(200, viewport.width - 16);
  const containerClasses = [
    'ultimate-input-field',
    isGlowing ? 'animate-glow' : '',
    docked ? `transition-all is-docked docked-${docked}` : '',
    terminal ? 'terminal-glass' : glassEffect ? 'glass-effect' : '',
    terminal ? 'is-terminal' : 'is-chat',
    sideways ? 'is-sideways' : 'is-stacked',
    viewport.handheld ? 'is-handheld' : '',
    isolated ? 'has-isolated-bar' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const actionBar = (vertical: boolean) => (
    <ActionBar
      registry={registry}
      layout={layout}
      onRun={action => void runAction(action)}
      vertical={vertical}
      pressed={{
        strings,
        dock: !!docked,
        ...Object.fromEntries(CONTEXT_KINDS.map(k => [`win-${k}`, uif.windows.isOpen(k)])),
      }}
    />
  );

  return (
    <div
      ref={setHub}
      className={containerClasses}
      style={{
        ...dockStyle,
        width: Math.min(size.width, fitW),
        height: size.height,
        minWidth: Math.min(minWidth, fitW),
        maxWidth: Math.min(maxWidth, fitW),
        minHeight,
        zIndex: zIndexOf(HUB_KEY),
      }}
      onPointerDownCapture={() => raise(HUB_KEY)}
    >
      {terminal && (
        <div className="uif-termlog" ref={logRef} role="log" aria-live="polite">
          {log.length === 0 && <div className="uif-termline is-dim">T mode: type a command, or help</div>}
          {log.map(l => (
            <div key={l.id} className={`uif-termline is-${l.kind}`}>
              {l.text}
            </div>
          ))}
        </div>
      )}

      {draggable && !docked && (
        <div
          className={`drag-handle ${isDragging ? 'dragging' : ''}`}
          onPointerDown={startDrag}
          onKeyDown={onHandleKeyDown}
          tabIndex={0}
          role="group"
          aria-label={`Input field. ${KEYBOARD_HINT}`}
          title={KEYBOARD_HINT}
        >
          <div className="drag-indicator" />
        </div>
      )}

      <div className="uif-row">
        {left && <div className="uif-modules uif-modules-left">{left}</div>}
        <div className="uif-core">
          <div className="uif-prompt">
            {terminal && <span className="uif-prompt-sigil">❯</span>}
            <textarea
              ref={textareaRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || (terminal ? 'Enter command… (help)' : 'Message…  @output to target · /command to run')}
              disabled={disabled}
              spellCheck={!terminal}
              className={`ultimate-textarea ${terminal ? 'terminal-mode' : 'text-mode'} ${isDragging ? 'pointer-events-none' : ''}`}
            />
          </div>
          <div className="ultimate-controls">
            <div className="ultimate-controls-left">
              <Button
                variant="ghost"
                size="icon"
                className={`uif-mode-toggle ${terminal ? 'is-terminal' : ''}`}
                onClick={() => setMode('toggle')}
                type="button"
                title={terminal ? 'Switch to chat' : 'Switch to T terminal mode'}
                aria-label={terminal ? 'Switch to chat' : 'Switch to terminal mode'}
              >
                {terminal ? <IconType /> : <IconTerminal />}
              </Button>
              <WindowsMenu />
              {!isolated && (
                <>
                  <button
                    type="button"
                    className={`uif-bar-grip ${grip.dragging ? 'is-dragging' : ''}`}
                    onPointerDown={grip.onPointerDown}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        isolateBar(false);
                      }
                    }}
                    title="Hold, then drag the button row out of the field"
                    aria-label="Button row: hold and drag to take it out of the field (Enter does it)"
                  >
                    ⠿
                  </button>
                  <div className="uif-bar-slot" ref={barRef}>
                    {actionBar(false)}
                  </div>
                </>
              )}
            </div>
            {status && !terminal && <span className={`uif-status is-${status.kind}`}>{status.text}</span>}
            <Button
              variant="default"
              size="icon"
              className="uif-send"
              onClick={submit}
              disabled={disabled || (isLoading && !terminal) || !value.trim()}
              type="button"
              aria-label={terminal ? 'Run' : 'Send'}
            >
              <IconSend />
            </Button>
          </div>
        </div>
        {right && <div className="uif-modules uif-modules-right">{right}</div>}
      </div>

      {!docked && resizable && <ResizeCorners onStart={startResize} />}

      {isolated && (
        <IsolatedBar state={isolated} onChange={setIsolated}>
          {actionBar(isolated.vertical)}
        </IsolatedBar>
      )}
      {grip.dragging &&
        createPortal(
          <div
            className="uif-bar-ghost"
            style={{
              left: grip.dragging.x - grip.dragging.offsetX,
              top: grip.dragging.y - grip.dragging.offsetY,
              width: barRef.current?.offsetWidth ?? 200,
            }}
          >
            button row
          </div>,
          document.body,
        )}
    </div>
  );
};
