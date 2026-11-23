import { describe, expect, it, vi } from "vitest";
import { anteprimaContatti, importaContatti } from "@/lib/marketing/importaContatti";
import { anteprimaOpportunita, importaOpportunita } from "@/lib/marketing/importaOpportunita";
import { dentroFascia, fineStimata, prossimoMomentoUtile, type Programmazione } from "@/lib/importazione/programmata";
import { csvRigheDaRivedere } from "@/components/shared/import-wizard/scaricaRighe";

/** Un database finto: tiene le tabelle in memoria e registra le chiamate. */
function dbFinto(esistenti: { id: string; email?: string | null; phone?: string | null; tags?: string[] }[] = [], opzioni: { falliscoInsertDopo?: number } = {}) {
  const inseriti: Record<string, unknown[][]> = {};
  const aggiornati: Record<string, unknown>[] = [];
  let id = 0;
  let insertContatti = 0;
  const rpc = vi.fn(async (_nome: string, arg: { p_entity_ids: string[] }) => ({ data: { enrolled: arg.p_entity_ids.length }, error: null as null }));
  const from = (tabella: string) => {
    let filtroIn: { col: string; valori: string[] } | null = null;
    const catena = {
      select: () => catena,
      eq: () => catena,
      is: () => catena,
      in: async (col: string, valori: string[]) => {
        filtroIn = { col, valori };
        const f = filtroIn;
        return { data: esistenti.filter((e) => f.valori.includes(String((e as Record<string, unknown>)[f.col] ?? ""))), error: null as null };
      },
      insert: (righe: unknown) => {
        const lista = Array.isArray(righe) ? righe : [righe];
        (inseriti[tabella] ??= []).push(lista);
        const fallisce = tabella === "marketing_contacts" && opzioni.falliscoInsertDopo !== undefined && ++insertContatti > opzioni.falliscoInsertDopo;
        const dati = lista.map(() => ({ id: `${tabella}-${++id}` }));
        const risposta = fallisce ? { data: null as null, error: { message: "timeout" } } : { data: dati, error: null };
        return {
          select: () => ({ ...Promise.resolve(risposta), then: (r: (v: unknown) => unknown) => Promise.resolve(risposta).then(r), single: async () => ({ data: fallisce ? null : dati[0], error: risposta.error }) }),
          then: (r: (v: unknown) => unknown) => Promise.resolve({ error: risposta.error }).then(r),
        };
      },
      update: (riga: Record<string, unknown>) => {
        aggiornati.push(riga);
        return { eq: () => ({ eq: async () => ({ error: null as null }), then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) }) };
      },
      upsert: async () => ({ error: null as null }),
      delete: () => ({ eq: async () => ({ error: null as null }) }),
    };
    return catena;
  };
  return { db: { from, rpc }, inseriti, aggiornati, rpc };
}

const ctx = (db: ReturnType<typeof dbFinto>["db"]) => ({ db, companyId: "azienda-a", customKeys: [] as string[] });

