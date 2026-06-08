import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'path';

const sqlite = new Database(resolve(process.cwd(), 'db.sqlite'));
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
console.log('Migrations applied.');
sqlite.close();
