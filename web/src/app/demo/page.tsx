'use client';

import { DEMO_CREDENTIALS } from '@/demo/fixtures';
import { enableDemoMode } from '@/demo/mode';
import { bootstrapDemoSession } from '@/demo/router';
import { clearTokenClient } from '@/lib/client-auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DemoLandingPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#2b2e33] p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold text-[#e8eaed]">Previa</div>
          <div className="text-xs text-[#8b919a]">interactive demo</div>
        </div>
        <div className="card space-y-4 p-6">
          <h1 className="page-title">Frontend demo</h1>
          <p className="page-subtitle">
            Explore the full UI with mocked projects, instances, cluster nodes, metrics, and users.
            No API or database required — ideal for GitHub Pages.
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm text-[#b8bcc4]">
            <li>Local + remote cluster instances</li>
            <li>Admin and operator roles</li>
            <li>Pause / activate / env edits (in-memory)</li>
          </ul>
          <div className="rounded-lg border border-[#3d4048] bg-[#2b2e33] p-3 text-xs text-[#8b919a]">
            <p className="font-medium text-[#e8eaed]">Demo logins</p>
            <p className="mt-1 font-mono">
              {DEMO_CREDENTIALS.admin.email} / {DEMO_CREDENTIALS.admin.password}{' '}
              <span className="text-[#b8bcc4]">(admin)</span>
            </p>
            <p className="mt-0.5 font-mono">
              {DEMO_CREDENTIALS.operator.email} / {DEMO_CREDENTIALS.operator.password}{' '}
              <span className="text-[#b8bcc4]">(operator)</span>
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              clearTokenClient();
              enableDemoMode();
              bootstrapDemoSession();
              router.push('/login?demo=1');
            }}
          >
            {busy ? 'Opening…' : 'Open demo login'}
          </button>
          <p className="text-center text-xs text-[#8b919a]">
            Or go to{' '}
            <Link className="link-muted" href="/login?demo=1">
              /login?demo=1
            </Link>{' '}
            after enabling demo once.
          </p>
        </div>
      </div>
    </div>
  );
}
