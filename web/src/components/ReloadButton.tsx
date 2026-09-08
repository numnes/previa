'use client';

import { useEffect, useRef, useState } from 'react';
import { IconRefresh } from './icons';

export const AUTO_RELOAD_INTERVAL_MS = 10_000;

/**
 * Botão de reload que gira o ícone enquanto o `onReload` está em andamento
 * e para assim que a promise resolve/rejeita.
 */
export function ReloadButton({
  onReload,
  title = 'Reload',
  className = '',
  disabled = false,
  intervalMs,
}: {
  onReload: () => void | Promise<void>;
  title?: string;
  className?: string;
  disabled?: boolean;
  /** When set, reloads on this interval with the same busy/spin feedback as a click. */
  intervalMs?: number;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const disabledRef = useRef(disabled);
  const onReloadRef = useRef(onReload);
  disabledRef.current = disabled;
  onReloadRef.current = onReload;

  async function runReload() {
    if (busyRef.current || disabledRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const started = Date.now();
    try {
      await onReloadRef.current();
    } catch {
      // Erros de carregamento são tratados pela página que chamou.
    } finally {
      const wait = 400 - (Date.now() - started);
      if (wait > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, wait));
      }
      busyRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (intervalMs == null || intervalMs <= 0) return;

    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void runReload();
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [intervalMs]);

  return (
    <button
      type="button"
      className={`btn p-2 ${className}`}
      onClick={() => void runReload()}
      disabled={busy || disabled}
      aria-label={title}
      aria-busy={busy}
      title={title}
    >
      <IconRefresh className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
    </button>
  );
}
