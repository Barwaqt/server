#!/usr/bin/env node
/**
 * One-time (idempotent) migration of legacy relative image paths to absolute
 * upload URLs.
 *
 *   /shop/product-0-0.webp  ->  https://api.barwaqt.com/uploads/<uuid>.webp
 *
 * Each unique legacy path is copied once into <api root>/uploads/public and the
 * relative -> absolute mapping is persisted in .image-url-map.json so re-runs
 * reuse the same URL instead of creating duplicate files or duplicate rows.
 *
 * The API root is detected by walking up from this file until
 * prisma/data/catalog.json is found, so it runs unchanged in the monorepo and in
 * a deployment where the repo root is the web root:
 *
 *   node --env-file=.env scripts/import-public-images.cjs [--dry-run]
 *
 * Legacy images are read from vendor_web/public, admin/public and web/public
 * beside the API root. A deployment that ships only the API can point at the
 * storefront checkout instead: IMAGE_SOURCE_DIR=/var/www/barwaqt.com/public
 */
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs");
const { Pool } = require("pg");

/**
 * Locate the API root by walking up from scripts/ until prisma/data/catalog.json
 * is found. Works both in the monorepo (<repo>/server) and in a deployment where
 * the API repo itself is the web root (for example /var/www/api.example.com).
 */
function findApiRoot() {
  let dir = path.resolve(__dirname, "..");
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(dir, "prisma", "data", "catalog.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, "..");
}

const API_ROOT = findApiRoot();
const WORKSPACE_ROOT = path.dirname(API_ROOT);
const UPLOADS_DIR = path.resolve(API_ROOT, "uploads", "public");
const MAP_FILE = path.resolve(__dirname, ".image-url-map.json");

// New files are served from the public API host.
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || "https://api.barwaqt.com").replace(/\/+$/, "");

// Legacy images live in frontend public dirs (first hit wins). Deployments that
// only ship the API set IMAGE_SOURCE_DIR to the storefront's public folder.
const SOURCE_DIRS = [
  process.env.IMAGE_SOURCE_DIR,
  ...[API_ROOT, WORKSPACE_ROOT].flatMap((root) =>
    ["vendor_web", "admin", "web"].map((app) => path.join(root, app, "public"))
  )
].filter(Boolean);

// The Prisma schema lives in the "barwaqt" schema, so the connection needs a
// matching search_path; DATABASE_URL's ?schema= is Prisma-only and ignored by pg.
const DB_URL = process.env.DATABASE_URL;
const DB_SCHEMA = (() => {
  const m = /[?&]schema=([^&]+)/.exec(DB_URL || "");
  return m ? decodeURIComponent(m[1]) : "public";
})();
const pool = new Pool({
  connectionString: DB_URL,
  options: `-c search_path=${DB_SCHEMA},public`
});

const isRelativeLegacyPath = (value) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//");

function absoluteUrl(uuidName) {
  return `${PUBLIC_API_URL}/uploads/${uuidName}`;
}

async function loadMap() {
  try {
    const raw = await fs.promises.readFile(MAP_FILE, "utf8");
    return new Map(Object.entries(JSON.parse(raw)));
  } catch (err) {
    if (err.code === "ENOENT") return new Map();
    throw err;
  }
}

async function saveMap(map) {
  const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  await writeFile(MAP_FILE, JSON.stringify(Object.fromEntries(sorted), null, 2) + "\n");
}

function resolveSource(relPath) {
  const filename = relPath.replace(/^\/+/, "");
  for (const dir of SOURCE_DIRS) {
    const candidate = path.join(dir, filename);
    try {
      fs.accessSync(candidate);
      return candidate;
    } catch {
      /* try next dir */
    }
  }
  return null;
}

/** sha256 -> existing upload filename, so re-runs reuse files instead of duplicating. */
function buildUploadIndex() {
  const index = new Map();
  let names = [];
  try {
    names = fs.readdirSync(UPLOADS_DIR);
  } catch {
    return index;
  }
  for (const name of names) {
    const full = path.join(UPLOADS_DIR, name);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      const hash = createHash("sha256").update(fs.readFileSync(full)).digest("hex");
      if (!index.has(hash)) index.set(hash, name);
    } catch {
      /* skip unreadable entries */
    }
  }
  return index;
}

/** Returns the absolute URL for a legacy path, copying the file on first sight. */
async function ingest(relPath, map, dryRun, problems, uploadIndex) {
  if (map.has(relPath)) return map.get(relPath);

  const source = resolveSource(relPath);
  if (!source) {
    problems.push(`missing source file: ${relPath}`);
    return null;
  }

  const data = await fs.promises.readFile(source);
  const hash = createHash("sha256").update(data).digest("hex");

  // Already ingested in an earlier run: reuse that file.
  const existing = uploadIndex.get(hash);
  if (existing) {
    const url = absoluteUrl(existing);
    map.set(relPath, url);
    console.log(`♻️  ${relPath} → ${url} (existing upload)`);
    return url;
  }

  if (dryRun) {
    problems.push(`would copy: ${relPath} (from ${source})`);
    return null;
  }

  const ext = path.extname(relPath).toLowerCase() || ".webp";
  const uuidName = `${randomUUID()}${ext}`;
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, uuidName), data);
  uploadIndex.set(hash, uuidName);
  const url = absoluteUrl(uuidName);
  map.set(relPath, url);
  console.log(`✅ ${relPath} → ${url}`);
  return url;
}

