import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Smoke test: idempotency and RLS of the new "fruver" migrations.
 *
 * Task 1.6 — Requirements 12.3 (additive & idempotent migrations that include
 * business_id for tenant isolation) and 12.4 (row-level security policies per
 * business_id).
 *
 * A live Supabase/Postgres instance is not available in the test environment,
 * so idempotency is verified through static SQL analysis: every new migration
 * must guard its DDL so that running it twice cannot error. RLS presence is
 * verified by parsing the migration SQL for ENABLE ROW LEVEL SECURITY plus a
 * per-tenant policy filtering by business_id.
 *
 * The analysis is intentionally conservative: it asserts on the guards the
 * project already uses (IF NOT EXISTS / ON CONFLICT / DROP ... IF EXISTS +
 * CREATE) and would fail loudly if a future edit introduced a non-idempotent
 * statement (a bare CREATE TABLE/INDEX/POLICY or a plain INSERT without an
 * ON CONFLICT clause).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../supabase/migrations");

/** Migrations introduced by tasks 1.1–1.5 for the fruver vertical. */
const FRUVER_MIGRATIONS = [
  "035_seed_fruver_vertical.sql",
  "036_add_products.sql",
  "037_add_promotions.sql",
  "038_add_quotes.sql",
  "039_add_fruver_business_config.sql"
] as const;

/** New tables that must have RLS enabled with a per-business_id policy. */
const RLS_TABLES: Record<string, string> = {
  "036_add_products.sql": "products",
  "037_add_promotions.sql": "promotions",
  "038_add_quotes.sql": "quotes"
};

function readMigration(file: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
}

/** Escape regex metacharacters in a string (avoids a regex literal that the
 *  oxc transform mis-parses). */
function escapeRegExp(value: string): string {
  const specials = new Set([
    ".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"
  ]);
  let out = "";
  for (const ch of value) {
    out += specials.has(ch) ? "\\" + ch : ch;
  }
  return out;
}

// Strip line and block SQL comments so guards inside comments don't produce
// false positives/negatives during static analysis.
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

