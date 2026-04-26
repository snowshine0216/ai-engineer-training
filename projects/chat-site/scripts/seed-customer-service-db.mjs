import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const dbPath = resolve(root, process.env.CUSTOMER_SERVICE_DB_PATH ?? "data/customer-service/customer-service.sqlite");
const schemaPath = resolve(root, "data/customer-service/schema.sql");
const seedPath = resolve(root, "data/customer-service/seed.sql");

mkdirSync(dirname(dbPath), { recursive: true });
rmSync(dbPath, { force: true });

const db = new DatabaseSync(dbPath);
try {
  db.exec(readFileSync(schemaPath, "utf8"));
  db.exec(readFileSync(seedPath, "utf8"));
  const count = db.prepare("SELECT COUNT(*) AS count FROM orders").get();
  console.log(`Seeded ${count.count} orders into ${dbPath}`);
} finally {
  db.close();
}
