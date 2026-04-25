import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * FIX SCHEMA — switch dalla tabella inesistente `supporto_ticket` alla
 * tabella reale `tickets` (con types.ts esistenti).
 *
 * Mapping camp:
 *   - DB `subject` (legacy `titolo` nullable) → `titolo` esposto al component
 *   - DB `status` enum 3-valori (aperto/in_lavorazione/risolto) → `stato`
 *   - DB `priority` enum 4-valori (bassa/normale/alta/urgente) → `priorita`
 *   - DB `descrizione` → `descrizione`
 *   - DB `category` (legacy `tipo`) → `categoria`
 *   - DB `created_by` UUID + `assigned_to` UUID → manual join `profiles`
 *     per esporre `aperto_da_nome` / `assegnato_a_nome` al component.
 *
 * Lo schema `tickets.status` ha solo 3 valori — gli stati "in_attesa" e
 * "chiuso" del vecchio mapping non esistono. Rimossi dalle UI consumer.
 *
 * Per le RISPOSTE: tabella `ticket_messages`:
 *   - `message` (non `testo`)
 *   - `sender_id` UUID + manual join profiles
 *   - `is_interno` NON ESISTE → rimossa dalla UI (le note interne possono
 *     essere salvate in `tickets.internal_notes` ma non come messaggi).
 */

