#!/usr/bin/env bash
# Run through the production deployment job after CI succeeds.
set -euo pipefail
umask 077
archive=${1:?Expected deployment archive path}
# Optional: the tested Git revision, used to sync the server's checkout.
revision=${2:-}
app_dir=/var/www/api.barwaqt.com
app_name=barwaqt-api
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 24
fi
for tool in node npm pm2 rsync curl flock; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done
[[ -f "$app_dir/.env" ]] || { echo "Missing $app_dir/.env" >&2; exit 1; }
pm2 describe "$app_name" >/dev/null
# Bring the server's Git checkout to the revision that was just deployed, so the
# deployment account never needs a manual `git pull` and `git log`/`git status`
# report what is actually running. Best effort: the release is already live and
# healthy, so a failed fetch warns instead of failing the deployment.
sync_git_checkout() {
  [[ -n "${revision:-}" ]] || return 0
  git -C "$app_dir" rev-parse --git-dir >/dev/null 2>&1 || return 0
  if ! GIT_TERMINAL_PROMPT=0 timeout 60 git -C "$app_dir" \
    fetch --quiet --prune origin </dev/null; then
    echo "Warning: cannot fetch origin; Git checkout left unsynced." >&2
    return 0
  fi
  if git -C "$app_dir" reset --hard --quiet "$revision" </dev/null; then
    echo "Git checkout synced to $revision"
  else
    echo "Warning: cannot move the Git checkout to $revision." >&2
  fi
  return 0
}
exec 9>"$app_dir/.deploy.lock"
flock -w 600 9
stage=$(mktemp -d /tmp/barwaqt-release.XXXXXXXX)
trap 'rm -rf "$stage"; rm -f "$archive"' EXIT
tar -xzf "$archive" -C "$stage"
ln -s "$app_dir/.env" "$stage/.env"
cd "$stage"
unset DATABASE_URL
npm ci --omit=dev
npm run db:generate
# Apply this tested release's migrations before updating live application files.
# set -e stops deployment without copying files or restarting PM2 if migration fails.
npm run db:migrate
# No deletion: preserve server-owned files and existing uploaded assets.
rsync -a \
  --exclude='.git/' --exclude='.env' --exclude='.env.*' \
  --exclude='.seed-vendor.local.json' --exclude='uploads/' \
  --exclude='.deploy.lock' --exclude='.email-preview/' \
  "$stage/" "$app_dir/"
cd "$app_dir"
pm2 restart "$app_name" --update-env
port=$(node --input-type=module -e 'import "dotenv/config"; console.log(process.env.PORT || 4000)')
for attempt in {1..12}; do
  if curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$port/ready"; then
    if [[ -n "$revision" ]]; then
      printf '%s\n' "$revision" > .deployed-revision
    fi
    sync_git_checkout
    pm2 save
    echo "Deployment complete."
    exit 0
  fi
  sleep 5
done
echo "Readiness failed. Inspect: pm2 logs $app_name --lines 80 --nostream" >&2
exit 1
