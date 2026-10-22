/**
 * Contabilità dei lavori pubblici della commessa: impostazioni, libretto delle
 * misure, SAL, certificati di pagamento, perizie di variante. Le regole stanno
 * nel database (20281023053000, 20281023054000); i calcoli in
 * src/lib/computo/contabilitaLavori.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { CalcoloSal, ModoSicurezza, RigaMisura, RigaRegistro } from "@/lib/computo/contabilitaLavori";

export interface ImpostazioniContabilita {
  id?: string;
  ritenuta_percentuale: number;
  anticipazione_percentuale: number;
  aliquota_iva: number;
  split_payment: boolean;
  sicurezza_modo: ModoSicurezza;
  direttore_lavori: string | null;
  rup: string | null;
  impresa: string | null;
  contratto_estremi: string | null;
  contratto_data: string | null;
  consegna_lavori: string | null;
}

export const IMPOSTAZIONI_PREDEFINITE: ImpostazioniContabilita = {
  ritenuta_percentuale: 0.5, anticipazione_percentuale: 0, aliquota_iva: 10, split_payment: true, sicurezza_modo: "proporzionale",
  direttore_lavori: null, rup: null, impresa: null, contratto_estremi: null, contratto_data: null, consegna_lavori: null,
};

export interface AllegatoLibretto { path: string; nome: string }

export interface RegistrazioneLibrettoDb {
  id: string;
  numero: number;
  data: string;
  voce_id: string;
  voce_radice: string;
  computo_upload_id: string;
  righe: RigaMisura[];
  quantita: number;
  annotazioni: string | null;
  allegati: AllegatoLibretto[];
  firmatario: string | null;
  firmato_at: string | null;
  sal_id: string | null;
  created_at: string;
}

export interface SalDb extends CalcoloSal {
  id: string;
  numero: number;
  data: string;
  lavori_a_tutto: string;
  stato: "bozza" | "approvato";
  ribasso_percentuale: number;
  sicurezza_modo: ModoSicurezza;
  note: string | null;
  approvato_at: string | null;
}

export interface SalVoceDb {
  id: string; sal_id: string; voce_radice: string; ordine: number; numero: string | null; tariffa: string | null; descrizione: string | null;
  unita_misura: string | null; is_sicurezza: boolean; prezzo: number; prezzo_ribassato: number;
  quantita_contratto: number; quantita_precedente: number; quantita_a_oggi: number; importo_a_oggi: number;
}

export interface CertificatoDb {
  id: string; sal_id: string; numero: number; data: string; imponibile: number; aliquota_iva: number; iva: number; totale: number;
  split_payment: boolean; da_pagare_impresa: number; note: string | null;
}

const num = (v: unknown) => (v == null ? 0 : Number(v));
const chiave = (orderId: string | undefined) => ["contabilita-lp", orderId];

export function useImpostazioniContabilita(orderId: string | undefined) {
  return useQuery({
    queryKey: [...chiave(orderId), "impostazioni"],
    enabled: !!orderId,
    queryFn: async (): Promise<ImpostazioniContabilita> => {
      const { data, error } = await supabase.from("lp_contabilita").select("*").eq("order_id", orderId!).maybeSingle();
      if (error) throw error;
      if (!data) return IMPOSTAZIONI_PREDEFINITE;
      return { ...data, ritenuta_percentuale: num(data.ritenuta_percentuale), anticipazione_percentuale: num(data.anticipazione_percentuale),
        aliquota_iva: num(data.aliquota_iva), sicurezza_modo: data.sicurezza_modo as ModoSicurezza };
    },
  });
}

export function useSalvaImpostazioni(orderId: string, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (imp: ImpostazioniContabilita) => {
      const { id: _id, ...resto } = imp;
      const { error } = await supabase.from("lp_contabilita")
        .upsert({ ...resto, order_id: orderId, company_id: companyId, updated_at: new Date().toISOString() }, { onConflict: "order_id" });
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiave(orderId) }),
  });
}

export function useLibretto(orderId: string | undefined) {
  return useQuery({
    queryKey: [...chiave(orderId), "libretto"],
    enabled: !!orderId,
    queryFn: async () => {
      const tutte: RegistrazioneLibrettoDb[] = [];
      for (let da = 0; ; da += 1000) {
        const { data, error } = await supabase.from("lp_libretto")
          .select("id, numero, data, voce_id, voce_radice, computo_upload_id, righe, quantita, annotazioni, allegati, firmatario, firmato_at, sal_id, created_at")
          .eq("order_id", orderId!).order("data").order("numero").range(da, da + 999);
        if (error) throw error;
        tutte.push(...(data ?? []).map(r => ({ ...r, quantita: num(r.quantita),
          righe: (Array.isArray(r.righe) ? r.righe : []) as unknown as RigaMisura[],
          allegati: (Array.isArray(r.allegati) ? r.allegati : []) as unknown as AllegatoLibretto[] })));
        if (!data || data.length < 1000) break;
      }
      return tutte;
    },
  });
}

export interface NuovaRegistrazione {
  voce_id: string;
  data: string;
  righe: RigaMisura[];
  annotazioni: string | null;
  firmatario: string | null;
  firma: boolean;
  foto: File[];
}

export function useRegistraMisura(orderId: string, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: NuovaRegistrazione) => {
      const allegati: AllegatoLibretto[] = [];
      for (const f of r.foto) {
        if (f.size > 15 * 1024 * 1024) throw new Error(`«${f.name}» supera 15 MB.`);
        const path = `${companyId}/${orderId}/libretto/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
        const { error } = await supabase.storage.from("foto-cantiere").upload(path, f);
        if (error) throw new Error(`Foto non caricata: ${error.message}`);
        allegati.push({ path, nome: f.name });
      }
      const { error } = await supabase.from("lp_libretto").insert({
        company_id: companyId, order_id: orderId, voce_id: r.voce_id, data: r.data, righe: r.righe as unknown as Json,
        annotazioni: r.annotazioni, firmatario: r.firmatario, firmato_at: r.firma ? new Date().toISOString() : null,
        allegati: allegati as unknown as Json,
      });
      if (error) {
        if (allegati.length) await supabase.storage.from("foto-cantiere").remove(allegati.map(a => a.path));
        throw new Error(error.message);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiave(orderId) }),
  });
}

export function useFirmaRegistrazione(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, firmatario }: { id: string; firmatario: string }) => {
      const { error } = await supabase.from("lp_libretto").update({ firmatario, firmato_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiave(orderId) }),
  });
}

export function useEliminaRegistrazione(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Pick<RegistrazioneLibrettoDb, "id" | "allegati">) => {
      const { error } = await supabase.from("lp_libretto").delete().eq("id", r.id);
      if (error) throw new Error(error.message);
      if (r.allegati.length) await supabase.storage.from("foto-cantiere").remove(r.allegati.map(a => a.path));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiave(orderId) }),
  });
}

export async function apriAllegato(path: string) {
  const { data, error } = await supabase.storage.from("foto-cantiere").createSignedUrl(path, 600);
  if (error || !data) throw new Error(error?.message ?? "Allegato non disponibile.");
  window.open(data.signedUrl, "_blank", "noopener");
}

export function useSal(orderId: string | undefined) {
  return useQuery({
    queryKey: [...chiave(orderId), "sal"],
    enabled: !!orderId,
    queryFn: async () => {
      const [{ data: sal, error }, { data: cert, error: e2 }] = await Promise.all([
        supabase.from("lp_sal").select("*").eq("order_id", orderId!).order("numero"),
        supabase.from("lp_certificati_pagamento").select("*").eq("order_id", orderId!).order("numero"),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      const numerici = ["ribasso_percentuale", "ritenuta_percentuale", "anticipazione_percentuale", "lavori_lordo", "ribasso", "lavori_netti",
        "sicurezza", "totale_a_oggi", "ritenuta", "anticipazione", "recupero_anticipazione", "netto_a_oggi", "sal_precedenti", "importo_sal"] as const;
      return {
        sal: (sal ?? []).map(s => {
          const out = { ...s } as unknown as SalDb;
          for (const k of numerici) (out as unknown as Record<string, number>)[k] = num(s[k]);
          return out;
        }),
        certificati: (cert ?? []).map(c => ({ ...c, imponibile: num(c.imponibile), aliquota_iva: num(c.aliquota_iva), iva: num(c.iva),
          totale: num(c.totale), da_pagare_impresa: num(c.da_pagare_impresa) })) as CertificatoDb[],
      };
    },
  });
}

export async function caricaVociSal(salId: string): Promise<SalVoceDb[]> {
  const { data, error } = await supabase.from("lp_sal_voci").select("*").eq("sal_id", salId).order("ordine");
  if (error) throw new Error(error.message);
  return (data ?? []).map(v => ({ ...v, prezzo: num(v.prezzo), prezzo_ribassato: num(v.prezzo_ribassato), quantita_contratto: num(v.quantita_contratto),
    quantita_precedente: num(v.quantita_precedente), quantita_a_oggi: num(v.quantita_a_oggi), importo_a_oggi: num(v.importo_a_oggi) }));
}

export function useEmettiSal(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ calcolo, dati, righe, precedenti }: {
      calcolo: CalcoloSal; dati: { data: string; lavori_a_tutto: string; sicurezza_modo: ModoSicurezza; note: string | null };
      righe: RigaRegistro[]; precedenti: Map<string, number>;
    }) => {
      const voci = righe.filter(r => r.quantita !== 0 || (precedenti.get(r.radice) ?? 0) !== 0).map((r, i) => ({
        voce_radice: r.radice, ordine: i + 1, numero: r.numero, tariffa: r.tariffa, descrizione: r.descrizione.slice(0, 2000),
        unita_misura: r.unita_misura, is_sicurezza: r.is_sicurezza, prezzo: r.prezzo, prezzo_ribassato: r.prezzo_ribassato,
        quantita_contratto: r.quantita_contratto, quantita_precedente: precedenti.get(r.radice) ?? 0, quantita_a_oggi: r.quantita,
        importo_a_oggi: r.importo_lordo,
      }));
      const { data, error } = await supabase.rpc("lp_sal_emetti", {
        p_order_id: orderId, p_sal: { ...calcolo, ...dati } as unknown as Json, p_voci: voci as unknown as Json,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiave(orderId) }),
  });
}

export function useApprovaSal(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("lp_sal").update({ stato: "approvato" }).eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("Approva il SAL chi ha «Ordini e Commesse» o l'amministratore.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiave(orderId) }),
  });
}

export function useEliminaSal(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lp_sal").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiave(orderId) }),
  });
}

export function useEmettiCertificato(orderId: string, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Omit<CertificatoDb, "id" | "numero">) => {
      const { error } = await supabase.from("lp_certificati_pagamento").insert({ ...c, order_id: orderId, company_id: companyId });
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiave(orderId) }),
  });
}

// ── Varianti ────────────────────────────────────────────────────────────────

export function useCreaVariante(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uploadId, titolo, motivo }: { uploadId: string; titolo: string; motivo: string }) => {
      const { data, error } = await supabase.rpc("computo_crea_variante", { p_upload_id: uploadId, p_titolo: titolo, p_motivo: motivo });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["computo-commessa", orderId] }),
  });
}

export function useApprovaVariante(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("computo_approva_variante", { p_variante_id: id });
      if (error) throw new Error(error.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["computo-commessa", orderId] });
      qc.invalidateQueries({ queryKey: ["computo-commessa-voci"] });
    },
  });
}

/** Scarta una variante non approvata (le voci e le misure se ne vanno con lei). */
export function useScartaVariante(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("computo_uploads").delete().eq("id", id).not("variante_di", "is", null).in("stato", ["bozza", "verificato"]);
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["computo-commessa", orderId] }),
  });
}

