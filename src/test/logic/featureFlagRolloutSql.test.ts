/// <reference types="node" />
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

const companyA = "00000000-0000-0000-0000-000000000001";
const companyB = "00000000-0000-0000-0000-000000000002";
const companyC = "00000000-0000-0000-0000-000000000003";
const companyD = "00000000-0000-0000-0000-000000000004";
const admin = "00000000-0000-0000-0000-000000000010";
const rollout = readFileSync("supabase/migrations/20290505101500_feature_flags_rollout_atomico.sql", "utf8");
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    CREATE TYPE app_role AS ENUM ('super_admin', 'admin');
    CREATE TYPE feature_access_level AS ENUM ('enabled', 'preview', 'disabled');
    CREATE FUNCTION public.has_role(uuid, app_role) RETURNS boolean LANGUAGE sql STABLE AS
      'SELECT $1 = ''${admin}''::uuid AND $2 = ''super_admin''';
    CREATE TABLE companies (id uuid PRIMARY KEY);
    CREATE TABLE platform_feature_flags (key text PRIMARY KEY);
    CREATE TABLE company_feature_overrides (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id uuid NOT NULL REFERENCES companies(id),
      feature_key text NOT NULL REFERENCES platform_feature_flags(key),
      is_enabled boolean,
      access_level feature_access_level,
      expires_at timestamptz,
      limit_value integer,
      price_override numeric(10,2),
      updated_at timestamptz,
      UNIQUE (company_id, feature_key)
    );
    ALTER TABLE company_feature_overrides ENABLE ROW LEVEL SECURITY;
    ALTER TABLE platform_feature_flags ENABLE ROW LEVEL SECURITY;
    CREATE POLICY admin_flags ON platform_feature_flags FOR ALL TO authenticated
      USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
    CREATE POLICY admin_overrides ON company_feature_overrides FOR ALL TO authenticated
      USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
    GRANT SELECT ON companies TO authenticated;
    GRANT SELECT, UPDATE ON platform_feature_flags TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON company_feature_overrides TO authenticated;
    INSERT INTO platform_feature_flags VALUES ('calendario');
    INSERT INTO companies VALUES ('${companyA}'), ('${companyB}'), ('${companyC}'), ('${companyD}');
  `);
  await db.exec(rollout);
}, 60_000);

beforeEach(async () => {
  await db.exec(`
    RESET ROLE;
    TRUNCATE company_feature_overrides;
    INSERT INTO company_feature_overrides
      (company_id, feature_key, is_enabled, access_level, expires_at, limit_value, price_override, updated_at)
    VALUES
      ('${companyA}', 'calendario', false, 'disabled', '2000-01-01Z', 5, 19.95, '2026-11-20Z'),
      ('${companyB}', 'calendario', false, 'preview', '2099-01-01Z', NULL, NULL, '2026-11-20Z'),
      ('${companyC}', 'calendario', false, 'preview', '2099-01-01Z', 3, 8.50, '2026-11-20Z');
    SET ROLE authenticated;
    SET request.jwt.claim.sub = '${admin}';
  `);
});

afterAll(async () => db?.close());

async function picture(company: string) {
  const { rows } = await db.query<{ preview: unknown }>(
    "SELECT to_jsonb(company_feature_overrides) AS preview FROM company_feature_overrides WHERE company_id = $1",
    [company],
  );
  return rows[0].preview;
}

const apply = (enable: string[], remove: unknown[]) => db.query(
  "SELECT public.admin_apply_feature_rollout('calendario', $1::uuid[], $2::jsonb)",
  [enable, JSON.stringify(remove)],
);

it("abilita e rimuove nella stessa transazione conservando le eccezioni fuori dall'anteprima", async () => {
  const removal = await picture(companyC);
  await db.query(
    "INSERT INTO company_feature_overrides(company_id, feature_key, access_level) VALUES ($1, 'calendario', 'disabled')",
    [companyD],
  );
  await apply([companyA, companyB], [removal]);
  expect(await picture(companyA)).toMatchObject({ access_level: "enabled", expires_at: null, limit_value: 5, price_override: 19.95 });
  expect(await picture(companyB)).toMatchObject({ access_level: "enabled", expires_at: expect.stringContaining("2099-01-01") });
  expect((await db.query("SELECT company_id FROM company_feature_overrides ORDER BY company_id")).rows).toEqual([
    { company_id: companyA }, { company_id: companyB }, { company_id: companyD },
  ]);
});

it("annulla anche le abilitazioni se un'eccezione è stata modificata dopo l'anteprima", async () => {
  const removal = await picture(companyC);
  await db.query("UPDATE company_feature_overrides SET price_override = 25 WHERE company_id = $1", [companyC]);
  await expect(apply([companyA, companyB], [removal])).rejects.toMatchObject({ code: "40001" });
  expect(await picture(companyA)).toMatchObject({ access_level: "disabled", expires_at: expect.stringContaining("2000-01-01") });
  expect(await picture(companyB)).toMatchObject({ access_level: "preview" });
  expect(await picture(companyC)).toMatchObject({ access_level: "preview", price_override: 25 });
});

it("nega l'operazione a utenti non amministratori e anonimi", async () => {
  await db.exec(`SET request.jwt.claim.sub = '${companyB}'`);
  await expect(apply([companyA], [])).rejects.toMatchObject({ code: "42501" });
  await db.exec("SET ROLE anon");
  await expect(apply([companyA], [])).rejects.toMatchObject({ code: "42501" });
});
