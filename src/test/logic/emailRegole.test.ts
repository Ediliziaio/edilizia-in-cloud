/**
 * MP-EMAIL-AI-05 — Le regole email dell'azienda, sul codice del server
 * (supabase/functions/_shared/email-ai-cascade.ts).
 *
 * Fino al 26/09/2026 la pagina delle regole offriva «Silenzia», «Marca da fare»,
 * «Imposta priorità», «Etichetta» e «Salta AI», ma il server applicava solo la
 * categoria: gli altri effetti li calcolava una copia nel browser
 * (src/lib/email-ai/rules-engine.ts) che nessuno eseguiva. Da allora silenzia =
 * letta, marca da fare = stella, priorità = ai_priority difesa da un trigger
 * (migrazione 20280926100700); etichetta e salta AI sono sparite dalla pagina.
 *
 * Caso guida: Edil Forniture SpA, 4 indirizzi della stessa entità trattati in
 * modo diverso.
 */

import { describe, it, expect } from "vitest";
import {
  valutaRegole,
  classificaConRegole,
  applicaEffettiRegola,
  type EmailInput,
  type EsitoRegola,
  type Regola,
} from "../../../supabase/functions/_shared/email-ai-cascade";

const FORNITORE_ID = "00000000-0000-0000-0000-00000000ed11";

// 4 regole Edil Forniture (stessa priorità, una per indirizzo)
const REGOLE_EDIL_FORNITURE: Regola[] = [
  {
    id: "r-news", nome: "Newsletter Edil Forniture", stato: "attiva", priorita: 10, combinatore: "AND",
    condizioni: [{ campo: "indirizzo", operatore: "e", valore: "newsletter@ediforniture.it" }],
    azioni: [{ tipo: "categoria", valore: "newsletter" }, { tipo: "silenzia" }],
  },
  {
    id: "r-prev", nome: "Preventivi Edil Forniture", stato: "attiva", priorita: 10, combinatore: "AND",
    condizioni: [{ campo: "indirizzo", operatore: "e", valore: "preventivi@ediforniture.it" }],
    azioni: [
      { tipo: "categoria", valore: "preventivo" },
      { tipo: "collega_entita", valore: { tipo: "fornitore", id: FORNITORE_ID } },
      { tipo: "priorita", valore: "alta" },
    ],
  },
  {
    id: "r-ord", nome: "Ordini Edil Forniture", stato: "attiva", priorita: 10, combinatore: "AND",
    condizioni: [{ campo: "indirizzo", operatore: "e", valore: "ordini@ediforniture.it" }],
    azioni: [
      { tipo: "categoria", valore: "fornitore" },
      { tipo: "collega_entita", valore: { tipo: "fornitore", id: FORNITORE_ID } },
      { tipo: "priorita", valore: "alta" },
    ],
  },
  {
    id: "r-log", nome: "Logistica Edil Forniture (DDT)", stato: "attiva", priorita: 10, combinatore: "AND",
    condizioni: [{ campo: "indirizzo", operatore: "e", valore: "logistica@ediforniture.it" }],
    azioni: [
      { tipo: "categoria", valore: "fornitore" },
      { tipo: "collega_entita", valore: { tipo: "fornitore", id: FORNITORE_ID } },
      { tipo: "marca_da_fare" },
    ],
  },
];

function emailDa(indirizzo: string, extra: Partial<EmailInput> = {}): EmailInput {
  return { from_email: indirizzo, fromDomain: "ediforniture.it", subject: "", snippet: "", ...extra };
}

/** Una regola sola, attiva, con le azioni date. */
function regola(parziale: Partial<Regola> & Pick<Regola, "condizioni">): Regola {
  return {
    id: "r", nome: "Regola di prova", stato: "attiva", priorita: 50, combinatore: "AND",
    azioni: [{ tipo: "categoria", valore: "fornitore" }],
    ...parziale,
  };
}

