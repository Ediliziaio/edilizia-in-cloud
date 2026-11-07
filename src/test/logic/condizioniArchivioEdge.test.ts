/**
 * L'archivio letto dalle edge function (07/11/2026).
 *
 * Il contratto d'appalto lo scrive l'AI. Finché nessuno gli passava le condizioni dell'azienda,
 * inventava garanzia, penali e foro a ogni giro. Qui si prova il pezzo che gliele passa: il modello
 * predefinito dell'ambito, il suo testo e le clausole da approvare a parte. E, soprattutto, che
 * un'azienda senza archivio continui a funzionare come prima.
 */
import { describe, expect, it } from "vitest";
import {
  clausoleBuone, condizioniInCodaAlContratto, modelloPredefinitoDellAzienda, origineDelModello, testoDelModello, titoliVessatorie,
  type ModelloArchivio,
} from "../../../supabase/functions/_shared/condizioniArchivio";

const modello = (p: Partial<ModelloArchivio> = {}): ModelloArchivio => ({
  id: "m1", nome: "Appalto privato 2026", ambito: "appalto", predefinito: true, attivo: true, versione: 4,
  clausole: [
    { titolo: "Modalità di pagamento", testo: "30% alla firma, 40% all'inizio dei lavori, saldo alla consegna." },
    { titolo: "Foro competente", testo: "Il foro del luogo in cui ha sede l'impresa.", vessatoria: true },
  ],
  ...p,
});

/** Il minimo di `supabase` che serve: la catena di filtri e una risposta. */
const dbFinto = (risposta: { data?: unknown; error?: unknown }) => {
  const calls: Record<string, unknown> = {};
  const catena: Record<string, unknown> = {
    select: () => catena, maybeSingle: () => Promise.resolve(risposta),
    eq: (col: string, val: unknown) => { calls[col] = val; return catena; },
  };
  return { db: { from: (t: string) => { calls.tabella = t; return catena; } }, calls };
};

describe("Il testo che finisce nel contratto", () => {
  it("mette titolo e testo di ogni clausola, nell'ordine", () => {
    const testo = testoDelModello(modello());
    expect(testo).toBe("Modalità di pagamento\n30% alla firma, 40% all'inizio dei lavori, saldo alla consegna.\n\nForo competente\nIl foro del luogo in cui ha sede l'impresa.");
  });

  it("il titolo non esce due volte se il testo si apre già con quello", () => {
    const testo = testoDelModello(modello({ clausole: [{ titolo: "Termini legali", testo: "# Termini legali\nRecesso entro 14 giorni." }] }));
    expect(testo.match(/Termini legali/g)).toHaveLength(1);
  });

  it("le clausole vuote non sporcano niente", () => {
    expect(testoDelModello(modello({ clausole: [{ titolo: " ", testo: "<p>&nbsp;</p>" }] }))).toBe("");
    expect(clausoleBuone(modello({ clausole: [] }))).toEqual([]);
    expect(testoDelModello(null)).toBe("");
  });

  it("dice quali clausole il committente deve approvare a parte", () => {
    expect(titoliVessatorie(modello())).toEqual(["Foro competente"]);
    expect(titoliVessatorie(modello({ clausole: [{ titolo: "Pagamenti", testo: "Testo." }] }))).toEqual([]);
  });

  it("l'origine dice modello, nome e versione del momento in cui il contratto è nato", () => {
    expect(origineDelModello(modello(), "2026-11-07T09:00:00.000Z")).toEqual({
      modello_id: "m1", modello_nome: "Appalto privato 2026", versione: 4, congelate_il: "2026-11-07T09:00:00.000Z",
    });
  });
});

describe("Leggere il modello dell'azienda", () => {
  it("chiede il predefinito attivo di quell'ambito, per quella azienda sola", async () => {
    const { db, calls } = dbFinto({ data: modello() });
    const trovato = await modelloPredefinitoDellAzienda(db, "az-1", "appalto");
    expect(trovato?.nome).toBe("Appalto privato 2026");
    expect(calls).toMatchObject({ tabella: "condizioni_modelli", company_id: "az-1", ambito: "appalto", predefinito: true, attivo: true });
  });

  it("azienda senza archivio: niente modello, e il contratto esce come prima", async () => {
    const { db } = dbFinto({ data: null });
    expect(await modelloPredefinitoDellAzienda(db, "az-1", "appalto")).toBeNull();
  });

  it("un modello col solo nome e nessun testo non vale: meglio niente che un titolo a vuoto", async () => {
    const { db } = dbFinto({ data: modello({ clausole: [{ titolo: " ", testo: " " }] }) });
    expect(await modelloPredefinitoDellAzienda(db, "az-1", "appalto")).toBeNull();
  });

  it("se le tabelle non ci sono ancora, non fa saltare la generazione", async () => {
    const { db } = dbFinto({ error: { message: 'relation "condizioni_modelli" does not exist' } });
    expect(await modelloPredefinitoDellAzienda(db, "az-1", "appalto")).toBeNull();
    const esplode = { from: () => { throw new Error("rete"); } };
    expect(await modelloPredefinitoDellAzienda(esplode, "az-1", "appalto")).toBeNull();
  });
});

describe("Le condizioni in coda al contratto d'appalto, parola per parola", () => {
  // Chiedere all'AI di ricopiarle allungava il contratto oltre i limiti: risposta tagliata, poi timeout
  // (07/11/2026, prova su Demo Azienda 2). Le attacca il sistema.
  it("titolo e testo di ogni clausola, esatti, e in fondo le clausole da approvare con la seconda firma", () => {
    const coda = condizioniInCodaAlContratto(modello());
    expect(coda.startsWith("## Condizioni generali dell'impresa")).toBe(true);
    expect(coda).toContain("### Modalità di pagamento\n30% alla firma, 40% all'inizio dei lavori, saldo alla consegna.");
    expect(coda).toContain("## Clausole da approvare specificamente (art. 1341 c.c.)");
    expect(coda).toMatch(/- Foro competente$/);
  });

  it("l'HTML dell'editor diventa testo, e i titoli di un contratto importato scendono di livello", () => {
    const coda = condizioniInCodaAlContratto(modello({ clausole: [
      { titolo: "Garanzie", testo: "<p>Due <strong>anni</strong> sulle opere.</p>" },
      { titolo: "Condizioni", testo: "# Condizioni\n## Art. 1\nOggetto." },
    ] }));
    expect(coda).toContain("### Garanzie\nDue anni sulle opere.");
    expect(coda).toContain("#### Condizioni\n#### Art. 1\nOggetto.");
    expect(coda).not.toContain("<");
  });

  it("senza clausole non si aggiunge niente", () => {
    expect(condizioniInCodaAlContratto(modello({ clausole: [] }))).toBe("");
  });
});
