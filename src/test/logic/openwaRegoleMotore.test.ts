import { describe, it, expect, vi } from "vitest";
import { applicaRegole, type MessaggioInArrivo } from "../../../supabase/functions/_shared/openwa-regole-motore";

/**
 * Il motore delle regole WhatsApp contro un client finto: ogni chiamata al
 * database finisce in `log`, con tabella, operazione, dati e filtri, e le
 * risposte arrivano da `stato`. Si guarda COSA il motore scrive, e in che
 * ordine, per un messaggio in arrivo.
 */

type Filtro = [string, ...unknown[]];
interface Voce { tabella: string; op: "select" | "insert" | "update"; dati?: Record<string, unknown>; filtri: Filtro[] }
interface Risposta { data?: unknown; count?: number; error: { code?: string; message: string } | null }

interface Stato {
  destinatari: Array<{ destinatario_id: string; campagna_id: string; contact_id: string | null }>;
  regole: Array<Record<string, unknown>>;
  inbound?: number;
  conversazione?: { assegnato_a: string | null } | null;
  etichette?: Record<string, string[]>;
  risposteGiaDate?: Set<string>;
}

function clienteFinto(stato: Stato) {
  const log: Voce[] = [];
  const risposteDate = stato.risposteGiaDate ?? new Set<string>();
  const rispondi = (v: Voce): Risposta => {
    if (v.tabella === "openwa_rules") return { data: stato.regole, error: null };
    if (v.tabella === "openwa_messages") return { count: stato.inbound ?? 1, error: null };
    if (v.tabella === "openwa_regole_scatti" && v.op === "insert" && v.dati?.risposta_inviata) {
      const chiave = `${v.dati.rule_id}|${v.dati.wa_chat_id}`;
      if (risposteDate.has(chiave)) return { error: { code: "23505", message: "duplicate key" } };
      risposteDate.add(chiave);
      return { error: null };
    }
    if (v.tabella === "marketing_contacts" && v.op === "select") {
      const id = v.filtri.find((f) => f[0] === "eq" && f[1] === "id")?.[2] as string;
      return { data: { tags: stato.etichette?.[id] ?? [] }, error: null };
    }
    if (v.tabella === "openwa_conversazioni" && v.op === "select") return { data: stato.conversazione ?? null, error: null };
    return { data: null, error: null };
  };
  const from = (tabella: string) => {
    const v: Voce = { tabella, op: "select", filtri: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      insert: (d: Record<string, unknown>) => { v.op = "insert"; v.dati = d; return b; },
      update: (d: Record<string, unknown>) => { v.op = "update"; v.dati = d; return b; },
      maybeSingle: () => b,
      then: (ok: (x: unknown) => unknown, ko: (e: unknown) => unknown) => {
        log.push(v);
        return Promise.resolve(rispondi(v)).then(ok, ko);
      },
    };
    for (const f of ["eq", "in", "is", "or", "order", "ilike", "limit"]) {
      b[f] = (...a: unknown[]) => { v.filtri.push([f, ...a]); return b; };
    }
    return b;
  };
  const admin = { from, rpc: async (): Promise<Risposta> => ({ data: stato.destinatari, error: null }) };
  return { admin, log };
}

function dipendenze(stato: Stato) {
  const { admin, log } = clienteFinto(stato);
  const inviaRisposta = vi.fn(async (p: { text: string }) => {
    log.push({ tabella: "INVIO", op: "insert", dati: p, filtri: [] });
    return { ok: true };
  });
  const avvisaEmail = vi.fn(async () => null);
  return {
    dip: { admin, platformCompanyId: "piattaforma", inviaRisposta, avvisaEmail, fuoriOrario: async () => false },
    log, inviaRisposta, avvisaEmail,
  };
}

const MSG = (text: string): MessaggioInArrivo => ({
  numberId: "num-1", chatId: "393331234567@c.us", phone: "+393331234567", text, contactId: "contatto-chat",
});

const regola = (r: Record<string, unknown>): Record<string, unknown> => ({
  id: "r", name: "Regola", enabled: true, priority: 10, campagna_id: "camp-A", number_id: null,
  match_type: "contains", match_keywords: [], only_first_contact: false, only_outside_hours: false,
  reply_text: null, add_tags: [], assign_to: null, notify_email: null, block: false,
  ferma_flusso: false, imposta_esito: null, optout: false,
  ...r,
});