describe("MP-05 — Edil Forniture: 1 entità, 4 canali, 4 trattamenti", () => {
  it("newsletter@ → newsletter + silenziata", () => {
    const m = valutaRegole(emailDa("newsletter@ediforniture.it"), REGOLE_EDIL_FORNITURE);
    expect(m?.risultato?.categoria).toBe("newsletter");
    expect(m?.effetti).toEqual({ silenzia: true });
    expect(m?.regola_nome).toContain("Newsletter");
  });

  it("preventivi@ → preventivo + entità fornitore + priorità alta", () => {
    const m = valutaRegole(emailDa("preventivi@ediforniture.it"), REGOLE_EDIL_FORNITURE);
    expect(m?.risultato?.categoria).toBe("preventivo");
    expect(m?.risultato?.entita_tipo).toBe("fornitore");
    expect(m?.risultato?.entita_id).toBe(FORNITORE_ID);
    expect(m?.risultato?.matched_by).toBe("regola:Preventivi Edil Forniture");
    expect(m?.effetti.priorita).toBe("alta");
  });

  it("ordini@ → fornitore + entità + priorità alta", () => {
    const m = valutaRegole(emailDa("ordini@ediforniture.it"), REGOLE_EDIL_FORNITURE);
    expect(m?.risultato?.categoria).toBe("fornitore");
    expect(m?.risultato?.entita_id).toBe(FORNITORE_ID);
    expect(m?.effetti.priorita).toBe("alta");
  });

  it("logistica@ → fornitore + da fare (stella)", () => {
    const m = valutaRegole(emailDa("logistica@ediforniture.it"), REGOLE_EDIL_FORNITURE);
    expect(m?.risultato?.categoria).toBe("fornitore");
    expect(m?.effetti).toEqual({ marca_da_fare: true });
  });

  it("indirizzo non coperto → nessuna regola (scende nella cascata)", () => {
    expect(valutaRegole(emailDa("amministrazione@ediforniture.it"), REGOLE_EDIL_FORNITURE)).toBeNull();
  });
});

describe("MP-05 — operatori e combinatori", () => {
  it("operatore 'contiene' su oggetto", () => {
    const r = [regola({ condizioni: [{ campo: "oggetto", operatore: "contiene", valore: "ddt" }] })];
    expect(valutaRegole(emailDa("x@y.it", { subject: "Trasmissione DDT 451" }), r)).not.toBeNull();
    expect(valutaRegole(emailDa("x@y.it", { subject: "Preventivo" }), r)).toBeNull();
  });

  it("operatore 'termina_con' su dominio", () => {
    const r = [regola({ condizioni: [{ campo: "dominio", operatore: "termina_con", valore: "ediforniture.it" }] })];
    expect(valutaRegole(emailDa("chiunque@ediforniture.it"), r)).not.toBeNull();
  });

  it("combinatore OR: basta una condizione", () => {
    const r = [regola({
      combinatore: "OR",
      condizioni: [
        { campo: "oggetto", operatore: "contiene", valore: "fattura" },
        { campo: "oggetto", operatore: "contiene", valore: "sollecito" },
      ],
    })];
    expect(valutaRegole(emailDa("x@y.it", { subject: "Sollecito pagamento" }), r)).not.toBeNull();
    expect(valutaRegole(emailDa("x@y.it", { subject: "Newsletter" }), r)).toBeNull();
  });

  it("combinatore AND: servono tutte", () => {
    const r = [regola({
      condizioni: [
        { campo: "dominio", operatore: "e", valore: "ediforniture.it" },
        { campo: "oggetto", operatore: "contiene", valore: "ddt" },
        { campo: "allegato", operatore: "e", valore: "si" },
      ],
    })];
    expect(valutaRegole(emailDa("log@ediforniture.it", { subject: "DDT 9", has_attachment: true }), r)).not.toBeNull();
    expect(valutaRegole(emailDa("log@ediforniture.it", { subject: "DDT 9", has_attachment: false }), r)).toBeNull();
  });

  it("destinatario e casella leggono a e cc", () => {
    const r = [regola({ condizioni: [{ campo: "destinatario", operatore: "contiene", valore: "acquisti@" }] })];
    expect(valutaRegole(emailDa("x@y.it", { to_email: "info@impresa.it", cc_emails: ["acquisti@impresa.it"] }), r)).not.toBeNull();
    expect(valutaRegole(emailDa("x@y.it", { to_email: "info@impresa.it" }), r)).toBeNull();
  });
});

