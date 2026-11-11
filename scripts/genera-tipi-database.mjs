#!/usr/bin/env node
/**
 * Rigenera src/integrations/supabase/types.ts dal database (11/11/2026).
 *
 * Il file era fermo da settimane: 260 tabelle su 1.324 non c'erano, e il codice che le usa
 * passava da cast («as never», «as unknown as») che spengono il controllo. Una colonna sbagliata
 * in quei punti non la vedeva nessuno. Da qui in poi il file si rifà con questo script, mai a mano.
 *
 * Una correzione sul generato: le colonne NOT NULL senza default che un trigger BEFORE INSERT
 * riempie da sé (`NEW.colonna := …` o `… INTO NEW.colonna`: l'IVA dalla ditta, il numero
 * progressivo, l'azienda dalla riga madre) diventano facoltative in `Insert`. Il generatore non
 * guarda i trigger e le segnerebbe obbligatorie, costringendo a scrivere valori finti o cast.
 *
 * Uso (dalla radice del repository, con la CLI collegata al progetto):
 *   node scripts/genera-tipi-database.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/integrations/supabase/types.ts";
const progetto = readFileSync("supabase/.temp/project-ref", "utf8").trim();

const esegui = (args) => execFileSync("supabase", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });

let tipi = esegui(["gen", "types", "typescript", "--project-id", progetto, "--schema", "graphql_public,public"]);

const QUERY = `
select coalesce(json_agg(json_build_object('t', c.table_name, 'c', c.column_name) order by c.table_name, c.column_name), '[]') j
  from information_schema.columns c
 where c.table_schema = 'public' and c.is_nullable = 'NO' and c.column_default is null
   and c.is_generated = 'NEVER' and c.is_identity = 'NO'
   and exists (
     select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass
        and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4
        and (p.prosrc ~* ('new\\.' || c.column_name || '\\s*:=') or p.prosrc ~* ('into\\s+new\\.' || c.column_name || '\\M'))
   )`;
const grezzo = esegui(["db", "query", "--remote", "--yes", "-o", "json", QUERY]);
const righe = JSON.parse(grezzo.slice(grezzo.indexOf("{"), grezzo.lastIndexOf("}") + 1)).rows;
const valore = righe[0].j;
const colonne = typeof valore === "string" ? JSON.parse(valore) : valore;

// Solo dentro il blocco Tables dello schema public, solo dentro Insert della tabella.
const inizioPublic = tipi.indexOf("\n  public: {");
let toccate = 0;
for (const { t, c } of colonne) {
  const apre = `\n      ${t}: {\n        Row: {`;
  const i = tipi.indexOf(apre, inizioPublic);
  if (i < 0) continue;
  const insert = tipi.indexOf("\n        Insert: {", i);
  const fine = tipi.indexOf("\n        }", insert + 1);
  const blocco = tipi.slice(insert, fine);
  const nuovo = blocco.replace(new RegExp(`\\n          ${c}: `), `\n          ${c}?: `);
  if (nuovo !== blocco) {
    tipi = tipi.slice(0, insert) + nuovo + tipi.slice(fine);
    toccate++;
  }
}

// La versione di PostgREST resta quella con cui il codice è scritto, se il file ne dichiara una.
try {
  const vecchia = /PostgrestVersion: "([^"]+)"/.exec(readFileSync(FILE, "utf8"))?.[1];
  if (vecchia) tipi = tipi.replace(/PostgrestVersion: "[^"]+"/, `PostgrestVersion: "${vecchia}"`);
} catch {
  // file assente: si tiene quella generata
}

writeFileSync(FILE, tipi);
console.log(`${FILE}: rigenerato; ${toccate} colonne riempite dai trigger rese facoltative in Insert.`);
