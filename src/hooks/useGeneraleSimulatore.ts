// src/hooks/useGeneraleSimulatore.ts
// Le ipotesi del simulatore prima dell'acquisto (generale_ipotesi) e «Diventa operazione»
// (generale_ipotesi_diventa_operazione). I conti stanno in src/lib/orders/generali/simulatore.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isModelloSimulato, leggiIpotesi, type Ipotesi, type ModelloSimulato } from "@/lib/orders/generali/simulatore";
import type { OperazioneDaCreare } from "@/lib/orders/generali/simulatoreOperazione";
import type { StoredContractFile } from "@/lib/orders/contractPreparation";
import { collegaOriginaleAi } from "@/lib/orders/documentImportAi";
import { aggiornaDatiPlanimetria, caricaPlanimetria, caricaVersione, chiaviPlanimetrie } from "@/lib/planimetrie/archivio";

// Tabella e RPC non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviSimulatore = {
  elenco: (companyId: string | undefined) => ["generale-ipotesi", companyId] as const,
  dettaglio: (companyId: string | undefined, id: string | null) => ["generale-ipotesi-dettaglio", companyId, id] as const,
  origine: (companyId: string | undefined, generaleId?: string) => ["generale-ipotesi-origine", companyId, generaleId] as const,
};

export interface IpotesiSalvata {
  id: string;
  nome: string;
  modello: ModelloSimulato;
  ipotesi: Ipotesi;
  generaleId: string | null;
  creataIl: string;
  aggiornataIl: string;
}

const meseOggi = () => new Date().toISOString().slice(0, 7);
const COLONNE_IPOTESI = "id, nome, modello, dati, generale_id, created_at, updated_at";

function leggiSalvata(r: Record<string,unknown>): IpotesiSalvata | null {
  if (!isModelloSimulato(r.modello) || typeof r.id!=="string") return null;
  return {
    id:r.id, nome:typeof r.nome==="string" && r.nome ? r.nome : "Ipotesi", modello:r.modello,
    ipotesi:leggiIpotesi(r.dati,r.modello,meseOggi()),
    generaleId:typeof r.generale_id==="string" ? r.generale_id : null,
    creataIl:r.created_at as string, aggiornataIl:r.updated_at as string,
  };
}

export function useIpotesiSalvate(abilitato = true) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: chiaviSimulatore.elenco(companyId),
    enabled: !!companyId && abilitato,
    staleTime: 30_000,
    queryFn: async (): Promise<IpotesiSalvata[]> => {
      const { data, error } = await db
        .from("generale_ipotesi")
        .select(COLONNE_IPOTESI)
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as Record<string,unknown>[]).map(leggiSalvata).filter((r): r is IpotesiSalvata => r !== null);
    },
  });
}

export function useIpotesiSalvata(id: string | null, abilitata: boolean) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey:chiaviSimulatore.dettaglio(companyId,id),
    enabled:!!companyId && !!id && abilitata,
    queryFn:async()=>{
      const { data,error } = await db.from("generale_ipotesi").select(COLONNE_IPOTESI)
        .eq("company_id",companyId).eq("id",id).maybeSingle();
      if (error) throw error;
      return data ? leggiSalvata(data) : null;
    },
  });
}

export function useIpotesiOrigineCommessa(generaleId: string | undefined, abilitata: boolean) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey:chiaviSimulatore.origine(companyId,generaleId),
    enabled:!!companyId && !!generaleId && abilitata,
    queryFn:async()=>{
      const {data,error} = await db.from("generale_ipotesi").select("id")
        .eq("company_id",companyId).eq("generale_id",generaleId)
        .order("updated_at",{ascending:false}).limit(1).maybeSingle();
      if (error) throw error;
      return typeof data?.id==="string" ? data.id : null;
    },
  });
}

/** Salva un'ipotesi: nuova senza id, altrimenti la aggiorna. Restituisce l'id. */
export function useSalvaIpotesi() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string | null; nome: string; ipotesi: Ipotesi }): Promise<string> => {
      if (!companyId) throw new Error("Seleziona un’azienda prima di salvare.");
      const riga = { nome: v.nome.trim().slice(0, 200) || "Ipotesi", modello: v.ipotesi.modello, dati: v.ipotesi };
      if (v.id) {
        const { error } = await db.from("generale_ipotesi").update(riga).eq("company_id",companyId).eq("id", v.id);
        if (error) throw error;
        return v.id;
      }
      const { data, error } = await db.from("generale_ipotesi").insert({ ...riga, company_id: companyId }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: id => {
      void qc.invalidateQueries({ queryKey:chiaviSimulatore.elenco(companyId) });
      void qc.invalidateQueries({ queryKey:chiaviSimulatore.dettaglio(companyId,id) });
    },
  });
}