describe("importazione contatti", () => {
  it("crea e aggiorna dallo stesso file, senza cancellare i campi che il file non ha", async () => {
    const f = dbFinto([{ id: "esistente", email: "gia@example.test", tags: ["vecchia"] }]);
    const esito = await importaContatti(ctx(f.db), [
      { first_name: "", email: "gia@example.test", __riga: "2" },
      { first_name: "Nuovo", email: "nuovo@example.test", __riga: "3" },
    ], { mode: "upsert" });
    expect(esito).toMatchObject({ success: 2, creati: 1, aggiornati: 1, errors: [] });
    expect(f.aggiornati[0]).not.toHaveProperty("first_name");
    expect(f.aggiornati[0]).not.toHaveProperty("city");
    expect(f.aggiornati[0]).not.toHaveProperty("tags");
  });

  it("etichette scelte e automazioni: le etichette si sommano, i contatti entrano nel flusso", async () => {
    const f = dbFinto([{ id: "esistente", email: "gia@example.test", tags: ["vecchia"] }]);
    const esito = await importaContatti(ctx(f.db), [
      { first_name: "Già", email: "gia@example.test" },
      { first_name: "Nuovo", email: "nuovo@example.test", tags: "fiera" },
    ], { mode: "upsert", etichette: ["Lista novembre"], automazioni: [{ id: "flusso-1", nome: "Benvenuto" }] });
    expect((f.inseriti.marketing_contacts[0][0] as { tags: string[] }).tags).toEqual(expect.arrayContaining(["fiera", "lista novembre"]));
    expect(f.aggiornati[0].tags).toEqual(expect.arrayContaining(["vecchia", "lista novembre"]));
    expect(f.rpc).toHaveBeenCalledWith("enroll_entities_in_flow", expect.objectContaining({ p_flow_id: "flusso-1", p_entity_type: "contact" }));
    expect(esito.fatto).toEqual(["Etichetta «lista novembre» su 2 contatti", "2 contatti entrati nell'automazione «Benvenuto»"]);
  });

  it("una riga doppia nel file è un avviso col numero di riga del file, ed è tra le righe da scaricare", async () => {
    const f = dbFinto();
    const esito = await importaContatti(ctx(f.db), [
      { first_name: "Anna", email: "anna@example.test", phone: "348 5273876", __riga: "9" },
      { first_name: "Anna", email: "anna@example.test", phone: "3485273876", __riga: "17" },
    ], { mode: "create" });
    expect(esito.errors).toEqual([]);
    expect(esito.avvisi).toEqual(["Riga 17: è lo stesso contatto della riga 9 (stessa email e stesso telefono), importato una volta sola"]);
    expect(esito.righeDaRivedere).toEqual([expect.objectContaining({ riga: 17 })]);
  });

  it("file grande: entra a blocchi da 500 e un blocco andato male non ferma gli altri", async () => {
    const f = dbFinto([], { falliscoInsertDopo: 1 });
    const righe = Array.from({ length: 1200 }, (_, i) => ({ first_name: `C${i}`, email: `c${i}@example.test`, __riga: String(i + 2) }));
    const esito = await importaContatti(ctx(f.db), righe, { mode: "create" });
    expect(f.inseriti.marketing_contacts.map((l) => l.length)).toEqual([500, 500, 200]);
    expect(esito.creati).toBe(500);
    expect(esito.errors).toHaveLength(700);
    expect(esito.righeDaRivedere?.[0].riga).toBe(502);
  });

  it("a scaglioni: niente contatti scritti adesso, le righe vanno in coda con le forme del telefono", async () => {
    const f = dbFinto();
    const programmazione: Programmazione = { perGiro: 10, ogniMinuti: 10, inizio: new Date(2026, 10, 23, 9, 0), giorni: [1, 2, 3, 4, 5] };
    const esito = await importaContatti(ctx(f.db), [{ first_name: "Anna", phone: "348 5273876" }], { mode: "create", programmazione, etichette: ["fiera"] });
    expect(f.inseriti.marketing_contacts).toBeUndefined();
    const job = f.inseriti.importazioni_programmate[0][0] as Record<string, unknown>;
    expect(job).toMatchObject({ oggetto: "contatti", per_giro: 10, ogni_minuti: 10, totale: 1, stato: "in_pausa" });
    const riga = (f.inseriti.importazioni_programmate_righe[0][0] as { dati: { contatto: { phone: string; tags: string[] }; forme: string[] } }).dati;
    expect(riga.contatto.phone).toBe("+393485273876");
    expect(riga.contatto.tags).toEqual(["fiera"]);
    expect(riga.forme).toContain("3485273876");
    expect(esito.programmata).toMatchObject({ totale: 1 });
  });

  it("anteprima: dice cosa succederà senza scrivere niente", async () => {
    const f = dbFinto([{ id: "e1", email: "gia@example.test" }]);
    const a = await anteprimaContatti(ctx(f.db), [
      { first_name: "A", email: "gia@example.test" },
      { first_name: "B", email: "nuovo@example.test" },
      { first_name: "B", email: "nuovo@example.test" },
      { first_name: "C", email: "sbagliata" },
      { first_name: "D" },
    ], { mode: "update" });
    expect(a).toEqual({ righe: 5, nuovi: 0, aggiornati: 1, saltati: 2, doppi: 1, nonValide: 1, senzaContatto: 1 });
    expect(f.inseriti).toEqual({});
  });
});

