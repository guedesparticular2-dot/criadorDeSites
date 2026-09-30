import postgres from "postgres";
import { setRlsContext } from "./rls-context";

export type DatabaseQuery = postgres.ISql;

export function createDatabaseClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return postgres(databaseUrl, { max: 10, idle_timeout: 20, connect_timeout: 10 });
}

export async function withTenantTransaction<T>(
  tenantId: string,
  actorUserId: string,
  work: (sql: postgres.TransactionSql) => Promise<T>,
) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId: actorUserId });
      return work(tx);
    });
  } finally {
    await sql.end();
  }
}
