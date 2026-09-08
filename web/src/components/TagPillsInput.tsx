'use client';

import { useRef, useState } from 'react';

function splitTokens(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniqueAppend(list: string[], incoming: string[]): string[] {
  const seen = new Set(list.map((n) => n.toLowerCase()));
  const next = [...list];
  for (const name of incoming) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(name);
  }
  return next;
}

export function TagPillsInput({
  id,
  values,
  onChange,
  placeholder,
  disabled,
}: {
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const tokens = splitTokens(raw);
    if (!tokens.length) return;
    onChange(uniqueAppend(values, tokens));
    setDraft('');
  }

  function removeAt(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  return (
    <div
      className="input mt-1.5 flex min-h-[2.75rem] cursor-text flex-wrap items-center gap-1.5 py-1.5"
      onClick={() => inputRef.current?.focus()}
    >
      {values.map((name, index) => (
        <span
          key={`${name.toLowerCase()}-${index}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/15 py-0.5 pl-2.5 pr-1 text-xs font-medium text-sky-100"
        >
          <span className="truncate font-mono">{name}</span>
          <button
            type="button"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-sky-100/80 hover:bg-sky-400/25 hover:text-white disabled:opacity-40"
            aria-label={`Remove ${name}`}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              removeAt(index);
              inputRef.current?.focus();
            }}
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
              <path
                d="M3 3l6 6M9 3L3 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        className="min-w-[7rem] flex-1 bg-transparent py-0.5 font-mono text-sm text-[#e8eaed] outline-none placeholder:text-[#6b7280]"
        value={draft}
        disabled={disabled}
        placeholder={values.length === 0 ? placeholder : ''}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (!/[\n,]/.test(text)) return;
          e.preventDefault();
          commit(`${draft} ${text}`);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit(draft);
            return;
          }
          if (e.key === 'Backspace' && !draft && values.length) {
            e.preventDefault();
            onChange(values.slice(0, -1));
          }
        }}
      />
    </div>
  );
}
