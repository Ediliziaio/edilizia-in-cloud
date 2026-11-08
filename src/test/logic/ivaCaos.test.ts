// Simulazioni del caos sulla liquidazione IVA, fasi 0 e 1.1
// (docs/piano-liquidazione-iva-lipe-f24.md). Gli SQL veri in un Postgres isolato.
//
// 1. Centinaia di fatture con date casuali: il periodo di detrazione calcolato
//    dal database è confrontato, fattura per fattura, con un oracolo scritto da
//    zero qui sotto; il prospetto deve dire la stessa cosa del registro, e ogni
//    fattura cade in un solo periodo.
// 2. I bordi: mezzanotte di Capodanno, il 15 contro il 16 del mese dopo, il cambio
//    d'ora, la nota di credito.
// 3. Gli abusi: id ripetuti o nulli, troppe fatture, date nel futuro scritte a
//    mano, impostazioni salvate due volte, anno cambiato, mesi chiusi.
// 4. Il doppione: fattura entrata da un gestionale e poi arrivata dallo SDI.
import type { PGlite } from "@electric-sql/pglite";
import { describe, it, expect, vi } from "vitest";
import { c, setup } from "./ivaPglite";
import { salvaFatturaRicevuta } from "../../../supabase/functions/_shared/salvaFatturaRicevuta";

vi.setConfig({ testTimeout: 120000 });

// ── Oracolo: la regola della detrazione scritta da zero ─────────────────────
// Art. 1 DPR 100/1998: l'IVA si detrae nel mese in cui la fattura è ricevuta;
// se è ricevuta entro il 15 del mese dopo (stesso anno), nel mese della fattura.
const romaFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const giornoRoma = (iso: string) => romaFmt.format(new Date(iso));
function oracolo(dataFattura: string, ricevuta: string | null): string {
  if (!ricevuta) return dataFattura;
  if (ricevuta <= dataFattura) return dataFattura;
  const [fa, fm] = dataFattura.split("-").map(Number);
  const [ra, rm, rg] = ricevuta.split("-").map(Number);
  const meseDopo = fm === 12 ? { a: fa + 1, m: 1 } : { a: fa, m: fm + 1 };
  if (ra === meseDopo.a && rm === meseDopo.m && rg <= 15 && ra === fa) return dataFattura;
  return ricevuta;
}
const trimestre = (d: string) => `${d.slice(0, 4)}-T${Math.ceil(Number(d.slice(5, 7)) / 3)}`;

