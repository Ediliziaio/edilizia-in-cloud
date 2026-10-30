// src/hooks/useGeneraleContratto.ts
// Il contratto della commessa generale: lettura in una chiamata (generale_contratto_leggi) e
// salvataggi di contratto, atti aggiuntivi e garanzie. I documenti degli atti e delle garanzie
// vanno nell'archivio della generale (order_attachments), come ogni altro documento di commessa.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { chiaviGenerali } from "@/hooks/useCommesseGenerali";
import { caricaDocumentoCommessa } from "@/lib/commesse/caricaDocumentoCommessa";
import {
  contrattoPerDb, leggiDatiContratto,
  type ContrattoGenerale, type DatiContratto, type TipoAtto, type TipoGaranzia,
} from "@/lib/orders/generali/contratto";

// Tabelle e RPC del contratto non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviContratto = {
  tutto: (generaleId: string | undefined) => ["generale-contratto", generaleId] as const,
  dati: (generaleId: string | undefined) => ["generale-contratto", generaleId, "dati"] as const,
  elenco: (generaleId: string | undefined) => ["generale-contratto", generaleId, "elenco"] as const,
  computo: (generaleId: string | undefined) => ["generale-contratto", generaleId, "computo"] as const,
  misure: (generaleId: string | undefined) => ["generale-contratto", generaleId, "misure"] as const,
  anteprima: (generaleId: string | undefined, al: string, avanzamenti: string) =>
    ["generale-contratto", generaleId, "anteprima", al, avanzamenti] as const,
};

/** Dopo ogni salvataggio: il contratto e i numeri della generale (il valore viene dal contratto). */
export function useAggiornaDopo(generaleId: string) {
  const qc = useQueryClient();
  return (anche: { ordini?: boolean } = {}) => {
    void qc.invalidateQueries({ queryKey: chiaviContratto.tutto(generaleId) });
    void qc.invalidateQueries({ queryKey: chiaviGenerali.riepilogo(generaleId) });
    if (anche.ordini) void qc.invalidateQueries({ queryKey: ["orders"] });
  };
}

/** Tutto il contratto in una lettura: dati, atti, garanzie, SAL con le voci, fatture. */
export function useDatiContratto(generaleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chiaviContratto.dati(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<DatiContratto> => {
      const { data, error } = await db.rpc("generale_contratto_leggi", { p_generale_id: generaleId });
      if (error) throw error;
      return leggiDatiContratto(data);
    },
  });
}

export function useSalvaContratto(generaleId: string) {
  const { effectiveCompany } = useAuth();
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (c: ContrattoGenerale) => {
      if (!effectiveCompany?.id) throw new Error("Seleziona un’azienda prima di salvare.");
      // L'azienda la riscrive il database da quella della generale.
      const { error } = await db
        .from("generale_contratti")
        .upsert({ generale_id: generaleId, company_id: effectiveCompany.id, ...contrattoPerDb(c) }, { onConflict: "generale_id" });
      if (error) throw error;
    },
    onSuccess: () => dopo({ ordini: true }),
  });
}

/** Un file nell'archivio della generale; restituisce l'id della riga in order_attachments. */
async function caricaAllegato(generaleId: string, companyId: string, userId: string, file: File | null | undefined) {
  if (!file) return undefined;
  const { id } = await caricaDocumentoCommessa({ orderId: generaleId, companyId, userId, file });
  return id;
}

export interface AttoDaSalvare {
  id?: string;
  tipo: TipoAtto;
  numero: string | null;
  data: string;
  descrizione: string;
  importo: number;
  giorniProroga: number;
  file?: File | null;
}

export function useSalvaAtto(generaleId: string) {
  const { effectiveCompany, user } = useAuth();
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (a: AttoDaSalvare) => {
      if (!effectiveCompany?.id || !user?.id) throw new Error("Seleziona un’azienda prima di salvare.");
      const allegatoId = await caricaAllegato(generaleId, effectiveCompany.id, user.id, a.file);
      const riga = {
        generale_id: generaleId, company_id: effectiveCompany.id, tipo: a.tipo, numero: a.numero, data: a.data,
        descrizione: a.descrizione, importo: a.tipo === "proroga" ? 0 : a.importo, giorni_proroga: a.giorniProroga,
        ...(allegatoId ? { allegato_id: allegatoId } : {}),
      };
      const { error } = a.id
        ? await db.from("generale_contratto_atti").update(riga).eq("id", a.id)
        : await db.from("generale_contratto_atti").insert(riga);
      if (error) throw error;
    },
    onSuccess: () => dopo({ ordini: true }),
  });
}

export function useEliminaAtto(generaleId: string) {
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("generale_contratto_atti").delete().eq("id", id).eq("generale_id", generaleId);
      if (error) throw error;
    },
    onSuccess: () => dopo({ ordini: true }),
  });
}

export interface GaranziaDaSalvare {
  id?: string;
  tipo: TipoGaranzia;
  garante: string | null;
  numero: string | null;
  importo: number | null;
  dataEmissione: string | null;
  scadenza: string | null;
  svincolataIl: string | null;
  note: string | null;
  file?: File | null;
}

export function useSalvaGaranzia(generaleId: string) {
  const { effectiveCompany, user } = useAuth();
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (g: GaranziaDaSalvare) => {
      if (!effectiveCompany?.id || !user?.id) throw new Error("Seleziona un’azienda prima di salvare.");
      const allegatoId = await caricaAllegato(generaleId, effectiveCompany.id, user.id, g.file);
      const riga = {
        generale_id: generaleId, company_id: effectiveCompany.id, tipo: g.tipo, garante: g.garante, numero: g.numero,
        importo: g.importo, data_emissione: g.dataEmissione, scadenza: g.scadenza, svincolata_il: g.svincolataIl, note: g.note,
        ...(allegatoId ? { allegato_id: allegatoId } : {}),
      };
      const { error } = g.id
        ? await db.from("generale_contratto_garanzie").update(riga).eq("id", g.id)
        : await db.from("generale_contratto_garanzie").insert(riga);
      if (error) throw error;
    },
    onSuccess: () => dopo(),
  });
}

export function useEliminaGaranzia(generaleId: string) {
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("generale_contratto_garanzie").delete().eq("id", id).eq("generale_id", generaleId);
      if (error) throw error;
    },
    onSuccess: () => dopo(),
  });
}
