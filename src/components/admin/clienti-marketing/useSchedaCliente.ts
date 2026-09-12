/**
 * La scheda di un cliente marketing: un solo giro al database
 * (admin_cliente_marketing_scheda) che porta fuori il giorno per giorno, le
 * settimane, i lead con chi li ha toccati, le vendite con il lead d'origine,
 * l'imbuto e chi lavora dentro l'azienda. Serve a non dover entrare
 * nell'azienda per sapere come va.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const n = (v: unknown) => (v == null ? null : Number(v));

export interface GiornoScheda {
  giorno: string;
  spesa: number;
  copertura: number | null;
  interazioni: number | null;
  impression: number | null;
  click: number | null;
  cpm: number | null;
  cpc: number | null;
  frequenza: number | null;
  campagne_attive: number | null;
  lead_dichiarati: number;
  lead: number;
  cpl: number | null;
  opportunita: number;
  lavorate: number;
  mediana_min: number | null;
  appuntamenti: number;
  vendite: number;
  valore: number;
}

export interface SettimanaScheda {
  settimana: string;
  spesa: number; lead: number; lavorate: number; appuntamenti: number; vendite: number; valore: number;
  mediana_min: number | null; cpl: number | null;
  lead_prec: number | null; cpl_prec: number | null; spesa_prec: number | null; app_prec: number | null;
}

export interface LeadScheda {
  id: string;
  nome: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  fonte: string | null;
  city: string | null;
  province: string | null;
  opportunita_id: string | null;
  status: string | null;
  value: number | null;
  fase: string | null;
  assegnato_a: string | null;
  primo_contatto_min: number | null;
  last_activity_at: string | null;
}

export interface VenditaScheda {
  id: string;
  name: string | null;
  value: number;
  vinto_il: string;
  source: string | null;
  cliente_finale: string | null;
  lead_il: string | null;
  giorni_dal_lead: number | null;
  venditore: string | null;
}

export interface RigaDiario {
  settimana: string;
  trend: string | null;
  cosa_fare: string | null;
  esito: string | null;
  chiusa: boolean;
  updated_at: string | null;
}

export interface CanaleScheda {
  canale: string;
  nome: string;
  spesa: number;
  spesa_importata: number;
  spesa_a_mano: number;
  copertura: number | null;
  interazioni: number | null;
  click: number | null;
  impression: number | null;
  lead_dichiarati: number;
  lead: number;
  con_opportunita: number;
  vendite: number;
  valore: number;
  cpm: number | null;
  cpc: number | null;
  cpl: number | null;
  cpa: number | null;
  roas: number | null;
  aggiornato_il: string | null;
  giorni_con_dati: number;
  origine_costo: string;
}

export interface SchedaCliente {
  cliente: {
    id: string; company_id: string; cliente_nome: string; azienda_nome: string | null; logo_url: string | null;
    stato: string; data_inizio: string | null; commerciale: string | null; commerciale_id: string | null;
    responsabile_nome: string | null; servizio: string | null; categoria: string | null;
    mkt_settore: string | null; mkt_classe: string | null; mkt_budget_mensile: number | null; mkt_ticket_medio: number | null;
    mkt_chi_richiama: string | null; azienda_telefono: string | null; azienda_email: string | null; provvigione_scaglioni: unknown;
  } | null;
  diario: RigaDiario[];
  servizi: Array<{ id: string; servizio: string; categoria: string; stato: string; billing_model: string; ricorrenza: string | null; importo: number; data_inizio: string | null; data_fine: string | null; corrente: boolean; incassato: number; da_incassare: number }>;
  periodo: { da: string; a: string; giorni: number; precedente_da: string };
  totali: {
    spesa: number; lead: number; opportunita: number; lavorate: number; appuntamenti: number; vendite: number; valore: number;
    copertura: number; click: number; mediana_min: number | null;
    cpl: number | null; costo_appuntamento: number | null; cpa: number | null; roas: number | null;
    tasso_lavorati: number | null; tasso_appuntamento: number | null; tasso_chiusura: number | null;
  };
  precedente: { spesa: number; lead: number; appuntamenti: number; vendite: number; valore: number };
  giorni: GiornoScheda[];
  settimane: SettimanaScheda[];
  lead: LeadScheda[];
  vendite: VenditaScheda[];
  imbuto: Array<{ fase: string; ordine: number; n: number; valore: number; ferme_14g: number }>;
  perse: Array<{ motivo: string; n: number }>;
  persone: Array<{ persona: string; opportunita: number; lavorate: number; vinte: number; mediana_min: number | null }>;
  attivita: Array<{ tipo: string; n: number }>;
}

/** I numeri della scheda nel periodo scelto (default: ultimi 30 giorni). */
export function useSchedaCliente(serviceClientId: string | null, da?: string, a?: string) {
  return useQuery({
    queryKey: ["clienti-marketing", "scheda", serviceClientId, da ?? null, a ?? null],
    enabled: !!serviceClientId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SchedaCliente> => {
      const { data, error } = await db.rpc("admin_cliente_marketing_scheda", {
        p_service_client_id: serviceClientId, p_da: da ?? null, p_a: a ?? null,
      });
      if (error) throw error;
      const s = data as SchedaCliente;
      return {
        ...s,
        giorni: (s.giorni ?? []).map((g) => ({
          ...g, spesa: Number(g.spesa) || 0, copertura: n(g.copertura), interazioni: n(g.interazioni), impression: n(g.impression),
          click: n(g.click), cpm: n(g.cpm), cpc: n(g.cpc), frequenza: n(g.frequenza), cpl: n(g.cpl), valore: Number(g.valore) || 0,
        })),
        settimane: (s.settimane ?? []).map((w) => ({
          ...w, spesa: Number(w.spesa) || 0, valore: Number(w.valore) || 0, cpl: n(w.cpl), cpl_prec: n(w.cpl_prec), spesa_prec: n(w.spesa_prec),
        })),
        vendite: (s.vendite ?? []).map((v) => ({ ...v, value: Number(v.value) || 0 })),
        totali: {
          ...s.totali,
          spesa: Number(s.totali?.spesa) || 0, valore: Number(s.totali?.valore) || 0,
          cpl: n(s.totali?.cpl), costo_appuntamento: n(s.totali?.costo_appuntamento), cpa: n(s.totali?.cpa), roas: n(s.totali?.roas),
          tasso_lavorati: n(s.totali?.tasso_lavorati), tasso_appuntamento: n(s.totali?.tasso_appuntamento), tasso_chiusura: n(s.totali?.tasso_chiusura),
        },
        precedente: {
          spesa: Number(s.precedente?.spesa) || 0, lead: Number(s.precedente?.lead) || 0,
          appuntamenti: Number(s.precedente?.appuntamenti) || 0, vendite: Number(s.precedente?.vendite) || 0, valore: Number(s.precedente?.valore) || 0,
        },
      };
    },
  });
}

