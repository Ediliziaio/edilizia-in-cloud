/**
 * La lettura di PSC e contratto come lavoro registrato, con un database finto: un secondo clic ritrova la stessa
 * lettura, una lettura ferma si riprende dal primo blocco mancante senza ripagare quelli fatti, il contratto si
 * legge solo se l'utente vede l'allegato e se è della stessa commessa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ chiamate: [] as string[], risposta: (_: string) => "{}" as string, fallisci: false }));
vi.mock("../../../supabase/functions/_shared/aiRouter.ts", () => ({
  aiRouterComplete: vi.fn(async (o: { idempotencyKey: string; messages: { content: string }[] }) => {
    ai.chiamate.push(o.idempotencyKey);
    if (ai.fallisci) throw new Error("provider giù");
    return { content: ai.risposta(o.messages[1].content) };
  }),
}));
const psc = vi.hoisted(() => ({ pagine: [] as { pagina: number; testo: string }[] }));
vi.mock("../../../supabase/functions/_shared/posOcrPsc.ts", () => ({
  estrattiOcrPsc: vi.fn(async () => ({ fonte: { pagine: psc.pagine, letturaIntegrale: true }, avviso: "Lettura PSC: 3/3 pagine esaminate, 0 illeggibili." })),
}));
vi.mock("../../../supabase/functions/_shared/posAiFonti.ts", () => ({ pscPerAiPos: vi.fn(async () => ({ fonte: null })) }));
vi.mock("../../../supabase/functions/_shared/pdfExtraction.ts", () => ({
  estraiPagineTestoPdf: vi.fn(async () => ({ pagine: [{ pagina: 2, testo: "Art. 6 — L'appaltatore accede al cantiere dall'ingresso principale di Via Verdi 12 negli orari 8.00–17.00." }], illeggibili: [], ispezionate: 1, totale: 1 })),
}));

import {
  contrattoPerLettore, eseguiLetturaDocumenti, prenotaLetturaDocumenti, risultatoUtilizzabile, salvaDecisioniLettura, ultimaLetturaDocumenti,
} from "../../../supabase/functions/_shared/posLettoreServer";

type Riga = Record<string, unknown>;
/** Un client Supabase finto, ridotto a quello che usa il lettore: una tabella, filtri eq/or/lt, upsert, update. */
function dbFinto(file: Record<string, Uint8Array> = {}) {
  const righe: Riga[] = [];
  // Un solo orologio per il finto e per il codice: quello di vitest, che avanza di un secondo a ogni scrittura.
  const adesso = () => { vi.setSystemTime(Date.now() + 1000); return new Date().toISOString(); };
  const db = {
    righe,
    avanza: (ms: number) => { vi.setSystemTime(Date.now() + ms); },
    storage: { from: (_bucket: string) => ({
      download: async (path: string) => file[path]
        ? { data: new Blob([file[path] as BlobPart]), error: null as unknown } : { data: null as Blob | null, error: { message: "assente" } as unknown },
    }) },
    from(tabella: string) {
      if (tabella !== "pos_letture_documenti") throw new Error(`tabella inattesa ${tabella}`);
      const filtri: ((r: Riga) => boolean)[] = [];
      let modifica: Riga | null = null;
      let ordine = false;
      const q = {
        select: () => q, limit: () => q,
        order: () => { ordine = true; return q; },
        eq: (k: string, v: unknown) => { filtri.push(r => r[k] === v); return q; },
        or: (espressione: string) => {
          const parti = espressione.split(",").map(p => p.split("."));
          filtri.push(r => parti.some(([k, op, ...v]) => op === "eq" ? r[k] === v.join(".") : String(r[k]) < v.join(".")));
          return q;
        },
        insert: (riga: Riga) => {
          const doppia = righe.some(r => r.pos_id === riga.pos_id && r.impronta === riga.impronta);
          const t = adesso();
          const nuova: Riga = { id: `l-${righe.length + 1}`, stato: "in_corso", parziali: [] as unknown[], risultato: null as unknown, decisioni: {},
            avvisi: [] as string[], errore: null as string | null, created_at: t, updated_at: t, completata_il: null as string | null, ...riga };
          if (!doppia) righe.push(nuova);
          const esito = { select: () => esito, maybeSingle: async (): Promise<{ data: Riga | null; error: unknown }> => doppia
            ? { data: null, error: { code: "23505", message: "duplicate key" } } : { data: structuredClone(nuova), error: null } };
          return esito;
        },
        update: (campi: Riga) => { modifica = campi; return q; },
        maybeSingle: async () => {
          let trovate = righe.filter(r => filtri.every(f => f(r)));
          if (ordine) trovate = [...trovate].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
          if (modifica) {
            const t = adesso();
            for (const r of trovate) Object.assign(r, structuredClone(modifica), { updated_at: t });
          }
          return { data: trovate[0] ? structuredClone(trovate[0]) : null, error: null as unknown };
        },
        then: (ok: (r: { error: null }) => unknown) => q.maybeSingle().then(() => ok({ error: null })),
      };
      return q;
    },
  };
  return db;
}

