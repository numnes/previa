#!/usr/bin/env bash
# Shared hint for configuring Git access on the root machine.

print_github_credentials_hint() {
  cat <<'EOF'

=== GitHub credentials on the root machine ===

The previa clones application repositories on the root server.
Configure access before the first deploy:

Option A — SSH deploy key (recommended for servers)
  ssh-keygen -t ed25519 -C "previa@$(hostname)" -f ~/.ssh/previa_deploy_key -N ""
  cat ~/.ssh/previa_deploy_key.pub
  # Add the public key as a Deploy Key (read-only) on each app repo in GitHub.

  export GIT_SSH_COMMAND='ssh -i ~/.ssh/previa_deploy_key -o IdentitiesOnly=yes'
  # Persist in ~/.bashrc or export before starting the API (PM2).

Option B — HTTPS with Personal Access Token
  git config --global credential.helper store
  git clone https://github.com/org/private-repo.git
  # Username: your-github-user
  # Password: ghp_... (PAT with repo read scope)

Option C — gh CLI
  gh auth login

Test:
  git ls-remote <your-repo-git-url>

EOF
}

print_registry_setup_hint() {
  local registry="${1:-ghcr.io}"
  local image_name="${2:-owner/app}"

  cat <<EOF

=== Docker registry on the root machine (image built on GitHub) ===

The workflow pushes images to: ${registry}/${image_name}
The root server must be able to pull them on deploy.

1. Create a token with read access to the registry (GHCR: read:packages).
2. On the root machine:

   echo "\$CR_PAT" | docker login ${registry} -u YOUR_GITHUB_USER --password-stdin

3. Ensure package visibility allows the root server to pull.

Building on GitHub uses Actions minutes but saves CPU on the root server.

EOF
}