describe("MP-05 — precedenza", () => {
  it("priorità più bassa vince", () => {
    const m = valutaRegole(emailDa("preventivi@ediforniture.it"), [
      regola({ id: "generica", priorita: 100, condizioni: [{ campo: "dominio", operatore: "e", valore: "ediforniture.it" }] }),
      regola({
        id: "specifica", priorita: 10,
        condizioni: [{ campo: "indirizzo", operatore: "e", valore: "preventivi@ediforniture.it" }],
        azioni: [{ tipo: "categoria", valore: "preventivo" }],
      }),
    ]);
    expect(m?.regola_id).toBe("specifica");
    expect(m?.risultato?.categoria).toBe("preventivo");
  });

  it("a parità di priorità vince la più specifica", () => {
    const m = valutaRegole(emailDa("preventivi@ediforniture.it", { subject: "Offerta" }), [
      regola({ id: "una", condizioni: [{ campo: "dominio", operatore: "e", valore: "ediforniture.it" }] }),
      regola({
        id: "due",
        condizioni: [
          { campo: "dominio", operatore: "e", valore: "ediforniture.it" },
          { campo: "oggetto", operatore: "contiene", valore: "offerta" },
        ],
      }),
    ]);
    expect(m?.regola_id).toBe("due");
  });

  it("regola disattivata viene ignorata", () => {
    const r = [regola({ stato: "disattivata", condizioni: [{ campo: "dominio", operatore: "e", valore: "ediforniture.it" }] })];
    expect(valutaRegole(emailDa("x@ediforniture.it"), r)).toBeNull();
  });
});

describe("Effetti della regola", () => {
  it("priorità solo coi valori della posta in arrivo (alta, media, bassa)", () => {
    const conPriorita = (valore: string) =>
      valutaRegole(emailDa("x@ediforniture.it"), [regola({
        condizioni: [{ campo: "dominio", operatore: "e", valore: "ediforniture.it" }],
        azioni: [{ tipo: "priorita", valore }],
      })])?.effetti.priorita;
    expect(conPriorita("media")).toBe("media");
    expect(conPriorita("urgente")).toBeUndefined();
    expect(conPriorita("normale")).toBeUndefined();
  });

  it("una regola senza categoria non decide la classificazione", () => {
    const m = valutaRegole(emailDa("x@ediforniture.it"), [regola({
      condizioni: [{ campo: "dominio", operatore: "e", valore: "ediforniture.it" }],
      azioni: [{ tipo: "silenzia" }, { tipo: "priorita", valore: "bassa" }],
    })]);
    expect(m?.risultato).toBeNull();
    expect(m?.effetti).toEqual({ silenzia: true, priorita: "bassa" });
  });
});

// ─── Sul database (finto) ─────────────────────────────────────────────────────

type Filtri = Record<string, unknown>;

interface Scrittura {
  tabella: string;
  modifica: Record<string, unknown>;
  filtri: Filtri;
}

interface QueryFinta {
  select(): QueryFinta;
  eq(colonna: string, valore: unknown): QueryFinta;
  ilike(colonna: string, valore: unknown): QueryFinta;
  is(colonna: string, valore: unknown): QueryFinta;
  in(): QueryFinta;
  order(): QueryFinta;
  limit(): QueryFinta;
  update(modifica: Record<string, unknown>): QueryFinta;
  maybeSingle(): Promise<{ data: null; error: null }>;
  /** Le regole (await sulla lettura) e gli update (await sulla scrittura). */
  then<T>(fatto: (risposta: { data: unknown[]; error: null }) => T): Promise<T>;
}

/**
 * Un finto client Supabase: le letture della cascata non trovano niente, le
 * regole sono quelle date, e l'update con `regola_applicata_at is null` tocca la
 * riga una volta sola, come farebbe Postgres.
 */
function databaseFinto(regole: Regola[] = []) {
  const scritture: Scrittura[] = [];
  const contatori: unknown[] = [];
  let giaApplicata = false;
  const db = {
    from(tabella: string): QueryFinta {
      const filtri: Filtri = {};
      let modifica: Record<string, unknown> | null = null;
      const query: QueryFinta = {
        select: () => query,
        eq(colonna, valore) {
          filtri[colonna] = valore;
          return query;
        },
        ilike(colonna, valore) {
          filtri[colonna] = valore;
          return query;
        },
        is(colonna, valore) {
          filtri[`${colonna} is`] = valore;
          return query;
        },
        in: () => query,
        order: () => query,
        limit: () => query,
        update(m) {
          modifica = m;
          return query;
        },
        maybeSingle: async () => ({ data: null, error: null }),
        then: async (fatto) => {
          if (!modifica) return fatto({ data: tabella === "email_regole" ? regole : [], error: null });
          scritture.push({ tabella, modifica, filtri });
          if (filtri["regola_applicata_at is"] === null && giaApplicata) return fatto({ data: [], error: null });
          giaApplicata = true;
          return fatto({ data: [{ id: filtri.id }], error: null });
        },
      };
      return query;
    },
    rpc: async (funzione: string, argomenti: unknown): Promise<{ data: null; error: null }> => {
      if (funzione === "bump_email_regola_match") contatori.push(argomenti);
      return { data: null, error: null };
    },
  };
  return { db: db as unknown as Parameters<typeof classificaConRegole>[0], scritture, contatori };
}

