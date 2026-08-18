'use client';

import { ClientTable } from '@/components/ClientTable';
import { useEffect, useMemo, useState } from 'react';
import {
  createApiKey,
  listApiKeys,
  type ApiKeyRow,
} from './::handlers/api-keys';

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [label, setLabel] = useState('');

  const canCreate = useMemo(() => !creating, [creating]);

  async function refresh() {
    const data = await listApiKeys();
    setKeys(data);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listApiKeys();
        if (!alive) return;
        setKeys(data);
      } catch {
        if (!alive) return;
        setError('Could not load API keys.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section>
      <h2 className="text-sm font-medium text-[#e8eaed]">API keys</h2>
      <p className="mt-1 text-xs text-[#8b919a]">
        Generate keys for GitHub Actions (header <span className="font-mono">X-Previa-Api-Key</span>).
      </p>

      <div className="mt-4">
        {newKey ? (
          <div className="rounded-2xl border border-sky-200/30 bg-sky-200/10 p-4">
            <div className="font-bold">New key generated</div>
            <div className="mt-1.5 text-sm text-white/70">
              Copy now and save it in GitHub Secrets.
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-sm">
              {newKey}
            </div>
          </div>
        ) : null}

        {error ? <div className="alert-error mb-3 mt-3">{error}</div> : null}

        <form
          className="mt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setNewKey(null);
            if (!canCreate) return;
            setCreating(true);
            try {
              const data = await createApiKey(label.trim() || undefined);
              setNewKey(data.apiKey);
              setLabel('');
              await refresh();
            } catch {
              setError('Could not generate key.');
            } finally {
              setCreating(false);
            }
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="input min-w-[12rem] flex-1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="label (optional) — e.g. github-actions"
            />
            <button
              className="btn btn-primary whitespace-nowrap"
              type="submit"
              disabled={!canCreate}
            >
              {creating ? 'Generating…' : 'Generate key'}
            </button>
          </div>
        </form>

        <div className="mt-4">
          <ClientTable
            head={
              <tr>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Label
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Created
                </th>
              </tr>
            }
          >
            {(keys ?? []).map((k) => (
              <tr key={k.id}>
                <td className="border-b border-white/10 px-3 py-2 font-semibold">
                  {k.label}
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  {new Date(k.createdAt).toLocaleString('en-US')}
                </td>
              </tr>
            ))}
            {keys && keys.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-3 text-white/70">
                  No keys registered.
                </td>
              </tr>
            ) : null}
            {!keys && !error ? (
              <tr>
                <td colSpan={2} className="px-3 py-3 text-white/70">
                  Loading…
                </td>
              </tr>
            ) : null}
          </ClientTable>
        </div>
        <p className="mt-3 text-xs text-white/55">
          The plain-text key is only returned at creation time; store it in GitHub Secrets.
        </p>
      </div>
    </section>
  );
}