/** Collect every legacy relative path referenced by catalog + homepage seed data. */
function collectSeedPaths() {
  const paths = new Set();
  const add = (value) => {
    if (isRelativeLegacyPath(value)) paths.add(value);
  };

  const catalog = JSON.parse(
    fs.readFileSync(path.join(API_ROOT, "prisma", "data", "catalog.json"), "utf8")
  );
  for (const product of catalog.products || []) add(product.image);
  for (const category of catalog.categories || []) add(category.image);

  const homepage = JSON.parse(
    fs.readFileSync(path.join(API_ROOT, "prisma", "homepage-default.json"), "utf8")
  );
  add(homepage.heroMain?.image);
  add(homepage.heroSide?.image);
  add(homepage.upgrade?.image);
  for (const section of ["featured", "banners", "productRows"]) {
    for (const item of homepage[section]?.items || []) add(item.image);
  }

  return paths;
}

/** Replace any string exactly matching a mapped legacy path, recursively. */
function rewriteJson(node, map, changed) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      if (typeof node[i] === "string" && map.has(node[i])) {
        node[i] = map.get(node[i]);
        changed.value = true;
      } else {
        rewriteJson(node[i], map, changed);
      }
    }
    return node;
  }
  if (node && typeof node === "object") {
    for (const key of Object.keys(node)) {
      if (typeof node[key] === "string" && map.has(node[key])) {
        node[key] = map.get(node[key]);
        changed.value = true;
      } else {
        rewriteJson(node[key], map, changed);
      }
    }
  }
  return node;
}

async function migrate({ dryRun }) {
  if (!DB_URL) throw new Error("DATABASE_URL is not set");
  console.log(`🔍 Image migration (dry-run=${dryRun}, schema=${DB_SCHEMA})`);
  console.log(`📁 API root: ${API_ROOT}`);
  console.log(`🖼️  Upload dir: ${UPLOADS_DIR}`);

  const map = await loadMap();
  const uploadIndex = buildUploadIndex();
  const paths = collectSeedPaths();
  console.log(`📸 ${paths.size} legacy relative paths referenced by seed data`);

  const problems = [];
  for (const relPath of paths) {
    await ingest(relPath, map, dryRun, problems, uploadIndex);
  }

  if (!dryRun) await saveMap(map);
  console.log(`🗺️  ${map.size}/${paths.size} paths mapped`);

  if (dryRun) {
    for (const p of problems) console.log(`   • ${p}`);
    console.log("\n--- DRY RUN: no files or database rows were changed ---");
    await pool.end();
    return;
  }
  for (const p of problems) console.warn(`⚠️  ${p}`);

  const client = await pool.connect();
  const summary = {};
  try {
    // --- Product.images (text[]) ---
    {
      const { rows } = await client.query('SELECT id, images FROM "Product"');
      let updated = 0;
      for (const row of rows) {
        const images = row.images || [];
        let changed = false;
        const next = images.map((image) => {
          if (map.has(image)) {
            changed = true;
            return map.get(image);
          }
          return image;
        });
        if (!changed) continue;
        await client.query('UPDATE "Product" SET images = $1 WHERE id = $2', [next, row.id]);
        updated += 1;
      }
      summary.Product = `${updated}/${rows.length}`;
      console.log(`✅ Product.images: ${updated}/${rows.length} updated`);
    }

    // --- Category.image ---
    {
      const { rows } = await client.query('SELECT id, image FROM "Category"');
      let updated = 0;
      for (const row of rows) {
        if (!map.has(row.image)) continue;
        await client.query('UPDATE "Category" SET image = $1 WHERE id = $2', [map.get(row.image), row.id]);
        updated += 1;
      }
      summary.Category = `${updated}/${rows.length}`;
      console.log(`✅ Category.image: ${updated}/${rows.length} updated`);
    }

    // --- StorefrontPage.content (jsonb) ---
    {
      const { rows } = await client.query('SELECT key, content FROM "StorefrontPage"');
      let updated = 0;
      for (const row of rows) {
        const before = JSON.stringify(row.content);
        const changed = { value: false };
        const next = rewriteJson(row.content, map, changed);
        if (!changed.value || JSON.stringify(next) === before) continue;
        await client.query(
          'UPDATE "StorefrontPage" SET content = $1, version = version + 1, "updatedAt" = now() WHERE key = $2',
          [next, row.key]
        );
        updated += 1;
      }
      summary.StorefrontPage = `${updated}/${rows.length}`;
      console.log(`✅ StorefrontPage.content: ${updated}/${rows.length} updated`);
    }

    // --- OrderItem.image ---
    {
      const { rows } = await client.query('SELECT id, image FROM "OrderItem"');
      let updated = 0;
      for (const row of rows) {
        if (!map.has(row.image)) continue;
        await client.query('UPDATE "OrderItem" SET image = $1 WHERE id = $2', [map.get(row.image), row.id]);
        updated += 1;
      }
      summary.OrderItem = `${updated}/${rows.length}`;
      console.log(`✅ OrderItem.image: ${updated}/${rows.length} updated`);
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log("\n📊 Rows updated:", summary);
  console.log("✅ Migration complete.");
}

const dryRun = process.argv.slice(2).includes("--dry-run");
migrate({ dryRun }).catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