const RIF_PSC = {
  archivio: "sicurezza_documenti" as const, id: "psc-1", company_id: "az", order_id: "ord", titolo: "PSC", file_name: "psc.pdf",
  file_path: "az/psc.pdf", data_documento: "2026-11-10", revisione: "1", sha256: "a".repeat(64),
};
const pagina = (n: number) => ({ pagina: n, testo: `Accesso al cantiere dal passo carraio di Via Rossi ${n}, consegne e deposito materiali. ${"x".repeat(5_800)}` });
const rispostaPer = (richiesta: string) => {
  const { psc: pagine } = JSON.parse(richiesta) as { psc: { pagina: number }[] };
  return JSON.stringify({ indicazioni: pagine.map(p => ({ campo: "accessi", documento: "psc", pagina: p.pagina,
    citazione: `Accesso al cantiere dal passo carraio di Via Rossi ${p.pagina}` })), conflitti: [] });
};
const dati = (_db: ReturnType<typeof dbFinto>) => ({ companyId: "az", orderId: "ord", posId: "pos", userId: "u1", psc: RIF_PSC, contratto: null as { id: string; file_name: string; file_path: string; sha256: string } | null });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
  ai.chiamate = []; ai.risposta = rispostaPer; ai.fallisci = false;
  psc.pagine = Array.from({ length: 10 }, (_, i) => pagina(i + 1));
});

