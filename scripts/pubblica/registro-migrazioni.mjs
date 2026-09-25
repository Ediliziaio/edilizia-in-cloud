#!/usr/bin/env node
/**
 * Confronta le versioni delle migrazioni nel repository con il registro del
 * database (supabase_migrations.schema_migrations). Il controllo Supabase
 * Preview è verde solo se i due elenchi sono identici (vedi CLAUDE.md).
 *
 * Lo script non si collega al database: stampa le query da lanciare con
 * execute_sql (sola lettura), già complete dei dati del repository.
 *
 * Uso:
 *   node scripts/pubblica/registro-migrazioni.mjs --ref <sha>                 il commit da pubblicare
 *   node scripts/pubblica/registro-migrazioni.mjs --ref <sha> --mese 202609   il dettaglio di un mese
 *
 * Senza --ref legge la cartella di lavoro, che è condivisa: contiene anche file
 * non ancora pubblicati di altre sessioni, e il confronto può dare falsi allarmi.
 *
 * 1. Numero e impronta: stessi valori sul registro = controllo verde.
 * 2. Se non tornano, la query per mese dice dove: solo i mesi con elenchi diversi.
 * 3. Con --mese, la query elenca le versioni del registro senza file e i file
 *    senza riga, col nome della migrazione (per capire di chi sono). Una riga
 *    non riallineata ha la versione col timestamp vero (2026…): sta nel mese in
 *    cui è stata applicata, non in quello del file (2028…).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const argomenti = process.argv.slice(2);
const noti = new Set(["--ref", "--mese"]);
for (const a of argomenti) {
  if (a.startsWith("--") && !noti.has(a)) {
    console.error(`Opzione sconosciuta: ${a} (valide: ${[...noti].join(", ")}).`);
    process.exit(2);
  }
}
// Un'opzione senza valore (in fondo, o seguita da un'altra opzione) non va
// ignorata in silenzio: senza --ref si leggerebbe la cartella condivisa.
const valore = (nome) => {
  const i = argomenti.indexOf(nome);
  if (i < 0) return undefined;
  const v = argomenti[i + 1];
  if (v === undefined || v.startsWith("--")) {
    console.error(`${nome} vuole un valore.`);
    process.exit(2);
  }
  return v;
};
const ref = valore("--ref");
const mese = valore("--mese");
if (mese !== undefined && !/^\d{6}$/.test(mese)) {
  console.error(`--mese vuole anno e mese, per esempio 202609 (non «${mese}»).`);
  process.exit(2);
}

// Dalla radice del repository, da qualunque cartella lo si lanci.
const radice = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const nomi = ref
  ? execFileSync("git", ["ls-tree", "--name-only", ref, "supabase/migrations/"], { cwd: radice, encoding: "utf8" })
      .split("\n")
      .map((percorso) => percorso.replace(/^.*\//, ""))
  : readdirSync(join(radice, "supabase/migrations"));

// L'ordine è quello dei caratteri, come `order by version` sul registro
// (le versioni sono solo cifre).
const versioni = nomi
  .filter((nome) => nome.endsWith(".sql"))
  .map((nome) => nome.split("_")[0])
  .sort();
if (versioni.length === 0) {
  console.error(`Nessuna migrazione trovata${ref ? ` su ${ref}` : ""}: il riferimento è giusto?`);
  process.exit(2);
}
const strane = versioni.filter((v) => !/^\d+$/.test(v));
if (strane.length > 0) {
  console.error(`File con una versione che non è fatta di sole cifre: ${strane.join(", ")}`);
  process.exit(2);
}
const doppie = [...new Set(versioni.filter((v, i) => versioni[i - 1] === v))];
const md5 = (testo) => createHash("md5").update(testo).digest("hex");

console.log(
  `${ref ? `Su ${ref}` : "Nella cartella di lavoro"}: ${versioni.length} migrazioni, impronta ${md5(versioni.join(","))}`,
);
if (doppie.length > 0) {
  console.log(`ATTENZIONE, versioni doppie (il push si ferma con duplicate key): ${doppie.join(", ")}`);
}

console.log("\n1. Sul registro, con execute_sql:");
console.log(
  "select count(*) as n, md5(string_agg(version, ',' order by version)) as impronta" +
    " from supabase_migrations.schema_migrations;",
);

const perMese = new Map();
for (const v of versioni) {
  const m = v.slice(0, 6);
  perMese.set(m, [...(perMese.get(m) ?? []), v]);
}
const righe = [...perMese].map(([m, vs]) => `('${m}', ${vs.length}, '${md5(vs.join(","))}')`);
console.log("\n2. Se numero o impronta non tornano, i mesi diversi:");
console.log(
  `with repo(mese, n, impronta) as (values ${righe.join(", ")}),
registro as (
  select left(version, 6) as mese, count(*) as n, md5(string_agg(version, ',' order by version)) as impronta
  from supabase_migrations.schema_migrations group by 1
)
select coalesce(r.mese, g.mese) as mese, r.n as file_nel_repo, g.n as righe_nel_registro
from repo r full join registro g on g.mese = r.mese
where r.impronta is distinct from g.impronta
order by 1;`,
);

if (mese) {
  const delMese = perMese.get(mese) ?? [];
  const valori = delMese.length > 0 ? delMese.map((v) => `('${v}')`).join(", ") : "(null)";
  console.log(`\n3. Il mese ${mese} (${delMese.length} file nel repository), versione per versione:`);
  console.log(
    `with repo(version) as (values ${valori})
select 'nel registro, senza file' as dove, s.version, s.name
from supabase_migrations.schema_migrations s
where left(s.version, 6) = '${mese}' and s.version not in (select version from repo where version is not null)
union all
select 'file senza riga nel registro', r.version, null
from repo r
where r.version is not null
  and not exists (select 1 from supabase_migrations.schema_migrations s where s.version = r.version)
order by 2;`,
  );
} else {
  console.log("\nPer il dettaglio di un mese: stesso comando con --mese <aaaamm>.");
}
if (doppie.length > 0) process.exit(1);
