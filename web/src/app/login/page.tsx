'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login } from './::handlers/auth';
import { setTokenClient, setUserClient } from '@/lib/client-auth';
import { DEMO_CREDENTIALS } from '@/demo/fixtures';
import { enableDemoMode, isDemoMode } from '@/demo/mode';
import { bootstrapDemoSession } from '@/demo/router';
import Link from 'next/link';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const demoQuery = search.get('demo') === '1';
  const demo = demoQuery || isDemoMode();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(
    demo ? DEMO_CREDENTIALS.admin.email : '',
  );
  const [password, setPassword] = useState(demo ? DEMO_CREDENTIALS.admin.password : '');

  useEffect(() => {
    if (demoQuery) {
      enableDemoMode();
      bootstrapDemoSession();
      setEmail(DEMO_CREDENTIALS.admin.email);
      setPassword(DEMO_CREDENTIALS.admin.password);
    }
  }, [demoQuery]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#2b2e33] p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold text-[#e8eaed]">Previa</div>
          <div className="text-xs text-[#8b919a]">preview environments</div>
        </div>
        <div className="card p-5">
          <div className="page-title">Sign in</div>
          <p className="page-subtitle">
            {demo
              ? 'Demo mode — credentials are pre-filled. Data is mocked in the browser.'
              : 'Log in to manage preview instances.'}
          </p>
          {demo ? (
            <div className="mt-3 rounded-lg border border-sky-400/25 bg-sky-950/30 px-3 py-2 text-xs text-sky-100/85">
              Try admin or switch to{' '}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setEmail(DEMO_CREDENTIALS.operator.email);
                  setPassword(DEMO_CREDENTIALS.operator.password);
                }}
              >
                operator@demo.local
              </button>
              . <Link className="underline" href="/demo">Demo home</Link>
            </div>
          ) : null}
          <div className="h-4" />
          {error ? <div className="alert-error mb-3">{error}</div> : null}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setLoading(true);
              try {
                if (demo) {
                  enableDemoMode();
                }
                const data = await login(email, password);
                setTokenClient(data.access_token);
                setUserClient(data.user);
                router.push('/');
              } catch {
                setError(
                  demo
                    ? 'Use admin@demo.local / demo or operator@demo.local / demo.'
                    : 'Could not sign in.',
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            <label className="mb-1.5 block text-sm text-[#b8bcc4]">Email</label>
            <input
              className="input"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
            <div className="h-3" />
            <label className="mb-1.5 block text-sm text-[#b8bcc4]">Password</label>
            <input
              className="input"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <div className="h-4" />
            <button className="btn btn-primary w-full" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-white/70">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
