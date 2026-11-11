// Due connessioni vere contro un database temporaneo, mai contro dati aziendali.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const container = process.env.EIC_TEST_PG_CONTAINER;
if (container !== "eic-fatture-ai-pg") throw new Error("Usa eic-fatture-ai-pg");
const database = "eic_riconciliazione_concorrenza";
const psql = [
  "exec",
  "-i",
  container,
  "psql",
  "-U",
  "supabase_admin",
  "-d",
  database,
  "-v",
  "ON_ERROR_STOP=1",
  "-X",
  "-q",
];
const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-a000-000000000001`;
const docs = JSON.stringify({ ddt: [id(20)], oda: [] });
const leggi = (n) =>
  `select fattura_riconciliazione_imputa('${id(n + 2)}',(select impronta from fattura_riconciliazioni_ai where id='${id(n + 2)}'),'[{"fattura_riga":"1","ddt_riga":"${id(21)}","quantita_fattura":5,"fattore":1,"conferma_residuo":true}]',0,true);`;
const sessione = (sql) =>
  new Promise((resolve) => {
    const p = spawn("docker", psql);
    let out = "";
    p.stdout.on("data", (d) => {
      out += d;
    });
    p.stderr.on("data", (d) => {
      out += d;
    });
    p.on("close", (code) => resolve({ code, out }));
    p.stdin.end(sql);
  });
try {
  execFileSync("docker", [
    "exec",
    container,
    "createdb",
    "-U",
    "supabase_admin",
    database,
  ]);
  const fixture = readFileSync("/tmp/eic-test-completa.sql", "utf8").replace(
    /rollback;\s*$/,
    "commit;",
  );
  execFileSync("docker", psql, {
    input: fixture,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const setup = `set qa.user_id='${id(3)}';
insert into ddt_ricezione(id,company_id,supplier_id,numero_ddt,stato) values('${id(20)}','${id(1)}','${id(10)}','CONCORRENZA','ricevuto');
insert into ddt_righe(id,company_id,ddt_ricezione_id,posizione,descrizione,unita_misura,quantita) values('${id(21)}','${id(1)}','${id(20)}',1,'Articolo prova concorrenza','pz',5);
insert into fatture_ricevute(id,company_id,fornitore_id,tipo_documento,righe) select i,'${id(1)}','${id(10)}','TD01','[{"numero_linea":1,"descrizione":"Articolo prova concorrenza","quantita":5,"unita_misura":"pz"}]'::jsonb from unnest(array['${id(22)}'::uuid,'${id(23)}'::uuid]) i;
insert into fattura_riconciliazioni_ai(id,company_id,fattura_id,impronta,documenti,proposta,esiti,modello,created_by,decisioni)
select a,'${id(1)}',f,'iniziale','${docs}','{"righe":[{"fattura":"1","ddt":["${id(21)}"],"oda":[]}]}','[]','test','${id(3)}','{"1":"accettata"}' from (values('${id(24)}'::uuid,'${id(22)}'::uuid),('${id(25)}'::uuid,'${id(23)}'::uuid)) v(a,f);
update fattura_riconciliazioni_ai set impronta=fattura_riconciliazione_contesto(fattura_id,documenti)->>'impronta' where id in('${id(24)}','${id(25)}');`;
  execFileSync("docker", psql, {
    input: setup,
    stdio: ["pipe", "pipe", "pipe"],
  });
  // A prende il lock della bolla; B prepara lo stesso residuo e attende quel lock.
  const a = sessione(
    `begin; set local qa.user_id='${id(3)}'; select id from ddt_ricezione where id='${id(20)}' for update; select pg_sleep(0.6); set local role authenticated; ${leggi(22)} select pg_sleep(0.6); commit;`,
  );
  await new Promise((r) => setTimeout(r, 150));
  const b = sessione(`\\set VERBOSITY verbose
begin; set local qa.user_id='${id(3)}'; set local role authenticated; ${leggi(23)} commit;`);
  const [ra, rb] = await Promise.all([a, b]);
  if (ra.code !== 0 || rb.code === 0 || !rb.out.includes("PT409"))
    throw new Error(
      `Concorrenza non protetta: A=${ra.code} ${ra.out}; B=${rb.code} ${rb.out}`,
    );
  execFileSync("docker", psql, {
    input: `do $$begin assert(select sum(quantita_ddt)=5 from fattura_ddt_quantita where ddt_riga='${id(21)}');end $$;`,
    stdio: ["pipe", "pipe", "pipe"],
  });
  console.log(
    "PASS: due sessioni sullo stesso DDT; un salvataggio accettato, l’altro respinto PT409, nessuna quantità duplicata.",
  );
} finally {
  execFileSync("docker", [
    "exec",
    container,
    "dropdb",
    "-U",
    "supabase_admin",
    "--if-exists",
    database,
  ]);
}