// Generatore deterministico: lo stesso seme rifà la stessa simulazione.
function rng(seme: number) {
  let s = seme >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const piuGiorni = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

interface Caso {
  numero: string;
  dataFattura: string;
  sdi: string | null;
  dichiarata: string | null;
  notaCredito: boolean;
  iva: number;
}

async function inserisci(db: PGlite, k: Caso) {
  const r = await db.query<{ id: string }>(
    `insert into fatture_ricevute(company_id,numero_fattura,tipo_documento,cedente_ragione_sociale,data_fattura,data_ricezione_sdi,imponibile_totale,iva_totale,riepilogo_iva,stato)
     values($1,$2,$3,'Fornitore',$4,$5,$6,$7,$8,'letta') returning id`,
    [
      c,
      k.numero,
      k.notaCredito ? "TD04" : "TD01",
      k.dataFattura,
      k.sdi,
      k.iva * 5,
      k.iva,
      JSON.stringify([{ aliquota: "22", imponibile: String(k.iva * 5), imposta: String(k.iva) }]),
    ],
  );
  return r.rows[0].id;
}

async function prospetto(db: PGlite, anno: number, t: number) {
  const r = await db.query<{ l: { iva_acquisti: number; documenti: Record<string, number> } }>(
    "select liquidazione_iva_periodo($1,'trimestrale',$2,null,$3) as l",
    [c, anno, t],
  );
  return r.rows[0].l;
}

describe("simulazione: 600 fatture casuali", () => {
  it("database e oracolo mettono ogni fattura nello stesso periodo, il prospetto torna col registro", async () => {
    const db = await setup();
    try {
      const caso = rng(20261107);
      const casi: Caso[] = [];
      for (let i = 0; i < 600; i++) {
        // Fatture da ottobre 2025 a febbraio 2027, con più peso su fine mese.
        const base = piuGiorni("2025-10-01", Math.floor(caso() * 500));
        const fineMese = caso() < 0.3;
        const dataFattura = fineMese
          ? piuGiorni(`${base.slice(0, 7)}-01`, 27 + Math.floor(caso() * 4)).slice(0, 7) === base.slice(0, 7)
            ? piuGiorni(`${base.slice(0, 7)}-01`, 27 + Math.floor(caso() * 4))
            : base
          : base;
        const tipo = caso();
        let sdi: string | null = null;
        let dichiarata: string | null = null;
        if (tipo < 0.45) {
          // Consegna dello SDI: da subito a 40 giorni, a un'ora qualsiasi (anche le 23:xx UTC).
          const giorno = piuGiorni(dataFattura, Math.floor(caso() * 41));
          const ora = String(Math.floor(caso() * 24)).padStart(2, "0");
          sdi = `${giorno}T${ora}:${String(Math.floor(caso() * 60)).padStart(2, "0")}:00Z`;
        } else if (tipo < 0.75) {
          const d = piuGiorni(dataFattura, Math.floor(caso() * 41));
          dichiarata = d <= oggi ? d : null;
        }
        casi.push({
          numero: `R${i}`,
          dataFattura,
          sdi,
          dichiarata,
          notaCredito: caso() < 0.1,
          iva: 1 + Math.floor(caso() * 500),
        });
      }
      const ids: string[] = [];
      for (const k of casi) ids.push(await inserisci(db, k));

      await db.exec("set role authenticated");
      // Le dichiarate: raggruppate per data, come farebbe chi le dichiara in blocco.
      const perData = new Map<string, string[]>();
      casi.forEach((k, i) => {
        if (k.dichiarata) perData.set(k.dichiarata, [...(perData.get(k.dichiarata) ?? []), ids[i]]);
      });
      for (const [data, lista] of perData) {
        const r = await db.query<{ e: { aggiornate: number; saltate: number } }>(
          "select fiscalita_dichiara_ricezione($1,$2::uuid[],$3::date) as e",
          [c, lista, data],
        );
        expect(r.rows[0].e).toMatchObject({ aggiornate: lista.length, saltate: 0 });
      }

      // 1) Fattura per fattura.
      const vista = await db.query<{ id: string; data_detrazione: string; ricezione_origine: string }>(
        "select id, data_detrazione::text, ricezione_origine from fatture_ricevute_periodo_iva",
      );
      const perId = new Map(vista.rows.map((r) => [r.id, r]));
      const discordanti: string[] = [];
      casi.forEach((k, i) => {
        const ricevuta = k.sdi ? giornoRoma(k.sdi) : k.dichiarata;
        const atteso = oracolo(k.dataFattura, ricevuta);
        const v = perId.get(ids[i])!;
        if (v.data_detrazione !== atteso)
          discordanti.push(`${k.numero}: fattura ${k.dataFattura}, ricevuta ${ricevuta ?? "—"} → db ${v.data_detrazione}, oracolo ${atteso}`);
        const origine = k.sdi
          ? "sdi"
          : k.dichiarata
            ? "dichiarata"
            : k.dataFattura.slice(5, 7) === "12" && Number(k.dataFattura.slice(8)) >= 20
              ? "da_verificare"
              : "presunta";
        if (v.ricezione_origine !== origine) discordanti.push(`${k.numero}: origine ${v.ricezione_origine}, attesa ${origine}`);
      });
      expect(discordanti).toEqual([]);

      // 2) Prospetto = registro, trimestre per trimestre; nessuna fattura in due periodi.
      const attesoPerTrimestre = new Map<string, { iva: number; n: number; senza: number }>();
      casi.forEach((k) => {
        const ricevuta = k.sdi ? giornoRoma(k.sdi) : k.dichiarata;
        const t = trimestre(oracolo(k.dataFattura, ricevuta));
        const x = attesoPerTrimestre.get(t) ?? { iva: 0, n: 0, senza: 0 };
        x.iva += k.notaCredito ? -k.iva : k.iva;
        x.n++;
        if (!k.sdi && !k.dichiarata) x.senza++;
        attesoPerTrimestre.set(t, x);
      });
      let contate = 0;
      for (const anno of [2025, 2026, 2027]) {
        for (const t of [1, 2, 3, 4]) {
          const atteso = attesoPerTrimestre.get(`${anno}-T${t}`) ?? { iva: 0, n: 0, senza: 0 };
          const p = await prospetto(db, anno, t);
          expect({ periodo: `${anno}-T${t}`, iva: Number(p.iva_acquisti), n: p.documenti.acquisti, senza: p.documenti.acquisti_senza_data_ricezione })
            .toEqual({ periodo: `${anno}-T${t}`, iva: atteso.iva, n: atteso.n, senza: atteso.senza });
          contate += p.documenti.acquisti;
        }
      }
      expect(contate).toBe(casi.length);

      // 3) Togliere tutte le dichiarazioni riporta ogni fattura alla presunzione.
      const tutte = [...perData.values()].flat();
      const r = await db.query<{ e: { aggiornate: number } }>(
        "select fiscalita_dichiara_ricezione($1,$2::uuid[],null) as e",
        [c, tutte],
      );
      expect(r.rows[0].e.aggiornate).toBe(tutte.length);
      const resto = await db.query<{ n: number }>(
        "select count(*)::int n from fatture_ricevute_periodo_iva where ricezione_origine='dichiarata'",
      );
      expect(resto.rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  });
});

describe("bordi del calendario", () => {
  const prova = async (dataFattura: string, sdi: string | null, dichiarata: string | null) => {
    const db = await setup();
    try {
      const id = await inserisci(db, { numero: "X", dataFattura, sdi, dichiarata: null, notaCredito: false, iva: 10 });
      await db.exec("set role authenticated");
      if (dichiarata)
        await db.query("select fiscalita_dichiara_ricezione($1,array[$2]::uuid[],$3::date)", [c, id, dichiarata]);
      const r = await db.query<{ d: string }>("select data_detrazione::text d from fatture_ricevute_periodo_iva where id=$1", [id]);
      return r.rows[0].d;
    } finally {
      await db.close();
    }
  };

  it("Capodanno: le 00:30 del 1° gennaio a Roma sono le 23:30 UTC del 31 dicembre", async () => {
    expect(await prova("2026-12-30", "2026-12-31T23:30:00Z", null)).toBe("2027-01-01");
    // 23:30 del 31/12 a Roma: ricevuta a dicembre, l'IVA resta nell'anno.
    expect(await prova("2026-12-30", "2026-12-31T22:30:00Z", null)).toBe("2026-12-31");
  });

  it("il 15 del mese dopo tiene la fattura nel suo mese, il 16 no — anche a mezzanotte con l'ora legale", async () => {
    // 15/10 alle 23:30 a Roma (ora legale, UTC+2) = 21:30 UTC.
    expect(await prova("2026-09-30", "2026-10-15T21:30:00Z", null)).toBe("2026-09-30");
    // 16/10 alle 00:30 a Roma = 22:30 UTC del 15.
    expect(await prova("2026-09-30", "2026-10-15T22:30:00Z", null)).toBe("2026-10-16");
    expect(await prova("2026-09-30", null, "2026-10-15")).toBe("2026-09-30");
    expect(await prova("2026-09-30", null, "2026-10-16")).toBe("2026-10-16");
  });

  it("dicembre ricevuta il 10 gennaio va nell'anno dopo, anche se è entro il 15", async () => {
    expect(await prova("2025-12-28", null, "2025-12-28")).toBe("2025-12-28");
    expect(await prova("2025-12-28", null, "2026-01-10")).toBe("2026-01-10");
  });

  it("il giorno del cambio d'ora non sposta niente", async () => {
    expect(await prova("2026-03-29", null, "2026-03-29")).toBe("2026-03-29");
    expect(await prova("2026-10-25", null, "2026-10-25")).toBe("2026-10-25");
  });
});

describe("abusi e casi storti", () => {
  it("id ripetuti, nulli e troppe fatture", async () => {
    const db = await setup();
    try {
      const id = await inserisci(db, { numero: "D", dataFattura: "2026-09-01", sdi: null, dichiarata: null, notaCredito: false, iva: 1 });
      await db.exec("set role authenticated");
      const r = await db.query<{ e: { aggiornate: number; saltate: number } }>(
        "select fiscalita_dichiara_ricezione($1,array[$2,$2,$2,null]::uuid[],'2026-09-05') as e",
        [c, id],
      );
      expect(r.rows[0].e).toMatchObject({ aggiornate: 1, saltate: 0 });
      await expect(
        db.query("select fiscalita_dichiara_ricezione($1,array[null]::uuid[],'2026-09-05')", [c]),
      ).rejects.toThrow("Nessuna");
      await expect(
        db.query("select fiscalita_dichiara_ricezione($1,(select array_agg(gen_random_uuid()) from generate_series(1,2001)),'2026-09-05')", [c]),
      ).rejects.toThrow("2000");
      // 2000 esatte (di cui 1999 inesistenti) passano.
      const r2 = await db.query<{ e: { aggiornate: number; saltate: number } }>(
        "select fiscalita_dichiara_ricezione($1,array[$2::uuid] || (select array_agg(gen_random_uuid()) from generate_series(1,1999)),'2026-09-06') as e",
        [c, id],
      );
      expect(r2.rows[0].e).toMatchObject({ aggiornate: 1, saltate: 1999 });
    } finally {
      await db.close();
    }
  });

  it("data nel futuro scritta a mano nella colonna: rifiutata", async () => {
    const db = await setup();
    try {
      const id = await inserisci(db, { numero: "F", dataFattura: "2026-09-01", sdi: null, dichiarata: null, notaCredito: false, iva: 1 });
      await db.exec("set role authenticated");
      await expect(
        db.query("update fatture_ricevute set ricezione_dichiarata_il = current_date + 30 where id=$1", [id]),
      ).rejects.toThrow("futuro");
      // Anche all'inserimento.
      await expect(
        db.query(
          "insert into fatture_ricevute(company_id,numero_fattura,data_fattura,ricezione_dichiarata_il,stato) values($1,'G','2026-09-01',current_date + 30,'letta')",
          [c],
        ),
      ).rejects.toThrow("futuro");
    } finally {
      await db.close();
    }
  });

  it("impostazioni salvate due volte come fa il browser (upsert), mai spostate su un altro anno o azienda", async () => {
    const db = await setup();
    try {
      await db.exec("set role authenticated");
      const upsert = (periodicita: string) =>
        db.query(
          `insert into fiscalita_impostazioni_iva(company_id,anno,periodicita,regime,iva_per_cassa,pro_rata_percentuale,attivita_separate,credito_anno_precedente,metodo_acconto,cf_contribuente,cf_dichiarante,codice_carica,cf_intermediario,note)
           values($1,2026,$2,'ordinario',false,null,false,0,'storico',null,null,'1',null,null)
           on conflict (company_id,anno) do update set company_id=excluded.company_id, anno=excluded.anno, periodicita=excluded.periodicita,
             regime=excluded.regime, iva_per_cassa=excluded.iva_per_cassa, pro_rata_percentuale=excluded.pro_rata_percentuale,
             attivita_separate=excluded.attivita_separate, credito_anno_precedente=excluded.credito_anno_precedente,
             metodo_acconto=excluded.metodo_acconto, cf_contribuente=excluded.cf_contribuente, cf_dichiarante=excluded.cf_dichiarante,
             codice_carica=excluded.codice_carica, cf_intermediario=excluded.cf_intermediario, note=excluded.note`,
          [c, periodicita],
        );
      await upsert("trimestrale");
      await upsert("mensile");
      await upsert("mensile");
      const r = await db.query<{ periodicita: string; n: number }>(
        "select periodicita, count(*) over ()::int n from fiscalita_impostazioni_iva",
      );
      expect(r.rows).toEqual([{ periodicita: "mensile", n: 1 }]);
      await expect(db.exec("update fiscalita_impostazioni_iva set anno=2027")).rejects.toThrow("non si cambiano");
    } finally {
      await db.close();
    }
  });

  it("partita IVA scritta come sulle fatture, con IT e spazi: salvata in 11 cifre", async () => {
    const db = await setup();
    try {
      await db.exec("set role authenticated");
      await db.query(
        "insert into fiscalita_impostazioni_iva(company_id,anno,periodicita,cf_contribuente,cf_intermediario,cf_dichiarante) values($1,2026,'mensile',' it 0123 4567 890 ','IT98765432109','rssmra80a01h501u')",
        [c],
      );
      const r = await db.query<Record<string, string>>(
        "select cf_contribuente, cf_intermediario, cf_dichiarante from fiscalita_impostazioni_iva",
      );
      expect(r.rows[0]).toEqual({ cf_contribuente: "01234567890", cf_intermediario: "98765432109", cf_dichiarante: "RSSMRA80A01H501U" });
      // Un codice fiscale di persona che inizia per IT non va toccato.
      await db.exec("update fiscalita_impostazioni_iva set cf_contribuente='ITLMRA80A01H501U'");
      const p = await db.query<{ cf_contribuente: string }>("select cf_contribuente from fiscalita_impostazioni_iva");
      expect(p.rows[0].cf_contribuente).toBe("ITLMRA80A01H501U");
      await expect(db.exec("update fiscalita_impostazioni_iva set cf_contribuente='IT0123'")).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  it("mesi chiusi: niente IVA che entra o che esce, ma una modifica che non tocca il periodo passa", async () => {
    const db = await setup();
    try {
      const agosto = await inserisci(db, { numero: "A", dataFattura: "2026-08-10", sdi: null, dichiarata: null, notaCredito: false, iva: 1 });
      const settembre = await inserisci(db, { numero: "S", dataFattura: "2026-09-10", sdi: null, dichiarata: null, notaCredito: false, iva: 1 });
      await db.exec(`alter table fiscalita_periodi disable trigger user;
        insert into fiscalita_periodi(company_id,mese,stato,motivo,attore) values('${c}','2026-09-01','chiuso','test','${c}');
        alter table fiscalita_periodi enable trigger user;`);
      await db.exec("set role authenticated");
      // Agosto → settembre (chiuso): entra in un mese chiuso.
      await expect(
        db.query("select fiscalita_dichiara_ricezione($1,array[$2]::uuid[],'2026-09-20')", [c, agosto]),
      ).rejects.toThrow("chiuso");
      // Settembre (chiuso) → ottobre: esce da un mese chiuso.
      await expect(
        db.query("select fiscalita_dichiara_ricezione($1,array[$2]::uuid[],'2026-10-20')", [c, settembre]),
      ).rejects.toThrow("chiuso");
      // Settembre → settembre (ricevuta il 12): il periodo non cambia, ma la data sì: resta un dato
      // fiscale, quindi anche questa va rifiutata a mese chiuso.
      await expect(
        db.query("select fiscalita_dichiara_ricezione($1,array[$2]::uuid[],'2026-09-12')", [c, settembre]),
      ).rejects.toThrow("chiuso");
      // Agosto → agosto/settembre entro il 15: agosto resta aperto, passa.
      const ok = await db.query<{ e: { aggiornate: number } }>(
        "select fiscalita_dichiara_ricezione($1,array[$2]::uuid[],'2026-09-14') as e",
        [c, agosto],
      );
      expect(ok.rows[0].e.aggiornate).toBe(1);
      // Una nota interna sulla fattura di settembre non tocca l'IVA: passa.
      await db.exec("reset role");
      await db.exec("alter table fatture_ricevute add column if not exists note_interne text");
      await db.exec("grant update on fatture_ricevute to authenticated");
      await db.exec("set role authenticated");
      await db.query("update fatture_ricevute set note_interne='controllata' where id=$1", [settembre]);
      // Una dichiarazione che fallisce non lascia niente a metà.
      await db.exec("reset role");
      const r = await db.query<{ ricezione_dichiarata_il: string | null }>(
        "select ricezione_dichiarata_il::text from fatture_ricevute where id=$1",
        [settembre],
      );
      expect(r.rows[0].ricezione_dichiarata_il).toBeNull();
    } finally {
      await db.close();
    }
  });

  it("un blocco con una fattura in un mese chiuso non scrive neanche le altre", async () => {
    const db = await setup();
    try {
      const aperta = await inserisci(db, { numero: "O", dataFattura: "2026-07-10", sdi: null, dichiarata: null, notaCredito: false, iva: 1 });
      const chiusa = await inserisci(db, { numero: "C", dataFattura: "2026-09-10", sdi: null, dichiarata: null, notaCredito: false, iva: 1 });
      await db.exec(`alter table fiscalita_periodi disable trigger user;
        insert into fiscalita_periodi(company_id,mese,stato,motivo,attore) values('${c}','2026-09-01','chiuso','test','${c}');
        alter table fiscalita_periodi enable trigger user;`);
      await db.exec("set role authenticated");
      await expect(
        db.query("select fiscalita_dichiara_ricezione($1,array[$2,$3]::uuid[],'2026-10-20')", [c, aperta, chiusa]),
      ).rejects.toThrow("chiuso");
      await db.exec("reset role");
      const r = await db.query<{ n: number }>("select count(*)::int n from fatture_ricevute where ricezione_dichiarata_il is not null");
      expect(r.rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  });
});

describe("il doppione che arriva dallo SDI dopo il gestionale", () => {
  const letta = {
    cedente_piva: "01158300937", cedente_cf: "", cedente_ragione_sociale: "Fornitore", cedente_paese: "IT",
    cedente_indirizzo: "", cedente_cap: "", cedente_comune: "", cedente_provincia: "", cessionario_piva: "01941970939",
    cessionario_cf: "", tipo_documento: "TD01", numero_fattura: "77", data_fattura: "2026-09-21",
    imponibile_totale: 100, iva_totale: 22, totale_documento: 122, righe: [], riepilogo_iva: [],
    sdi_id_trasmissione: "", sdi_progressivo: "", fatture_nel_file: 1,
  } as never;

  function finto(esistente: Record<string, unknown>) {
    const scritture: Array<{ campi: Record<string, unknown>; filtri: string[] }> = [];
    const catena = () => {
      const q: Record<string, unknown> = {};
      const self = () => q;
      q.select = self;
      q.eq = self;
      q.is = self;
      q.limit = self;
      q.maybeSingle = async () => ({ data: esistente, error: null as unknown });
      q.update = (campi: Record<string, unknown>) => {
        const voce = { campi, filtri: [] as string[] };
        scritture.push(voce);
        const u: Record<string, unknown> = {};
        u.eq = (k: string) => (voce.filtri.push(`eq:${k}`), u);
        u.is = (k: string) => (voce.filtri.push(`is:${k}`), u);
        u.then = (ok: (v: unknown) => void) => ok({ error: null });
        return u;
      };
      return q;
    };
    return {
      client: { from: catena, storage: { from: () => ({ upload: async () => ({ error: null as unknown }) }) } },
      scritture,
    };
  }

  it("prende la data SDI se la fattura non l'aveva, solo dove è ancora vuota", async () => {
    const f = finto({ id: "r1", openapi_id: null, xml_raw: "<x/>", note: null, data_ricezione_sdi: null });
    const esito = await salvaFatturaRicevuta(f.client as never, {
      companyId: "co", xml: "<x/>", letta, openapiId: "oa1", ricevutaIl: "2026-10-20T08:00:00Z",
    } as never);
    expect(esito.doppione).toBe(true);
    const data = f.scritture.find((s) => "data_ricezione_sdi" in s.campi);
    expect(data?.campi).toEqual({ data_ricezione_sdi: "2026-10-20T08:00:00Z" });
    expect(data?.filtri).toContain("is:data_ricezione_sdi");
  });

  it("non tocca una data SDI già presente e non inventa date se il canale non la dà", async () => {
    const giaDatata = finto({ id: "r1", openapi_id: "oa1", xml_raw: "<x/>", note: null, data_ricezione_sdi: "2026-09-22T08:00:00Z" });
    await salvaFatturaRicevuta(giaDatata.client as never, {
      companyId: "co", xml: "<x/>", letta, openapiId: "oa1", ricevutaIl: "2026-10-20T08:00:00Z",
    } as never);
    expect(giaDatata.scritture.some((s) => "data_ricezione_sdi" in s.campi)).toBe(false);

    const senzaData = finto({ id: "r1", openapi_id: null, xml_raw: "<x/>", note: null, data_ricezione_sdi: null });
    await salvaFatturaRicevuta(senzaData.client as never, { companyId: "co", xml: "<x/>", letta } as never);
    expect(senzaData.scritture.some((s) => "data_ricezione_sdi" in s.campi)).toBe(false);
  });
});
