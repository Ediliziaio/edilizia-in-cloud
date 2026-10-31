/**
 * La bozza della commessa di Silvio (fase 1, lotto 1.4; fase 2, lotto 2.2): crea, salva con
 * attesa, riprendi, crea o completa la commessa con le fonti allegate, annulla. Il database
 * e lo storage sono finti (src/test/helpers/dbFinto.ts); le RPC vere sono provate in
 * transazioni annullate (vedi la nota della sessione nel piano). Dati inventati.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { DbFinto } from "@/test/helpers/dbFinto";
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import { fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import {
  allegaFonti, annullaSilvio, bozzeDaRiprendere, completaCommessa, creaBozza, creaCommessa, ErroreBozza,
  leggiBozza, messaggioErrore, salvaBozza, salvataggioConAttesa, type Bozza, type ClientBozze,
} from "@/lib/silvio-commessa/bozze";

const AZ = "az-1";
const piano = (totale = 12000) => fondi(pianoVuoto(AZ), {
  fonte: { tipo: "preventivo", id: "q-1", etichetta: "PR-0001" },
  aree: { economia: { "economia.total_amount": { valore: totale, fiducia: 1, stato: "fatto" } } },
} satisfies Frammento);

let db: DbFinto;
const client = () => db.client as unknown as ClientBozze;

beforeEach(() => {
  db = new DbFinto();
  // La tabella finta fa da database: id, stato e scadenza li darebbe Postgres.
  let n = 0;
  db.rifiuta = (tabella, riga) => {
    if (tabella === "commessa_bozze" && !riga.id) {
      Object.assign(riga, { id: `b-${++n}`, stato: "bozza", scade_il: "2026-12-01T00:00:00Z", updated_at: `2026-10-31T10:0${n}:00Z` });
    }
    return null;
  };
});
afterEach(() => { vi.useRealTimers(); });

describe("creaBozza e salvaBozza", () => {
  it("la bozza nasce col piano e con la sua scrittura; senza commessa è una creazione", async () => {
    const b = await creaBozza({ companyId: AZ, piano: piano() }, client());
    expect(b).toMatchObject({ id: "b-1", company_id: AZ, modo: "crea", order_id: null });
    expect(b.scrittura?.ordine.total_amount).toBe(12000);
  });

  it("con una commessa è un completamento", async () => {
    const b = await creaBozza({ companyId: AZ, orderId: "ord-1", piano: pianoVuoto(AZ, "ord-1") }, client());
    expect(b).toMatchObject({ modo: "completa", order_id: "ord-1" });
  });

  it("salvare riscrive piano e scrittura insieme; una bozza già usata non si tocca", async () => {
    const b = await creaBozza({ companyId: AZ, piano: piano() }, client());
    await salvaBozza(b.id, { piano: piano(15000), fonti: [{ path: "az-1/u/commessa-1-c.pdf", nome: "c.pdf" }] }, client());
    const riga = db.righe("commessa_bozze")[0] as unknown as Bozza;
    expect(riga.scrittura?.ordine.total_amount).toBe(15000);
    expect(riga.fonti).toHaveLength(1);

    db.righe("commessa_bozze")[0].stato = "creata";
    await expect(salvaBozza(b.id, { piano: piano(1) }, client())).rejects.toThrow("non si può più modificare");
  });

  it("un errore del database diventa un messaggio in italiano", async () => {
    db.erroriProssimi["commessa_bozze:insert"] = { message: "new row violates row-level security policy for table \"commessa_bozze\"", code: "42501" };
    const err = await creaBozza({ companyId: AZ, piano: piano() }, client()).catch((e) => e);
    expect(err).toBeInstanceOf(ErroreBozza);
    expect(err.message).toBe("Non hai il permesso di modificare le commesse di questa azienda.");
  });
});

describe("salvataggioConAttesa", () => {
  it("salva solo l'ultima versione, dopo l'attesa", async () => {
    vi.useFakeTimers();
    const salvati: number[] = [];
    const s = salvataggioConAttesa<number>(async (x) => { salvati.push(x); }, { attesaMs: 500 });
    s.programma(1); s.programma(2);
    await vi.advanceTimersByTimeAsync(300);
    s.programma(3);
    await vi.advanceTimersByTimeAsync(499);
    expect(salvati).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(salvati).toEqual([3]);
    expect(s.inAttesa()).toBe(false);
  });

  it("«subito» non aspetta; mai due salvataggi insieme", async () => {
    let inCorso = 0; let massimo = 0;
    const salvati: string[] = [];
    const s = salvataggioConAttesa<string>(async (x) => {
      inCorso += 1; massimo = Math.max(massimo, inCorso);
      await new Promise((r) => setTimeout(r, 5));
      salvati.push(x); inCorso -= 1;
    }, { attesaMs: 10_000 });
    s.programma("a");
    const primo = s.subito();
    s.programma("b");
    await Promise.all([primo, s.subito()]);
    expect(salvati).toEqual(["a", "b"]);
    expect(massimo).toBe(1);
  });

  it("se il salvataggio fallisce lo dice, e la versione resta da salvare", async () => {
    const errori: string[] = [];
    let volte = 0;
    const s = salvataggioConAttesa<string>(async () => {
      volte += 1;
      if (volte === 1) throw new TypeError("Failed to fetch");
    }, { quandoSbaglia: (e) => errori.push(e.message) });
    s.programma("x");
    await s.subito();
    expect(errori).toEqual(["Connessione assente: la bozza è salva, riprova appena torna la rete."]);
    expect(s.inAttesa()).toBe(true);
    await s.subito();
    expect(volte).toBe(2);
    expect(s.inAttesa()).toBe(false);
  });
});

describe("bozzeDaRiprendere e leggiBozza", () => {
  it("solo le bozze aperte e non scadute, dalla più recente", async () => {
    db = new DbFinto({ commessa_bozze: [
      { id: "vecchia", company_id: AZ, stato: "bozza", scade_il: "2026-12-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" },
      { id: "nuova", company_id: AZ, stato: "bozza", scade_il: "2026-12-01T00:00:00Z", updated_at: "2026-10-30T00:00:00Z" },
      { id: "scaduta", company_id: AZ, stato: "bozza", scade_il: "2026-10-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" },
      { id: "usata", company_id: AZ, stato: "creata", scade_il: "2026-12-01T00:00:00Z", updated_at: "2026-10-31T00:00:00Z" },
      { id: "altra", company_id: "az-2", stato: "bozza", scade_il: "2026-12-01T00:00:00Z", updated_at: "2026-10-31T00:00:00Z" },
    ] });
    const bozze = await bozzeDaRiprendere(AZ, client(), new Date("2026-10-31T12:00:00Z"));
    expect(bozze.map((b) => b.id)).toEqual(["nuova", "vecchia"]);
    expect((await leggiBozza("nuova", client())).id).toBe("nuova");
    await expect(leggiBozza("non-c-e", client())).rejects.toThrow(ErroreBozza);
  });
});

describe("creaCommessa, completaCommessa, allegaFonti", () => {
  const fonti = [
    { path: "az-1/u/commessa-1-contratto.pdf", nome: "contratto.pdf", mime: "application/pdf" },
    { path: "az-1/u/commessa-2-sparito.jpg", nome: "sparito.jpg" },
  ];
  const esito = { order_id: "ord-9", colonne: 3, fasi: 2, voci: 1, rate: 0, contratto: true, righe_registrate: 12 };

  beforeEach(() => {
    db.file.set("silvio-uploads/az-1/u/commessa-1-contratto.pdf", { bytes: new Uint8Array([1, 2, 3]), contentType: "application/pdf" });
    db.rispostaRpc.commessa_crea_con_silvio = esito;
    db.rispostaRpc.commessa_completa_con_silvio = { ...esito, order_id: "ord-1" };
    db.rispostaRpc.commessa_bozza_allega = 1;
  });

  it("la RPC crea; i file passano a order-attachments e si registrano; quello che manca lo dice", async () => {
    const r = await creaCommessa({ id: "b-1", fonti }, client());
    expect(db.chiamateRpc[0]).toEqual({ nome: "commessa_crea_con_silvio", args: { p_bozza_id: "b-1" } });
    expect(r).toMatchObject({ order_id: "ord-9", allegati: 1, allegatiNonRiusciti: [{ nome: "sparito.jpg", motivo: "file non trovato tra quelli caricati" }] });

    const allega = db.chiamateRpc[1];
    expect(allega.nome).toBe("commessa_bozza_allega");
    const [allegato] = allega.args.p_allegati as { path: string; nome: string; dimensione: number }[];
    expect(allegato.path).toMatch(/^orders\/ord-9\/\d+-\d+-contratto\.pdf$/);
    expect(allegato).toMatchObject({ nome: "contratto.pdf", mime: "application/pdf", dimensione: 3 });
    expect(db.file.has(`order-attachments/${allegato.path}`)).toBe(true);
  });

  it("completare chiama la RPC del completamento sulla stessa bozza", async () => {
    const r = await completaCommessa({ id: "b-2", fonti: [] }, client());
    expect(db.chiamateRpc.map((c) => c.nome)).toEqual(["commessa_completa_con_silvio"]);
    expect(r).toMatchObject({ order_id: "ord-1", allegati: 0, allegatiNonRiusciti: [] });
  });

  it("se la registrazione degli allegati fallisce, i file copiati non restano orfani", async () => {
    const c = client();
    const rpc = c.rpc.bind(c);
    c.rpc = async (nome, args) => nome === "commessa_bozza_allega"
      ? { data: null, error: { message: "Percorso dell'allegato non valido.", code: "22023" } }
      : rpc(nome, args);
    const r = await allegaFonti({ id: "b-1", fonti: [fonti[0]] }, "ord-9", c);
    expect(r).toEqual({ allegati: 0, nonRiusciti: [{ nome: "contratto.pdf", motivo: "Percorso dell'allegato non valido." }] });
    expect([...db.file.keys()].filter((k) => k.startsWith("order-attachments/"))).toEqual([]);
  });

  it("un rifiuto della RPC arriva col messaggio del database (conflitti, cliente, permessi)", async () => {
    const c = client();
    c.rpc = async () => ({ data: null, error: { message: "C'è un valore in conflitto: scegli quale tenere prima di continuare.", code: "22023" } });
    await expect(creaCommessa({ id: "b-1", fonti }, c)).rejects.toThrow("C'è un valore in conflitto");
    // Niente commessa, niente file copiati.
    expect([...db.file.keys()].filter((k) => k.startsWith("order-attachments/"))).toEqual([]);
  });
});

describe("annullaSilvio", () => {
  it("il database toglie righe e colonne; qui si tolgono i file copiati", async () => {
    db.file.set("order-attachments/orders/ord-9/1-2-contratto.pdf", { bytes: new Uint8Array([1]), contentType: null });
    db.rispostaRpc.commessa_annulla_silvio = { righe_tolte: 13, commessa_tolta: true, file_da_togliere: ["orders/ord-9/1-2-contratto.pdf"] };
    const r = await annullaSilvio("b-1", client());
    expect(db.chiamateRpc).toEqual([{ nome: "commessa_annulla_silvio", args: { p_bozza_id: "b-1" } }]);
    expect(r.commessa_tolta).toBe(true);
    expect(db.file.size).toBe(0);
  });

  it("se qualcuno ci ha lavorato sopra, il rifiuto dice dove", async () => {
    const c = client();
    c.rpc = async () => ({ data: null, error: { message: "Non si può annullare: qualcuno ci ha già lavorato sopra (company_costs).", code: "55000" } });
    await expect(annullaSilvio("b-1", c)).rejects.toThrow("qualcuno ci ha già lavorato sopra (company_costs)");
  });
});

describe("messaggioErrore", () => {
  it("traduce gli errori tecnici e lascia quelli già scritti per le persone", () => {
    expect(messaggioErrore({ code: "PGRST202", message: "Could not find the function public.commessa_crea_con_silvio" }))
      .toBe("Questa funzione di Silvio non è ancora attiva su questo gestionale.");
    expect(messaggioErrore({ code: "42501", message: "permission denied for function commessa_crea_con_silvio" }))
      .toBe("Non hai il permesso di modificare le commesse di questa azienda.");
    expect(messaggioErrore({ code: "42501", message: "Bozza non trovata, o non hai il permesso di modificare le commesse di questa azienda." }))
      .toBe("Bozza non trovata, o non hai il permesso di modificare le commesse di questa azienda.");
    expect(messaggioErrore({ code: "55P03", message: "canceling statement due to lock timeout" }))
      .toBe("Qualcun altro sta modificando questa commessa proprio ora: riprova tra qualche secondo.");
    expect(messaggioErrore({ code: "23505", message: "duplicate key value violates unique constraint \"orders_company_code\"" }))
      .toBe("Esiste già una commessa con questo numero: cambialo e riprova.");
    expect(messaggioErrore({ code: "23502", message: "null value in column \"x\"" }))
      .toBe("Non è andata: riprova. Se succede ancora, scrivi all'assistenza.");
    expect(messaggioErrore(new TypeError("Failed to fetch")))
      .toBe("Connessione assente: la bozza è salva, riprova appena torna la rete.");
  });
});
