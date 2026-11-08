// Liquidazione IVA, fasi 0 e 1.1 (docs/piano-liquidazione-iva-lipe-f24.md):
// impostazioni IVA dell'azienda e data di ricezione dichiarata delle fatture
// importate. Gli SQL veri delle migrazioni, in un database PGlite isolato.
import type { PGlite } from "@electric-sql/pglite";
import { it, expect, vi } from "vitest";

// Ogni test avvia un Postgres in WASM: con la suite intera in parallelo ci mette più di 5 secondi.
vi.setConfig({ testTimeout: 30000 });

import { c, other, u, setup } from "./ivaPglite";

async function ricevuta(
  db: PGlite,
  numero: string,
  data: string,
  opz: { sdi?: string; azienda?: string; iva?: number } = {},
) {
  const r = await db.query<{ id: string }>(
    `insert into fatture_ricevute(company_id,numero_fattura,tipo_documento,data_fattura,data_ricezione_sdi,imponibile_totale,iva_totale,riepilogo_iva,stato)
     values($1,$2,'TD01',$3,$4,100,$5,$6,'letta') returning id`,
    [
      opz.azienda ?? c,
      numero,
      data,
      opz.sdi ?? null,
      opz.iva ?? 22,
      JSON.stringify([
        { aliquota: "22", imponibile: "100", imposta: String(opz.iva ?? 22) },
      ]),
    ],
  );
  return r.rows[0].id;
}

async function vista(db: PGlite, id: string) {
  const r = await db.query<{
    data_detrazione: string;
    ricezione_origine: string;
  }>(
    "select data_detrazione::text,ricezione_origine from fatture_ricevute_periodo_iva where id=$1",
    [id],
  );
  return r.rows[0];
}

async function dichiara(db: PGlite, ids: string[], data: string | null) {
  const r = await db.query<{ esito: { aggiornate: number; saltate: number } }>(
    "select fiscalita_dichiara_ricezione($1,$2::uuid[],$3::date) as esito",
    [c, ids, data],
  );
  return r.rows[0].esito;
}

async function liquida(db: PGlite, trimestre: number) {
  const r = await db.query<{ l: Record<string, unknown> }>(
    "select liquidazione_iva_periodo($1,'trimestrale',2026,null,$2) as l",
    [c, trimestre],
  );
  return r.rows[0].l as {
    iva_acquisti: number;
    documenti: Record<string, number>;
    ipotesi: string[];
  };
}

it("dice da dove viene la data di ricezione: SDI, presunta, da verificare a fine dicembre, dichiarata", async () => {
  const db = await setup();
  try {
    const sdi = await ricevuta(db, "A1", "2026-09-28", {
      sdi: "2026-10-20T09:00:00Z",
    });
    const presunta = await ricevuta(db, "A2", "2026-09-28");
    const dicembre = await ricevuta(db, "A3", "2026-12-29");
    const dichiarata = await ricevuta(db, "A4", "2026-09-28");
    await db.exec("set role authenticated");
    await dichiara(db, [dichiarata], "2026-10-20");

    expect(await vista(db, sdi)).toEqual({
      data_detrazione: "2026-10-20",
      ricezione_origine: "sdi",
    });
    expect(await vista(db, presunta)).toEqual({
      data_detrazione: "2026-09-28",
      ricezione_origine: "presunta",
    });
    expect((await vista(db, dicembre)).ricezione_origine).toBe("da_verificare");
    // Dichiarata il 20/10, dopo il 15 del mese dopo: l'IVA va in ottobre.
    expect(await vista(db, dichiarata)).toEqual({
      data_detrazione: "2026-10-20",
      ricezione_origine: "dichiarata",
    });
  } finally {
    await db.close();
  }
});

