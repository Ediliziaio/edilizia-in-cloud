#!/usr/bin/env node
/**
 * Impronta delle versioni delle migrazioni, da confrontare con il registro
 * (supabase_migrations.schema_migrations). Il controllo Supabase Preview è
 * verde solo se i due elenchi sono identici (vedi CLAUDE.md).
 *
 * Uso:
 *   node scripts/pubblica/registro-migrazioni.mjs                     cartella di lavoro
 *   node scripts/pubblica/registro-migrazioni.mjs --ref origin/main   quello pubblicato
 *   node scripts/pubblica/registro-migrazioni.mjs --dal 20280925      anche le versioni da quella in poi
 *
 * Stampa numero e impronta e la query da lanciare sul registro con execute_sql:
 * stesso numero e stessa impronta = controllo verde. Con --dal stampa anche le
 * versioni recenti, per trovare la differenza quando l'impronta non torna.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";

const argomenti = process.argv.slice(2);
const valore = (nome) => {
  const i = argomenti.indexOf(nome);
  return i >= 0 ? argomenti[i + 1] : undefined;
};
const ref = valore("--ref");
const dal = valore("--dal");

const nomi = ref
  ? execFileSync("git", ["ls-tree", "--name-only", ref, "supabase/migrations/"], { encoding: "utf8" })
      .split("\n")
      .map((percorso) => percorso.replace(/^.*\//, ""))
  : readdirSync("supabase/migrations");

// L'ordine è quello dei caratteri, come `order by version` sul registro
// (le versioni sono solo cifre).
const versioni = nomi
  .filter((nome) => nome.endsWith(".sql"))
  .map((nome) => nome.split("_")[0])
  .sort();
const doppie = [...new Set(versioni.filter((v, i) => versioni[i - 1] === v))];
const impronta = createHash("md5").update(versioni.join(",")).digest("hex");

console.log(`${ref ? `Su ${ref}` : "Nella cartella di lavoro"}: ${versioni.length} migrazioni, impronta ${impronta}`);
if (doppie.length > 0) {
  console.log(`ATTENZIONE, versioni doppie (il push si ferma con duplicate key): ${doppie.join(", ")}`);
}
console.log("\nSul registro, con execute_sql (sola lettura):");
console.log(
  "  select count(*) as n, md5(string_agg(version, ',' order by version)) as impronta" +
    " from supabase_migrations.schema_migrations;",
);
if (dal) {
  console.log(`\nVersioni da ${dal} in poi:`);
  console.log(`  ${versioni.filter((v) => v >= dal).join(",") || "(nessuna)"}`);
  console.log("E sul registro:");
  console.log(
    "  select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations" +
      ` where version >= '${dal.replace(/[^0-9]/g, "")}';`,
  );
}
if (doppie.length > 0) process.exit(1);
