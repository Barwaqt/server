import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

for (const fail of [false, true])
  test(`deployment ${fail ? "stops before activation when migration fails" : "migrates before copying and restarting"}`, () => {
    const root = mkdtempSync(join(tmpdir(), "barwaqt-deploy-test-"));
    try {
      const app = join(root, "app"),
        bin = join(root, "bin"),
        release = join(root, "release"),
        log = join(root, "calls");
      for (const dir of [app, bin, release]) mkdirSync(dir);
      writeFileSync(join(app, ".env"), "PORT=4000\n");
      const archive = join(root, "release.tar.gz");
      assert.equal(
        spawnSync("tar", ["-czf", archive, "-C", release, "."]).status,
        0,
      );
      for (const name of ["npm", "node", "pm2", "rsync", "curl"])
        writeFileSync(
          join(bin, name),
          `#!/bin/bash
name=\${0##*/}
printf '%s\\n' "$name $*" >> "$TEST_DEPLOY_LOG"
if [[ "$name" = npm && "$*" = 'run db:migrate' && "$TEST_MIGRATION_FAIL" = yes ]]; then exit 17; fi
if [[ "$name" = node ]]; then echo 4000; fi
`,
          { mode: 0o700 },
        );
      let script = readFileSync(
        new URL("../scripts/deploy.sh", import.meta.url),
        "utf8",
      );
      script = script.replace(
        "app_dir=/var/www/api.barwaqt.com",
        `app_dir='${app}'`,
      );
      // Test the deploy flow without loading the developer's NVM configuration.
      script = script.replace(
        /if \[\[ -s "\$HOME\/\.nvm\/nvm.sh" \]\]; then[\s\S]*?\nfi\n/,
        "",
      );
      const result = spawnSync("bash", ["-s", "--", archive], {
        input: script,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: bin + ":" + process.env.PATH,
          TEST_DEPLOY_LOG: log,
          TEST_MIGRATION_FAIL: fail ? "yes" : "no",
        },
      });
      const calls = readFileSync(log, "utf8").split("\n");
      const migration = calls.indexOf("npm run db:migrate");
      assert.ok(migration > calls.indexOf("npm run db:generate"));
      if (fail) {
        assert.equal(result.status, 17);
        assert.ok(
          !calls.some(
            (c) => c.startsWith("rsync ") || c.startsWith("pm2 restart "),
          ),
        );
      } else {
        assert.equal(result.status, 0, result.stderr);
        const copy = calls.findIndex((c) => c.startsWith("rsync "));
        const restart = calls.indexOf("pm2 restart barwaqt-api --update-env");
        assert.ok(copy > migration);
        assert.ok(restart > copy);
        assert.ok(calls.includes("pm2 save"));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
