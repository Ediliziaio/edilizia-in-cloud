/**
 * Il registro attività dell'azienda parla italiano e non mostra identificativi (09/10/2026).
 *
 * Negli ultimi 30 giorni il registro (company_activity_log) aveva 10.676 righe e
 * nessuna con un'etichetta: il badge diceva «contact.updated», il «Dettaglio»
 * mostrava l'identificativo (un UUID) in 9.696 righe, e il filtro offriva 12
 * azioni di un'altra epoca. Ogni riga ha però `description` e `target_label`.
 *
 * Le azioni qui sotto sono TUTTE quelle presenti in produzione negli ultimi 60
 * giorni (27, con le righe); le descrizioni sono quelle vere, con i nomi cambiati.
 */
import { describe, expect, it } from "vitest";
import {
  OGGETTI_FILTRO_LOG_AZIENDA,
  campiModificatiLeggibili,
  contieneIdentificativo,
  cosaDelLogAzienda,
  dettaglioLogAzienda,
  filtroNomePersona,
  paroleDaCercare,
  suCosaDelLogAzienda,
  vocedaLogAzienda,
} from "@/lib/users/logAttivitaUtente";

const UUID = "39e05a1b-f998-48d8-aab7-9aafb25a4a2a";

const AZIONI_IN_PRODUZIONE: Array<[string, string]> = [
  ["contact.created", "Contatto creato"],
  ["contact.updated", "Contatto modificato"],
  ["contact.deleted", "Contatto eliminato"],
  ["customer.created", "Cliente creato"],
  ["customer.updated", "Cliente modificato"],
  ["order.created", "Commessa creata"],
  ["order.updated", "Commessa modificata"],
  ["order.deleted", "Commessa eliminata"],
  ["order.status_updated", "Commessa: stato cambiato"],
  ["quote.created", "Preventivo creato"],
  ["quote.updated", "Preventivo modificato"],
  ["quote.deleted", "Preventivo eliminato"],
  ["supplier.created", "Fornitore creato"],
  ["supplier.updated", "Fornitore modificato"],
  ["supplier.deleted", "Fornitore eliminato"],
  ["employee.updated", "Dipendente modificato"],
  ["employee.hired", "Dipendente assunto"],
  ["task_created", "Attività creata"],
  ["task_updated", "Attività modificata"],
  ["task_completed", "Attività completata"],
  ["task_deleted", "Attività eliminata"],
  ["task_status_changed", "Attività: stato cambiato"],
  ["task_review_requested", "Attività: revisione richiesta"],
  ["task_comment_added", "Attività: commento aggiunto"],
  ["task_checklist_item_added", "Attività: voce aggiunta alla lista"],
  ["hr.request.status_changed", "Richiesta HR: stato cambiato"],
];

describe("vocedaLogAzienda: ogni azione di oggi ha un nome italiano", () => {
  it.each(AZIONI_IN_PRODUZIONE)("%s → %s", (azione, titolo) => {
    expect(vocedaLogAzienda(azione).titolo).toBe(titolo);
  });

  it("nessun titolo ha il codice dentro (punti, underscore) e quelli sconosciuti diventano una frase", () => {
    for (const [azione] of AZIONI_IN_PRODUZIONE) expect(vocedaLogAzienda(azione).titolo, azione).not.toMatch(/[._]/);
    expect(vocedaLogAzienda("cantiere.opened").titolo).toBe("Cantiere.opened".replace(".", " "));
    expect(vocedaLogAzienda("azione_nuova").titolo).toBe("Azione nuova");
    expect(vocedaLogAzienda(null).titolo).toBe("Azione");
  });

  it("le commesse e i dipendenti non finiscono più in «altro» (servono ai filtri per categoria)", () => {
    expect(vocedaLogAzienda("order.updated").categoria).toBe("commesse");
    expect(vocedaLogAzienda("employee.hired").categoria).toBe("personale");
    expect(vocedaLogAzienda("supplier.created").categoria).toBe("acquisti");
  });
});

