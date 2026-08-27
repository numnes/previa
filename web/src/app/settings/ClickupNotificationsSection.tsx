'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchSettings, patchSettings } from './::handlers/settings';

export const DEFAULT_CLICKUP_COMMENT_TEMPLATE =
  'Preview is ready for branch {{branch_name}} ({{project_name}}).\n{{preview_link}}';

export function ClickupNotificationsSection() {
  const [token, setToken] = useState('');
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [tokenLast4, setTokenLast4] = useState('');
  const [teamId, setTeamId] = useState('');
  const [commentTemplate, setCommentTemplate] = useState(
    DEFAULT_CLICKUP_COMMENT_TEMPLATE,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchSettings();
      setTokenConfigured(!!s.clickupApiTokenConfigured);
      setTokenLast4(typeof s.clickupApiTokenLast4 === 'string' ? s.clickupApiTokenLast4 : '');
      setToken('');
      setTeamId(typeof s.clickupTeamId === 'string' ? s.clickupTeamId : '');
      setCommentTemplate(
        typeof s.clickupCommentTemplate === 'string' && s.clickupCommentTemplate.trim()
          ? s.clickupCommentTemplate
          : DEFAULT_CLICKUP_COMMENT_TEMPLATE,
      );
    } catch {
      setError('Could not load ClickUp settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-white/60">Loading ClickUp…</p>;
  }

  return (
    <section>
      <h2 className="text-sm font-medium text-[#e8eaed]">ClickUp comments</h2>
      <p className="mt-1 text-xs text-[#8b919a]">
        When a preview first becomes active, post a comment on the ClickUp task whose custom ID
        matches the branch name (e.g. branch <span className="font-mono">cicm-4491</span> → task
        CICM-4491). Enable per project in project settings. Requires a public URL on the project.
      </p>

      {error ? <div className="alert-error mt-3">{error}</div> : null}

      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          setError(null);
          setSaving(true);
          try {
            const body: Parameters<typeof patchSettings>[0] = {
              clickupTeamId: teamId.trim(),
              clickupCommentTemplate: commentTemplate,
            };
            if (token.trim()) {
              body.clickupApiToken = token.trim();
            }
            const s = await patchSettings(body);
            setToken('');
            setTokenConfigured(!!s.clickupApiTokenConfigured);
            setTokenLast4(
              typeof s.clickupApiTokenLast4 === 'string' ? s.clickupApiTokenLast4 : '',
            );
            setTeamId(typeof s.clickupTeamId === 'string' ? s.clickupTeamId : '');
            if (typeof s.clickupCommentTemplate === 'string') {
              setCommentTemplate(s.clickupCommentTemplate);
            }
            setMsg('Saved.');
          } catch {
            setError('Could not save ClickUp settings.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="block text-sm text-white/70">
          Personal API token
          <input
            className="input mt-1.5 font-mono text-sm"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              tokenConfigured
                ? `Configured (…${tokenLast4}) — paste a new token to replace`
                : 'pk_…'
            }
            type="password"
            autoComplete="off"
          />
        </label>
        <p className="text-xs text-white/55">
          Create at ClickUp → Settings → Apps. Leave blank to keep the current token.
        </p>

        <label className="block text-sm text-white/70">
          Workspace (team) ID
          <input
            className="input mt-1.5 font-mono text-sm"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            placeholder="123456789"
          />
        </label>
        <p className="text-xs text-white/55">
          Required to resolve custom IDs (CICM-123). In ClickUp, open Settings → ClickUp API, or
          copy the numeric ID from the workspace URL.
        </p>

        <label className="block text-sm text-white/70">
          Comment template
          <textarea
            className="input mt-1.5 min-h-[7rem] font-mono text-sm"
            value={commentTemplate}
            onChange={(e) => setCommentTemplate(e.target.value)}
            spellCheck={false}
          />
        </label>
        <p className="text-xs text-white/55">
          Placeholders:{' '}
          <span className="font-mono text-white/75">
            {'{{branch_name}} {{project_name}} {{preview_link}} {{task_id}}'}
          </span>
        </p>

        {msg ? <p className="text-sm text-emerald-200/90">{msg}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save ClickUp settings'}
          </button>
          {tokenConfigured ? (
            <button
              type="button"
              className="btn text-sm"
              disabled={saving}
              onClick={async () => {
                if (!confirm('Remove the stored ClickUp API token?')) return;
                setSaving(true);
                setError(null);
                try {
                  const s = await patchSettings({ clickupApiToken: '' });
                  setTokenConfigured(!!s.clickupApiTokenConfigured);
                  setTokenLast4('');
                  setToken('');
                  setMsg('Token removed.');
                } catch {
                  setError('Could not clear ClickUp token.');
                } finally {
                  setSaving(false);
                }
              }}
            >
              Clear token
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
