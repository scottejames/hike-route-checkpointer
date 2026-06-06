#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/deploy.sh [--dry-run]

Deploys the static site runtime files to:
  bill@billrobinson.uk:billrobinson.uk/hike-route-checkpointer/

Environment overrides:
  DEPLOY_SSH_USER       default: bill
  DEPLOY_SSH_HOST       default: billrobinson.uk
  DEPLOY_SSH_PORT       default: 8177
  DEPLOY_REMOTE_DIR     default: billrobinson.uk/hike-route-checkpointer
USAGE
}

dry_run=0
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=1
elif [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
elif [[ $# -gt 0 ]]; then
  usage >&2
  exit 2
fi

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(CDPATH= cd -- "${script_dir}/.." && pwd)"

ssh_user="${DEPLOY_SSH_USER:-bill}"
ssh_host="${DEPLOY_SSH_HOST:-billrobinson.uk}"
ssh_port="${DEPLOY_SSH_PORT:-8177}"
remote_dir="${DEPLOY_REMOTE_DIR:-billrobinson.uk/hike-route-checkpointer}"
remote="${ssh_user}@${ssh_host}"
ssh_cmd=(ssh -p "${ssh_port}")
rsync_cmd=(rsync -az --delete --delete-excluded)

if [[ "${dry_run}" -eq 1 ]]; then
  rsync_cmd+=(--dry-run --itemize-changes)
fi

for required in ssh rsync; do
  if ! command -v "${required}" >/dev/null 2>&1; then
    echo "Missing required command: ${required}" >&2
    exit 1
  fi
done

echo "Deploying ${repo_root}/"
echo "Target: ${remote}:${remote_dir}/"

"${ssh_cmd[@]}" "${remote}" "mkdir -p '${remote_dir}'"

cd "${repo_root}"
"${rsync_cmd[@]}" \
  -e "ssh -p ${ssh_port}" \
  --include '/index.html' \
  --include '/styles.css' \
  --include '/js/' \
  --include '/js/***' \
  --include '/vendor/' \
  --include '/vendor/***' \
  --exclude '*' \
  ./ "${remote}:${remote_dir}/"

if [[ "${dry_run}" -eq 1 ]]; then
  echo "Dry run complete. No files were changed."
else
  echo "Deploy complete."
fi