const SILENZIA_NEWSLETTER: Regola = regola({
  id: "r-silenzia", nome: "Silenzia le newsletter del fornitore",
  condizioni: [{ campo: "dominio", operatore: "e", valore: "ediforniture.it" }],
  azioni: [{ tipo: "silenzia" }],
});

describe("classificaConRegole: la regola e il resto della cascata", () => {
  it("una regola con categoria decide la classificazione", async () => {
    const { db } = databaseFinto(REGOLE_EDIL_FORNITURE);
    const { risultato, regola: r } = await classificaConRegole(db, "azienda", emailDa("ordini@ediforniture.it"));
    expect(risultato?.categoria).toBe("fornitore");
    expect(risultato?.matched_by).toBe("regola:Ordini Edil Forniture");
    expect(r?.effetti.priorita).toBe("alta");
  });

  it("senza categoria, la categoria la decide il resto della cascata (non più «altro»)", async () => {
    const { db } = databaseFinto([SILENZIA_NEWSLETTER]);
    const { risultato, regola: r } = await classificaConRegole(db, "azienda", emailDa("news@ediforniture.it", {
      subject: "Le novità di settembre",
      headers: { "list-unsubscribe": "<mailto:unsubscribe@ediforniture.it>" },
    }));
    expect(risultato?.categoria).toBe("newsletter");
    expect(risultato?.matched_by).toBe("header:list-unsubscribe");
    expect(r?.regola_id).toBe("r-silenzia");
    expect(r?.effetti.silenzia).toBe(true);
  });

  it("senza categoria e senza altri segnali: l'email va a L3, la regola resta da applicare", async () => {
    const { db } = databaseFinto([SILENZIA_NEWSLETTER]);
    const { risultato, regola: r } = await classificaConRegole(db, "azienda", emailDa("mario@ediforniture.it", { subject: "Ciao" }));
    expect(risultato).toBeNull();
    expect(r?.effetti.silenzia).toBe(true);
  });

  it("nessuna regola: nessuna regola da applicare", async () => {
    const { db } = databaseFinto();
    const { regola: r } = await classificaConRegole(db, "azienda", emailDa("mario@ediforniture.it"));
    expect(r).toBeNull();
  });
});

describe("applicaEffettiRegola: letta, stella e priorità, una volta sola", () => {
  const esito: EsitoRegola = {
    regola_id: "r-tutto", regola_nome: "Tutto", risultato: null,
    effetti: { silenzia: true, marca_da_fare: true, priorita: "alta" },
  };

  it("scrive letta, stella e priorità (anche in regola_priorita, per il trigger)", async () => {
    const { db, scritture, contatori } = databaseFinto();
    expect(await applicaEffettiRegola(db, "email-1", esito)).toBe(true);
    expect(scritture).toHaveLength(1);
    const { tabella, modifica, filtri } = scritture[0];
    expect(tabella).toBe("email_inbox");
    expect(modifica).toMatchObject({ is_read: true, is_starred: true, ai_priority: "alta", regola_priorita: "alta" });
    expect(typeof modifica.regola_applicata_at).toBe("string");
    expect(filtri).toEqual({ id: "email-1", "regola_applicata_at is": null });
    expect(contatori).toEqual([{ p_regola_id: "r-tutto" }]);
  });

  it("la seconda volta non tocca niente e non conta un altro match", async () => {
    const { db, contatori } = databaseFinto();
    await applicaEffettiRegola(db, "email-1", esito);
    expect(await applicaEffettiRegola(db, "email-1", esito)).toBe(false);
    expect(contatori).toHaveLength(1);
  });

  it("una regola con la sola categoria segna soltanto che ha agito", async () => {
    const { db, scritture } = databaseFinto();
    await applicaEffettiRegola(db, "email-2", { regola_id: "r", regola_nome: "Solo categoria", risultato: null, effetti: {} });
    expect(Object.keys(scritture[0].modifica)).toEqual(["regola_applicata_at"]);
  });
});
