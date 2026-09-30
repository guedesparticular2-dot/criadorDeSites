import { cp, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const applicationRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(applicationRoot, ".next", "static");
const destination = join(applicationRoot, ".next", "standalone", "apps", "web", ".next", "static");
const publicSource = join(applicationRoot, "public");
const publicDestination = join(applicationRoot, ".next", "standalone", "apps", "web", "public");

try {
  await stat(source);
  await cp(source, destination, { recursive: true });
  await stat(publicSource);
  await cp(publicSource, publicDestination, { recursive: true });
  console.info("Copied Next static assets and public assets into the standalone bundle.");
} catch (error) {
  console.error("Could not copy standalone static assets.", error);
  process.exitCode = 1;
}