describe("il filtro per cosa: ogni azione di oggi sta in uno e un solo filtro", () => {
  // Il `like` di Postgres: % = qualunque cosa, _ = un carattere, \ toglie il significato speciale al carattere dopo.
  const comePostgres = (modello: string) => {
    let regex = "";
    for (let i = 0; i < modello.length; i++) {
      const c = modello[i];
      if (c === "\\" && i + 1 < modello.length) regex += modello[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      else if (c === "%") regex += ".*";
      else if (c === "_") regex += ".";
      else regex += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`^${regex}$`);
  };

  it("«Commesse» manda order.% e «Attività» task\\_%", () => {
    const modelli = Object.fromEntries(OGGETTI_FILTRO_LOG_AZIENDA.map((o) => [o.chiave, o.modelloAzione]));
    expect(modelli.commesse).toBe("order.%");
    expect(modelli.attivita).toBe("task\\_%");
  });

  it.each(AZIONI_IN_PRODUZIONE.map(([a]) => a))("%s", (azione) => {
    const trovati = OGGETTI_FILTRO_LOG_AZIENDA.filter((o) => comePostgres(o.modelloAzione).test(azione));
    expect(trovati.map((o) => o.chiave)).toHaveLength(1);
  });

  it("il backslash conta: «task_%» non prende azioni che cominciano con «task» seguito da un altro carattere", () => {
    const attivita = OGGETTI_FILTRO_LOG_AZIENDA.find((o) => o.chiave === "attivita")!;
    expect(comePostgres(attivita.modelloAzione).test("task_created")).toBe(true);
    expect(comePostgres(attivita.modelloAzione).test("tasks.created")).toBe(false);
  });
});

describe("su cosa è successa l'azione: il nome, mai l'identificativo", () => {
  it("usa il nome registrato", () => {
    expect(suCosaDelLogAzienda({ action: "contact.updated", target_label: "Fatima Menezes", description: "Contatto Fatima Menezes aggiornato. Campi: tags" }))
      .toBe("Fatima Menezes");
  });

  it("una commessa che nel registro ha solo l'identificativo prende il numero dalla commessa", () => {
    const riga = { action: "order.updated", target_label: UUID, target_id: UUID, description: `Commessa ${UUID} modificata. Campi: version` };
    expect(suCosaDelLogAzienda(riga, { [UUID]: "C-2026-042 · Mario Rossi" })).toBe("C-2026-042 · Mario Rossi");
    // Commessa eliminata o non leggibile: niente, non l'identificativo.
    expect(suCosaDelLogAzienda(riga, {})).toBeNull();
    expect(suCosaDelLogAzienda(riga)).toBeNull();
  });

  it("se l'etichetta manca prova i dettagli, e scarta quello che è un identificativo", () => {
    expect(suCosaDelLogAzienda({ details: { name: "Giovanna Serra" } })).toBe("Giovanna Serra");
    expect(suCosaDelLogAzienda({ details: { order_code: "C-2026-001" } })).toBe("C-2026-001");
    expect(suCosaDelLogAzienda({ target_label: "  ", details: { name: UUID } })).toBeNull();
  });

  it("qualunque cosa si dia in ingresso, nell'uscita non c'è mai un identificativo", () => {
    const righe = [
      { action: "order.created", target_label: UUID, target_id: UUID, description: `Nuova commessa creata: ${UUID}` },
      { action: "order.deleted", target_label: UUID, description: `Commessa ${UUID} eliminata` },
      { action: "order.status_updated", target_label: UUID, description: `order.status_updated su orders ${UUID}` },
      { action: "order.updated", target_label: UUID, description: `Commessa ${UUID} modificata. Campi: version, quote_id` },
    ];
    for (const r of righe) {
      expect(contieneIdentificativo(suCosaDelLogAzienda(r) ?? ""), r.action).toBe(false);
      expect(contieneIdentificativo(cosaDelLogAzienda(r) ?? ""), r.action).toBe(false);
      expect(contieneIdentificativo(dettaglioLogAzienda(r) ?? ""), r.action).toBe(false);
    }
  });
});

describe("cosa è cambiato: i campi in italiano, quelli tecnici non si mostrano", () => {
  it("traduce i campi e toglie i doppioni", () => {
    expect(campiModificatiLeggibili("Contatto Fatima Menezes aggiornato. Campi: tags")).toBe("etichette");
    expect(campiModificatiLeggibili("Contatto X aggiornato. Campi: province, region, city")).toBe("provincia, regione, città");
    expect(campiModificatiLeggibili("Contatto X aggiornato. Campi: meta_lead_id, meta_ad_id, attr_content, attr_campaign, tags"))
      .toBe("dati della campagna, etichette");
    expect(campiModificatiLeggibili("Commessa C aggiornata. Campi: deposit_amount, deposit_paid, balance_amount")).toBe("acconti e saldo");
  });

  it("se cambiano solo dati tecnici, non c'è niente da dire", () => {
    expect(campiModificatiLeggibili(`Commessa ${UUID} modificata. Campi: version`)).toBeNull();
    expect(campiModificatiLeggibili("Preventivo P modificato. Campi: version, boh_campo_nuovo")).toBeNull();
    expect(campiModificatiLeggibili("Nuovo contatto CRM: Fatima Menezes")).toBeNull();
    expect(cosaDelLogAzienda({ action: "order.updated", description: `Commessa ${UUID} modificata. Campi: version` })).toBeNull();
  });

  it("un preventivo cambia gli importi; un dipendente la retribuzione (i valori non si dicono)", () => {
    expect(cosaDelLogAzienda({ action: "quote.updated", description: "Preventivo P modificato. Campi: subtotal, total, vat_amount, status" }))
      .toBe("Cambiato: importi, stato");
    expect(cosaDelLogAzienda({ action: "employee.updated", description: "Dipendente Elena aggiornato. Campi: net_salary, gross_salary, data_assunzione" }))
      .toBe("Cambiato: retribuzione, date di lavoro");
  });

  it("le attività raccontano la frase del registro, con la maiuscola", () => {
    expect(cosaDelLogAzienda({ action: "task_status_changed", description: "ha spostato l'attivita da Da fare a In corso" }))
      .toBe("Ha spostato l'attivita da Da fare a In corso");
    expect(cosaDelLogAzienda({ action: "task_created", description: "ha creato l'attività" })).toBe("Ha creato l'attività");
  });

  it("le descrizioni in forma «macchina» non diventano un dettaglio", () => {
    expect(cosaDelLogAzienda({ action: "customer.created", description: "customer.created su customers Giovanna Serra" })).toBeNull();
    expect(suCosaDelLogAzienda({ action: "customer.created", target_label: "Giovanna Serra", description: "customer.created su customers Giovanna Serra" }))
      .toBe("Giovanna Serra");
  });

  it("nella lista senza colonne (scheda utente) nome e cambiamento stanno insieme", () => {
    expect(dettaglioLogAzienda({ action: "contact.updated", target_label: "Fatima Menezes", description: "Contatto Fatima Menezes aggiornato. Campi: tags" }))
      .toBe("Fatima Menezes — Cambiato: etichette");
    expect(dettaglioLogAzienda({ action: "contact.created", target_label: "Fatima Menezes", description: "Nuovo contatto CRM: Fatima Menezes" }))
      .toBe("Fatima Menezes");
    expect(dettaglioLogAzienda({ action: "contact.created" })).toBeNull();
  });
});

describe("la ricerca nel registro", () => {
  it("toglie i caratteri che per il filtro sono sintassi", () => {
    expect(paroleDaCercare("rossi, mario")).toBe("rossi mario");
    expect(paroleDaCercare("a(b)c*d%e\\f\"g'h")).toBe("a b c d e f g h");
    expect(paroleDaCercare("   ")).toBe("");
    expect(paroleDaCercare("x".repeat(200))).toHaveLength(60);
  });

  it("«Mario» è un nome o un cognome, «Mario Rossi» nome e cognome in uno dei due ordini", () => {
    expect(filtroNomePersona("mario")).toBe("first_name.ilike.*mario*,last_name.ilike.*mario*");
    expect(filtroNomePersona("mario rossi")).toBe(
      "and(first_name.ilike.*mario*,last_name.ilike.*rossi*),and(first_name.ilike.*rossi*,last_name.ilike.*mario*)",
    );
  });
});
