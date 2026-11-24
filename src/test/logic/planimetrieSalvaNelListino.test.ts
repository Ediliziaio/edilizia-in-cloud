import { beforeEach, describe, expect, it, vi } from "vitest";

/** Finto listino: una tabella in memoria con le sole chiamate che il modulo usa. */
const righe: Record<string, unknown>[] = [];
const ultimo: { update?: Record<string, unknown>; insert?: Record<string, unknown>; filtri: Record<string, unknown> } = { filtri: {} };
let erroreLettura = false;

type Riga = Record<string, unknown>;
interface Catena {
  select: () => Catena;
  eq: (campo: string, valore: unknown) => Catena;
  limit: () => Catena;
  maybeSingle: () => Promise<{ data: Riga | null; error: { message: string } | null }>;
  update: (valori: Riga) => Catena;
  insert: (valori: Riga) => Promise<{ error: { message: string } | null }>;
}

function from(tabella: string): Catena {
  expect(tabella).toBe("rst_listino_voci");
  const filtri: Riga = {};
  ultimo.filtri = filtri;
  const self: Catena = {
    select: () => self,
    eq: (campo, valore) => { filtri[campo] = valore; return self; },
    limit: () => self,
    maybeSingle: async () => erroreLettura
      ? { data: null, error: { message: "giù" } }
      : { data: righe.find((r) => Object.entries(filtri).every(([c, v]) => r[c] === v)) ?? null, error: null },
    update: (valori) => { ultimo.update = valori; return self; },
    insert: async (valori) => { ultimo.insert = valori; righe.push(valori); return { error: null }; },
  };
  return self;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => from(t) } }));

const { messaggioListino, quotaManodopera, salvaPrezzoNelListino, unitaListino } = await import("@/lib/planimetrie/salvaNelListino");

const riga = (id: string, descrizione: string) => ({ id, descrizione } as { id: string; descrizione: string });

beforeEach(() => { righe.length = 0; erroreLettura = false; ultimo.update = undefined; ultimo.insert = undefined; });

describe("il prezzo corretto va nel listino dell'azienda", () => {
  it("traduce l'unità della pianta in quella del listino", () => {
    expect(["m²", "m", "cad", "a corpo"].map((u) => unitaListino(u as "m²"))).toEqual(["mq", "ml", "cad", "a corpo"]);
  });

  it("divide manodopera e materiali con la quota tipica della lavorazione, ricarico a zero", async () => {
    expect(quotaManodopera(riga("m1", "Demolizione tramezzo"))).toBe(0.85);
    expect(quotaManodopera(riga("x", "Ventilazione del nuovo bagno"))).toBe(0.5);
    const esito = await salvaPrezzoNelListino("az", { descrizione: "Demolizione tramezzo", unita: "m²", importo: 32.2, riga: riga("m1", "Demolizione tramezzo") });
    expect(esito).toBe("creata");
    expect(ultimo.insert).toMatchObject({
      company_id: "az", descrizione: "Demolizione tramezzo", unita_misura: "mq",
      prezzo_unitario: 32.2, ricarico_pct: 0, costo_manodopera: 27.37, costo_materiali: 4.83,
    });
    expect(String(ultimo.insert?.note)).toMatch(/Prezzo corretto dalla planimetria il \d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it("la stessa lavorazione non crea un doppione: aggiorna la voce che c'è già", async () => {
    righe.push({ id: "v1", company_id: "az", descrizione: "Nuovo tramezzo", unita_misura: "mq" });
    const esito = await salvaPrezzoNelListino("az", { descrizione: "  Nuovo tramezzo  ", unita: "m²", importo: 60 });
    expect(esito).toBe("aggiornata");
    expect(ultimo.update).toMatchObject({ prezzo_unitario: 60, costo_manodopera: 30, costo_materiali: 30 });
    expect(ultimo.filtri).toMatchObject({ id: "v1", company_id: "az" });
    expect(righe).toHaveLength(1);
  });

  it("rifiuta un prezzo o una descrizione che non vanno, e dice se il listino non risponde", async () => {
    await expect(salvaPrezzoNelListino("az", { descrizione: " ", unita: "m²", importo: 10 })).rejects.toThrow(/non valido/);
    await expect(salvaPrezzoNelListino("az", { descrizione: "X", unita: "m²", importo: Number.NaN })).rejects.toThrow(/non valido/);
    erroreLettura = true;
    await expect(salvaPrezzoNelListino("az", { descrizione: "X", unita: "m²", importo: 10 })).rejects.toThrow(/Listino non disponibile/);
  });

  it("dice all'utente cosa è successo", () => {
    expect(messaggioListino("creata", "Nuovo tramezzo")).toMatch(/è ora nel listino dell'azienda/);
    expect(messaggioListino("aggiornata", "Nuovo tramezzo")).toMatch(/Ho aggiornato «Nuovo tramezzo»/);
  });
});
