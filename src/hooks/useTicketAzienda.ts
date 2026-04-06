import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TicketRow {
  id: string;
  company_id: string;
  titolo: string;
  descrizione: string | null;
  priorita: "bassa" | "normale" | "alta" | "urgente";
  stato: "aperto" | "in_lavorazione" | "in_attesa" | "risolto" | "chiuso";
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
  aperto_da_nome?: string;
}

export function useTicketAzienda(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: tickets, isLoading, isError } = useQuery({
    queryKey: ["ticket-azienda", companyId],
    queryFn: async (): Promise<TicketRow[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("supporto_ticket")
        .select(
          "id, company_id, titolo, descrizione, priorita, stato, categoria, assegnato_a_nome, aperto_da_nome, risolto_at, created_at, updated_at"
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[useTicketAzienda]", error);
        throw new Error("Impossibile caricare i ticket: " + error.message);
      }
      return (data ?? []) as TicketRow[];
    },
    enabled: !!companyId,
  });

  const creaTicket = useMutation({
    mutationFn: async (payload: NuovoTicket & { company_id: string }) => {
      const { error } = await supabase
        .from("supporto_ticket")
        .insert({
          company_id: payload.company_id,
          titolo: payload.titolo,
          descrizione: payload.descrizione ?? null,
          priorita: payload.priorita,
          categoria: payload.categoria ?? "generale",
          aperto_da_nome: payload.aperto_da_nome ?? null,
        });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Ticket creato con successo");
      queryClient.invalidateQueries({ queryKey: ["ticket-azienda", companyId] });
    },
    onError: (err: Error) => toast.error("Errore nella creazione del ticket", { description: err.message }),
  });

  const cambiaStato = useMutation({
    mutationFn: async ({ ticketId, stato }: { ticketId: string; stato: TicketRow["stato"] }) => {
      const update: Partial<TicketRow> = { stato };
      if (stato === "risolto") update.risolto_at = new Date().toISOString();
      const { error } = await supabase
        .from("supporto_ticket")
        .update(update)
        .eq("id", ticketId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Stato ticket aggiornato");
      queryClient.invalidateQueries({ queryKey: ["ticket-azienda", companyId] });
    },
    onError: (err: Error) => toast.error("Errore aggiornamento stato", { description: err.message }),
  });

  return { tickets: tickets ?? [], isLoading, isError, creaTicket, cambiaStato };
}

export function useTicketRisposte(ticketId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: risposte, isLoading } = useQuery({
    queryKey: ["ticket-risposte", ticketId],
    queryFn: async (): Promise<RispostaRow[]> => {
      if (!ticketId) return [];
      const { data, error } = await supabase
        .from("supporto_risposte")
        .select("id, ticket_id, testo, autore_nome, is_interno, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as RispostaRow[];
    },
    enabled: !!ticketId,
  });

  const aggiungiRisposta = useMutation({
    mutationFn: async (payload: { testo: string; autore_nome?: string; is_interno?: boolean }) => {
      if (!ticketId) throw new Error("ticketId mancante");
      const { error } = await supabase.from("supporto_risposte").insert({
        ticket_id: ticketId,
        testo: payload.testo,
        autore_nome: payload.autore_nome ?? null,
        is_interno: payload.is_interno ?? false,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-risposte", ticketId] });
    },
    onError: (err: Error) => toast.error("Errore nell'aggiunta della risposta", { description: err.message }),
  });

  return { risposte: risposte ?? [], isLoading, aggiungiRisposta };
}
