import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionContext, DockEdge, LogKind, UIFMode, UltimateInputFieldProps } from '../types';
import type { Action } from '../core/actions';
import { parseCommand } from '../core/commands';
import { KEYBOARD_HINT, useDragResize } from '../hooks/useDragResize';
import { Button } from './ui/Button';
import { IconSend, IconTerminal, IconType } from './ui/Icons';
import { ActionBar } from './ActionBar';
import { ResizeCorners } from './ResizeCorners';
import { HUB_KEY, UIFProvider, useOptionalUIF, useUIF } from './UIFContext';
import { loadJSON, saveJSON } from '../core/storage';
import '../styles/UltimateInputField.css';

interface LogLine {
  id: number;
  kind: LogKind;
  text: string;
}

const MAX_LOG = 300;

/** What the field remembers across reloads. */
interface HubState {
  x: number;
  y: number;
  width: number;
  height: number;
  mode: UIFMode;
  docked: DockEdge | null;
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
  const { registry, outputs, strings, setStrings, hubRef, requestScreens, storageKey, raise, zIndexOf, registerSender } = uif;
  const hubKey = `uif:${storageKey}:hub`;
  const [saved] = useState(() => loadJSON<Partial<HubState>>(hubKey, {}));

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
  const [docked, setDocked] = useState<DockEdge | null>(saved.docked ?? null);
  const [isGlowing, setIsGlowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<LogLine | null>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const logSeq = useRef(0);

  const { position, size, setPosition, isDragging, isResizing, startDrag, startResize, onHandleKeyDown } = useDragResize({
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
    saveJSON(hubKey, { x: position.x, y: position.y, width: size.width, height: size.height, mode, docked } satisfies HubState);
  }, [hubKey, position, size, mode, docked, isDragging, isResizing]);

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
      const result = onSend?.(text, { outputId: id });
      if (result === undefined) return;
      if (typeof result === 'string') {
        outputs.append(id, { role: 'assistant', text: result });
        return;
      }
      const mid = outputs.append(id, { role: 'assistant', text: '', pending: true });
      setBusy(true);
      try {
        if (isAsyncIterable(result)) {
          let acc = '';
          for await (const chunk of result) {
            acc += chunk;
            outputs.update(id, mid, { text: acc });
          }
          outputs.update(id, mid, { pending: false });
        } else {
          const reply = await result;
          outputs.update(id, mid, { text: reply ?? '', pending: false });
        }
      } catch (err) {
        outputs.update(id, mid, { text: `Error: ${(err as Error).message ?? err}`, pending: false });
      } finally {
        setBusy(false);
      }
    },
    [onSend, outputs, raise, triggerGlow],
  );

  // Reply boxes on the outputs (in-page and popped out) send through this field.
  useEffect(() => registerSender((text, outputId) => void send(text, outputId)), [registerSender, send]);

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
      requestScreens: async () => print(await requestScreens()),
    }),
    [print, send, mode, setMode, docked, dock, strings, setStrings, outputs, registry, requestScreens],
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
  const containerClasses = [
    'ultimate-input-field',
    isGlowing ? 'animate-glow' : '',
    docked ? `transition-all is-docked docked-${docked}` : '',
    terminal ? 'terminal-glass' : glassEffect ? 'glass-effect' : '',
    terminal ? 'is-terminal' : 'is-chat',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={setHub}
      className={containerClasses}
      style={{ ...dockStyle, width: size.width, height: size.height, minWidth, maxWidth, minHeight, zIndex: zIndexOf(HUB_KEY) }}
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
              <ActionBar
                registry={registry}
                onRun={action => void runAction(action)}
                pressed={{ strings, dock: !!docked }}
              />
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
    </div>
  );
};
