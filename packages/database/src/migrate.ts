import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabaseClient } from "./client";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(here, "../migrations");
const sql = createDatabaseClient();

await sql`
  create table if not exists schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )
`;

const applied = new Set((await sql`select filename from schema_migrations`).map((row) => row.filename as string));
const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  if (applied.has(file)) continue;
  const migration = await readFile(join(migrationsDirectory, file), "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(migration);
    await tx`insert into schema_migrations (filename) values (${file})`;
  });
  console.info(`applied ${file}`);
}

await sql.end();
