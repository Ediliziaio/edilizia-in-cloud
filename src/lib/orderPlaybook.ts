/**
 * Playbook commessa — set standard di attività ricorrenti per mestiere.
 *
 * Standardizza il flusso operativo tipico: con un click si creano in blocco le
 * task della commessa (titolo + scadenza relativa alla data commessa + priorità),
 * invece di crearle a mano una per una. Le task sono REALI (tabella `tasks`):
 * compaiono nella card "Attività" e si assegnano alle persone.
 *
 * v1: playbook definiti qui (per vertical). La versione modificabile per azienda
 * richiede una tabella DB dedicata (step successivo).
 */

import { supabase } from "@/integrations/supabase/client";
import { addDays, format } from "date-fns";

export interface PlaybookStep {
  titolo: string;
  descrizione?: string;
  /** Giorni dalla data della commessa (created_at) per la scadenza. */
  giorni_offset: number;
  priorita: "bassa" | "normale" | "alta" | "urgente";
}

const SERRAMENTISTA: PlaybookStep[] = [
  { titolo: "Sopralluogo e rilievo misure", giorni_offset: 2, priorita: "alta" },
  { titolo: "Conferma misure e capitolato col cliente", giorni_offset: 4, priorita: "normale" },
  { titolo: "Ordine serramenti al fornitore", giorni_offset: 5, priorita: "alta" },
  { titolo: "Verifica arrivo merce in magazzino", giorni_offset: 25, priorita: "normale" },
  { titolo: "Programmazione posa con la squadra", giorni_offset: 28, priorita: "normale" },
  { titolo: "Posa in opera", giorni_offset: 35, priorita: "alta" },
  { titolo: "Collaudo e firma verbale fine lavori", giorni_offset: 40, priorita: "normale" },
  { titolo: "Richiesta saldo + dossier detrazioni", giorni_offset: 42, priorita: "normale" },
];

const FOTOVOLTAICO: PlaybookStep[] = [
  { titolo: "Sopralluogo tecnico e rilievo tetto", giorni_offset: 3, priorita: "alta" },
  { titolo: "Pratica connessione (TICA) + CILA in Comune", giorni_offset: 7, priorita: "alta" },
  { titolo: "Ordine moduli, inverter e accumulo", giorni_offset: 10, priorita: "alta" },
  { titolo: "Installazione impianto", giorni_offset: 25, priorita: "alta" },
  { titolo: "Allaccio rete + collaudo", giorni_offset: 35, priorita: "normale" },
  { titolo: "Pratica GSE (Scambio sul Posto)", giorni_offset: 40, priorita: "normale" },
  { titolo: "Consegna dossier detrazioni + saldo", giorni_offset: 45, priorita: "normale" },
];

const TETTI: PlaybookStep[] = [
  { titolo: "Sopralluogo copertura e rilievo", giorni_offset: 2, priorita: "alta" },
  { titolo: "Conferma capitolato + documenti sicurezza (PSC/POS)", giorni_offset: 5, priorita: "alta" },
  { titolo: "Ordine materiali", giorni_offset: 7, priorita: "normale" },
  { titolo: "Allestimento cantiere e ponteggio", giorni_offset: 12, priorita: "normale" },
  { titolo: "Rifacimento / posa copertura", giorni_offset: 25, priorita: "alta" },
  { titolo: "Smontaggio ponteggio e pulizia cantiere", giorni_offset: 35, priorita: "normale" },
  { titolo: "Collaudo + saldo", giorni_offset: 40, priorita: "normale" },
];

const GENERICO: PlaybookStep[] = [
  { titolo: "Sopralluogo iniziale", giorni_offset: 2, priorita: "alta" },
  { titolo: "Conferma preventivo e capitolato", giorni_offset: 4, priorita: "normale" },
  { titolo: "Ordine materiali ai fornitori", giorni_offset: 6, priorita: "alta" },
  { titolo: "Avvio lavori in cantiere", giorni_offset: 10, priorita: "normale" },
  { titolo: "Verifica avanzamento (SAL)", giorni_offset: 20, priorita: "normale" },
  { titolo: "Fine lavori e collaudo", giorni_offset: 35, priorita: "alta" },
  { titolo: "Saldo e chiusura commessa", giorni_offset: 40, priorita: "normale" },
];

