# Backend CI/CD

The backend is its own repository (`Barwaqt/server`); these workflow paths are relative to that repository, not the parent folder containing the frontends.

Pushes and pull requests to `main` run syntax checks, unit tests, migrations and integration tests against disposable PostgreSQL 16. Pushes to `main` automatically deploy after tests pass. Pull requests only run tests. To redeploy manually, use **Actions → Server CI and deployment → Run workflow → main → enable deploy**. No server-side `git pull` is needed. All tests must pass before deployment. Configure branch protection to require the `test` job.

## VPS prerequisites

The workflow targets `/var/www/api.barwaqt.com` and the existing `barwaqt-api` PM2 process. The SSH user must own that process and have write access to the application folder. Prefer a dedicated deployment account; if moving from the current root-owned PM2 process, configure and verify the process under that account first. A different user cannot manage root's PM2 process.

Install Node 24, npm, PM2, rsync, curl and flock (the latter is in util-linux). The script loads `$HOME/.nvm/nvm.sh` and selects Node 24 when NVM exists. PM2 must be installed for that Node version. Verify `node --version` and `pm2 describe barwaqt-api` as the deployment user. Keep the working production `.env` in the application directory. If PM2 separately defines DATABASE_URL, update that configuration too, as exported settings override dotenv.

Create a dedicated SSH key on your trusted computer, and install its public key for the chosen VPS user:

```bash
ssh-keygen -t ed25519 -C github-barwaqt-server -f ~/.ssh/barwaqt_deploy
ssh-copy-id -i ~/.ssh/barwaqt_deploy.pub DEPLOY_USER@VPS_IP
```

## GitHub secrets

In **Settings → Environments**, create `production`, restrict its deployment branches to `main`, and add the secrets below. For unattended deployment, do not enable required reviewers or wait timers on this environment; existing protection rules can pause the job.

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

The workflow uploads the tested Git revision, installs production dependencies in a temporary folder, generates Prisma, and runs `npm run db:migrate` (`prisma migrate deploy`) against production. Pending migrations are applied automatically from the tested revision. If migration fails, deployment stops before copying live files or restarting PM2. On success it copies files, restarts PM2, saves its process list, and checks local and public `/ready`.

Production migrations are automatic; seeds are not. No manual `git pull` or migration command is needed for normal deployment. Review migrations before merging and maintain database backups. Migrations must remain compatible with the currently running application, which continues serving while migrations run. A failed migration may need operator repair before redeploying; the pipeline never resets the database or marks failed migrations as resolved. Catalog seeding still requires frontend images under `/var/www/barwaqt.com/public`; this backend-only workflow does not upload those assets.

`.env`, `.env.*`, `.git`, uploads and the local vendor credentials file are excluded from synchronization. No destination files are deleted. Consequently, removed source files and obsolete dependencies can remain on the VPS; review and remove stale files separately when needed. Store custom runtime files outside source directories to avoid name collisions.

Deployment is in place with a brief restart, not zero downtime. There is no automatic rollback. On failure, inspect Actions and `pm2 logs barwaqt-api --lines 80 --nostream`; fix forward or deploy a reviewed revert from main. Code rollback does not reverse database migrations.

Commit and push the workflow, deployment script and this guide to the backend repository. Configure secrets and prerequisites before pushing: each push to `main` triggers deployment. Check that both `test` and `deploy` finish successfully in Actions. Deployment copies files without updating the VPS Git metadata, so `git log` on the VPS is not a deployment status check.