it("la data dichiarata sposta l'IVA nel prospetto del trimestre giusto", async () => {
  const db = await setup();
  try {
    const id = await ricevuta(db, "B1", "2026-09-28", { iva: 50 });
    await db.exec("set role authenticated");
    expect((await liquida(db, 3)).iva_acquisti).toBe(50);
    expect((await liquida(db, 3)).documenti.acquisti_senza_data_ricezione).toBe(1);

    await dichiara(db, [id], "2026-10-20");
    const q3 = await liquida(db, 3);
    const q4 = await liquida(db, 4);
    expect(q3.documenti.acquisti).toBe(0);
    expect(q4.iva_acquisti).toBe(50);
    expect(q4.documenti.acquisti_senza_data_ricezione).toBe(0);

    // Entro il 15 del mese dopo resta nel mese della fattura.
    await dichiara(db, [id], "2026-10-10");
    expect((await liquida(db, 3)).iva_acquisti).toBe(50);
  } finally {
    await db.close();
  }
});

it("segnala nel prospetto le fatture di fine dicembre senza data", async () => {
  const db = await setup();
  try {
    await ricevuta(db, "C1", "2026-12-29");
    await ricevuta(db, "C2", "2026-12-05");
    await db.exec("set role authenticated");
    const q4 = await liquida(db, 4);
    expect(q4.documenti.acquisti_ricezione_da_verificare).toBe(1);
    expect(q4.ipotesi.join(" ")).toContain("1 di fine dicembre da verificare");
  } finally {
    await db.close();
  }
});

it("dichiara solo dove serve: mai sopra la data SDI, mai prima della fattura, mai di un'altra azienda, mai nel futuro", async () => {
  const db = await setup();
  try {
    const sdi = await ricevuta(db, "D1", "2026-09-01", {
      sdi: "2026-09-02T08:00:00Z",
    });
    const libera = await ricevuta(db, "D2", "2026-09-10");
    const altra = await ricevuta(db, "D3", "2026-09-10", { azienda: other });
    await db.exec("set role authenticated");

    expect(await dichiara(db, [sdi, libera, altra], "2026-09-12")).toMatchObject({
      aggiornate: 1,
      saltate: 2,
    });
    // Prima della data della fattura: saltata.
    expect(await dichiara(db, [libera], "2026-09-01")).toMatchObject({
      aggiornate: 0,
    });
    await expect(dichiara(db, [libera], "2999-01-01")).rejects.toThrow("futuro");
    await expect(dichiara(db, [], "2026-09-12")).rejects.toThrow("Nessuna");

    await db.exec("reset role");
    const r = await db.query<{ ricezione_dichiarata_da: string | null }>(
      "select ricezione_dichiarata_da from fatture_ricevute where id=$1",
      [libera],
    );
    expect(r.rows[0].ricezione_dichiarata_da).toBe(u);

    // Togliere la dichiarazione torna alla presunzione.
    await db.exec("set role authenticated");
    expect(await dichiara(db, [libera], null)).toMatchObject({ aggiornate: 1 });
    expect((await vista(db, libera)).ricezione_origine).toBe("presunta");

    await db.exec("set test.readonly='yes'");
    await expect(dichiara(db, [libera], "2026-09-12")).rejects.toThrow(
      "non autorizzata",
    );
    await db.exec("reset role");
    await expect(
      db.query("select fiscalita_dichiara_ricezione($1,$2::uuid[],'2026-09-12')", [other, [altra]]),
    ).rejects.toThrow("non autorizzata");
  } finally {
    await db.close();
  }
});

it("anche scrivendo la colonna a mano: firma del database, niente sopra lo SDI, lo SDI che arriva dopo vince", async () => {
  const db = await setup();
  try {
    const libera = await ricevuta(db, "F1", "2026-09-10");
    const sdi = await ricevuta(db, "F2", "2026-09-10", {
      sdi: "2026-09-11T08:00:00Z",
    });
    await db.exec("set role authenticated");
    await db.query(
      "update fatture_ricevute set ricezione_dichiarata_il='2026-09-12', ricezione_dichiarata_da=$1 where id=$2",
      [other, libera],
    );
    await expect(
      db.query(
        "update fatture_ricevute set ricezione_dichiarata_il='2026-09-12' where id=$1",
        [sdi],
      ),
    ).rejects.toThrow("SDI");
    await expect(
      db.query(
        "update fatture_ricevute set ricezione_dichiarata_il='2026-09-01' where id=$1",
        [libera],
      ),
    ).rejects.toThrow("precedere");
    // Arriva la data SDI: la dichiarazione sparisce.
    await db.query(
      "update fatture_ricevute set data_ricezione_sdi='2026-09-11T10:00:00Z' where id=$1",
      [libera],
    );
    await db.exec("reset role");
    const r = await db.query<Record<string, unknown>>(
      "select ricezione_dichiarata_il,ricezione_dichiarata_da from fatture_ricevute where id=$1",
      [libera],
    );
    expect(r.rows[0]).toEqual({
      ricezione_dichiarata_il: null,
      ricezione_dichiarata_da: null,
    });
  } finally {
    await db.close();
  }
});