export function useModificaVoceVariante(uploadId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, quantita, prezzo }: { id: string; quantita: number; prezzo: number }) => {
      const importo = Math.round(quantita * prezzo * 100) / 100;
      const { error } = await supabase.from("computo_voci_estratte")
        .update({ quantita, prezzo_unitario_computo: prezzo, importo_computo: importo, is_modified: true }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["computo-commessa-voci", uploadId] }),
  });
}

export function useAggiungiNuovoPrezzo(uploadId: string | undefined, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (np: { numero: string; descrizione: string; unita_misura: string; quantita: number; prezzo: number; is_sicurezza: boolean; ordine: number; capitolo: string | null }) => {
      const { error } = await supabase.from("computo_voci_estratte").insert({
        computo_upload_id: uploadId!, company_id: companyId, numero_ordine: np.numero, codice_tariffa: np.numero,
        descrizione_breve: np.descrizione.slice(0, 200), descrizione_estesa: np.descrizione, unita_misura: np.unita_misura,
        quantita: np.quantita, prezzo_unitario_computo: np.prezzo, importo_computo: Math.round(np.quantita * np.prezzo * 100) / 100,
        is_sicurezza: np.is_sicurezza, nuovo_prezzo: true, quadro_voce: "lavori", ordine: np.ordine, super_categoria: np.capitolo,
        confidence: 1, is_included: true,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["computo-commessa-voci", uploadId] }),
  });
}

export function useEliminaNuovoPrezzo(uploadId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("computo_voci_estratte").delete().eq("id", id).eq("nuovo_prezzo", true);
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["computo-commessa-voci", uploadId] }),
  });
}
