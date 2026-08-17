'use client';

import { EnvEditor } from '@/components/EnvEditor';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { ReloadButton } from '@/components/ReloadButton';
import { RequireAuth } from '@/components/RequireAuth';
import { RequireRole } from '@/components/RequireRole';
import { TabBar } from '@/components/TabBar';
import { IconEnv, IconSettings } from '@/components/icons';
import { normalizeEnvVars, type EnvVarsMap } from '@/lib/env-vars';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { listInstances } from '../../../instances/::handlers/instances';
import {
  deleteProject,
  getProject,
  patchProject,
  restartProjectInstances,
  teardownProjectInstances,
  type Project,
} from '../../::handlers/projects';

function parseLifetimeField(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function lifetimeFieldValue(n: number | null | undefined): string {
  return n == null ? '' : String(n);
}

type ProjectTab = 'general' | 'environment';

export default function ProjectSettingsClient() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [tab, setTab] = useState<ProjectTab>('general');
  const [project, setProject] = useState<Project | null>(null);
  const [instanceCount, setInstanceCount] = useState(0);
  const [gitUrl, setGitUrl] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [portEnvNamesText, setPortEnvNamesText] = useState('');
  const [activeLifetimeDays, setActiveLifetimeDays] = useState('');
  const [activeLifetimeHours, setActiveLifetimeHours] = useState('');
  const [existenceLifetimeDays, setExistenceLifetimeDays] = useState('');
  const [existenceLifetimeHours, setExistenceLifetimeHours] = useState('');
  const [idlePauseMinutes, setIdlePauseMinutes] = useState('');
  const [envVars, setEnvVars] = useState<EnvVarsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [envSaving, setEnvSaving] = useState(false);
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [envSaved, setEnvSaved] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [p, instances] = await Promise.all([getProject(id), listInstances()]);
      setProject(p);
      setGitUrl(p.gitUrl ?? '');
      setServerUrl(p.serverUrl ?? '');
      setPortEnvNamesText((p.portEnvNames ?? []).join(', '));
      setActiveLifetimeDays(lifetimeFieldValue(p.maxActiveLifetimeDays));
      setActiveLifetimeHours(lifetimeFieldValue(p.maxActiveLifetimeHours));
      setExistenceLifetimeDays(lifetimeFieldValue(p.maxExistenceLifetimeDays));
      setExistenceLifetimeHours(lifetimeFieldValue(p.maxExistenceLifetimeHours));
      setIdlePauseMinutes(lifetimeFieldValue(p.idlePauseMinutes));
      setEnvVars(normalizeEnvVars(p.envVars));
      setInstanceCount(instances.filter((i) => i.projectId === id).length);
    } catch {
      setError('Project not found or access denied.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequireAuth>
      <RequireRole roles={['admin']}>
        <PageContainer>
          <div className="mb-3 text-sm text-[#b8bcc4]">
            <Link className="link-muted" href="/projects">
              ← Back to projects
            </Link>
          </div>
          <PageHeader
            title="Project settings"
            subtitle={
              project ? (
                <>
                  Slug: <span className="font-semibold text-[#e8eaed]">{project.slug}</span>
                  {' · '}
                  {instanceCount} instance{instanceCount === 1 ? '' : 's'}
                </>
              ) : undefined
            }
            action={<ReloadButton onReload={load} title="Reload project" />}
          />

          {loading ? <div className="text-sm text-white/70">Loading…</div> : null}
          {error ? <div className="alert-error mb-4">{error}</div> : null}

          {project && !error ? (
            <div className="card">
              <div className="px-5 pt-2">
                <TabBar
                  value={tab}
                  onChange={(next) => {
                    setSaved(false);
                    setEnvSaved(false);
                    setActionMsg(null);
                    setTab(next);
                  }}
                  tabs={[
                    {
                      id: 'general',
                      label: 'General',
                      icon: <IconSettings className="h-4 w-4" />,
                    },
                    {
                      id: 'environment',
                      label: 'Environment',
                      icon: <IconEnv className="h-4 w-4" />,
                    },
                  ]}
                />
              </div>

              <div className="p-5">
                {tab === 'general' ? (
                  <>
                    {saved ? <div className="alert-success mb-3">Saved.</div> : null}
                    {actionMsg ? <div className="alert-success mb-3">{actionMsg}</div> : null}

                    <form
                      className="space-y-4"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setError(null);
                        setSaved(false);
                        setActionMsg(null);
                        setSaving(true);
                        try {
                          const trimmedGit = gitUrl.trim();
                          if (!trimmedGit) {
                            setError('Git URL is required.');
                            return;
                          }
                          const trimmed = serverUrl.trim();
                          const portExtras = portEnvNamesText
                            .split(/[\n,]+/)
                            .map((s) => s.trim())
                            .filter(Boolean);
                          const updated = await patchProject(id, {
                            gitUrl: trimmedGit,
                            serverUrl: trimmed === '' ? null : trimmed,
                            portEnvNames: portExtras,
                            maxActiveLifetimeDays: parseLifetimeField(activeLifetimeDays),
                            maxActiveLifetimeHours: parseLifetimeField(activeLifetimeHours),
                            maxExistenceLifetimeDays: parseLifetimeField(existenceLifetimeDays),
                            maxExistenceLifetimeHours: parseLifetimeField(existenceLifetimeHours),
                            idlePauseMinutes: parseLifetimeField(idlePauseMinutes),
                          });
                          setProject(updated);
                          setGitUrl(updated.gitUrl);
                          setServerUrl(updated.serverUrl ?? '');
                          setPortEnvNamesText((updated.portEnvNames ?? []).join(', '));
                          setActiveLifetimeDays(lifetimeFieldValue(updated.maxActiveLifetimeDays));
                          setActiveLifetimeHours(lifetimeFieldValue(updated.maxActiveLifetimeHours));
                          setExistenceLifetimeDays(
                            lifetimeFieldValue(updated.maxExistenceLifetimeDays),
                          );
                          setExistenceLifetimeHours(
                            lifetimeFieldValue(updated.maxExistenceLifetimeHours),
                          );
                          setIdlePauseMinutes(lifetimeFieldValue(updated.idlePauseMinutes));
                          setSaved(true);
                          router.refresh();
                        } catch {
                          setError('Could not save. Check the fields and try again.');
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      <div>
                        <label className="mb-1.5 block text-sm text-white/70">Git URL</label>
                        <input
                          className="input"
                          value={gitUrl}
                          onChange={(e) => setGitUrl(e.target.value)}
                          placeholder="https://github.com/org/repo.git"
                          required
                        />
                        <p className="mt-2 text-xs text-white/55">
                          Repository used for clone/fetch on deploy and redeploy. Changing this
                          applies to new deploys; existing checkouts keep their remote until the
                          next redeploy.
                        </p>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm text-white/70">
                          Public URL (nginx domain)
                        </label>
                        <input
                          className="input"
                          value={serverUrl}
                          onChange={(e) => setServerUrl(e.target.value)}
                          placeholder="https://preview.example.com"
                          type="url"
                        />
                        <p className="mt-2 text-xs text-white/55">
                          The public domain configured in nginx where preview instances are
                          available. Branch preview lives at{' '}
                          <span className="font-mono text-white/75">
                            {'{URL}'}/{'{project-slug}'}/{'{branch-slug}'}/{' '}
                          </span>
                          (PM2 app{' '}
                          <span className="font-mono text-white/75">{project.slug}-…</span>).
                        </p>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm text-white/70">
                          Port env names (optional extras)
                        </label>
                        <input
                          className="input font-mono text-sm"
                          value={portEnvNamesText}
                          onChange={(e) => setPortEnvNamesText(e.target.value)}
                          placeholder="HTTP_PORT, LISTEN_PORT"
                        />
                        <p className="mt-2 text-xs text-white/55">
                          Always set on deploy:{' '}
                          <span className="font-mono text-white/75">
                            PORT, SERVER_PORT, APP_PORT
                          </span>{' '}
                          = allocated preview port. Add comma-separated extras if the app uses
                          another name (e.g. Nest{' '}
                          <span className="font-mono text-white/75">SERVER_PORT</span> is already
                          covered).
                        </p>
                      </div>

                      <div className="border-t border-[#3d4048] pt-5">
                        <h2 className="text-sm font-medium text-[#e8eaed]">Instance lifetime</h2>
                        <p className="mt-1 text-xs text-[#8b919a]">
                          Leave fields empty for no limit. Instances stay active until manual
                          teardown. Limits are checked every minute.
                        </p>

                        <div className="mt-4 space-y-4">
                          <div>
                            <p className="text-sm text-white/70">Max active time</p>
                            <p className="mt-0.5 text-xs text-white/55">
                              After this duration in{' '}
                              <span className="font-semibold">active</span> status, the instance is
                              paused automatically (checkout kept on disk).
                            </p>
                            <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-md">
                              <div>
                                <label className="mb-1 block text-xs text-white/55">Days</label>
                                <input
                                  className="input"
                                  type="number"
                                  min={0}
                                  placeholder="no limit"
                                  value={activeLifetimeDays}
                                  onChange={(e) => setActiveLifetimeDays(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs text-white/55">Hours</label>
                                <input
                                  className="input"
                                  type="number"
                                  min={0}
                                  placeholder="no limit"
                                  value={activeLifetimeHours}
                                  onChange={(e) => setActiveLifetimeHours(e.target.value)}
                                />
                              </div>
                            </div>
                          </div>

                          <div>
                            <p className="text-sm text-white/70">Max existence time</p>
                            <p className="mt-0.5 text-xs text-white/55">
                              After this duration since creation, the instance is removed and the
                              cloned branch files on disk are deleted.
                            </p>
                            <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-md">
                              <div>
                                <label className="mb-1 block text-xs text-white/55">Days</label>
                                <input
                                  className="input"
                                  type="number"
                                  min={0}
                                  placeholder="no limit"
                                  value={existenceLifetimeDays}
                                  onChange={(e) => setExistenceLifetimeDays(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs text-white/55">Hours</label>
                                <input
                                  className="input"
                                  type="number"
                                  min={0}
                                  placeholder="no limit"
                                  value={existenceLifetimeHours}
                                  onChange={(e) => setExistenceLifetimeHours(e.target.value)}
                                />
                              </div>
                            </div>
                          </div>

                          <div>
                            <p className="text-sm text-white/70">Idle pause (minutes)</p>
                            <p className="mt-0.5 text-xs text-white/55">
                              After this many minutes without HTTP traffic to the preview URL, the
                              instance is slept (PM2 stopped). The next request wakes it (resume
                              without rebuild) and returns HTTP 302 to the same URL. Empty = off.
                            </p>
                            <div className="mt-2 sm:max-w-xs">
                              <input
                                className="input"
                                type="number"
                                min={0}
                                placeholder="off"
                                value={idlePauseMinutes}
                                onChange={(e) => setIdlePauseMinutes(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button className="btn btn-primary" type="submit" disabled={saving}>
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </form>

                    <div className="mt-8 border-t border-[#3d4048] pt-6">
                      <h2 className="text-sm font-medium text-[#e8eaed]">Instances</h2>
                      <p className="mt-1 text-xs text-[#8b919a]">
                        Bulk actions for all instances registered under this project.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn text-sm"
                          disabled={bulkLoading !== null || instanceCount === 0}
                          onClick={async () => {
                            if (
                              !confirm(
                                `Teardown all active instances for "${project.slug}"?\n\nThis pauses every active instance (stops PM2/Docker and nginx). Records and checkout on disk are kept.`,
                              )
                            ) {
                              return;
                            }
                            setError(null);
                            setActionMsg(null);
                            setBulkLoading('teardown');
                            try {
                              const r = await teardownProjectInstances(id);
                              setActionMsg(
                                `Teardown done: ${r.paused ?? 0} paused, ${r.skipped ?? 0} skipped, ${r.failed ?? 0} failed.`,
                              );
                              router.refresh();
                            } catch {
                              setError('Could not teardown instances.');
                            } finally {
                              setBulkLoading(null);
                            }
                          }}
                        >
                          {bulkLoading === 'teardown' ? 'Working…' : 'Teardown all instances'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary text-sm"
                          disabled={bulkLoading !== null || instanceCount === 0}
                          onClick={async () => {
                            if (
                              !confirm(
                                `Restart all instances for "${project.slug}"?\n\nThis redeploys or activates every instance (active, paused, waiting, error).`,
                              )
                            ) {
                              return;
                            }
                            setError(null);
                            setActionMsg(null);
                            setBulkLoading('restart');
                            try {
                              const r = await restartProjectInstances(id);
                              setActionMsg(
                                `Restart done: ${r.restarted ?? 0} restarted, ${r.skipped ?? 0} skipped, ${r.failed ?? 0} failed.`,
                              );
                              router.refresh();
                            } catch {
                              setError('Could not restart instances.');
                            } finally {
                              setBulkLoading(null);
                            }
                          }}
                        >
                          {bulkLoading === 'restart' ? 'Working…' : 'Restart all instances'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-8 border-t border-[#3d4048] pt-6">
                      <h2 className="text-sm font-medium text-[#e8eaed]">Delete project</h2>
                      <p className="mt-1 text-xs text-[#8b919a]">
                        Destroys every instance (runtime, nginx, database record, checkout on disk)
                        and removes this project. This cannot be undone.
                      </p>
                      <button
                        type="button"
                        className="btn mt-4 border-rose-200/30 bg-rose-200/10 text-sm text-rose-100 hover:bg-rose-200/15"
                        disabled={bulkLoading !== null}
                        onClick={async () => {
                          if (
                            !confirm(
                              `Delete project "${project.slug}"?\n\nAll ${instanceCount} instance(s) will be destroyed and removed. This cannot be undone.`,
                            )
                          ) {
                            return;
                          }
                          setError(null);
                          setActionMsg(null);
                          setBulkLoading('delete');
                          try {
                            await deleteProject(id);
                            router.push('/projects');
                            router.refresh();
                          } catch {
                            setError('Could not delete project.');
                            setBulkLoading(null);
                          }
                        }}
                      >
                        {bulkLoading === 'delete' ? 'Deleting…' : 'Delete project'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {envSaved ? (
                      <div className="alert-success mb-3">
                        Environment saved. Redeploy instances to apply.
                      </div>
                    ) : null}
                    <h2 className="text-sm font-medium text-[#e8eaed]">Environment variables</h2>
                    <p className="mt-1 text-xs text-[#8b919a]">
                      Optional defaults for every instance of this project. Applied on create /
                      redeploy (PM2 after build commands; Docker via{' '}
                      <span className="font-mono">--env-file</span>). Instance overrides can replace
                      individual keys. Also merges over optional{' '}
                      <span className="font-mono">env:</span> in{' '}
                      <span className="font-mono">previa.yaml</span>.
                    </p>
                    <div className="mt-4">
                      <EnvEditor
                        value={envVars}
                        onChange={(next) => {
                          setEnvSaved(false);
                          setEnvVars(next);
                        }}
                        disabled={envSaving}
                        hint="Edit as a table, paste KEY=value text, or load a .env file."
                      />
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={envSaving}
                        onClick={async () => {
                          setError(null);
                          setEnvSaved(false);
                          setEnvSaving(true);
                          try {
                            const updated = await patchProject(id, { envVars });
                            setProject(updated);
                            setEnvVars(normalizeEnvVars(updated.envVars));
                            setEnvSaved(true);
                            router.refresh();
                          } catch {
                            setError('Could not save environment variables.');
                          } finally {
                            setEnvSaving(false);
                          }
                        }}
                      >
                        {envSaving ? 'Saving…' : 'Save environment'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </PageContainer>
      </RequireRole>
    </RequireAuth>
  );
}
