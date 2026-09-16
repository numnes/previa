'use client';

import { useCallback, useEffect, useState } from 'react';
import { TagPillsInput } from '@/components/TagPillsInput';
import { fetchSettings, patchSettings } from './::handlers/settings';

export function AmplifySettingsSection() {
  const [appId, setAppId] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [accessKey, setAccessKey] = useState('');
  const [secret, setSecret] = useState('');
  const [accessKeyConfigured, setAccessKeyConfigured] = useState(false);
  const [accessKeyLast4, setAccessKeyLast4] = useState('');
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [hiddenBranches, setHiddenBranches] = useState<string[]>([]);
  const [maxBranches, setMaxBranches] = useState(50);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchSettings();
      setAppId(typeof s.amplifyAppId === 'string' ? s.amplifyAppId : '');
      setRegion(
        typeof s.amplifyRegion === 'string' && s.amplifyRegion.trim()
          ? s.amplifyRegion
          : 'us-east-1',
      );
      setAccessKeyConfigured(!!s.amplifyAccessKeyConfigured);
      setAccessKeyLast4(
        typeof s.amplifyAccessKeyLast4 === 'string' ? s.amplifyAccessKeyLast4 : '',
      );
      setSecretConfigured(!!s.amplifySecretConfigured);
      setAccessKey('');
      setSecret('');
      setHiddenBranches(
        Array.isArray(s.amplifyHiddenBranches)
          ? s.amplifyHiddenBranches
          : typeof s.amplifyHiddenBranchesText === 'string'
            ? s.amplifyHiddenBranchesText
                .split(/[\n,]+/)
                .map((n) => n.trim())
                .filter(Boolean)
            : [],
      );
      setMaxBranches(
        typeof s.amplifyMaxBranches === 'number' && s.amplifyMaxBranches > 0
          ? s.amplifyMaxBranches
          : 50,
      );
    } catch {
      setError('Could not load Amplify settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-white/60">Loading Amplify…</p>;
  }

  return (
    <section>
      <h2 className="text-sm font-medium text-[#e8eaed]">AWS Amplify</h2>
      <p className="mt-1 text-xs text-[#8b919a]">
        List hosted branches of an Amplify app, hide long-lived ones (e.g.{' '}
        <span className="font-mono">main</span>), host a git branch from the current HEAD without a
        push (<span className="font-mono">create-branch</span> /{' '}
        <span className="font-mono">start-job RELEASE</span>), and tear down a branch the same way
        as <span className="font-mono">aws amplify delete-branch</span>. ClickUp status uses the
        same branch → task matching as Previa instances.
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
              amplifyAppId: appId.trim(),
              amplifyRegion: region.trim() || 'us-east-1',
              amplifyHiddenBranches: hiddenBranches.join('\n'),
              amplifyMaxBranches: maxBranches,
            };
            if (accessKey.trim()) body.amplifyAccessKeyId = accessKey.trim();
            if (secret.trim()) body.amplifySecretAccessKey = secret.trim();
            const s = await patchSettings(body);
            setAccessKey('');
            setSecret('');
            setAppId(typeof s.amplifyAppId === 'string' ? s.amplifyAppId : '');
            setRegion(
              typeof s.amplifyRegion === 'string' && s.amplifyRegion.trim()
                ? s.amplifyRegion
                : 'us-east-1',
            );
            setAccessKeyConfigured(!!s.amplifyAccessKeyConfigured);
            setAccessKeyLast4(
              typeof s.amplifyAccessKeyLast4 === 'string' ? s.amplifyAccessKeyLast4 : '',
            );
            setSecretConfigured(!!s.amplifySecretConfigured);
            setHiddenBranches(
              Array.isArray(s.amplifyHiddenBranches) ? s.amplifyHiddenBranches : [],
            );
            if (typeof s.amplifyMaxBranches === 'number' && s.amplifyMaxBranches > 0) {
              setMaxBranches(s.amplifyMaxBranches);
            }
            setMsg('Saved.');
          } catch {
            setError('Could not save Amplify settings.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="block text-sm text-white/70">
          App ID
          <input
            className="input mt-1.5 font-mono text-sm"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="d0exampleappid"
            autoComplete="off"
          />
        </label>
        <p className="text-xs text-white/55">
          From the Amplify console URL or <span className="font-mono">aws amplify list-apps</span>.
        </p>

        <label className="block text-sm text-white/70">
          Region
          <input
            className="input mt-1.5 font-mono text-sm"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="us-east-1"
            autoComplete="off"
          />
        </label>

        <label className="block text-sm text-white/70">
          Access key ID
          <input
            className="input mt-1.5 font-mono text-sm"
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
            placeholder={
              accessKeyConfigured
                ? `Configured (…${accessKeyLast4}) — paste a new key to replace`
                : 'AKIA…'
            }
            type="password"
            autoComplete="off"
          />
        </label>
        <label className="block text-sm text-white/70">
          Secret access key
          <input
            className="input mt-1.5 font-mono text-sm"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={
              secretConfigured
                ? 'Configured — paste a new secret to replace'
                : 'Leave blank to use the host IAM role / env credentials'
            }
            type="password"
            autoComplete="off"
          />
        </label>
        <p className="text-xs text-white/55">
          IAM needs <span className="font-mono">amplify:ListBranches</span>,{' '}
          <span className="font-mono">amplify:GetApp</span>,{' '}
          <span className="font-mono">amplify:GetBranch</span>,{' '}
          <span className="font-mono">amplify:CreateBranch</span>,{' '}
          <span className="font-mono">amplify:StartJob</span>, and{' '}
          <span className="font-mono">amplify:DeleteBranch</span>. Leave keys blank to keep the
          current pair, or to use <span className="font-mono">AWS_ACCESS_KEY_ID</span> / instance
          role on the host.
        </p>

        <div>
          <label className="block text-sm text-white/70" htmlFor="amplify-hidden-branches">
            Hidden branches
          </label>
          <TagPillsInput
            id="amplify-hidden-branches"
            values={hiddenBranches}
            onChange={setHiddenBranches}
            placeholder="Type a branch and press Enter"
            disabled={saving}
          />
        </div>
        <p className="text-xs text-white/55">
          Press Enter or comma to add a capsule. These branches stay off the Amplify list and
          cannot be deleted from Previa. They still count toward the branch slot quota.
        </p>

        <label className="block text-sm text-white/70">
          Branch slot limit
          <input
            type="number"
            min={1}
            max={1000}
            className="input mt-1.5"
            value={maxBranches}
            onChange={(e) => setMaxBranches(Number(e.target.value))}
          />
        </label>
        <p className="text-xs text-white/55">
          AWS default is 50 branches per app. Used for the used/available display on the Amplify
          page.
        </p>

        {msg ? <p className="text-sm text-emerald-200/90">{msg}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Amplify settings'}
          </button>
          {accessKeyConfigured || secretConfigured ? (
            <button
              type="button"
              className="btn text-sm"
              disabled={saving}
              onClick={async () => {
                if (!confirm('Remove the stored AWS access keys?')) return;
                setSaving(true);
                setError(null);
                try {
                  const s = await patchSettings({
                    amplifyAccessKeyId: '',
                    amplifySecretAccessKey: '',
                  });
                  setAccessKeyConfigured(!!s.amplifyAccessKeyConfigured);
                  setAccessKeyLast4('');
                  setSecretConfigured(!!s.amplifySecretConfigured);
                  setAccessKey('');
                  setSecret('');
                  setMsg('Keys removed.');
                } catch {
                  setError('Could not clear AWS keys.');
                } finally {
                  setSaving(false);
                }
              }}
            >
              Clear keys
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
