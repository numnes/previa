'use client';

import { useEffect, useState } from 'react';
import { CodeBlock } from '@/components/CodeBlock';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import {
  fetchProjectTemplates,
  type ProjectTemplatesResult,
} from '../::handlers/setup';

export default function SetupGithubActionsPage() {
  const [templates, setTemplates] = useState<ProjectTemplatesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchProjectTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load templates');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const workflowFiles =
    templates?.files.filter((f) => f.path.startsWith('.github/workflows/')) ?? [];
  const previaYaml = templates?.files.find((f) => f.path === 'previa.yaml');

  return (
    <RequireAuth>
      <PageContainer>
        <PageHeader
          title="GitHub Actions"
          subtitle="Workflows for deploy on PR open/update and teardown on PR close or branch delete."
        />
        <div className="card p-5">
          <div className="space-y-8 text-sm text-[#b8bcc4]">
            <section>
              <h2 className="font-medium text-[#e8eaed]">1. Automatic setup (recommended)</h2>
              <p className="mt-2">
                From your application repo root, run the command below. It creates{' '}
                <code className="rounded bg-[#2b2e33] px-1.5 py-0.5 text-xs">.github/workflows/</code>{' '}
                with both workflows and copies{' '}
                <code className="rounded bg-[#2b2e33] px-1.5 py-0.5 text-xs">previa.yaml</code>{' '}
                to the project root.
              </p>
              <div className="mt-3">
                <CodeBlock
                  title="Terminal — in your app folder"
                  content={`# current directory\n${templates?.cliCommand ?? 'previa project init'}\n\n# explicit path\n${templates?.cliCommand ?? 'previa project init'} ../my-app\n\n# PR target branches (default: master,homologation)\n${templates?.cliCommand ?? 'previa project init'} --branches main,develop\n\n# overwrite existing files\n${templates?.cliCommand ?? 'previa project init'} --force`}
                />
              </div>
              <p className="mt-3 text-[#8b919a]">
                Files created:{' '}
                <code className="text-xs">.github/workflows/deploy-preview.yml</code>,{' '}
                <code className="text-xs">.github/workflows/teardown-preview.yml</code>,{' '}
                <code className="text-xs">previa.yaml</code>. Then adjust{' '}
                <code className="text-xs">previa.yaml</code> (build and PM2 target) and commit.
              </p>
            </section>

            <section>
              <h2 className="font-medium text-[#e8eaed]">2. Workflow contents</h2>
              <p className="mt-2">
                To copy manually, use the files below in your app repo{' '}
                <code className="rounded bg-[#2b2e33] px-1.5 py-0.5 text-xs">.github/workflows/</code>.
              </p>
              {loading ? (
                <p className="mt-4 text-[#8b919a]">Loading templates…</p>
              ) : error ? (
                <p className="mt-4 text-red-400">{error}</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {workflowFiles.map((file) => (
                    <CodeBlock
                      key={file.path}
                      title={file.path.split('/').pop() ?? file.path}
                      path={file.path}
                      content={file.content}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="font-medium text-[#e8eaed]">3. previa.yaml</h2>
              <p className="mt-2">
                At the application repo root (same level as the clone). Defines build commands and
                the PM2 entrypoint.
              </p>
              {previaYaml ? (
                <div className="mt-4">
                  <CodeBlock
                    title="previa.yaml"
                    path={previaYaml.path}
                    content={previaYaml.content}
                  />
                </div>
              ) : null}
            </section>

            <section>
              <h2 className="font-medium text-[#e8eaed]">4. Register the project in previa</h2>
              <p className="mt-2">
                <code className="text-xs">previa project init</code> detects metadata from your
                repo (Git remote, <code className="text-xs">package.json</code> name, or folder
                name), asks for anything missing, copies workflow files, then prints a{' '}
                <strong className="text-[#e8eaed]">registration JSON</strong> between{' '}
                <code className="text-xs">=== Registration JSON ===</code> markers.
              </p>
              <p className="mt-2">Auto-detected when possible:</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>
                  <strong className="text-[#e8eaed]">gitUrl</strong> —{' '}
                  <code className="text-xs">git remote get-url origin</code> (SSH URLs are
                  converted to HTTPS)
                </li>
                <li>
                  <strong className="text-[#e8eaed]">slug</strong> — npm{' '}
                  <code className="text-xs">package.json</code> name or repository folder name
                </li>
                <li>
                  <strong className="text-[#e8eaed]">serverUrl</strong> — optional; the public
                  domain configured in nginx where preview instances are available (e.g.{' '}
                  <code className="text-xs">https://preview.example.com</code>). Each branch is
                  served at <code className="text-xs">{'{URL}/{project-slug}/{branch-slug}/'}</code>
                </li>
              </ul>
              <p className="mt-3">Import the JSON in the dashboard:</p>
              <ol className="mt-2 list-inside list-decimal space-y-1">
                <li>
                  Copy the JSON block from the terminal (from{' '}
                  <code className="text-xs">previa project init</code>)
                </li>
                <li>
                  Open <strong className="text-[#e8eaed]">Projects → Add project</strong>
                </li>
                <li>
                  Paste into <strong className="text-[#e8eaed]">Import registration JSON</strong>
                </li>
                <li>
                  Click <strong className="text-[#e8eaed]">Create from JSON</strong> (or{' '}
                  <strong className="text-[#e8eaed]">Apply to form</strong> to review first)
                </li>
              </ol>
              <div className="mt-4">
                <CodeBlock
                  title="Example registration JSON (printed by previa project init)"
                  content={`{
  "slug": "my-app",
  "gitUrl": "https://github.com/org/my-app.git",
  "serverUrl": "https://preview.example.com"
}`}
                />
              </div>
              <p className="mt-3 text-[#8b919a]">
                After importing, configure GitHub secrets{' '}
                <code className="text-xs">PREVIA_API_URL</code> and{' '}
                <code className="text-xs">PREVIA_API_KEY</code>. The project slug is written into
                the workflow files by <code className="text-xs">previa project init</code>. See{' '}
                <strong className="text-[#b8bcc4]">Setup → Secrets</strong>.
              </p>
              <p className="mt-2 text-[#8b919a]">
                Non-interactive env vars for <code className="text-xs">previa project init</code>:{' '}
                <code className="text-xs">PREVIA_PROJECT_SLUG</code>,{' '}
                <code className="text-xs">PREVIA_PROJECT_GIT_URL</code>,{' '}
                <code className="text-xs">PREVIA_PROJECT_SERVER_URL</code> (optional).
              </p>
            </section>

            <section>
              <h2 className="font-medium text-[#e8eaed]">5. Instances</h2>
              <p className="mt-2">
                Open <strong className="text-[#e8eaed]">Instances</strong> to list previews, filter
                by project/branch or status, and open a row for logs, pause, restart, or destroy.
                Status cards on the dashboard link here with the status filter applied.
              </p>
            </section>

            <section>
              <h2 className="font-medium text-[#e8eaed]">6. Deploy flow</h2>
              <ol className="mt-2 list-inside list-decimal space-y-1">
                <li>PR opened/updated triggers the workflow</li>
                <li>
                  <code className="text-xs">POST /deploy</code> with project + branch
                </li>
                <li>API queues the job; core clones, builds, and starts PM2</li>
                <li>
                  Preview at {'{project URL}'}/{'{project-slug}'}/{'{branch-slug}'}/
                </li>
                <li>
                  On PR close, <code className="text-xs">POST /deploy/destroy</code> removes the
                  instance
                </li>
              </ol>
            </section>
          </div>
        </div>
      </PageContainer>
    </RequireAuth>
  );
}
