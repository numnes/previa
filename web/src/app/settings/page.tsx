'use client';

import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { RequireRole } from '@/components/RequireRole';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiKeysSection } from './ApiKeysSection';
import { ClusterSettingsSection } from './ClusterSettingsSection';
import { DiscordNotificationsSection } from './DiscordNotificationsSection';
import { ClickupNotificationsSection } from './ClickupNotificationsSection';
import { fetchSettings, patchSettings } from './::handlers/settings';

export default function SettingsPage() {
  const [max, setMax] = useState<number>(10);
  const [nodeLabel, setNodeLabel] = useState('');
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await fetchSettings();
        if (!alive) return;
        setRaw(s as Record<string, unknown>);
        if (typeof s.maxActiveInstancesParsed === 'number') {
          setMax(s.maxActiveInstancesParsed);
        }
        if (typeof s.nodeLabel === 'string') {
          setNodeLabel(s.nodeLabel);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <RequireAuth>
      <RequireRole roles={['admin']}>
        <PageContainer>
          <div className="mb-3 text-sm text-[#b8bcc4]">
            <Link className="link-muted" href="/">
              ← Dashboard
            </Link>
          </div>
          <PageHeader
            title="Settings"
            subtitle="Global limits, API keys, node identity, and multi-machine cluster connections."
          />

          <div className="space-y-5">
            <div className="card p-5">
              {loading ? (
                <p className="text-sm text-white/60">Loading…</p>
              ) : (
                <>
                  <h2 className="text-sm font-medium text-[#e8eaed]">This node</h2>
                  <p className="mt-1 text-xs text-[#8b919a]">
                    Identity and capacity limits for preview instances on this machine.
                  </p>
                  <form
                    className="mt-4 space-y-4"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setMsg(null);
                      setSaving(true);
                      try {
                        const s = await patchSettings({
                          maxActiveInstances: max,
                          nodeLabel: nodeLabel.trim(),
                        });
                        setRaw(s as Record<string, unknown>);
                        if (typeof s.maxActiveInstancesParsed === 'number') {
                          setMax(s.maxActiveInstancesParsed);
                        }
                        if (typeof s.nodeLabel === 'string') {
                          setNodeLabel(s.nodeLabel);
                        }
                        setMsg('Saved.');
                      } catch {
                        setMsg('Could not save.');
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    <label className="block text-sm text-white/70">
                      This node label
                      <input
                        className="input mt-1.5"
                        value={nodeLabel}
                        onChange={(e) => setNodeLabel(e.target.value)}
                        placeholder="Machine A"
                      />
                    </label>
                    <p className="text-xs text-white/55">
                      Shown in the dashboard and instance lists when this panel aggregates multiple
                      machines.
                    </p>
                    <label className="block text-sm text-white/70">
                      Max active instances (this node)
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        className="input mt-1.5"
                        value={max}
                        onChange={(e) => setMax(Number(e.target.value))}
                      />
                    </label>
                    {msg ? <p className="text-sm text-emerald-200/90">{msg}</p> : null}
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </form>
                </>
              )}
            </div>

            <div className="card p-5">
              <DiscordNotificationsSection />
            </div>

            <div className="card p-5">
              <ClickupNotificationsSection />
            </div>

            <div className="card p-5">
              <ApiKeysSection />
            </div>

            <div className="card p-5">
              <ClusterSettingsSection />
            </div>
          </div>

          {raw && !loading ? (
            <details className="mt-5 text-xs text-white/50">
              <summary className="cursor-pointer text-white/60">Raw settings keys</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-2">
                {JSON.stringify(raw, null, 2)}
              </pre>
            </details>
          ) : null}
        </PageContainer>
      </RequireRole>
    </RequireAuth>
  );
}
