'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createClusterKey,
  createClusterNode,
  deleteClusterKey,
  deleteClusterNode,
  listClusterKeys,
  listClusterNodes,
  testClusterNode,
  type ClusterKeyRow,
  type ClusterKeyScope,
  type ClusterNodeRow,
} from './::handlers/cluster';

export function ClusterSettingsSection() {
  const [keys, setKeys] = useState<ClusterKeyRow[]>([]);
  const [nodes, setNodes] = useState<ClusterNodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyLabel, setNewKeyLabel] = useState('cluster');
  const [newKeyScope, setNewKeyScope] = useState<ClusterKeyScope>('read');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [nodeLabel, setNodeLabel] = useState('');
  const [nodeUrl, setNodeUrl] = useState('');
  const [nodeKey, setNodeKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, n] = await Promise.all([listClusterKeys(), listClusterNodes()]);
      setKeys(k);
      setNodes(n);
    } catch {
      setError('Could not load cluster settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-white/60">Loading cluster…</p>;
  }

  return (
    <div className="space-y-8">
      {error ? <div className="alert-error">{error}</div> : null}

      <section>
        <h2 className="text-sm font-medium text-[#e8eaed]">Cluster credentials (this node)</h2>
        <p className="mt-1 text-xs text-[#8b919a]">
          Generate a key on this machine and paste it into another previa&apos;s connected nodes
          settings. Choose <strong>Read-only</strong> (dashboard, projects, instances and logs) or{' '}
          <strong>Read &amp; write</strong> (also allows pausing, activating and removing instances
          from the remote panel).
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm text-white/70">
            Label
            <input
              className="input mt-1 block w-40"
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
            />
          </label>
          <label className="text-sm text-white/70">
            Permissions
            <select
              className="input mt-1 block w-44"
              value={newKeyScope}
              onChange={(e) => setNewKeyScope(e.target.value as ClusterKeyScope)}
            >
              <option value="read">Read-only (incl. logs)</option>
              <option value="write">Read &amp; write</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy === 'key'}
            onClick={async () => {
              setBusy('key');
              setError(null);
              setCreatedKey(null);
              try {
                const res = await createClusterKey(newKeyLabel, newKeyScope);
                setCreatedKey(res.plainKey);
                await load();
              } catch {
                setError('Could not create cluster key.');
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === 'key' ? 'Creating…' : 'Generate cluster key'}
          </button>
        </div>
        {createdKey ? (
          <div className="alert-success mt-3 break-all font-mono text-xs">
            Copy now (shown once): {createdKey}
          </div>
        ) : null}
        <ul className="mt-4 space-y-2 text-sm">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
            >
              <span>
                <span className="font-medium text-white/90">{k.label}</span>
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                    k.scope === 'write'
                      ? 'bg-amber-400/15 text-amber-200'
                      : 'bg-white/10 text-white/60'
                  }`}
                >
                  {k.scope === 'write' ? 'read & write' : 'read-only'}
                </span>
                <span className="ml-2 text-xs text-white/45">
                  {new Date(k.createdAt).toLocaleString('en-US')}
                </span>
              </span>
              <button
                type="button"
                className="btn text-xs"
                disabled={busy === k.id}
                onClick={async () => {
                  if (!confirm(`Revoke cluster key "${k.label}"?`)) return;
                  setBusy(k.id);
                  try {
                    await deleteClusterKey(k.id);
                    await load();
                  } catch {
                    setError('Could not delete key.');
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Revoke
              </button>
            </li>
          ))}
          {keys.length === 0 ? (
            <li className="text-white/50">No cluster keys yet.</li>
          ) : null}
        </ul>
      </section>

      <section className="border-t border-[#3d4048] pt-6">
        <h2 className="text-sm font-medium text-[#e8eaed]">Connected nodes</h2>
        <p className="mt-1 text-xs text-[#8b919a]">
          Add other previa machines to aggregate their dashboard, projects, and instances in this
          panel.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-white/70">
            Label
            <input
              className="input mt-1"
              value={nodeLabel}
              onChange={(e) => setNodeLabel(e.target.value)}
              placeholder="Machine B"
            />
          </label>
          <label className="text-sm text-white/70">
            API URL
            <input
              className="input mt-1"
              value={nodeUrl}
              onChange={(e) => setNodeUrl(e.target.value)}
              placeholder="http://192.168.1.10:3000"
            />
          </label>
          <label className="text-sm text-white/70 sm:col-span-2">
            Cluster key (from remote node)
            <input
              className="input mt-1 font-mono text-xs"
              value={nodeKey}
              onChange={(e) => setNodeKey(e.target.value)}
              placeholder="clu_…"
            />
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primary mt-3"
          disabled={busy === 'node'}
          onClick={async () => {
            setBusy('node');
            setError(null);
            try {
              await createClusterNode({
                label: nodeLabel.trim(),
                baseUrl: nodeUrl.trim(),
                apiKey: nodeKey.trim(),
              });
              setNodeLabel('');
              setNodeUrl('');
              setNodeKey('');
              await load();
            } catch {
              setError('Could not add node. Check URL and clu_ key.');
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === 'node' ? 'Adding…' : 'Add connected node'}
        </button>

        <ul className="mt-4 space-y-2 text-sm">
          {nodes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-white/90">
                    {n.label}
                    <span
                      className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                        n.scope === 'write'
                          ? 'bg-amber-400/15 text-amber-200'
                          : 'bg-white/10 text-white/60'
                      }`}
                    >
                      {n.scope === 'write' ? 'read & write' : 'read-only'}
                    </span>
                  </div>
                  <div className="mt-0.5 break-all font-mono text-xs text-white/55">{n.baseUrl}</div>
                  {testResults[n.id] ? (
                    <div className="mt-1 text-xs text-white/60">{testResults[n.id]}</div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn text-xs"
                    disabled={busy === `test-${n.id}`}
                    onClick={async () => {
                      setBusy(`test-${n.id}`);
                      try {
                        const r = await testClusterNode(n.id);
                        setTestResults((prev) => ({
                          ...prev,
                          [n.id]: r.ok
                            ? `OK — remote: ${r.nodeLabel} (${
                                r.scope === 'write' ? 'read & write' : 'read-only'
                              })`
                            : `Failed — ${r.error}`,
                        }));
                        if (r.ok) await load();
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    className="btn text-xs"
                    disabled={busy === n.id}
                    onClick={async () => {
                      if (!confirm(`Remove connected node "${n.label}"?`)) return;
                      setBusy(n.id);
                      try {
                        await deleteClusterNode(n.id);
                        await load();
                      } catch {
                        setError('Could not remove node.');
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
          {nodes.length === 0 ? (
            <li className="text-white/50">No connected nodes.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