const IN_CAMPAGNA_A = [{ destinatario_id: "dest-A", campagna_id: "camp-A", contact_id: "contatto-campagna" }];

const scrittureSu = (log: Voce[], tabella: string, op: Voce["op"] = "update") => log.filter((v) => v.tabella === tabella && v.op === op);

describe("motore regole WhatsApp: SE / ALTRIMENTI SE per campagna", () => {
  it("decide la prima regola che combacia: «ok, ma no grazie» non è anche «interessato»", async () => {
    const { dip, log } = dipendenze({
      destinatari: IN_CAMPAGNA_A,
      regole: [
        regola({ id: "no", priority: 10, match_keywords: ["no grazie"], imposta_esito: "non_interessato", add_tags: ["wa-no"] }),
        regola({ id: "si", priority: 20, match_keywords: ["ok"], imposta_esito: "da_ricontattare", add_tags: ["wa-si"] }),
      ],
    });
    await applicaRegole(dip, MSG("ok, ma no grazie"));
    const scatti = scrittureSu(log, "openwa_regole_scatti", "insert").map((v) => v.dati?.rule_id);
    expect(scatti).toEqual(["no"]);
    const esiti = scrittureSu(log, "openwa_campagna_destinatari").map((v) => v.dati?.esito).filter(Boolean);
    expect(esiti).toEqual(["non_interessato"]);
    const etichette = scrittureSu(log, "marketing_contacts").map((v) => v.dati?.tags);
    expect(etichette.flat()).not.toContain("wa-si");
  });

  it("le regole di campagna vengono prima delle generali, qualunque sia il numero di priorità", async () => {
    const { dip, inviaRisposta } = dipendenze({
      destinatari: IN_CAMPAGNA_A,
      regole: [
        regola({ id: "generale", campagna_id: null, priority: 1, match_type: "any", reply_text: "Risposta generale" }),
        regola({ id: "campagna", priority: 50, match_keywords: ["prezzo"], reply_text: "Risposta della campagna" }),
      ],
    });
    await applicaRegole(dip, MSG("che prezzo fate?"));
    expect(inviaRisposta).toHaveBeenCalledTimes(1);
    expect(inviaRisposta.mock.calls[0][0]).toMatchObject({ text: "Risposta della campagna", numberId: "num-1" });
  });

  it("una regola di un'altra campagna non tocca questo destinatario", async () => {
    const { dip, log } = dipendenze({
      destinatari: IN_CAMPAGNA_A,
      regole: [regola({ id: "b", campagna_id: "camp-B", match_type: "any", ferma_flusso: true, imposta_esito: "cliente" })],
    });
    await applicaRegole(dip, MSG("ciao"));
    // La query la escluderebbe già; e se arrivasse, non ha destinatari suoi.
    expect(scrittureSu(log, "openwa_campagna_destinatari")).toHaveLength(0);
  });
});

describe("motore regole WhatsApp: risposte automatiche", () => {
  it("una sola risposta per messaggio, anche se più regole generali la prevedono", async () => {
    const { dip, inviaRisposta, log } = dipendenze({
      destinatari: [],
      regole: [
        regola({ id: "g1", campagna_id: null, match_type: "any", reply_text: "Prima" }),
        regola({ id: "g2", campagna_id: null, priority: 20, match_type: "any", reply_text: "Seconda", add_tags: ["x"] }),
      ],
    });
    await applicaRegole(dip, MSG("buongiorno"));
    expect(inviaRisposta).toHaveBeenCalledTimes(1);
    expect(inviaRisposta.mock.calls[0][0]).toMatchObject({ text: "Prima" });
    // La seconda scatta comunque (etichetta), solo senza risposta.
    const g2 = scrittureSu(log, "openwa_regole_scatti", "insert").find((v) => v.dati?.rule_id === "g2");
    expect(g2?.dati?.risposta_inviata).toBe(false);
  });

  it("la stessa regola risponde una volta sola per chat", async () => {
    const risposteGiaDate = new Set<string>();
    const regole = [regola({ id: "prezzi", match_keywords: ["prezzo"], reply_text: "Ti chiamo io" })];
    const primo = dipendenze({ destinatari: IN_CAMPAGNA_A, regole, risposteGiaDate });
    await applicaRegole(primo.dip, MSG("prezzo?"));
    const secondo = dipendenze({ destinatari: IN_CAMPAGNA_A, regole, risposteGiaDate });
    await applicaRegole(secondo.dip, MSG("e il prezzo per 10 finestre?"));
    expect(primo.inviaRisposta).toHaveBeenCalledTimes(1);
    expect(secondo.inviaRisposta).not.toHaveBeenCalled();
    // Lo scatto resta registrato, marcato senza risposta.
    const ultimi = scrittureSu(secondo.log, "openwa_regole_scatti", "insert").map((v) => v.dati?.risposta_inviata);
    expect(ultimi).toEqual([true, false]);
  });

  it("senza numero di arrivo non risponde: partirebbe da un numero sconosciuto", async () => {
    const { dip, inviaRisposta } = dipendenze({ destinatari: [], regole: [regola({ campagna_id: null, match_type: "any", reply_text: "Ciao" })] });
    await applicaRegole(dip, { ...MSG("ciao"), numberId: null });
    expect(inviaRisposta).not.toHaveBeenCalled();
  });
});

