// Prints the SQL for Better Auth's tables, for a new file in migrations/. Rerun after adding a Better Auth plugin that stores data.
// Usage: node scripts/auth-schema.mjs > migrations/NNNN_auth.sql
import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { magicLink } from "better-auth/plugins";

const auth = betterAuth({
  database: new DatabaseSync(":memory:"),
  plugins: [magicLink({ sendMagicLink: async () => {} })],
});
const { compileMigrations } = await getMigrations(auth.options);
console.log(await compileMigrations());