const PLAYBOOKS: Record<string, PlaybookStep[]> = {
  serramentista: SERRAMENTISTA,
  fotovoltaico: FOTOVOLTAICO,
  tetti: TETTI,
  generico: GENERICO,
};

/** Etichetta umana del playbook scelto (per il messaggio di conferma). */
export const PLAYBOOK_LABELS: Record<string, string> = {
  serramentista: "Serramenti",
  fotovoltaico: "Fotovoltaico",
  tetti: "Tetti e coperture",
  generico: "Generico edile",
};

/** Restituisce il playbook per il vertical (fallback: generico). */
export function getOrderPlaybook(vertical?: string | null): { key: string; steps: PlaybookStep[] } {
  const key = vertical && PLAYBOOKS[vertical] ? vertical : "generico";
  return { key, steps: PLAYBOOKS[key] };
}

/**
 * Applica il playbook a una commessa: crea le task standard (personalizzate se
 * l'azienda ha un playbook in `order_task_template`, altrimenti standard del
 * mestiere). Idempotente: salta i titoli già presenti. Usato sia dal bottone
 * manuale (OrderDetail) sia dall'auto-applica alla creazione (CreateOrder).
 */
export async function applyPlaybookToOrder(params: {
  companyId: string;
  orderId: string;
  vertical?: string | null;
  baseDate: Date;
}): Promise<{ created: number; playbookKey: string }> {
  const { companyId, orderId, vertical, baseDate } = params;
  const { key } = getOrderPlaybook(vertical);

  // created_by è NOT NULL su tasks: serve l'utente corrente.
  const { data: auth } = await supabase.auth.getUser();
  const createdBy = auth?.user?.id;
  if (!createdBy) throw new Error("Sessione scaduta: accedi di nuovo per applicare il processo standard.");

  let tplQuery = supabase
    .from("order_task_template")
    .select("titolo, descrizione, giorni_offset, priorita")
    .eq("company_id", companyId)
    .eq("attivo", true)
    .order("sort_order", { ascending: true });
  tplQuery = vertical ? tplQuery.eq("vertical", vertical) : tplQuery.is("vertical", null);
  const { data: customTpl } = await tplQuery;

  const steps: PlaybookStep[] = customTpl && customTpl.length > 0
    ? customTpl.map((t: { titolo: string; descrizione: string | null; giorni_offset: number; priorita: string }) => ({
        titolo: t.titolo,
        descrizione: t.descrizione ?? undefined,
        giorni_offset: Number(t.giorni_offset) || 0,
        priorita: (t.priorita as PlaybookStep["priorita"]) ?? "normale",
      }))
    : getOrderPlaybook(vertical).steps;

  const { data: existing } = await supabase
    .from("tasks")
    .select("title")
    .eq("company_id", companyId)
    .eq("order_id", orderId);
  const existingTitles = new Set(
    (existing ?? []).map((t: { title: string }) => (t.title ?? "").trim().toLowerCase()),
  );

  const rows = steps
    .filter((s) => !existingTitles.has(s.titolo.trim().toLowerCase()))
    .map((s) => ({
      company_id: companyId,
      order_id: orderId,
      title: s.titolo,
      notes: s.descrizione ?? null,
      status: "da_fare",
      priority: s.priorita,
      due_date: format(addDays(baseDate, s.giorni_offset), "yyyy-MM-dd"),
      category: "ordini",
      assigned_to: null,
      created_by: createdBy,
    }));

  if (rows.length === 0) return { created: 0, playbookKey: key };
  const { error } = await supabase.from("tasks").insert(rows as never);
  if (error) throw error;
  return { created: rows.length, playbookKey: key };
}
