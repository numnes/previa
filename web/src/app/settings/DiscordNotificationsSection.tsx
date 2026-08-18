'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchSettings,
  patchSettings,
  type DiscordNotifyStatus,
} from './::handlers/settings';

const ALL_STATUSES: DiscordNotifyStatus[] = [
  'waiting',
  'deploying',
  'active',
  'paused',
  'error',
  'deleted',
];

export const DEFAULT_DISCORD_MESSAGE_TEMPLATE =
  'Instance branch {{branch_name}} in project {{project_name}} changed from {{old_status}} to {{new_status}}.\nPreview: {{preview_link}}\nDetails: {{branch_page}}';

const DEFAULT_NOTIFY_STATUSES: DiscordNotifyStatus[] = [
  'active',
  'error',
  'paused',
  'deleted',
];

export function DiscordNotificationsSection() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [notifyStatuses, setNotifyStatuses] = useState<DiscordNotifyStatus[]>(
    DEFAULT_NOTIFY_STATUSES,
  );
  const [messageTemplate, setMessageTemplate] = useState(
    DEFAULT_DISCORD_MESSAGE_TEMPLATE,
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
      setWebhookUrl(typeof s.discordWebhookUrl === 'string' ? s.discordWebhookUrl : '');
      if (Array.isArray(s.discordNotifyStatuses) && s.discordNotifyStatuses.length > 0) {
        setNotifyStatuses(s.discordNotifyStatuses);
      } else {
        setNotifyStatuses(DEFAULT_NOTIFY_STATUSES);
      }
      setMessageTemplate(
        typeof s.discordMessageTemplate === 'string' && s.discordMessageTemplate.trim()
          ? s.discordMessageTemplate
          : DEFAULT_DISCORD_MESSAGE_TEMPLATE,
      );
    } catch {
      setError('Could not load Discord notification settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-white/60">Loading Discord notifications…</p>;
  }

  return (
    <section>
      <h2 className="text-sm font-medium text-[#e8eaed]">Discord notifications</h2>
      <p className="mt-1 text-xs text-[#8b919a]">
        Send Discord messages when preview instances change status. Configure a webhook here;
        enable notifications per project in project settings.
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
            const s = await patchSettings({
              discordWebhookUrl: webhookUrl.trim(),
              discordNotifyStatuses: notifyStatuses,
              discordMessageTemplate: messageTemplate,
            });
            setWebhookUrl(typeof s.discordWebhookUrl === 'string' ? s.discordWebhookUrl : '');
            if (Array.isArray(s.discordNotifyStatuses)) {
              setNotifyStatuses(s.discordNotifyStatuses);
            }
            if (typeof s.discordMessageTemplate === 'string') {
              setMessageTemplate(s.discordMessageTemplate);
            }
            setMsg('Saved.');
          } catch {
            setError('Could not save Discord notification settings.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="block text-sm text-white/70">
          Discord webhook URL
          <input
            className="input mt-1.5 font-mono text-sm"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            type="url"
            autoComplete="off"
          />
        </label>
        <p className="text-xs text-white/55">
          Leave empty to disable outbound Discord notifications on this node.
        </p>

        <fieldset>
          <legend className="text-sm text-white/70">Notify on status</legend>
          <p className="mt-1 text-xs text-white/55">
            Only the new status is checked. Transitions into unselected statuses are ignored.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ALL_STATUSES.map((status) => {
              const checked = notifyStatuses.includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  className={`rounded-md border px-2.5 py-1 text-xs font-mono transition ${
                    checked
                      ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100'
                      : 'border-[#3d4048] bg-black/20 text-white/60 hover:text-white/80'
                  }`}
                  onClick={() => {
                    setNotifyStatuses((prev) =>
                      checked ? prev.filter((s) => s !== status) : [...prev, status],
                    );
                  }}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block text-sm text-white/70">
          Message template
          <textarea
            className="input mt-1.5 min-h-[8rem] font-mono text-sm"
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            spellCheck={false}
          />
        </label>
        <p className="text-xs text-white/55">
          Placeholders:{' '}
          <span className="font-mono text-white/75">
            {'{{branch_name}} {{project_name}} {{old_status}} {{new_status}} {{preview_link}} {{branch_page}}'}
          </span>
        </p>

        {msg ? <p className="text-sm text-emerald-200/90">{msg}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Discord settings'}
        </button>
      </form>
    </section>
  );
}
