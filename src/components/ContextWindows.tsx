import React, { useEffect, useMemo, useRef, useState } from 'react';
import { commitment, composeSystem, modelLabel, parsePersona, personaLines, setModelField, TASK_CLASSES } from '../core/context';
import { CONTEXT_INFO, CONTEXT_KINDS, type ContextKind } from '../core/windows';
import { ContextWindow } from './ContextWindow';
import type { ContextApi } from './contextStore';
import { useUIF } from './UIFContext';

const ACCEPT: Record<ContextKind, string> = {
  history: '.history,.jsonl,application/json',
  memory: '.memory,.jsonl,application/json',
  prompt: '.prompt,.txt,text/plain',
  persona: '.persona,.json,application/json',
  model: '.model,.yaml,.yml,text/plain',
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Renders whichever context windows are open. */
export function ContextWindows() {
  const { windows } = useUIF();
  return (
    <>
      {CONTEXT_KINDS.filter(k => windows.open[k]).map(kind => (
        <OpenWindow key={kind} kind={kind} />
      ))}
    </>
  );
}

function OpenWindow({ kind }: { kind: ContextKind }) {
  const { windows, context, storageKey } = useUIF();
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileName = `${storageKey}${CONTEXT_INFO[kind].file}`;

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setNote({ text: context.importText(kind, await file.text()) });
    } catch (err) {
      setNote({ text: (err as Error).message, error: true });
    }
  };

  const tools = (
    <>
      <button type="button" title={`Import a ${CONTEXT_INFO[kind].file} file`} aria-label="Import" onClick={() => fileRef.current?.click()}>
        ⤒
      </button>
      <button type="button" title={`Download ${fileName}`} aria-label="Export" onClick={() => download(fileName, context.fileText(kind))}>
        ⤓
      </button>
      <input ref={fileRef} type="file" accept={ACCEPT[kind]} hidden onChange={onFile} data-uif-import={kind} />
    </>
  );

  return (
    <ContextWindow
      kind={kind}
      rect={windows.open[kind]!}
      onRect={r => windows.setRect(kind, r)}
      onClose={() => windows.hide(kind)}
      tools={tools}
    >
      {kind === 'history' && <HistoryBody context={context} />}
      {kind === 'memory' && <MemoryBody context={context} />}
      {kind === 'prompt' && <PromptBody context={context} />}
      {kind === 'persona' && <PersonaBody context={context} />}
      {kind === 'model' && <ModelBody context={context} />}
      {note && (
        <p className={`uif-window-note ${note.error ? 'is-error' : ''}`} role="status">
          {note.text}
        </p>
      )}
    </ContextWindow>
  );
}

/** Records, Merkle root (rfc6962-sha256, as bankml) — shareable, reveals no content. */
function Commitment({ file, lines }: { file: string; lines: string[] }) {
  const [c, setC] = useState<{ records: number; merkle_root: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    commitment(file, lines).then(r => live && setC(r)).catch(() => live && setC(null));
    return () => {
      live = false;
    };
  }, [file, lines]);
  if (!c) return null;
  return (
    <footer className="uif-window-commit" title="Merkle root over the JSONL lines (rfc6962-sha256), the same commitment bankml computes">
      {c.records} record{c.records === 1 ? '' : 's'}
      {c.merkle_root && (
        <>
          {' · root '}
          <code data-uif-root={c.merkle_root}>{c.merkle_root.slice(0, 16)}…</code>
          <button type="button" className="uif-link" onClick={() => navigator.clipboard?.writeText(c.merkle_root!)}>
            copy
          </button>
        </>
      )}
    </footer>
  );
}