export function useEliminaIpotesi() {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("generale_ipotesi").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r,id) => {
      void qc.invalidateQueries({ queryKey:chiaviSimulatore.elenco(effectiveCompany?.id) });
      void qc.invalidateQueries({ queryKey:chiaviSimulatore.dettaglio(effectiveCompany?.id,id) });
      void qc.invalidateQueries({ queryKey:["generale-ipotesi-origine",effectiveCompany?.id] });
    },
  });
}

/** Crea la commessa e registra i collegamenti alla versione di progetto, se presenti. */
export function useDiventaOperazione() {
  const { effectiveCompany, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { ipotesiId: string; operazione: OperazioneDaCreare; origine?: StoredContractFile; planimetria?: Ipotesi["planimetria"] }): Promise<{id:string;avviso?:string}> => {
      if (v.origine && (!effectiveCompany?.id || !user?.id)) throw new Error("Sessione non disponibile per conservare l’originale.");
      const fonte = v.planimetria;
      let pianta: Awaited<ReturnType<typeof caricaPlanimetria>> | undefined;
      if (fonte) {
        if (!fonte.confermata) throw new Error("Conferma i dati della variante prima di creare la commessa.");
        pianta = await caricaPlanimetria(fonte.planimetriaId);
        if (pianta.riga.company_id !== effectiveCompany?.id) throw new Error("La planimetria non appartiene a questa azienda.");
        const versione = pianta.versione.numero === fonte.versione ? pianta.versione : await caricaVersione(fonte.planimetriaId,fonte.versione);
        if (!versione.documento.livelli.some(l=>l.proposte.some(p=>p.id===fonte.varianteId))) throw new Error("Variante non disponibile in questa versione.");
      }
      const { data, error } = await db.rpc("generale_ipotesi_diventa_operazione", {
        p_ipotesi_id: v.ipotesiId,
        p_nome: v.operazione.nome,
        p_valore: v.operazione.valore,
        p_voci: v.operazione.voci,
        p_fonti: v.operazione.fonti,
        p_unita: v.operazione.unita.length ? v.operazione.unita : null,
      });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("L'operazione non risulta creata. Ricarica la pagina.");
      const avvisi: string[] = [];
      if (v.operazione.dati && Object.keys(v.operazione.dati).length > 0) {
        try {
          const risposta = await db.rpc("commessa_generale_dati_salva", { p_generale_id: data, p_dati: v.operazione.dati });
          if (risposta.error) throw risposta.error;
        } catch { avvisi.push("I dati aggiuntivi della commessa richiedono un nuovo salvataggio."); }
      }
      if (v.origine) await collegaOriginaleAi(supabase, data, effectiveCompany!.id, user!.id, v.origine);
      if (pianta && !pianta.riga.order_id) {
        try {
          await aggiornaDatiPlanimetria(pianta.riga.id,{orderId:data},{companyId:pianta.riga.company_id,updatedAt:pianta.riga.updated_at});
        } catch { avvisi.push("Il collegamento dalla scheda della planimetria va completato."); }
      }
      return {id:data,...(avvisi.length ? {avviso:avvisi.join(" ")} : {})};
    },
    onSuccess: (r, v) => {
      void qc.invalidateQueries({ queryKey: chiaviSimulatore.elenco(effectiveCompany?.id) });
      void qc.invalidateQueries({ queryKey:chiaviSimulatore.dettaglio(effectiveCompany?.id,v.ipotesiId) });
      void qc.invalidateQueries({ queryKey:chiaviSimulatore.origine(effectiveCompany?.id,r.id) });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      if (v.planimetria) {
        void qc.invalidateQueries({queryKey:chiaviPlanimetrie.dettaglio(v.planimetria.planimetriaId)});
        void qc.invalidateQueries({queryKey:["planimetrie","elenco"]});
      }
    },
  });
}
