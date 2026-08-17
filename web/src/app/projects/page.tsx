"use client";

import { PageContainer } from "@/components/PageContainer";
import { PageHeader } from "@/components/PageHeader";
import { ReloadButton } from "@/components/ReloadButton";
import { NodeBadge } from "@/components/NodeBadge";
import { RequireAuth } from "@/components/RequireAuth";
import { getUserClient, isAdmin } from "@/lib/client-auth";
import { ClientTable } from "@/components/ClientTable";
import { parseProjectRegistrationJson } from "@/lib/project-registration-json";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createProject, listProjects, type Project } from "./::handlers/projects";

export default function ProjectsPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState(() => isAdmin(getUserClient()));
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [slug, setSlug] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch {
      setError("Could not load projects.");
    }
  }, []);

  useEffect(() => {
    void load();
    setAdmin(isAdmin(getUserClient()));
  }, [load]);

  async function submitProject(fields: {
    slug: string;
    gitUrl: string;
    serverUrl: string | null;
  }) {
    setFormError(null);
    setCreating(true);
    try {
      const created = await createProject({
        slug: fields.slug,
        gitUrl: fields.gitUrl,
        serverUrl: fields.serverUrl,
      });
      setProjects((prev) =>
        [...(prev ?? []), created].sort((a, b) => a.slug.localeCompare(b.slug)),
      );
      setSlug("");
      setGitUrl("");
      setServerUrl("");
      setImportJson("");
      setImportError(null);
      setShowForm(false);
    } catch {
      setFormError(
        "Could not create project. Check slug (lowercase, hyphens) and git URL.",
      );
    } finally {
      setCreating(false);
    }
  }

  function applyImportJson() {
    setImportError(null);
    try {
      const fields = parseProjectRegistrationJson(importJson);
      setSlug(fields.slug);
      setGitUrl(fields.gitUrl);
      setServerUrl(fields.serverUrl ?? "");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Invalid registration JSON.");
    }
  }

  return (
    <RequireAuth>
      <PageContainer>
        <PageHeader
          title="Projects"
          subtitle="Slugs are used by the GitHub Action when calling deploy. Run previa project init in your app repo to get a registration JSON."
          action={
            <div className="flex items-center gap-2">
              <ReloadButton onReload={load} title="Reload projects" />
              {admin ? (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => {
                    setShowForm((v) => !v);
                    setFormError(null);
                    setImportError(null);
                  }}
                >
                  {showForm ? "Cancel" : "Add project"}
                </button>
              ) : null}
            </div>
          }
        />

        {admin && showForm ? (
          <div className="card mb-5 space-y-6 p-5">
            <div>
              <h2 className="text-sm font-medium text-[#e8eaed]">
                Import registration JSON
              </h2>
              <p className="mt-1 text-xs text-[#8b919a]">
                Paste the JSON printed at the end of{" "}
                <code className="text-[#b8bcc4]">previa project init</code> (between the
                === markers), then apply it to the form or create the project directly.
              </p>
              <textarea
                className="input mt-3 min-h-[140px] font-mono text-xs"
                value={importJson}
                onChange={(e) => {
                  setImportJson(e.target.value);
                  setImportError(null);
                }}
                placeholder='{"slug":"my-app","gitUrl":"https://github.com/org/repo.git","serverUrl":"https://preview.example.com"}'
              />
              {importError ? <div className="alert-error mt-2">{importError}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn"
                  disabled={!importJson.trim()}
                  onClick={applyImportJson}
                >
                  Apply to form
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={creating || !importJson.trim()}
                  onClick={async () => {
                    setImportError(null);
                    try {
                      const fields = parseProjectRegistrationJson(importJson);
                      await submitProject({
                        slug: fields.slug,
                        gitUrl: fields.gitUrl,
                        serverUrl: fields.serverUrl ?? null,
                      });
                    } catch (e) {
                      setImportError(
                        e instanceof Error ? e.message : "Invalid registration JSON.",
                      );
                    }
                  }}
                >
                  {creating ? "Creating…" : "Create from JSON"}
                </button>
              </div>
            </div>

            <form
              className="space-y-4 border-t border-[#3d4048] pt-5"
              onSubmit={async (e) => {
                e.preventDefault();
                await submitProject({
                  slug: slug.trim(),
                  gitUrl: gitUrl.trim(),
                  serverUrl: serverUrl.trim() === "" ? null : serverUrl.trim(),
                });
              }}
            >
              <h2 className="text-sm font-medium text-[#e8eaed]">Manual entry</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm text-[#b8bcc4]">Slug</label>
                  <input
                    className="input"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="my-app"
                    pattern="[a-z0-9][a-z0-9-]*"
                    required
                  />
                  <p className="mt-1 text-xs text-[#8b919a]">
                    Must match the slug embedded in your GitHub Actions workflows.
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-[#b8bcc4]">Git URL</label>
                  <input
                    className="input"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    placeholder="git@github.com:org/repo.git"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm text-[#b8bcc4]">
                    Public URL (optional)
                  </label>
                  <input
                    className="input"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="https://preview.example.com"
                    type="url"
                  />
                  <p className="mt-1 text-xs text-[#8b919a]">
                    The public domain configured in nginx where preview instances are available.
                    Branch previews are served at{' '}
                    <span className="font-mono text-[#b8bcc4]">{'{URL}/{branch-slug}/'}</span>.
                  </p>
                </div>
              </div>
              {formError ? <div className="alert-error">{formError}</div> : null}
              <button className="btn btn-success" type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create project"}
              </button>
            </form>
          </div>
        ) : null}

        <div className="card p-5">
          {error ? <div className="alert-error mb-4">{error}</div> : null}
          <ClientTable
            head={
              <tr>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Slug
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Node
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Git URL
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Public URL
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Created
                </th>
              </tr>
            }
          >
            {(projects ?? []).map((p) => (
              <tr
                key={`${p.nodeId}:${p.id}`}
                role={p.isLocal && admin ? 'button' : undefined}
                tabIndex={p.isLocal && admin ? 0 : undefined}
                className={
                  p.isLocal && admin
                    ? 'cursor-pointer transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-sky-200/30'
                    : ''
                }
                onClick={() => {
                  if (p.isLocal && admin) router.push(`/projects/${p.id}/settings`);
                }}
                onKeyDown={(e) => {
                  if (!p.isLocal || !admin) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/projects/${p.id}/settings`);
                  }
                }}
              >
                <td className="border-b border-white/10 px-3 py-2 font-semibold">
                  {p.slug}
                </td>
                <td className="border-b border-white/10 px-3 py-2">
                  <NodeBadge node={p} />
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  {p.gitUrl}
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  {p.serverUrl ? (
                    <span className="break-all">{p.serverUrl}</span>
                  ) : (
                    <span className="text-white/50">—</span>
                  )}
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  {new Date(p.createdAt).toLocaleString("en-US")}
                </td>
              </tr>
            ))}
            {projects && projects.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-white/70">
                  No projects yet. Click Add project or run previa project init in your app
                  repo.
                </td>
              </tr>
            ) : null}
            {!projects && !error ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-white/70">
                  Loading…
                </td>
              </tr>
            ) : null}
          </ClientTable>
        </div>
      </PageContainer>
    </RequireAuth>
  );
}
