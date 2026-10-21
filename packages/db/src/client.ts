import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema.js";

export function createDatabase(connectionString: string) {
  const pool = mysql.createPool(connectionString);
  return drizzle(pool, { schema, mode: "default" });
}

export type Database = ReturnType<typeof createDatabase>;