describe("importazione opportunità", () => {
  const ctxOpp = (db: ReturnType<typeof dbFinto>["db"]) => ({
    db, companyId: "azienda-a", pipelineId: "pipe", faseId: "fase", customKeys: [] as string[], nomeCampoContatto: () => "campo",
  });

  it("collega l'opportunità al contatto già presente e non lo crea due volte per due righe nuove uguali", async () => {
    const f = dbFinto([{ id: "c-esistente", email: "gia@example.test" }]);
    const esito = await importaOpportunita(ctxOpp(f.db), [
      { name: "Uno", contact_email: "gia@example.test" },
      { name: "Due", contact_email: "nuovo@example.test", contact_first_name: "Nuovo" },
      { name: "Tre", contact_email: "nuovo@example.test" },
    ], { mode: "create", etichette: ["fiera"] });
    expect(esito.success).toBe(3);
    expect(f.inseriti.marketing_contacts).toHaveLength(1);
    expect((f.inseriti.marketing_opportunities[0][0] as { contact_id: string; tags: string[] })).toMatchObject({ contact_id: "c-esistente", tags: ["fiera"] });
  });

  it("valore non valido: la riga non entra ed è tra quelle da scaricare", async () => {
    const f = dbFinto();
    const esito = await importaOpportunita(ctxOpp(f.db), [{ name: "X", value: "tanti", __riga: "4" }], { mode: "create" });
    expect(esito.success).toBe(0);
    expect(esito.righeDaRivedere).toEqual([{ riga: 4, motivo: "valore economico non valido" }]);
  });

  it("a scaglioni: va in coda con pipeline e fase", async () => {
    const f = dbFinto();
    const programmazione: Programmazione = { perGiro: 5, ogniMinuti: 15, inizio: new Date(), giorni: [1, 2, 3, 4, 5, 6, 7] };
    await importaOpportunita(ctxOpp(f.db), [{ name: "Uno", value: "1200", contact_phone: "333 1234567" }], { mode: "create", programmazione });
    expect(f.inseriti.importazioni_programmate[0][0]).toMatchObject({ oggetto: "opportunita", pipeline_id: "pipe", fase_id: "fase" });
    const dati = (f.inseriti.importazioni_programmate_righe[0][0] as { dati: { opportunita: { value: number }; forme: string[] } }).dati;
    expect(dati.opportunita.value).toBe(1200);
    expect(dati.forme).toContain("+393331234567");
  });

  it("anteprima: opportunità da creare e contatti già presenti", async () => {
    const f = dbFinto([{ id: "c1", email: "gia@example.test" }]);
    const a = await anteprimaOpportunita(ctxOpp(f.db), [{ name: "Uno", contact_email: "gia@example.test" }, { name: "Due" }]);
    expect(a).toMatchObject({ righe: 2, nuovi: 2, aggiornati: 1, senzaContatto: 1 });
  });
});

describe("scaglioni: fascia oraria, giorni e fine stimata", () => {
  const p: Programmazione = { perGiro: 10, ogniMinuti: 10, inizio: new Date(2026, 10, 23, 17, 40), fasciaDa: "09:00", fasciaA: "18:00", giorni: [1, 2, 3, 4, 5] };
  it("rispetta orari e giorni", () => {
    expect(dentroFascia(new Date(2026, 10, 23, 17, 50), p)).toBe(true); // lunedì
    expect(dentroFascia(new Date(2026, 10, 23, 18, 0), p)).toBe(false);
    expect(dentroFascia(new Date(2026, 10, 28, 10, 0), p)).toBe(false); // sabato
    expect(prossimoMomentoUtile(new Date(2026, 10, 27, 19, 0), p)).toEqual(new Date(2026, 10, 30, 9, 0)); // venerdì sera → lunedì
  });
  it("30 righe a 10 ogni 10 minuti dalle 17:40: due giri lunedì, l'ultimo martedì alle 9", () => {
    expect(fineStimata(30, p)).toEqual(new Date(2026, 10, 24, 9, 0));
  });
});

describe("righe da correggere", () => {
  it("il file scaricato ha le colonne originali e il motivo, pronto per Excel", () => {
    const csv = csvRigheDaRivedere(["nome", "email"], [["Anna", "anna@x.it"], ["Bea; B", "sbagliata"]], [{ riga: 3, motivo: "email «sbagliata» non valida" }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")).toEqual(["﻿nome;email;Motivo", '"Bea; B";sbagliata;email «sbagliata» non valida']);
  });
});

describe("righe vuote nel file", () => {
  it("il numero di riga resta quello del file anche dopo una riga vuota", () => {
    // Nel file: 1 intestazione, 2 Anna, 3 vuota, 4 Bea. Le righe lette sono due, coi numeri 2 e 4.
    const csv = csvRigheDaRivedere(["nome"], [["Anna"], ["Bea"]], [{ riga: 4, motivo: "da correggere" }], [2, 4]);
    expect(csv.split("\r\n")[1]).toBe("Bea;da correggere");
  });
});

describe("programmazione che non può partire", () => {
  it("nessun giorno o fascia rovesciata non si salvano", async () => {
    const { programmazioneValida } = await import("@/lib/importazione/programmata");
    const base: Programmazione = { perGiro: 10, ogniMinuti: 10, inizio: new Date(), giorni: [1], fasciaDa: "09:00", fasciaA: "18:00" };
    expect(programmazioneValida(base)).toBe(true);
    expect(programmazioneValida({ ...base, giorni: [] })).toBe(false);
    expect(programmazioneValida({ ...base, fasciaDa: "22:00", fasciaA: "06:00" })).toBe(false);
    expect(programmazioneValida({ ...base, fasciaDa: undefined, fasciaA: undefined })).toBe(true);
  });
});
