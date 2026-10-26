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

const sandboxGit = (args, cwd) => {
  const result = spawnSync(
    "git",
    [
      "-c",
      "user.name=CI",
      "-c",
      "user.email=ci@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
};

// Run scripts/deploy.sh against a sandbox application directory without NVM.
const deployScript = (app) =>
  readFileSync(new URL("../scripts/deploy.sh", import.meta.url), "utf8")
    .replace("app_dir=/var/www/api.barwaqt.com", `app_dir='${app}'`)
    .replace(/if \[\[ -s "\$HOME\/\.nvm\/nvm.sh" \]\]; then[\s\S]*?\nfi\n/, "");

test("deployment moves the server's Git checkout to the deployed revision", () => {
  const root = mkdtempSync(join(tmpdir(), "barwaqt-deploy-git-"));
  try {
    const app = join(root, "app"),
      bin = join(root, "bin"),
      work = join(root, "work"),
      origin = join(root, "origin.git");
    mkdirSync(bin);
    mkdirSync(work);
    for (const name of ["npm", "pm2", "rsync", "curl"])
      writeFileSync(join(bin, name), "#!/bin/bash\nexit 0\n", { mode: 0o700 });
    writeFileSync(join(bin, "node"), "#!/bin/bash\necho 4000\n", {
      mode: 0o700,
    });

    sandboxGit(["init", "--bare", "--initial-branch=main", origin]);
    sandboxGit(["init", "--initial-branch=main"], work);
    writeFileSync(join(work, "README.md"), "first release\n");
    writeFileSync(
      join(work, ".gitignore"),
      ".env\n.deploy.lock\n.deployed-revision\nuploads/\n",
    );
    sandboxGit(["add", "-A"], work);
    sandboxGit(["commit", "-m", "first release"], work);
    sandboxGit(["push", origin, "main"], work);

    // The server's clone, one release behind what is about to be deployed.
    assert.equal(spawnSync("git", ["clone", origin, app]).status, 0);
    writeFileSync(join(work, "README.md"), "second release\n");
    sandboxGit(["add", "-A"], work);
    sandboxGit(["commit", "-m", "second release"], work);
    sandboxGit(["push", origin, "main"], work);
    const revision = sandboxGit(["rev-parse", "HEAD"], work);
    const archive = join(root, "release.tar.gz");
    sandboxGit(
      ["archive", "--format=tar.gz", "--output", archive, revision],
      work,
    );

    // Server-owned runtime files that the deployment must not remove.
    mkdirSync(join(app, "uploads"));
    writeFileSync(join(app, ".env"), "PORT=4000\n");
    writeFileSync(join(app, ".deployed-revision"), "previous-release\n");
    writeFileSync(join(app, ".deploy.lock"), "");
    writeFileSync(join(app, "uploads", "runtime.txt"), "keep\n");

    const result = spawnSync("bash", ["-s", "--", archive, revision], {
      input: deployScript(app),
      encoding: "utf8",
      env: { ...process.env, PATH: bin + ":" + process.env.PATH },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.includes(`Git checkout synced to ${revision}`),
      result.stdout,
    );
    assert.equal(sandboxGit(["rev-parse", "HEAD"], app), revision);
    assert.equal(sandboxGit(["status", "--porcelain"], app), "");
    assert.equal(
      readFileSync(join(app, ".deployed-revision"), "utf8").trim(),
      revision,
    );
    assert.equal(readFileSync(join(app, "uploads", "runtime.txt"), "utf8"), "keep\n");
    assert.equal(readFileSync(join(app, ".env"), "utf8"), "PORT=4000\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
