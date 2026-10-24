# Backend CI/CD

The backend is its own repository (`Barwaqt/server`); these workflow paths are relative to that repository, not the parent folder containing the frontends.

Pushes and pull requests to `main` run syntax checks, unit tests, migrations and integration tests against disposable PostgreSQL 16. Deployments are manual: **Actions → Server CI and deployment → Run workflow → main → enable deploy**. All tests must pass before deployment. Configure branch protection to require the `test` job.

## VPS prerequisites

The workflow targets `/var/www/api.barwaqt.com` and the existing `barwaqt-api` PM2 process. The SSH user must own that process and have write access to the application folder. Prefer a dedicated deployment account; if moving from the current root-owned PM2 process, configure and verify the process under that account first. A different user cannot manage root's PM2 process.

Install Node 24, npm, PM2, rsync, curl and flock (the latter is in util-linux). The script loads `$HOME/.nvm/nvm.sh` and selects Node 24 when NVM exists. PM2 must be installed for that Node version. Verify `node --version` and `pm2 describe barwaqt-api` as the deployment user. Keep the working production `.env` in the application directory. If PM2 separately defines DATABASE_URL, update that configuration too, as exported settings override dotenv.

Create a dedicated SSH key on your trusted computer, and install its public key for the chosen VPS user:

```bash
ssh-keygen -t ed25519 -C github-barwaqt-server -f ~/.ssh/barwaqt_deploy
ssh-copy-id -i ~/.ssh/barwaqt_deploy.pub DEPLOY_USER@VPS_IP
```

## GitHub secrets

In **Settings → Environments**, create `production`, restrict its deployment branches to `main`, and add:

| Secret | Value |
| --- | --- |
| DEPLOY_HOST | VPS IP or SSH hostname, without https:// |
| DEPLOY_USER | User owning the configured PM2 process |
| DEPLOY_SSH_KEY | Entire private key file `~/.ssh/barwaqt_deploy` |
| DEPLOY_KNOWN_HOSTS | Verified SSH known_hosts entry for the VPS |

Optional environment variable: `DEPLOY_PORT` (default 22).

Obtain the host key on your trusted computer with `ssh-keyscan -H VPS_IP` (add `-p PORT` for a custom port). Verify its fingerprint against the server's host key through your trusted VPS console before storing it. For example, compare against `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. Do not disable host-key checking.

See [GitHub's environment configuration documentation](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## What deployment does

The workflow uploads the tested Git revision, installs production dependencies in a temporary folder, generates Prisma, and checks migration status. If migrations are pending, deployment stops before changing live application files. Otherwise it copies files, restarts PM2, saves its process list, and checks local and public `/ready`.

Production migrations and seeds are not automatic. For a revision with migrations, review and back up the database, upload that revision's migration files to the VPS, run `npm run db:migrate` from the backend directory, then rerun deployment. Migrations must remain compatible with the currently running application. Catalog seeding still requires frontend images under `/var/www/web/public`; this backend-only workflow does not upload those assets.

`.env`, `.env.*`, `.git`, uploads and the local vendor credentials file are excluded from synchronization. No destination files are deleted. Consequently, removed source files and obsolete dependencies can remain on the VPS; review and remove stale files separately when needed. Store custom runtime files outside source directories to avoid name collisions.

Deployment is in place with a brief restart, not zero downtime. There is no automatic rollback. On failure, inspect Actions and `pm2 logs barwaqt-api --lines 80 --nostream`; fix forward or deploy a reviewed revert from main. Code rollback does not reverse database migrations.

Commit and push the workflow, deployment script and this guide to the backend repository. Configure secrets and prerequisites before requesting deployment. Local creation of these files does not activate GitHub Actions or change the VPS.
