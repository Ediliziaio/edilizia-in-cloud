/**
 * «Scollega» nel pannello dei prodotti collegati a una tariffa (05/10/2026).
 *
 * Prima metteva la posa del prodotto a «nessuna» sempre: un prodotto con la
 * posa a prezzo manuale e un vecchio collegamento alla tariffa rimasto perdeva
 * la sua posa. E l'elenco mostrava anche i prodotti nel cestino.
 */
import { describe, expect, it } from "vitest";
import {
  caricaProdottiCollegati,
  esitoScollegamento,
  scollegaTariffaDaProdotto,
} from "@/components/listino/TariffaProdottiCollegati";

type Riga = Record<string, unknown>;

/** Una tabella in memoria che applica davvero filtri e aggiornamenti. */
function databaseFinto(righe: Riga[]) {
  const aggiornamenti: Riga[] = [];
  const from = (_tabella: string) => {
    let modifica: Riga | null = null;
    let colonne: string[] | null = null;
    const filtri: Array<(r: Riga) => boolean> = [];
    const q = {
      update(p: Riga) {
        modifica = p;
        return q;
      },
      select(c: string) {
        colonne = c.split(",").map((s) => s.trim());
        return q;
      },
      eq(col: string, val: unknown) {
        filtri.push((r) => r[col] === val);
        return q;
      },
      is(col: string, val: unknown) {
        filtri.push((r) => (r[col] ?? null) === val);
        return q;
      },
      order() {
        return q;
      },
      then(ok: (v: { data: Riga[]; error: null }) => unknown, ko?: (e: unknown) => unknown) {
        const scelte = righe.filter((r) => filtri.every((f) => f(r)));
        if (modifica && scelte.length > 0) {
          aggiornamenti.push(modifica);
          for (const r of scelte) Object.assign(r, modifica);
        }
        const data = scelte.map((r) =>
          colonne ? Object.fromEntries(colonne.map((c) => [c, r[c]])) : { ...r },
        );
        return Promise.resolve({ data, error: null }).then(ok, ko);
      },
    };
    return q;
  };
  return { db: { from }, aggiornamenti };
}

const TARIFFA = "tariffa-posa";

describe("Scollega una tariffa da un prodotto", () => {
  it("posa a prezzo manuale con un vecchio collegamento: si toglie solo il collegamento", async () => {
    const prodotto = {
      id: "p1",
      posa_tariffa_default_id: TARIFFA,
      manodopera_modalita: "manuale",
      manodopera_prezzo_vendita: 90,
    };
    const { db } = databaseFinto([prodotto]);
    const modalita = await scollegaTariffaDaProdotto(db, "p1", TARIFFA);
    expect(modalita).toBe("manuale");
    expect(prodotto).toEqual({
      id: "p1",
      posa_tariffa_default_id: null,
      manodopera_modalita: "manuale",
      manodopera_prezzo_vendita: 90,
    });
  });

  it("posa presa dalla tariffa: collegamento tolto e posa a «nessuna», come prima", async () => {
    const prodotto = { id: "p2", posa_tariffa_default_id: TARIFFA, manodopera_modalita: "tariffa" };
    const { db } = databaseFinto([prodotto]);
    expect(await scollegaTariffaDaProdotto(db, "p2", TARIFFA)).toBe("tariffa");
    expect(prodotto).toMatchObject({ posa_tariffa_default_id: null, manodopera_modalita: "nessuna" });
  });

  it("prodotto senza posa con il collegamento rimasto: si pulisce il collegamento", async () => {
    const prodotto = { id: "p3", posa_tariffa_default_id: TARIFFA, manodopera_modalita: "nessuna" };
    const { db } = databaseFinto([prodotto]);
    expect(await scollegaTariffaDaProdotto(db, "p3", TARIFFA)).toBe("nessuna");
    expect(prodotto).toMatchObject({ posa_tariffa_default_id: null, manodopera_modalita: "nessuna" });
  });

  it("decide la riga nel database, non l'elenco: passato a «manuale» nel frattempo, la posa resta", async () => {
    // L'elenco a schermo diceva «tariffa»; intanto qualcuno ha scelto il prezzo manuale.
    const prodotto = { id: "p4", posa_tariffa_default_id: TARIFFA, manodopera_modalita: "manuale" };
    const { db, aggiornamenti } = databaseFinto([prodotto]);
    await scollegaTariffaDaProdotto(db, "p4", TARIFFA);
    expect(prodotto.manodopera_modalita).toBe("manuale");
    // L'unica scrittura che ha toccato la riga è quella del solo collegamento.
    expect(aggiornamenti).toEqual([{ posa_tariffa_default_id: null }]);
  });

  it("collegato nel frattempo a un'altra tariffa: non si tocca", async () => {
    const prodotto = { id: "p5", posa_tariffa_default_id: "altra", manodopera_modalita: "tariffa" };
    const { db } = databaseFinto([prodotto]);
    expect(await scollegaTariffaDaProdotto(db, "p5", TARIFFA)).toBeNull();
    expect(prodotto).toMatchObject({ posa_tariffa_default_id: "altra", manodopera_modalita: "tariffa" });
  });

  it("il messaggio dice cosa è successo davvero", () => {
    expect(esitoScollegamento("tariffa")).toMatchObject({ fatto: true, testo: expect.stringMatching(/manodopera automatica/) });
    expect(esitoScollegamento("manuale")).toMatchObject({ fatto: true, testo: expect.stringMatching(/prezzo manuale/) });
    expect(esitoScollegamento("nessuna").fatto).toBe(true);
    expect(esitoScollegamento(null)).toMatchObject({ fatto: false, testo: expect.stringMatching(/già scollegato/) });
  });
});

describe("Elenco dei prodotti collegati", () => {
  it("non mostra i prodotti nel cestino", async () => {
    const { db } = databaseFinto([
      { id: "a", nome: "Finestra", posa_tariffa_default_id: TARIFFA, deleted_at: null },
      { id: "b", nome: "Porta cestinata", posa_tariffa_default_id: TARIFFA, deleted_at: "2026-09-30T10:00:00Z" },
      { id: "c", nome: "Persiana", posa_tariffa_default_id: "altra", deleted_at: null },
    ]);
    const prodotti = await caricaProdottiCollegati(db, TARIFFA);
    expect(prodotti.map((p) => p.id)).toEqual(["a"]);
  });
});
