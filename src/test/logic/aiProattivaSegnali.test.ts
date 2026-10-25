/**
 * I segnali dell'AI proattiva che non partivano mai (24-25/10/2026).
 *
 * ai-proactive-proposals-daily gira ogni mattina per tutte le aziende, ma in tutta
 * la sua storia ha prodotto proposte solo per il brief del mattino e per i cantieri in
 * ritardo. Gli altri segnali chiedevano colonne e stati che non esistono (numero,
 * importo_totale, durc_valido_fino, value_eur, scenarios, lo stato «new»…) e il codice
 * ignorava l'errore «column»: ogni mattina 16 errori nei log e nessuna proposta.
 *
 * Il cantiere in ritardo funzionava, ma sbagliava: 49 proposte su 84 erano su commesse
 * già in «Lavori completati» e 12 su commesse nel cestino.
 *
 * Qui lo schema vero (le colonne lette dal database il 25/10/2026) è scritto nel test:
 * una colonna nuova nella funzione che non è nello schema fa fallire il test, invece di
 * restare muta per mesi.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SORGENTE = readFileSync(
  join(__dirname, "../../../supabase/functions/ai-proactive-proposals-daily/index.ts"),
  "utf8",
);

/** Le colonne vere delle tabelle che i rilevatori interrogano. */
const SCHEMA: Record<string, string[]> = {
  invoices: [
    "id", "company_id", "invoice_number", "document_type", "status", "client_id",
    "client_company_name", "due_date", "total", "paid_amount", "deleted_at",
  ],
  subappaltatori_sicurezza: [
    "id", "company_id", "order_id", "ragione_sociale", "data_inizio", "data_fine",
    "durc_scadenza", "campo_subappaltatore_id",
  ],
  marketing_opportunities: [
    "id", "company_id", "contact_id", "name", "value", "status", "source", "assigned_to",
    "created_at", "updated_at", "last_activity_at", "deleted_at",
  ],
  order_statuses: ["id", "company_id", "name", "position", "is_support_phase"],
  durc_documents: ["id", "company_id", "data_scadenza", "esito", "numero_protocollo", "target_type", "status"],
  orders: [
    "id", "company_id", "description", "expected_date", "work_end_date", "current_status_id",
    "status", "fulfillment_status", "deleted_at",
  ],
};

/** Il corpo di un rilevatore, dal suo nome al successivo. */
function rilevatore(nome: string): string {
  const inizio = SORGENTE.indexOf(`async function ${nome}(`);
  expect(inizio, `rilevatore ${nome} non trovato`).toBeGreaterThan(-1);
  const prossimo = SORGENTE.indexOf("\nasync function ", inizio + 10);
  return SORGENTE.slice(inizio, prossimo === -1 ? undefined : prossimo);
}

/** Le colonne dei .select("...") fatti su una tabella dentro un rilevatore. */
function colonneSelezionate(corpo: string, tabella: string): string[] {
  const m = new RegExp(`\\.from\\("${tabella}"\\)\\s*\\.select\\("([^"]+)"\\)`).exec(corpo);
  expect(m, `select su ${tabella} non trovata`).not.toBeNull();
  return m![1].split(",").map((c) => c.trim());
}

describe("ai-proactive-proposals-daily — le colonne chieste esistono davvero", () => {
  const casi: Array<[string, string]> = [
    ["detectCantieriInRitardo", "orders"],
    ["detectCantieriInRitardo", "order_statuses"],
    ["detectFattureScadute", "invoices"],
    ["detectDurcInScadenza", "subappaltatori_sicurezza"],
    ["detectLeadDormienti", "marketing_opportunities"],
    ["detectLeadNuovoNoTouch", "marketing_opportunities"],
    ["detectDurcAziendale", "durc_documents"],
  ];
  for (const [nome, tabella] of casi) {
    it(`${nome}: ogni colonna letta da ${tabella} è nello schema`, () => {
      const colonne = colonneSelezionate(rilevatore(nome), tabella);
      const mancanti = colonne.filter((c) => !SCHEMA[tabella].includes(c));
      expect(mancanti, `colonne inesistenti in ${tabella}`).toEqual([]);
    });
  }

  it("nessun nome di colonna sbagliato è rimasto nel codice (i commenti possono raccontarlo)", () => {
    const codice = SORGENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
    for (const sbagliato of [
      "durc_valido_fino", "value_eur\")", "importo_totale", "inv.customer_id", "inv.numero",
      '"numero,', "scenarios, created_at", "p_giorni", ".worst_case", "cumulative_eur",
    ]) {
      expect(codice, sbagliato).not.toContain(sbagliato);
    }
  });
});