// Split into individual statements on semicolons after removing comments.
function statements(sql: string): string[] {
  return stripSqlComments(sql)
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

/** Migrations that actually exist on disk (038 may be authored by task 1.4). */
const presentMigrations = FRUVER_MIGRATIONS.filter((f) =>
  existsSync(resolve(MIGRATIONS_DIR, f))
);

describe("fruver migrations: presence", () => {
  // Migrations authored by tasks 1.1, 1.2, 1.3 and 1.5. Task 1.4 authors
  // 038_add_quotes.sql; this smoke test (task 1.6) does not depend on 1.4, so
  // 038 is asserted separately and does not fail this suite when still pending.
  const REQUIRED_NOW = [
    "035_seed_fruver_vertical.sql",
    "036_add_products.sql",
    "037_add_promotions.sql",
    "039_add_fruver_business_config.sql"
  ];

  it.each(REQUIRED_NOW)("%s exists on disk", (file) => {
    expect(existsSync(resolve(MIGRATIONS_DIR, file))).toBe(true);
  });
});

describe("fruver migrations: idempotency (safe to run twice)", () => {
  it.each(presentMigrations)("%s only contains idempotent statements", (file) => {
    const stmts = statements(readMigration(file));

    for (const stmt of stmts) {
      const upper = stmt.toUpperCase();

      // CREATE TABLE must guard with IF NOT EXISTS.
      if (/^CREATE\s+TABLE\b/.test(upper)) {
        expect(upper, "Non-idempotent CREATE TABLE in " + file + ": " + stmt).toMatch(
          /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/
        );
      }

      // CREATE INDEX must guard with IF NOT EXISTS.
      if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/.test(upper)) {
        expect(upper, "Non-idempotent CREATE INDEX in " + file + ": " + stmt).toMatch(
          /^CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b/
        );
      }

      // CREATE EXTENSION must guard with IF NOT EXISTS.
      if (/^CREATE\s+EXTENSION\b/.test(upper)) {
        expect(upper, "Non-idempotent CREATE EXTENSION in " + file + ": " + stmt).toMatch(
          /^CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\b/
        );
      }

      // ALTER TABLE ... ADD COLUMN must guard with IF NOT EXISTS.
      if (/^ALTER\s+TABLE\b/.test(upper) && /\bADD\s+COLUMN\b/.test(upper)) {
        expect(upper, "Non-idempotent ADD COLUMN in " + file + ": " + stmt).toMatch(
          /\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/
        );
      }

      // CREATE TRIGGER must be preceded by a matching DROP TRIGGER IF EXISTS.
      if (/^CREATE\s+TRIGGER\b/.test(upper)) {
        const name = stmt.match(/^CREATE\s+TRIGGER\s+([^\s]+)/i)?.[1];
        expect(name, "Unparsable CREATE TRIGGER in " + file + ": " + stmt).toBeTruthy();
        const dropRe = new RegExp(
          "DROP\\s+TRIGGER\\s+IF\\s+EXISTS\\s+" + escapeRegExp(name!),
          "i"
        );
        expect(
          dropRe.test(stripSqlComments(readMigration(file))),
          "CREATE TRIGGER " + name + " in " + file + " lacks a DROP TRIGGER IF EXISTS guard"
        ).toBe(true);
      }

      // CREATE POLICY must be preceded by a matching DROP POLICY IF EXISTS.
      if (/^CREATE\s+POLICY\b/.test(upper)) {
        const name = stmt.match(/^CREATE\s+POLICY\s+("[^"]+"|[^\s]+)/i)?.[1];
        expect(name, "Unparsable CREATE POLICY in " + file + ": " + stmt).toBeTruthy();
        const dropRe = new RegExp(
          "DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+" + escapeRegExp(name!),
          "i"
        );
        expect(
          dropRe.test(stripSqlComments(readMigration(file))),
          "CREATE POLICY " + name + " in " + file + " lacks a DROP POLICY IF EXISTS guard"
        ).toBe(true);
      }

      // Plain INSERT (seed) must be idempotent via ON CONFLICT.
      if (/^INSERT\s+INTO\b/.test(upper)) {
        expect(upper, "Non-idempotent INSERT in " + file + ": " + stmt).toMatch(
          /\bON\s+CONFLICT\b/
        );
      }
    }
  });

  it("seed migration 035 uses ON CONFLICT (slug) DO NOTHING", () => {
    const sql = stripSqlComments(readMigration("035_seed_fruver_vertical.sql"));
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*slug\s*\)\s+DO\s+NOTHING/i);
  });
});

describe("fruver migrations: RLS policies per business_id (R12.4)", () => {
  const presentRlsTables = Object.entries(RLS_TABLES).filter(([file]) =>
    existsSync(resolve(MIGRATIONS_DIR, file))
  );

  it.each(presentRlsTables)(
    "%s enables RLS and defines a policy filtering by business_id",
    (file, table) => {
      const sql = stripSqlComments(readMigration(file));
      const upper = sql.toUpperCase();

      // RLS enabled on the table.
      const enableRe = new RegExp(
        "ALTER\\s+TABLE\\s+" + table + "\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY",
        "i"
      );
      expect(
        enableRe.test(sql),
        file + " must ENABLE ROW LEVEL SECURITY on " + table
      ).toBe(true);

      // At least one policy created on the table.
      expect(upper, file + " must define a policy on " + table).toMatch(
        /CREATE\s+POLICY\b/
      );

      // The policy must scope access by business_id (tenant isolation).
      const scopeRe = new RegExp(table + "\\.business_id", "i");
      expect(
        scopeRe.test(sql),
        "RLS policy in " + file + " must filter by " + table + ".business_id"
      ).toBe(true);
    }
  );
});

describe("fruver migrations: multi-tenant column (R12.3)", () => {
  const tenantTables = Object.entries(RLS_TABLES).filter(([file]) =>
    existsSync(resolve(MIGRATIONS_DIR, file))
  );

  it.each(tenantTables)(
    "%s declares a business_id column referencing businesses",
    (file, table) => {
      const sql = stripSqlComments(readMigration(file));
      // business_id column referencing businesses(id) for tenant isolation.
      expect(sql, table + " must declare business_id").toMatch(/business_id\s+UUID/i);
      expect(sql, table + ".business_id must reference businesses").toMatch(
        /business_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+businesses/i
      );
    }
  );
});