it("firma con l'utente vero anche se il browser manda un altro autore", async () => {
  const db = await setup();
  try {
    const id = await ricevuta(db, "G1", "2026-09-10");
    await db.exec("set role authenticated");
    await db.query(
      "update fatture_ricevute set ricezione_dichiarata_il='2026-09-12', ricezione_dichiarata_da=$1 where id=$2",
      [other, id],
    );
    await db.exec("reset role");
    const r = await db.query<{ ricezione_dichiarata_da: string }>(
      "select ricezione_dichiarata_da from fatture_ricevute where id=$1",
      [id],
    );
    expect(r.rows[0].ricezione_dichiarata_da).toBe(u);
  } finally {
    await db.close();
  }
});

it("non sposta IVA dentro o fuori da un mese chiuso", async () => {
  const db = await setup();
  try {
    const id = await ricevuta(db, "E1", "2026-09-28");
    await db.exec(`alter table fiscalita_periodi disable trigger user;
      insert into fiscalita_periodi(company_id,mese,stato,motivo,attore) values('${c}','2026-09-01','chiuso','test','${u}');
      alter table fiscalita_periodi enable trigger user;`);
    await db.exec("set role authenticated");
    await expect(dichiara(db, [id], "2026-10-20")).rejects.toThrow("chiuso");
    await db.exec("reset role");
    const r = await db.query<{ ricezione_dichiarata_il: string | null }>(
      "select ricezione_dichiarata_il from fatture_ricevute where id=$1",
      [id],
    );
    expect(r.rows[0].ricezione_dichiarata_il).toBeNull();
  } finally {
    await db.close();
  }
});

it("impostazioni IVA: firmate dal database, codici fiscali ripuliti, valori fuori regola rifiutati, sola lettura bloccata", async () => {
  const db = await setup();
  try {
    await db.exec("set role authenticated");
    await db.query(
      `insert into fiscalita_impostazioni_iva(company_id,anno,periodicita,cf_contribuente,cf_dichiarante,codice_carica)
       values($1,2026,'trimestrale',' 01234567890 ','rssmra80a01h501u','1')`,
      [c],
    );
    const r = await db.query<Record<string, unknown>>(
      "select periodicita,regime,cf_contribuente,cf_dichiarante,aggiornato_da,iva_per_cassa,metodo_acconto from fiscalita_impostazioni_iva where company_id=$1",
      [c],
    );
    expect(r.rows[0]).toMatchObject({
      periodicita: "trimestrale",
      regime: "ordinario",
      cf_contribuente: "01234567890",
      cf_dichiarante: "RSSMRA80A01H501U",
      aggiornato_da: u,
      iva_per_cassa: false,
      metodo_acconto: "storico",
    });

    await expect(
      db.query(
        "insert into fiscalita_impostazioni_iva(company_id,anno,periodicita) values($1,2027,'annuale')",
        [c],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into fiscalita_impostazioni_iva(company_id,anno,periodicita,pro_rata_percentuale) values($1,2027,'mensile',120)",
        [c],
      ),
    ).rejects.toThrow();
    // Un'altra azienda: la policy non lo permette.
    await expect(
      db.query(
        "insert into fiscalita_impostazioni_iva(company_id,anno,periodicita) values($1,2026,'mensile')",
        [other],
      ),
    ).rejects.toThrow();
    // aggiornato_da non si scrive dal browser.
    await expect(
      db.query(
        "update fiscalita_impostazioni_iva set aggiornato_da=$1 where company_id=$2",
        [other, c],
      ),
    ).rejects.toThrow();

    await db.exec("set test.readonly='yes'");
    await expect(
      db.query(
        "update fiscalita_impostazioni_iva set periodicita='mensile' where company_id=$1 returning 1",
        [c],
      ),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
});