/** A button that asks once more before doing something it cannot undo (no browser dialogs). */
function ConfirmButton({ label, onConfirm }: { label: string; onConfirm(): void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`uif-button is-quiet ${armed ? 'is-danger' : ''}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? `Really ${label.toLowerCase()}?` : label}
    </button>
  );
}

function when(ts: number) {
  return new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function HistoryBody({ context }: { context: ContextApi }) {
  const [q, setQ] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = context.history.map((h, i) => ({ h, i }));
    return needle ? all.filter(({ h }) => `${h.user}\n${h.assistant}\n${h.output ?? ''}`.toLowerCase().includes(needle)) : all;
  }, [context.history, q]);
  useEffect(() => {
    const el = listRef.current;
    if (el && !q) el.scrollTop = el.scrollHeight;
  }, [shown.length, q]);

  return (
    <div className="uif-window-stack">
      <div className="uif-window-row">
        <input className="uif-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search .history…" aria-label="Search history" />
        <ConfirmButton label="Clear" onConfirm={context.clearHistory} />
      </div>
      {shown.length === 0 ? (
        <p className="uif-window-empty">{q ? 'Nothing matches.' : 'No exchanges yet. Messages you send in chat are recorded here.'}</p>
      ) : (
        <ol className="uif-history" ref={listRef}>
          {shown.map(({ h, i }) => (
            <li key={i} className="uif-history-item">
              <div className="uif-history-meta">
                {when(h.ts)}
                {h.output && <span> · {h.output}</span>}
                {h.model && <span> · {h.model}</span>}
              </div>
              <div className="uif-msg uif-msg-user">{h.user}</div>
              <div className="uif-msg uif-msg-assistant">{h.assistant}</div>
            </li>
          ))}
        </ol>
      )}
      <Commitment file=".history" lines={context.historyLines} />
    </div>
  );
}

function MemoryBody({ context }: { context: ContextApi }) {
  const [text, setText] = useState('');
  const notes = context.memory.map((n, i) => ({ n, i })).reverse();
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await context.remember(text);
    setText('');
  };
  return (
    <div className="uif-window-stack">
      <form className="uif-window-row" onSubmit={add}>
        <input className="uif-input" value={text} onChange={e => setText(e.target.value)} placeholder="Add a note to remember…" aria-label="New memory note" />
        <button type="submit" className="uif-button" disabled={!text.trim()}>Remember</button>
      </form>
      {notes.length === 0 ? (
        <p className="uif-window-empty">No notes. Add one here, or press ◈ on a reply to keep it.</p>
      ) : (
        <ul className="uif-memory">
          {notes.map(({ n, i }) => (
            <li key={`${n.sha256}-${i}`} className="uif-memory-item">
              <span className={`uif-memory-kind is-${n.source.kind}`} title={n.source.kind === 'response' ? 'kept from a reply' : 'typed'}>
                {n.source.kind === 'response' ? '◈' : '✎'}
              </span>
              <span className="uif-memory-text">{n.text}</span>
              <button type="button" className="uif-link" title="Forget this note" aria-label="Forget" onClick={() => context.forget(i)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="uif-window-row is-end">
        <span className="uif-window-hint">Sent with every message, newest first, up to 2,400 characters.</span>
        <ConfirmButton label="Clear" onConfirm={context.clearMemory} />
      </div>
      <Commitment file=".memory" lines={context.memoryLines} />
    </div>
  );
}

function PromptBody({ context }: { context: ContextApi }) {
  const [preview, setPreview] = useState(false);
  const hasPersonaPrompt = !!context.persona?.system_prompt?.trim();
  const composed = composeSystem({ prompt: context.prompt, persona: context.persona, source: context.promptSource, memory: context.memory });
  return (
    <div className="uif-window-stack">
      <textarea
        className="uif-input uif-window-text"
        value={context.prompt}
        onChange={e => context.setPrompt(e.target.value)}
        placeholder="You are … (the system prompt sent with every message)"
        aria-label="System prompt"
        spellCheck
      />
      <fieldset className="uif-window-choice">
        <legend>When the persona has its own system prompt</legend>
        <label>
          <input type="radio" name="uif-prompt-source" checked={context.promptSource === 'persona'} onChange={() => context.setPromptSource('persona')} />
          use the persona's{hasPersonaPrompt ? '' : ' (none set)'}
        </label>
        <label>
          <input type="radio" name="uif-prompt-source" checked={context.promptSource === 'prompt'} onChange={() => context.setPromptSource('prompt')} />
          use this .prompt
        </label>
      </fieldset>
      <button type="button" className="uif-link is-left" onClick={() => setPreview(p => !p)} aria-expanded={preview}>
        {preview ? '▾' : '▸'} What the model receives ({composed.promptSource}
        {context.memory.length ? ' + memory' : ''})
      </button>
      {preview && <pre className="uif-window-preview">{composed.system || '(empty: no system prompt)'}</pre>}
    </div>
  );
}

function PersonaBody({ context }: { context: ContextApi }) {
  const [draft, setDraft] = useState(context.personaText);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(context.personaText), [context.personaText]);
  const p = context.persona;
  const dirty = draft !== context.personaText;

  const check = (text: string) => {
    setDraft(text);
    if (!text.trim()) return setError(null);
    try {
      parsePersona(text);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const apply = () => {
    try {
      context.setPersonaText(draft);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="uif-window-stack">
      {p ? (
        <div className="uif-persona-card">
          <strong>{p.name ?? p.persona ?? 'Unnamed persona'}</strong>
          {p.role && <span className="uif-persona-role">{p.role}</span>}
          {p.description && <p>{p.description}</p>}
          {personaLines(p).map(l => (
            <p key={l} className="uif-persona-line">{l}</p>
          ))}
          <p className="uif-window-hint">{p.system_prompt ? 'Has its own system prompt.' : 'No system prompt of its own; the .prompt is used.'}</p>
        </div>
      ) : (
        <p className="uif-window-empty">No persona. Import a .persona file (mindX v1 or boardroom) or paste its JSON below.</p>
      )}
      <textarea
        className={`uif-input uif-window-text is-code ${error ? 'is-invalid' : ''}`}
        value={draft}
        onChange={e => check(e.target.value)}
        placeholder='{ "name": "Savante", "system_prompt": "You are …" }'
        aria-label="Persona JSON"
        aria-invalid={!!error}
        spellCheck={false}
      />
      {error && <p className="uif-window-note is-error">{error}</p>}
      <div className="uif-window-row is-end">
        <button type="button" className="uif-button is-quiet" disabled={!dirty} onClick={() => check(context.personaText)}>
          Revert
        </button>
        <button type="button" className="uif-button" disabled={!dirty || !!error} onClick={apply}>
          {draft.trim() ? 'Apply' : 'Clear persona'}
        </button>
      </div>
    </div>
  );
}

function ModelBody({ context }: { context: ContextApi }) {
  const m = context.model;
  const set = (key: string, value: string | boolean) => context.setModelText(setModelField(context.modelText, key, value));
  return (
    <div className="uif-window-stack">
      <div className="uif-model-grid">
        <label>
          logical_model
          <input className="uif-input" value={String(m.logical_model ?? '')} onChange={e => set('logical_model', e.target.value || 'auto')} />
        </label>
        <label>
          task_class
          <select className="uif-input" value={String(m.task_class ?? 'general')} onChange={e => set('task_class', e.target.value)}>
            {TASK_CLASSES.map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          model_facet
          <input className="uif-input" value={String(m.model_facet ?? '')} onChange={e => set('model_facet', e.target.value)} />
        </label>
        <label className="uif-model-pin">
          <input type="checkbox" checked={m.pinned === true} onChange={e => set('pinned', e.target.checked)} />
          pinned
        </label>
      </div>
      <p className="uif-window-hint">
        {context.modelError ? <span className="is-error">{context.modelError}</span> : <>Messages go out as <b>{modelLabel(m)}</b>. Your onSend reads this from meta.context.model.</>}
      </p>
      <textarea
        className={`uif-input uif-window-text is-code ${context.modelError ? 'is-invalid' : ''}`}
        value={context.modelText}
        onChange={e => context.setModelText(e.target.value)}
        aria-label=".model YAML"
        spellCheck={false}
      />
    </div>
  );
}
