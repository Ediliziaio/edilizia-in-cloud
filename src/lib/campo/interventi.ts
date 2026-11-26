/**
 * Interventi brevi dal telefono (26/11/2026): manutenzioni e assistenze assegnate al tecnico (o alla sua squadra),
 * lette dalle richieste di assistenza. Il server decide cosa è «mio» e cosa vuole l'azienda (firma, stato finale).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface InterventoCampo {
  id: string;
  titolo: string | null;
  descrizione: string | null;
  tipo: string | null;
  tipo_intervento: string | null;
  durata_stimata_h: number | null;
  stato: string;
  priorita: string | null;
  quando: string;
  indirizzo: string | null;
  lat: number | null;
  lng: number | null;
  order_id: string | null;
  order_code: string | null;
  merce_richiesta: boolean | null;
  merce_stato: string | null;
  cliente: { nome: string | null; telefono: string | null } | null;
  impianto: { tipo: string | null; marca: string | null; modello: string | null; matricola: string | null; installato: string | null; note: string | null } | null;
  iniziato_at: string | null;
  finito_at: string | null;
  firma_obbligatoria: boolean;
}

type Rpc = "campo_miei_interventi" | "campo_intervento_inizia" | "campo_intervento_chiudi" | "campo_intervento_rapporti" | "campo_vedo_telefono_clienti";
export const dbInterventi = () => supabase as unknown as {
  rpc: (nome: Rpc, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Stati che per il tecnico vogliono dire «fatto»: il resto lo decide l'ufficio. */
const STATI_FATTI = new Set(["risolto", "da_fatturare", "chiuso"]);
export const interventoFatto = (i: Pick<InterventoCampo, "stato" | "finito_at">) => !!i.finito_at || STATI_FATTI.has(i.stato);
export const interventoIniziato = (i: Pick<InterventoCampo, "stato" | "iniziato_at">) => !!i.iniziato_at || i.stato === "in_lavorazione";

/** Giorno di calendario a Roma (AAAA-MM-GG) di un istante. */
export function giornoRoma(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
export function oraRoma(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
export function spostaGiorno(giorno: string, giorni: number): string {
  const d = new Date(`${giorno}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

export function useMieiInterventi(dal: string, al: string) {
  const { user } = useAuth();
  return useQuery<InterventoCampo[]>({
    queryKey: ["campo-interventi", user?.id, dal, al],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await dbInterventi().rpc("campo_miei_interventi", { p_dal: dal, p_al: al });
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? (data as InterventoCampo[]) : [];
    },
  });
}

/** Il prossimo intervento da fare dopo quello indicato, nello stesso giorno. */
export function prossimoIntervento(lista: InterventoCampo[], dopoId: string): InterventoCampo | null {
  const qui = lista.find(i => i.id === dopoId);
  const giorno = qui ? giornoRoma(qui.quando) : null;
  return lista.filter(i => i.id !== dopoId && !interventoFatto(i) && (!giorno || giornoRoma(i.quando) === giorno))
    .sort((a, b) => a.quando.localeCompare(b.quando))[0] ?? null;
}

export const linkMappa = (indirizzo: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(indirizzo)}`;

/** Un rapporto dell'intervento: una visita di un tecnico, o il rapporto scritto dall'ufficio. */
export interface RapportoIntervento {
  id: string; chi: string | null; mio: boolean; dall_ufficio: boolean; iniziato_at: string | null; finito_at: string | null;
  note: string | null; ore: number | null; materiali: string | null; foto: number; firmato_da: string | null;
}

export function useRapportiIntervento(ticketId: string | undefined) {
  return useQuery<RapportoIntervento[]>({
    queryKey: ["campo-intervento-rapporti", ticketId],
    enabled: !!ticketId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await dbInterventi().rpc("campo_intervento_rapporti", { p_ticket: ticketId });
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? (data as RapportoIntervento[]) : [];
    },
  });
}

/** Io vedo il telefono dei clienti? Lo decide l'azienda (tutti / chi ha la spunta nella scheda / nessuno). */
export function useVedoTelefonoClienti() {
  const { user } = useAuth();
  return useQuery<boolean>({
    queryKey: ["campo-vedo-telefono-clienti", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await dbInterventi().rpc("campo_vedo_telefono_clienti", {});
      if (error) return false; // nel dubbio non si mostra
      return data !== false;
    },
  });
}