/**
 * I canali del cliente nello stesso periodo: quanto costa Facebook, quanto
 * Google, quanto TikTok, e quante richieste vere ha portato ognuno. Sta in una
 * chiamata a parte perché la scheda è già grande e i canali servono solo
 * quando si apre quella scheda.
 */
export function useCanaliCliente(serviceClientId: string | null, da?: string, a?: string) {
  return useQuery({
    queryKey: ["clienti-marketing", "canali", serviceClientId, da ?? null, a ?? null],
    enabled: !!serviceClientId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CanaleScheda[]> => {
      const { data, error } = await db.rpc("admin_cliente_marketing_canali", {
        p_service_client_id: serviceClientId, p_da: da ?? null, p_a: a ?? null,
      });
      if (error) throw error;
      return ((data ?? []) as CanaleScheda[]).map((c) => ({
        ...c,
        spesa: Number(c.spesa) || 0,
        spesa_importata: Number(c.spesa_importata) || 0,
        spesa_a_mano: Number(c.spesa_a_mano) || 0,
        valore: Number(c.valore) || 0,
        copertura: n(c.copertura), interazioni: n(c.interazioni), click: n(c.click), impression: n(c.impression),
        cpm: n(c.cpm), cpc: n(c.cpc), cpl: n(c.cpl), cpa: n(c.cpa), roas: n(c.roas),
      }));
    },
  });
}

/** Scrive la riga del diario di una settimana. Il campo lasciato a null non si tocca. */
export function useSalvaDiario(serviceClientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { settimana?: string | null; trend?: string | null; cosa_fare?: string | null; esito?: string | null; chiusa?: boolean | null }) => {
      const { data, error } = await db.rpc("admin_mkt_diario_salva", {
        p_service_client_id: serviceClientId,
        p_settimana: v.settimana ?? null,
        p_trend: v.trend ?? null,
        p_cosa_fare: v.cosa_fare ?? null,
        p_esito: v.esito ?? null,
        p_chiusa: v.chiusa ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["clienti-marketing", "scheda"] }); },
  });
}

/** Chi può seguire un cliente: le persone con un ruolo di piattaforma. */
export function useResponsabili(attivo: boolean) {
  return useQuery({
    queryKey: ["clienti-marketing", "responsabili"],
    enabled: attivo,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Array<{ id: string; nome: string; email: string | null; clienti: number }>> => {
      const { data, error } = await db.rpc("admin_mkt_responsabili");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string; email: string | null; clienti: number }>;
    },
  });
}

/** Assegna (o toglie) il responsabile di un contratto. */
export function useAssegnaResponsabile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { serviceClientId: string; userId: string | null }) => {
      const { data, error } = await db.rpc("admin_service_client_responsabile", {
        p_service_client_id: v.serviceClientId, p_user_id: v.userId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["clienti-marketing"] }); },
  });
}

/** Le righe del giorno per giorno in CSV, con le intestazioni del report del titolare. */
export function csvGiorni(giorni: GiornoScheda[], nomeCliente: string): string {
  const testa = ["Data", "Copertura", "Interazione", "CPM", "Lead", "Link Clicks", "Spesa", "Cost Per Click", "Cost Per Lead", "Frequenza", "Campagne Attive", "Lead CRM", "Lavorati", "Appuntamenti", "Vendite", "Valore"];
  const num = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
  const righe = [...giorni].sort((x, y) => x.giorno.localeCompare(y.giorno)).map((g) => [
    g.giorno, num(g.copertura), num(g.interazioni), num(g.cpm), num(g.lead_dichiarati), num(g.click),
    num(g.spesa), num(g.cpc), num(g.cpl), num(g.frequenza), num(g.campagne_attive),
    num(g.lead), num(g.lavorate), num(g.appuntamenti), num(g.vendite), num(g.valore),
  ].join(";"));
  return [`Report giornaliero ${nomeCliente}`, testa.join(";"), ...righe].join("\n");
}
