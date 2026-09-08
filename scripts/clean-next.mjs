// Cross-platform, resilient cleaner for the Next.js build cache.
//
// On Windows the `.next` folder is frequently held open by antivirus scans or
// leftover `node` dev-server processes, which produces the recurring
// `UNKNOWN: open ... app-paths-manifest.json` (errno -4094) crash. Deleting the
// cache before a fresh `next dev` avoids serving a corrupted manifest.
//
// This script retries the delete (locks are usually transient) and never throws
// if the folder is already gone, so it is safe to run every time.
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [".next"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function removeWithRetry(path, attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await rm(path, { recursive: true, force: true, maxRetries: 3 });
      return true;
    } catch (err) {
      if (i === attempts) {
        console.warn(`[clean-next] Could not fully remove ${path}: ${err.message}`);
        return false;
      }
      await sleep(300 * i); // back off; locks are usually transient
    }
  }
}

for (const t of targets) {
  const abs = join(root, t);
  if (!existsSync(abs)) {
    console.log(`[clean-next] ${t} not present, skipping.`);
    continue;
  }
  const ok = await removeWithRetry(abs);
  if (ok) console.log(`[clean-next] Removed ${t}.`);
}