describe("ai-proactive-proposals-daily — gli errori di schema non si ignorano più", () => {
  for (const nome of ["detectFattureScadute", "detectDurcInScadenza", "detectLeadDormienti", "detectLeadNuovoNoTouch"]) {
    it(`${nome} riporta l'errore invece di scartarlo in silenzio`, () => {
      const corpo = rilevatore(nome);
      expect(corpo).not.toContain('includes("column")');
      expect(corpo).toMatch(/result\.errors\.push\(`query /);
    });
  }
});

describe("fatture scadute", () => {
  const corpo = rilevatore("detectFattureScadute");

  it("solo fatture emesse (invoice, issued) non cancellate", () => {
    expect(corpo).toContain('.eq("document_type", "invoice")');
    expect(corpo).toContain('.eq("status", "issued")');
    expect(corpo).toContain('.is("deleted_at", null)');
  });

  it("scadute da 30 a 120 giorni, le più alte per prime, al massimo 10", () => {
    expect(corpo).toContain("dal.setDate(dal.getDate() - 120)");
    expect(corpo).toContain("al.setDate(al.getDate() - 30)");
    expect(corpo).toContain('.order("total", { ascending: false })');
    expect(corpo).toContain(".slice(0, 10)");
  });

  it("la proposta parla del residuo da incassare, non del totale", () => {
    expect(corpo).toContain("Number(f.total ?? 0) - Number(f.paid_amount ?? 0)");
    expect(corpo).toContain("f.residuo > 0.005");
    expect(corpo).toContain("const importo = Number(inv.residuo)");
  });
});

describe("DURC dei subappaltatori", () => {
  const corpo = rilevatore("detectDurcInScadenza");

  it("si legge dalla scheda sicurezza, solo per gli incarichi ancora in corso", () => {
    expect(corpo).toContain('.from("subappaltatori_sicurezza")');
    expect(corpo).toContain("data_fine.is.null,data_fine.gte.${oggi}");
  });

  it("l'entità della proposta è la scheda (stesso DURC, una proposta), con l'anagrafica nel contenuto", () => {
    expect(corpo).toContain("p_signal_entity_id: sub.id");
    expect(corpo).toContain("subappaltatore_id: sub.campo_subappaltatore_id ?? null");
    expect(corpo).toContain("scheda_sicurezza_id: sub.id");
  });
});

describe("opportunità ferme", () => {
  const corpo = rilevatore("detectLeadDormienti");

  it("solo trattative aperte con un valore, ferme da 30 a 120 giorni", () => {
    expect(corpo).toContain('.eq("status", "open")');
    expect(corpo).toContain('.gt("value", 0)');
    expect(corpo).toContain("fermaFinoA.setDate(fermaFinoA.getDate() - 120)");
    expect(corpo).toContain('.is("deleted_at", null)');
  });

  it("le più alte per prime, al massimo 5 per azienda (non i 26.000 lead di marketing)", () => {
    expect(corpo).toContain('.order("value", { ascending: false })');
    expect(corpo).toContain(".limit(5)");
    expect(corpo).not.toContain(".limit(15)");
  });

  it("gli stati inventati non ci sono più", () => {
    for (const s of ["qualified", "proposal", "negotiation"]) expect(corpo).not.toContain(`"${s}"`);
  });
});

describe("lead nuovi senza primo contatto", () => {
  const corpo = rilevatore("detectLeadNuovoNoTouch");

  it("lo stato è open: «new» non esiste", () => {
    expect(corpo).toContain('.eq("status", "open")');
    expect(corpo).not.toContain('.eq("status", "new")');
  });
});

describe("rischio di cassa", () => {
  const corpo = rilevatore("detectCashflowCritico");

  it("usa la RPC con i suoi parametri veri", () => {
    expect(corpo).toContain('"silvio_tool_get_cashflow_forecast_scenarios"');
    expect(corpo).toContain("{ p_company_id: companyId, p_user_id: defaultUserId }");
  });

  it("legge le chiavi che la RPC restituisce: worst.min_balance_eur e first_risk_date", () => {
    expect(corpo).toContain("(forecast as any)?.worst;");
    expect(corpo).toContain("worst.min_balance_eur");
    expect(corpo).toContain("worst.first_risk_date");
  });

  it("l'errore della RPC si riporta, non si ignora", () => {
    expect(corpo).toMatch(/if \(forecastErr\) \{\s*result\.errors\.push\(`forecast cassa: /);
  });

  it("la soglia di emergenza resta quella di prima: -5.000 euro", () => {
    expect(corpo).toContain("TRIGGER_THRESHOLD_EUR = -5_000");
  });
});

describe("cantieri in ritardo", () => {
  const corpo = rilevatore("detectCantieriInRitardo");

  it("non propone commesse nel cestino", () => {
    expect(corpo).toContain('.is("deleted_at", null)');
  });

  it("non propone commesse concluse, annullate o in una fase di supporto: la regola del Cruscotto", () => {
    expect(corpo).toContain('.from("order_statuses")');
    expect(corpo).toContain("!f.is_support_phase");
    expect(corpo).toContain("fase.id !== faseConclusiva?.id");
    expect(corpo).toContain('["annullato", "cancelled", "canceled"]');
    expect(corpo).toContain('o.fulfillment_status === "completed" || o.status === "completato"');
  });

  it("la scadenza è la fine dei lavori, o la data prevista se manca", () => {
    expect(corpo).toContain("work_end_date.lt.${today},and(work_end_date.is.null,expected_date.lt.${today})");
    expect(corpo).toContain("String(o.work_end_date || o.expected_date)");
  });

  it("le più recenti per prime (le vecchie non sono più un problema di oggi), al massimo 20", () => {
    expect(corpo).toContain('.order("expected_date", { ascending: false, nullsFirst: false })');
    expect(corpo).toContain(".slice(0, 20)");
  });
});