describe("lettura di PSC e contratto in background", () => {
  it("un secondo avvio ritrova la stessa lettura invece di crearne un’altra", async () => {
    const db = dbFinto();
    const prima = await prenotaLetturaDocumenti(db, dati(db));
    expect(prima.avvia).toBe(true);
    const seconda = await prenotaLetturaDocumenti(db, dati(db));
    expect(seconda).toMatchObject({ avvia: false, lettura: { id: prima.lettura.id } });
    expect(db.righe).toHaveLength(1);
  });

  it("legge a blocchi, salva ogni blocco e alla fine è pronta", async () => {
    const db = dbFinto();
    const { lettura } = await prenotaLetturaDocumenti(db, dati(db));
    await eseguiLetturaDocumenti(db, lettura, "u1");
    expect(ai.chiamate).toEqual([`pos_lettore:${lettura.id}:0`, `pos_lettore:${lettura.id}:1`, `pos_lettore:${lettura.id}:2`]);
    const finale = await ultimaLetturaDocumenti(db, "az", "pos");
    expect(finale?.stato).toBe("pronta");
    const uso = risultatoUtilizzabile(finale, RIF_PSC);
    expect(uso?.risultato.indicazioni).toHaveLength(10);
    expect(risultatoUtilizzabile(finale, { ...RIF_PSC, revisione: "2" })).toBeNull();
    expect((await prenotaLetturaDocumenti(db, dati(db))).avvia).toBe(false);
  });

  it("una lettura fermata a metà riparte dal primo blocco mancante, senza rileggere gli altri", async () => {
    const db = dbFinto();
    const { lettura } = await prenotaLetturaDocumenti(db, dati(db));
    let n = 0;
    ai.risposta = r => { if (++n === 2) throw new Error("worker ritirato"); return rispostaPer(r); };
    await eseguiLetturaDocumenti(db, lettura, "u1");
    expect((await ultimaLetturaDocumenti(db, "az", "pos"))?.stato).toBe("errore");
    expect((await ultimaLetturaDocumenti(db, "az", "pos"))?.errore).toMatch(/riparte dal punto in cui si è fermata/);

    ai.chiamate = []; ai.risposta = rispostaPer;
    const ripresa = await prenotaLetturaDocumenti(db, dati(db));
    expect(ripresa.avvia).toBe(true);
    await eseguiLetturaDocumenti(db, ripresa.lettura, "u1");
    expect(ai.chiamate).toEqual([`pos_lettore:${lettura.id}:1`, `pos_lettore:${lettura.id}:2`]);
    expect((await ultimaLetturaDocumenti(db, "az", "pos"))?.stato).toBe("pronta");
  });

  it("una lettura in corso da poco non si prende due volte; ferma da più di 5 minuti sì", async () => {
    const db = dbFinto();
    const { lettura } = await prenotaLetturaDocumenti(db, dati(db));
    expect((await prenotaLetturaDocumenti(db, dati(db))).avvia).toBe(false);
    db.avanza(4 * 60_000);
    expect((await prenotaLetturaDocumenti(db, dati(db))).avvia).toBe(false);
    db.avanza(2 * 60_000);
    const ripresa = await prenotaLetturaDocumenti(db, dati(db));
    expect(ripresa).toMatchObject({ avvia: true, lettura: { id: lettura.id } });
  });

  it("le decisioni valgono solo per i conflitti della lettura corrente", async () => {
    const db = dbFinto();
    const { lettura } = await prenotaLetturaDocumenti(db, dati(db));
    await expect(salvaDecisioniLettura(db, "az", "pos", lettura.id, { accessi: "psc" })).rejects.toThrow(/non è ancora pronta/);
    ai.risposta = () => JSON.stringify({ indicazioni: [], conflitti: [] });
    await eseguiLetturaDocumenti(db, lettura, "u1");
    expect(await salvaDecisioniLettura(db, "az", "pos", lettura.id, { accessi: "psc" })).toEqual({});
    await expect(salvaDecisioniLettura(db, "az", "pos", "altra", {})).rejects.toThrow(/è cambiata/);
  });
});

describe("contratto della lettura", () => {
  const utente = (riga: Riga | null, error: unknown = null as unknown) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: riga, error }) }) }) }),
  });
  const ID = "11111111-2222-3333-4444-555555555555";
  const riga = { id: ID, order_id: "ord", file_name: "Contratto.pdf", file_url: "ord/ai-contratti/c.pdf", file_type: "application/pdf", file_size: 2000 };

  it("si legge se l’utente vede l’allegato ed è della commessa del POS", async () => {
    const db = dbFinto({ "ord/ai-contratti/c.pdf": new Uint8Array([37, 80, 68, 70]) });
    const { fonte, bytes } = await contrattoPerLettore(db, utente(riga), "ord", ID);
    expect(fonte).toMatchObject({ id: ID, file_name: "Contratto.pdf", file_path: "ord/ai-contratti/c.pdf" });
    expect(fonte.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bytes).toHaveLength(4);
  });

  it("si rifiuta se l’allegato non si vede, è di un’altra commessa o non è un PDF", async () => {
    const db = dbFinto();
    await expect(contrattoPerLettore(db, utente(null), "ord", ID)).rejects.toMatchObject({ status: 404 });
    await expect(contrattoPerLettore(db, utente({ ...riga, order_id: "altra" }), "ord", ID)).rejects.toMatchObject({ status: 404 });
    await expect(contrattoPerLettore(db, utente({ ...riga, file_type: "image/jpeg", file_name: "foto.jpg" }), "ord", ID)).rejects.toMatchObject({ status: 422 });
    await expect(contrattoPerLettore(db, utente(riga, { message: "x" }), "ord", ID)).rejects.toMatchObject({ status: 503 });
    await expect(contrattoPerLettore(db, utente(riga), "ord", "non-un-id")).rejects.toMatchObject({ status: 400 });
  });
});