describe("motore regole WhatsApp: azioni di campagna", () => {
  it("l'esito si scrive solo dove è ancora vuoto", async () => {
    const { dip, log } = dipendenze({
      destinatari: IN_CAMPAGNA_A,
      regole: [regola({ match_keywords: ["interessato"], imposta_esito: "da_ricontattare" })],
    });
    await applicaRegole(dip, MSG("sono interessato"));
    const [esito] = scrittureSu(log, "openwa_campagna_destinatari");
    expect(esito.dati).toMatchObject({ esito: "da_ricontattare" });
    expect(esito.filtri).toContainEqual(["is", "esito", null]);
    expect(esito.filtri).toContainEqual(["in", "id", ["dest-A"]]);
  });

  it("ferma il flusso solo a chi è ancora dentro", async () => {
    const { dip, log } = dipendenze({ destinatari: IN_CAMPAGNA_A, regole: [regola({ match_type: "any", ferma_flusso: true })] });
    await applicaRegole(dip, MSG("ok"));
    const [ferma] = scrittureSu(log, "openwa_campagna_destinatari");
    expect(ferma.dati).toMatchObject({ stato: "risposto", claimed_at: null });
    const filtroStati = ferma.filtri.find((f) => f[0] === "in" && f[1] === "stato");
    expect(filtroStati?.[2]).toEqual(["da_inviare", "inviato", "followup_inviato", "followup2_inviato", "followup3_inviato"]);
  });

  it("non scrivergli più: la risposta di cortesia parte PRIMA dell'opt-out, che vale per tutte le schede col numero", async () => {
    const { dip, log } = dipendenze({
      destinatari: IN_CAMPAGNA_A,
      regole: [regola({ name: "Non vuole", match_keywords: ["non scrivermi"], optout: true, reply_text: "Va bene, niente più messaggi." })],
    });
    await applicaRegole(dip, MSG("Per favore non scrivermi più"));
    const iInvio = log.findIndex((v) => v.tabella === "INVIO");
    const iOptOut = log.findIndex((v) => v.tabella === "marketing_contacts" && v.dati?.optout_whatsapp === true);
    expect(iInvio).toBeGreaterThanOrEqual(0);
    expect(iOptOut).toBeGreaterThan(iInvio);
    const optout = log[iOptOut];
    expect(optout.filtri).toContainEqual(["ilike", "phone", "%331234567%"]);
    expect(optout.dati?.optout_reason).toBe("Regola WhatsApp: Non vuole");
    // Esce anche dal flusso.
    expect(scrittureSu(log, "openwa_campagna_destinatari")[0].dati).toMatchObject({ stato: "risposto" });
  });

  it("le etichette vanno sulla scheda della chat E su quella messa in campagna", async () => {
    const { dip, log } = dipendenze({
      destinatari: IN_CAMPAGNA_A,
      regole: [regola({ match_keywords: ["prezzo"], add_tags: ["wa-chiede-prezzi"] })],
      etichette: { "contatto-chat": ["vecchia"], "contatto-campagna": [] },
    });
    await applicaRegole(dip, MSG("prezzo?"));
    const scritture = scrittureSu(log, "marketing_contacts").map((v) => ({ id: v.filtri.find((f) => f[1] === "id")?.[2], tags: v.dati?.tags }));
    expect(scritture).toEqual([
      { id: "contatto-chat", tags: ["vecchia", "wa-chiede-prezzi"] },
      { id: "contatto-campagna", tags: ["wa-chiede-prezzi"] },
    ]);
  });

  it("assegna la conversazione solo se non la segue già qualcuno", async () => {
    const libera = dipendenze({ destinatari: [], conversazione: null, regole: [regola({ campagna_id: null, match_type: "any", assign_to: "utente-1" })] });
    await applicaRegole(libera.dip, MSG("ciao"));
    expect(scrittureSu(libera.log, "openwa_conversazioni", "insert")[0]?.dati).toMatchObject({ assegnato_a: "utente-1" });

    const presa = dipendenze({ destinatari: [], conversazione: { assegnato_a: "utente-2" }, regole: [regola({ campagna_id: null, match_type: "any", assign_to: "utente-1" })] });
    await applicaRegole(presa.dip, MSG("ciao"));
    expect(scrittureSu(presa.log, "openwa_conversazioni", "insert")).toHaveLength(0);
    expect(scrittureSu(presa.log, "openwa_conversazioni", "update")).toHaveLength(0);
  });

  it("l'avviso email dice quale regola di campagna è scattata", async () => {
    const { dip, avvisaEmail } = dipendenze({
      destinatari: IN_CAMPAGNA_A,
      regole: [regola({ name: "Chiede prezzi", match_keywords: ["prezzo"], notify_email: "flo@esempio.it" })],
    });
    await applicaRegole(dip, MSG("prezzo?"));
    expect(avvisaEmail).toHaveBeenCalledWith("flo@esempio.it", "+393331234567", "prezzo?", "Chiede prezzi");
  });
});

