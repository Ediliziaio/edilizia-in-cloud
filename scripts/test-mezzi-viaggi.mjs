// PostgreSQL isolato in memoria: nessuna connessione al database condiviso.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
const id = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [A, B, U, V, H, J, M, N, O, P] = Array.from({ length: 10 }, (_, i) =>
  id(i + 1),
);
let checks = 0;
function assert(ok, label) {
  if (!ok) throw Error(label);
  checks++;
}
const q = async (sql) => (await db.query(sql)).rows;
const reject = async (sql, label) => {
  let failed = false;
  try {
    await db.exec(sql);
  } catch {
    failed = true;
  }
  assert(failed, label);
};
const json = (v) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
const fixture = {
  partenza: "2026-10-20T06:00:00Z",
  arrivo: "2026-10-20T08:00:00Z",
  contatore_inizio: 100,
  contatore_fine: 180,
  note: "Giro A e B",
  tratte: [
    {
      id: "uno",
      da: "Sede",
      a: "A",
      km: 20,
      minuti: 25,
      fonte: "dichiarati",
      destinazione: "commessa",
      order_id: O,
    },
    {
      id: "due",
      da: "A",
      a: "Fornitore",
      km: 8,
      minuti: 10,
      fonte: "dichiarati",
      destinazione: "commessa",
      order_id: O,
    },
    {
      id: "tre",
      da: "Fornitore",
      a: "A",
      km: 8,
      minuti: 10,
      fonte: "dichiarati",
      destinazione: "commessa",
      order_id: O,
    },
    {
      id: "quattro",
      da: "A",
      a: "B",
      km: 14,
      minuti: 20,
      fonte: "dichiarati",
      destinazione: "commessa",
      order_id: P,
    },
    {
      id: "cinque",
      da: "B",
      a: "Sede",
      km: 30,
      minuti: 35,
      fonte: "dichiarati",
      destinazione: "commessa",
      order_id: P,
    },
  ],
};
const call = (
  journey,
  version,
  token,
  action = "invia",
  data = fixture,
  motivo = "",
  vehicle = M,
) =>
  `select public.mezzi_viaggi_salva('${vehicle}','${journey}',${version},'${token}','${action}',${json(data)},'${motivo}') as r`;
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create function utente_bloccato() returns boolean language sql stable as $$select coalesce(current_setting('app.blocked',true),'false')='true'$$;
 create function chiamante_anonimo() returns boolean language sql stable as $$select coalesce(current_setting('app.anon',true),'false')='true'$$;
 create function utente_sola_lettura(c uuid) returns boolean language sql stable as $$select coalesce(current_setting('app.readonly',true),'false')='true'$$;
 create function has_permission_for_company(u uuid,p text,c uuid) returns boolean language sql stable as $$select c::text=current_setting('app.company',true) and coalesce(current_setting('app.office',true),'false')='true' and (p<>'can_view_costs' or coalesce(current_setting('app.costs',true),'true')='true')$$;
 create table companies(id uuid primary key,operational_lat numeric,operational_lng numeric);
 create table profiles(id uuid primary key);
 create table hr_profili(id uuid primary key,company_id uuid,user_id uuid,nome text,cognome text);
 create table mezzi(id uuid primary key,company_id uuid,nome text,tipo text,contatore numeric,contatore_unita text,assegnato_hr_profilo_id uuid,deleted_at timestamptz);
 create table orders(id uuid primary key,company_id uuid,order_code text,work_address text,indirizzo_lavori text,work_lat numeric,work_lng numeric,created_at timestamptz default now(),deleted_at timestamptz);
 create function miei_hr_profili() returns setof uuid language sql stable as $$select id from hr_profili where user_id=auth.uid()$$;
 create function campo_lavoro_su_commessa(o uuid) returns boolean language sql stable as $$select exists(select 1 from orders where id=o and company_id::text=current_setting('app.company',true))$$;
 grant usage on schema public,auth to authenticated,anon;
 insert into companies(id) values('${A}'),('${B}');insert into profiles values('${U}'),('${V}');
 insert into hr_profili values('${H}','${A}','${U}','Mario','Prova'),('${J}','${B}','${V}','Altro','Tenant');
 insert into mezzi values('${M}','${A}','Furgone','furgone',100,'km','${H}',null),('${N}','${B}','Estero','furgone',200,'km','${J}',null);
 insert into orders(id,company_id,order_code) values('${O}','${A}','A'),('${P}','${A}','B'),('${id(99)}','${B}','ESTERO');
 `);
  const sql = await readFile(
    process.argv[2] ||
      "supabase/migrations/20281027180500_mezzi_viaggi_multitratta.sql",
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql);
  const guard = await readFile(
    process.argv[3] ||
      "supabase/migrations/20281027180600_mezzi_viaggi_formato_tratte.sql",
    "utf8",
  );
  await db.exec(guard);
  await db.exec(guard);
  checks++;
  await db.exec(
    `set app.uid='${U}';set app.company='${A}';set role authenticated;`,
  );
  const context = (await q(`select mezzi_viaggi_contesto('${M}') r`))[0].r;
  assert(context.cantieri.length === 2, "Solo cantieri del tenant");
  assert(
    !context.vede_costi && !context.puo_verificare && context.puo_scrivere,
    "Campo senza prezzi o approvazione",
  );
  await reject(`select mezzi_viaggi_contesto('${N}')`, "No mezzo altrui");
  await reject(
    "select * from mezzi_viaggi",
    "Nessuna lettura diretta di itinerari e tariffe",
  );
  await reject(
    `insert into mezzi_viaggi(id) values('${id(100)}')`,
    "Nessuna scrittura diretta",
  );
  const trip = id(20),
    token = id(21);
  await db.exec(call(trip, 0, token));
  assert(
    (await q(call(trip, 0, token)))[0].r.versione === 1,
    "Retry idempotente",
  );
  await reject(
    call(trip, 0, token, "invia", { ...fixture, note: "Alterata" }),
    "Token non riusabile con contenuti diversi",
  );
  await reject(call(trip, 0, id(22)), "Conflitto versione");
  await reject(
    call(id(23), 0, id(24)),
    "Doppio invio su stesso mezzo e intervallo",
  );
  await reject(call(trip, 1, id(25), "verifica"), "Operaio non approva");
  await reject(
    call(id(26), 0, id(27), "salva", { ...fixture, tariffa_km: 2 }),
    "Operaio non imposta costi",
  );
  await reject(
    call(id(28), 0, id(29), "salva", { ...fixture, contatore_fine: 90 }),
    "Contatore regressivo",
  );
  await reject(
    call(id(30), 0, id(31), "salva", { ...fixture, contatore_fine: null }),
    "Contatore parziale",
  );
  await reject(
    call(id(32), 0, id(33), "salva", { ...fixture, arrivo: fixture.partenza }),
    "Orari invertiti",
  );
  await reject(
    call(id(34), 0, id(35), "salva", {
      ...fixture,
      tratte: [{ ...fixture.tratte[0], order_id: id(99) }],
    }),
    "No attribuzioni cross tenant",
  );
  await reject(
    call(id(36), 0, id(37), "salva", {
      ...fixture,
      tratte: [{ ...fixture.tratte[0], km: -1 }],
    }),
    "No km negativi",
  );
  await reject(
    call(id(38), 0, id(39), "salva", {
      ...fixture,
      tratte: [fixture.tratte[0], fixture.tratte[0]],
    }),
    "No tratte duplicate",
  );
  for (const patch of [
    { km: "20" },
    { minuti: "10" },
    { da: { test: "luogo" } },
    { a: 123 },
    { id: 1 },
  ]) {
    await reject(
      call(id(900), 0, id(901), "salva", {
        ...fixture,
        tratte: [{ ...fixture.tratte[0], ...patch }],
      }),
      "Rifiuta tipi JSON non validi",
    );
  }
  await db.exec(`set app.blocked='true'`);
  await reject(call(id(40), 0, id(41), "salva"), "Utente bloccato");
  await db.exec(`set app.blocked='false';set app.readonly='true'`);
  await reject(call(id(42), 0, id(43), "salva"), "Sola lettura");
  await db.exec(`set app.readonly='false'`);
  await db.exec(
    `reset role;update mezzi set assegnato_hr_profilo_id=null where id='${M}';set role authenticated;`,
  );
  await reject(
    call(trip, 1, id(44), "salva"),
    "Revoca incarico blocca modifiche",
  );
  assert(
    (
      await q(
        `select mezzi_viaggi_elenco('${A}',null,null,'2026-10-01','2026-10-31') r`,
      )
    )[0].r.items.length === 1,
    "Conserva accesso al proprio storico",
  );
  await db.exec(`set app.uid='${V}';set app.company='${B}'`);
  assert(
    (
      await q(
        `select mezzi_viaggi_elenco('${A}',null,null,'2026-10-01','2026-10-31') r`,
      )
    )[0].r.items.length === 0,
    "Altro utente non vede il viaggio",
  );
  await db.exec(
    `set app.uid='${U}';set app.company='${A}';set app.office='true'`,
  );
  await db.exec(
    call(trip, 1, id(45), "verifica", { ...fixture, tariffa_km: 0.5 }),
  );
  await reject(
    call(trip, 2, id(46), "salva"),
    "Rettifica senza motivo bloccata",
  );
  const scoped = (
    await q(
      `select mezzi_viaggi_elenco('${A}',null,'${O}','2026-10-01','2026-10-31') r`,
    )
  )[0].r.items[0];
  assert(
    scoped.tratte.length === 3 && scoped.tratte.every((t) => t.order_id === O),
    "Commessa vede solo le sue tratte",
  );
  assert(
    scoped.note === "" && scoped.contatore_inizio === null,
    "Niente note o contatore globale in vista commessa",
  );
  assert(
    scoped.tratte.reduce((s, t) => s + t.km, 0) === 36,
    "Ripartizione A: 36 km, non tutto il giro",
  );
  await db.exec(`set app.costs='false'`);
  assert(
    (
      await q(
        `select mezzi_viaggi_elenco('${A}',null,'${O}','2026-10-01','2026-10-31') r`,
      )
    )[0].r.items[0].tariffa_km === null,
    "Tariffa nascosta senza permesso costi",
  );
  await db.exec(`set app.costs='true'`);
  await reject(
    call(
      trip,
      2,
      id(47),
      "verifica",
      { ...fixture, contatore_fine: 200 },
      "Correzione contatori",
    ),
    "Scarto contatore blocca approvazione",
  );
  await reject(
    call(
      trip,
      2,
      id(48),
      "verifica",
      {
        ...fixture,
        tratte: fixture.tratte.map((t) => ({ ...t, fonte: "stimati" })),
      },
      "Correzione stime",
    ),
    "Stime non diventano verificate",
  );
  await reject(
    call(
      trip,
      2,
      id(480),
      "verifica",
      { ...fixture, conducente_hr_id: J },
      "Correzione conducente",
    ),
    "Conducente di altra azienda rifiutato",
  );
  await reject(
    call(
      trip,
      2,
      id(481),
      "verifica",
      { ...fixture, conducente_hr_id: null },
      "Correzione conducente",
    ),
    "Conducente mancante non verificabile",
  );
  await reject(
    call(
      trip,
      2,
      id(482),
      "verifica",
      {
        ...fixture,
        tratte: fixture.tratte.map((t, i) =>
          i === 2 ? { ...t, da: "Un altro posto" } : t,
        ),
      },
      "Correzione tappe",
    ),
    "Tappe discontinue non verificabili",
  );
  await reject(
    call(
      trip,
      2,
      id(483),
      "verifica",
      {
        ...fixture,
        tratte: fixture.tratte.map((t) => ({ ...t, minuti: 100 })),
      },
      "Correzione tempi",
    ),
    "Minuti oltre la durata non verificabili",
  );
  await db.exec(
    call(trip, 2, id(49), "annulla", fixture, "Viaggio inserito per errore"),
  );
  assert(
    (await q(`select jsonb_array_length(mezzi_viaggi_storico('${trip}')) n`))[0]
      .n === 3,
    "Storico di invio, verifica e annullamento",
  );
  await db.exec(`reset role`);
  assert(
    (await q(`select contatore from mezzi where id='${M}'`))[0].contatore ===
      "100" ||
      Number(
        (await q(`select contatore from mezzi where id='${M}'`))[0].contatore,
      ) === 100,
    "Nessuna modifica automatica del contatore",
  );
  assert(
    (await q(`select count(*)::int n from mezzi_viaggi`))[0].n === 1,
    "Errori non lasciano mezzi viaggi parziali",
  );
  await db.exec(`set role authenticated`);
  const night = {
    ...fixture,
    conducente_hr_id: H,
    partenza: "2026-10-21T22:00:00Z",
    arrivo: "2026-10-22T01:00:00Z",
    contatore_inizio: 180,
    contatore_fine: 200,
    tratte: [
      {
        id: "notte1",
        da: "A",
        a: "B",
        km: 12,
        minuti: 30,
        fonte: "dichiarati",
        destinazione: "generale",
        order_id: null,
      },
      {
        id: "notte2",
        da: "B",
        a: "Sede",
        km: 8,
        minuti: 20,
        fonte: "dichiarati",
        destinazione: "generale",
        order_id: null,
      },
    ],
  };
  await db.exec(call(id(55), 0, id(56), "verifica", night));
  checks++;
  await reject(
    call(id(57), 0, id(58), "invia", {
      ...night,
      partenza: "2026-10-22T00:30:00Z",
      arrivo: "2026-10-22T01:30:00Z",
    }),
    "Sovrapposizione anche a cavallo di mezzanotte",
  );
  await reject(
    call(id(59), 0, id(60), "invia", {
      ...night,
      partenza: "2026-10-22T01:00:00Z",
      arrivo: "2026-10-22T02:00:00Z",
      contatore_inizio: 190,
      contatore_fine: 210,
    }),
    "Contatore regressivo tra due viaggi adiacenti",
  );
  await reject(
    call(id(61), 0, id(62), "salva", {
      ...night,
      partenza: "2099-01-01T00:00:00Z",
      arrivo: "2099-01-01T01:00:00Z",
    }),
    "Viaggio futuro non è un consuntivo",
  );
  for (let i = 0; i < 53; i++)
    await db.exec(
      call(id(1000 + i), 0, id(2000 + i), "salva", {
        ...fixture,
        conducente_hr_id: H,
      }),
    );
  const firstPage = (
    await q(
      `select mezzi_viaggi_elenco('${A}',null,null,'2026-10-01','2026-10-31') r`,
    )
  )[0].r;
  const lastPage = (
    await q(
      `select mezzi_viaggi_elenco('${A}',null,null,'2026-10-01','2026-10-31',50) r`,
    )
  )[0].r;
  assert(
    firstPage.items.length === 50 && firstPage.has_more,
    "Paginazione non tronca silenziosamente",
  );
  assert(
    lastPage.items.length === 5 && !lastPage.has_more,
    "Pagina successiva completa",
  );
  await reject(
    `select mezzi_viaggi_elenco('${A}',null,null,'2020-01-01','2026-10-31')`,
    "Periodo eccessivo rifiutato",
  );
  await db.exec(`set app.office='false'`);
  assert(
    (
      await q(
        `select mezzi_viaggi_elenco('${A}',null,null,'2026-10-01','2026-10-31') r`,
      )
    )[0].r.items.every((v) => v.tariffa_km === null),
    "Niente tariffe nel registro del campo, anche dopo verifica",
  );
  await db.exec(`set role anon`);
  await reject(`select mezzi_viaggi_contesto('${M}')`, "Anon non esegue RPC");
  console.log(`${checks} controlli SQL superati in PostgreSQL isolato`);
} finally {
  await db.close();
}