export interface TicketRow {
  id: string;
  company_id: string;
  titolo: string;
  descrizione: string | null;
  priorita: "bassa" | "normale" | "alta" | "urgente";
  stato: "aperto" | "in_lavorazione" | "risolto";
  categoria: string | null;
  assegnato_a_nome: string | null;
  aperto_da_nome: string | null;
  risolto_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RispostaRow {
  id: string;
  ticket_id: string;
  testo: string;
  autore_nome: string | null;
  is_interno: boolean;
  created_at: string;
}

export interface NuovoTicket {
  titolo: string;
  descrizione?: string;
  priorita: TicketRow["priorita"];
  categoria?: string;
  aperto_da_nome?: string; // mantenuto per compat firma — usato solo per audit lookup
}

interface RawTicket {
  id: string;
  company_id: string;
  subject: string;
  titolo: string | null;
  descrizione: string | null;
  priority: TicketRow["priorita"];
  priorita: string | null;
  status: TicketRow["stato"];
  category: string | null;
  assigned_to: string | null;
  created_by: string | null;
  updated_at: string;
  created_at: string;
}

/** Manual join: arricchisce ticket grezzi con nomi profili per assigned_to/created_by */
async function enrichTickets(rows: RawTicket[]): Promise<TicketRow[]> {
  const ids = Array.from(
    new Set(
      rows.flatMap((r) => [r.assigned_to, r.created_by].filter(Boolean) as string[]),
    ),
  );
  let nameMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", ids);
    if (profiles) {
      nameMap = new Map(
        profiles.map((p) => [
          p.id,
          [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || p.id,
        ]),
      );
    }
  }

  // risolto_at: l'enum `status` esistente ha solo 3 valori, quindi non c'è
  // un campo `resolved_at`. Approssimiamo con `updated_at` quando status="risolto".
  return rows.map((r) => ({
    id: r.id,
    company_id: r.company_id,
    // FALLBACK: se `titolo` legacy è null, usa `subject` (NOT NULL nel DB)
    titolo: r.titolo ?? r.subject,
    descrizione: r.descrizione,
    priorita: r.priority,
    stato: r.status,
    categoria: r.category,
    assegnato_a_nome: r.assigned_to ? nameMap.get(r.assigned_to) ?? null : null,
    aperto_da_nome: r.created_by ? nameMap.get(r.created_by) ?? null : null,
    risolto_at: r.status === "risolto" ? r.updated_at : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export function useTicketAzienda(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: tickets, isLoading, isError } = useQuery({
    queryKey: ["ticket-azienda", companyId],
    queryFn: async (): Promise<TicketRow[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, company_id, subject, titolo, descrizione, priority, priorita, status, category, assigned_to, created_by, created_at, updated_at",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[useTicketAzienda]", error);
        throw new Error("Impossibile caricare i ticket: " + error.message);
      }
      return enrichTickets((data ?? []) as RawTicket[]);
    },
    enabled: !!companyId,
  });

  const creaTicket = useMutation({
    mutationFn: async (
      payload: NuovoTicket & { company_id: string; created_by_id?: string | null },
    ) => {
      const { error } = await supabase.from("tickets").insert({
        company_id: payload.company_id,
        // NOT NULL constraint: subject è obbligatorio.
        // Salviamo in entrambi: subject (canonico) + titolo (legacy)
        subject: payload.titolo,
        titolo: payload.titolo,
        descrizione: payload.descrizione ?? null,
        priority: payload.priorita,
        priorita: payload.priorita, // legacy duplicato per compat
        status: "aperto",
        category: payload.categoria ?? "generale",
        created_by: payload.created_by_id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Ticket creato con successo");
      queryClient.invalidateQueries({ queryKey: ["ticket-azienda", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-detail", companyId] });
    },
    onError: (err: Error) =>
      toast.error("Errore nella creazione del ticket", { description: err.message }),
  });

  const cambiaStato = useMutation({
    mutationFn: async ({
      ticketId,
      stato,
    }: {
      ticketId: string;
      stato: TicketRow["stato"];
    }) => {
      const { error } = await supabase
        .from("tickets")
        .update({ status: stato })
        .eq("id", ticketId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Stato ticket aggiornato");
      queryClient.invalidateQueries({ queryKey: ["ticket-azienda", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-detail", companyId] });
    },
    onError: (err: Error) =>
      toast.error("Errore aggiornamento stato", { description: err.message }),
  });

  return { tickets: tickets ?? [], isLoading, isError, creaTicket, cambiaStato };
}

interface RawMessage {
  id: string;
  ticket_id: string;
  message: string;
  sender_id: string;
  created_at: string;
}

export function useTicketRisposte(ticketId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: risposte, isLoading } = useQuery({
    queryKey: ["ticket-risposte", ticketId],
    queryFn: async (): Promise<RispostaRow[]> => {
      if (!ticketId) return [];
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("id, ticket_id, message, sender_id, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as RawMessage[];

      // Manual join nomi mittenti
      const ids = Array.from(new Set(rows.map((r) => r.sender_id).filter(Boolean)));
      let nameMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", ids);
        if (profiles) {
          nameMap = new Map(
            profiles.map((p) => [
              p.id,
              [p.first_name, p.last_name].filter(Boolean).join(" ") ||
                p.email ||
                p.id,
            ]),
          );
        }
      }
      return rows.map((r) => ({
        id: r.id,
        ticket_id: r.ticket_id,
        testo: r.message,
        autore_nome: nameMap.get(r.sender_id) ?? null,
        // is_interno NON esiste in ticket_messages — sempre false (visibile)
        is_interno: false,
        created_at: r.created_at,
      }));
    },
    enabled: !!ticketId,
  });

  const aggiungiRisposta = useMutation({
    mutationFn: async (payload: {
      testo: string;
      sender_id?: string;
      autore_nome?: string;
      is_interno?: boolean;
    }) => {
      if (!ticketId) throw new Error("ticketId mancante");
      if (!payload.sender_id) {
        throw new Error("sender_id mancante (utente non autenticato)");
      }
      const { error } = await supabase.from("ticket_messages").insert({
        ticket_id: ticketId,
        message: payload.testo,
        sender_id: payload.sender_id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Risposta inviata");
      queryClient.invalidateQueries({ queryKey: ["ticket-risposte", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-azienda"] });
    },
    onError: (err: Error) =>
      toast.error("Errore nell'aggiunta della risposta", { description: err.message }),
  });

  return { risposte: risposte ?? [], isLoading, aggiungiRisposta };
}