describe("motore regole WhatsApp: condizioni", () => {
  it("«ignora» vale prima di tutto, anche delle regole di campagna", async () => {
    const { dip, log, inviaRisposta } = dipendenze({
      destinatari: IN_CAMPAGNA_A,
      regole: [
        regola({ id: "tutto", priority: 1, match_type: "any", reply_text: "Ciao", ferma_flusso: true }),
        regola({ id: "spam", campagna_id: null, priority: 99, match_keywords: ["bitcoin"], block: true }),
      ],
    });
    await applicaRegole(dip, MSG("bitcoin gratis"));
    expect(inviaRisposta).not.toHaveBeenCalled();
    expect(log.filter((v) => v.op !== "select")).toHaveLength(0);
  });

  it("un «ignora» che non combacia lascia lavorare le altre regole", async () => {
    const { dip, inviaRisposta } = dipendenze({
      destinatari: IN_CAMPAGNA_A,
      regole: [
        regola({ id: "spam", campagna_id: null, priority: 1, match_keywords: ["bitcoin"], block: true }),
        regola({ id: "tutto", match_type: "any", reply_text: "Ciao" }),
      ],
    });
    await applicaRegole(dip, MSG("buongiorno"));
    expect(inviaRisposta).toHaveBeenCalledTimes(1);
  });

  it("«ignora» senza regole di campagna: nessuna azione", async () => {
    const { dip, log, inviaRisposta } = dipendenze({
      destinatari: [],
      regole: [
        regola({ id: "spam", campagna_id: null, priority: 1, match_keywords: ["bitcoin"], block: true }),
        regola({ id: "saluto", campagna_id: null, priority: 2, match_type: "any", reply_text: "Ciao" }),
      ],
    });
    await applicaRegole(dip, MSG("bitcoin gratis"));
    expect(inviaRisposta).not.toHaveBeenCalled();
    expect(scrittureSu(log, "openwa_regole_scatti", "insert")).toHaveLength(0);
  });

  it("«solo al primo messaggio» lascia passare alla regola successiva", async () => {
    const { dip, log } = dipendenze({
      destinatari: IN_CAMPAGNA_A,
      inbound: 3,
      regole: [
        regola({ id: "primo", match_type: "any", only_first_contact: true, add_tags: ["primo"] }),
        regola({ id: "dopo", priority: 20, match_type: "any", add_tags: ["dopo"] }),
      ],
    });
    await applicaRegole(dip, MSG("ancora io"));
    expect(scrittureSu(log, "openwa_regole_scatti", "insert").map((v) => v.dati?.rule_id)).toEqual(["dopo"]);
  });

  it("messaggio vuoto: niente", async () => {
    const { dip, log } = dipendenze({ destinatari: IN_CAMPAGNA_A, regole: [regola({ match_type: "any", ferma_flusso: true })] });
    await applicaRegole(dip, MSG("   "));
    expect(log).toHaveLength(0);
  });
});
