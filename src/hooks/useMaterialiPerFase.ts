/**
 * Materiali della commessa divisi per fase di lavoro: fasi, materiali
 * (order_items natura 'materiale'), stato di validazione di ogni fase e
 * copertura degli ordini (bozza / emesso / ricevuto, come planMaterial).
 * Le azioni passano dalle funzioni del database che controllano chi può.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { loadMaterialCoverage } from "@/hooks/useMaterialProcurement";
import { planMaterial } from "@/lib/orders/materialProcurement";
import { createMaterialPurchaseOrder } from "@/lib/orders/createMaterialPurchaseOrder";
import { statoAcquistoMateriale, type StatoAcquistoMateriale } from "@/lib/distinta/fasiMateriali";
import { statoMateriale, type InfoStatoMateriale } from "@/lib/distinta/statoMateriale";
import { eliminabile, eMateriale } from "@/lib/distinta/elencoArticoli";
import type { AzioneFase, StatoMaterialiFase } from "@/lib/distinta/statiFase";
import type { OrigineRiga } from "@/lib/distinta/generaDistinta";

export interface MaterialeFase {
  id: string;
  order_id: string;
  name: string;
  description: string | null;
  quantity: number;
  status: string | null;
  supplier_id: string | null;
  purchase_price: number | null;
  vat_rate: number | null;
  phase_id: string | null;
  unita_misura: string | null;
  specifiche: string | null;
  origine_materiale: "computo" | "planimetria" | "manuale" | null;
  quantita_calcolata: number | null;
  origini: OrigineRiga[] | null;
  locale: string | null;
  supplier_rfq_item_id: string | null;
  stock_item_id: string | null;
  posizioni: { descrizione: string; misure?: string | null; quantita: number }[] | null;
  /** Calcolati dalla copertura degli ordini. */
  stato: StatoAcquistoMateriale;
  ordinabile: boolean;
  avviso: string | null;
  // ── Le altre colonne della riga, per l'elenco unico della commessa ──
  /** materiale (default), lavorazione, descrizione. */
  natura_riga?: string | null;
  article_template_id?: string | null;
  scomposizione_id?: string | null;
  prezzo_fonte?: string | null;
  standard_cost?: number | null;
  delivery_date?: string | null;
  is_paid?: boolean | null;
  deposit_paid?: boolean | null;
  balance_paid?: boolean | null;
  payment_method?: string | null;
  deposit_amount?: number | null;
  balance_amount?: number | null;
  balance_expected_date?: string | null;
  position?: number | null;
  /** Numeri degli ordini d'acquisto che coprono la riga (non annullati). */
  oda?: string[];
  /** Quantità negli ordini emessi. */
  ordinata?: number;
  /**
   * Lo stato sulla scala unica (statoMateriale), con gli ordini e le unità da
   * verificare: è quello che mostrano testata, fasi, filtri e righe.
   */
  scala?: InfoStatoMateriale;
}

export interface FaseMateriali {
  id: string | null;
  nome: string;
  posizione: number;
  validazione: {
    stato: StatoMaterialiFase;
    note_validazione: string | null;
    validata_il: string | null;
    inviata_il: string | null;
  } | null;
  materiali: MaterialeFase[];
}

const COLONNE_MATERIALE =
  "id, order_id, name, description, quantity, status, supplier_id, purchase_price, vat_rate, phase_id, unita_misura, specifiche, origine_materiale, quantita_calcolata, origini, locale, supplier_rfq_item_id, stock_item_id, posizioni, position, " +
  "natura_riga, article_template_id, scomposizione_id, prezzo_fonte, standard_cost, delivery_date, is_paid, deposit_paid, balance_paid, payment_method, " +
  "deposit_amount, balance_amount, balance_expected_date";

export const chiaviMateriali = {
  commessa: (orderId: string) => ["materiali-per-fase", orderId] as const,
};

export function useMaterialiPerFase(orderId: string | undefined) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const query = useQuery({
    queryKey: [...chiaviMateriali.commessa(orderId ?? ""), companyId],
    enabled: !!orderId && !!companyId,
    queryFn: async () => {
      const [fasi, materiali, validazioni] = await Promise.all([
        supabase.from("order_work_phases").select("id, name, position").eq("order_id", orderId!).order("position"),
        // Tutte le righe della commessa: è l'elenco unico (materiali, lavorazioni, descrizioni).
        supabase.from("order_items").select(COLONNE_MATERIALE).eq("order_id", orderId!).order("position"),
        supabase.from("materiali_fasi_validazione").select("phase_id, stato, note_validazione, validata_il, inviata_il").eq("order_id", orderId!),
      ]);
      if (fasi.error) throw fasi.error;
      if (materiali.error) throw materiali.error;
      if (validazioni.error) throw validazioni.error;
      const righe = (materiali.data ?? []) as unknown as Omit<MaterialeFase, "stato" | "ordinabile" | "avviso">[];
      const copertura = await loadMaterialCoverage(companyId!, righe.map((r) => r.id));
      return { fasi: fasi.data ?? [], righe, validazioni: validazioni.data ?? [], copertura };
    },
  });

  const fasi = useMemo<FaseMateriali[]>(() => {
    const d = query.data;
    if (!d) return [];
    const materiali: MaterialeFase[] = d.righe.map((r) => {
      const piano = planMaterial({ ...r, quantity: Number(r.quantity) }, d.copertura);
      const oda = [...new Set(d.copertura
        .filter((c) => c.order_item_id === r.id && c.purchase_orders?.status !== "annullato")
        .map((c) => c.purchase_orders?.oda_number)
        .filter((n): n is string => !!n))];
      const scala = statoMateriale({ ...r, quantity: Number(r.quantity) }, d.copertura);
      return {
        ...r,
        quantity: Number(r.quantity),
        stato: statoAcquistoMateriale({ ...r, drafted: piano.drafted, issued: piano.issued, received: piano.received }),
        scala,
        ordinabile: piano.canOrder && eMateriale(r),
        // Le unità diverse le riassume la testata, una volta sola.
        avviso: eMateriale(r) && !scala.unitaDaVerificare ? piano.review : null,
        oda,
        ordinata: piano.issued,
      };
    });
    const out: FaseMateriali[] = d.fasi.map((f) => {
      const v = d.validazioni.find((x) => x.phase_id === f.id);
      return {
        id: f.id,
        nome: f.name,
        posizione: f.position ?? 0,
        validazione: v ? { stato: v.stato as StatoMaterialiFase, note_validazione: v.note_validazione, validata_il: v.validata_il, inviata_il: v.inviata_il } : null,
        materiali: materiali.filter((m) => m.phase_id === f.id),
      };
    });
    const senza = materiali.filter((m) => !m.phase_id || !d.fasi.some((f) => f.id === m.phase_id));
    if (senza.length) out.push({ id: null, nome: "Senza fase", posizione: 1e9, validazione: null, materiali: senza });
    return out;
  }, [query.data]);

  return { ...query, fasi };
}

function messaggio(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function useAzioniMateriali(orderId: string, orderCode?: string | null) {
  const qc = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id ?? "";
  const aggiorna = () => {
    qc.invalidateQueries({ queryKey: chiaviMateriali.commessa(orderId) });
    // Il riepilogo della commessa legge le stesse righe.
    qc.invalidateQueries({ queryKey: ["order-items", orderId] });
    qc.invalidateQueries({ queryKey: ["material-procurement"] });
    qc.invalidateQueries({ queryKey: ["acquisti-da-fare"] });
  };

  const cambiaStato = useMutation({
    mutationFn: async (p: { phaseId: string; azione: AzioneFase; nota?: string | null }) => {
      const { error } = await supabase.rpc("materiali_fase_cambia_stato", { p_phase: p.phaseId, p_azione: p.azione, p_nota: p.nota ?? undefined });
      if (error) throw error;
    },
    onSuccess: (_d, p) => {
      toast.success(p.azione === "invia_validazione" ? "Inviati al tecnico" : p.azione === "valida" ? "Materiali validati: ora li vede l'ufficio acquisti" : "Rimandati indietro con la nota");
      aggiorna();
    },
    onError: (e) => toast.error(messaggio(e)),
  });

  /** In bozza scrive chi modifica le commesse; in verifica il tecnico passa dalla sua funzione. */
  const aggiornaMateriale = useMutation({
    mutationFn: async (p: { id: string; tecnico: boolean; modifica: { quantity?: number; specifiche?: string | null; unita_misura?: string | null; name?: string } }) => {
      if (p.tecnico) {
        const { error } = await supabase.rpc("materiali_tecnico_aggiorna", {
          p_item: p.id, p_quantita: p.modifica.quantity ?? 0, p_specifiche: p.modifica.specifiche ?? undefined,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("order_items").update(p.modifica).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError: (e) => toast.error(messaggio(e)),
  });

  const spostaInFase = useMutation({
    mutationFn: async (p: { ids: string[]; phaseId: string | null }) => {
      const { error } = await supabase.from("order_items").update({ phase_id: p.phaseId }).in("id", p.ids);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Materiali spostati"); aggiorna(); },
    onError: (e) => toast.error(messaggio(e)),
  });

  const assegnaFornitore = useMutation({
    mutationFn: async (p: { ids: string[]; supplierId: string | null; diretto: boolean }) => {
      // Chi modifica le commesse scrive la riga (il fornitore resta libero
      // anche nelle fasi in verifica); l'ufficio acquisti passa dalla sua
      // funzione, che vale solo per i materiali validati.
      const { error } = p.diretto
        ? await supabase.from("order_items").update({ supplier_id: p.supplierId }).in("id", p.ids)
        : await supabase.rpc("acquisti_assegna_fornitore", { p_items: p.ids, p_fornitore: p.supplierId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Fornitore assegnato"); aggiorna(); },
    onError: (e) => toast.error(messaggio(e)),
  });

  const richiediOfferta = useMutation({
    mutationFn: async (p: { ids: string[]; titolo: string; fornitori: string[] }) => {
      const { data, error } = await supabase.rpc("acquisti_richiedi_offerta", { p_items: p.ids, p_titolo: p.titolo, p_fornitori: p.fornitori });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => { toast.success("Richiesta d'offerta creata"); aggiorna(); qc.invalidateQueries({ queryKey: ["supplier-rfqs"] }); },
    onError: (e) => toast.error(messaggio(e)),
  });

  /** Un ordine (in bozza) per fornitore, con le regole di sempre (createMaterialPurchaseOrder). */
  const creaOrdini = useMutation({
    mutationFn: async (p: { materiali: MaterialeFase[]; orderIdDi?: (m: MaterialeFase) => string; codiceDi?: (m: MaterialeFase) => string | null }) => {
      const senzaFornitore = p.materiali.filter((m) => !m.supplier_id);
      if (senzaFornitore.length) throw new Error(`${senzaFornitore.length} materiali senza fornitore: assegnalo prima di creare l'ordine`);
      const gruppi = new Map<string, MaterialeFase[]>();
      for (const m of p.materiali) {
        const commessa = p.orderIdDi?.(m) ?? orderId;
        const k = `${commessa}|${m.supplier_id}`;
        gruppi.set(k, [...(gruppi.get(k) ?? []), m]);
      }
      const creati: string[] = [];
      for (const [k, gruppo] of gruppi) {
        const [commessa, fornitore] = k.split("|");
        const r = await createMaterialPurchaseOrder({
          companyId, orderId: commessa, orderCode: p.codiceDi?.(gruppo[0]) ?? orderCode, supplierId: fornitore, userId: user?.id,
          items: gruppo.map((m) => ({
            id: m.id, name: m.name, quantity: m.quantity, purchase_price: m.purchase_price, vat_rate: m.vat_rate,
            supplier_id: m.supplier_id, stock_item_id: m.stock_item_id, status: m.status, posizioni: m.posizioni, unita_misura: m.unita_misura,
          })),
        });
        creati.push(r.poId);
      }
      return creati;
    },
    onSuccess: (creati) => {
      toast.success(creati.length === 1 ? "Ordine creato in bozza" : `${creati.length} ordini creati in bozza (uno per fornitore)`);
      aggiorna();
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e) => toast.error(messaggio(e)),
  });

  /**
   * Toglie una riga mai entrata negli acquisti (da ordinare, niente offerta né
   * ordine, non presa dal magazzino): le altre portano via in cascata arrivi e
   * installazioni, e si tolgono da «Modifica commessa».
   */
  const elimina = useMutation({
    mutationFn: async (m: MaterialeFase) => {
      if (!eliminabile(m)) {
        throw new Error("Questa riga è già negli acquisti o in magazzino: si toglie da «Modifica commessa»");
      }
      const { error } = await supabase.from("order_items").delete().eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Riga tolta dalla commessa"); aggiorna(); },
    onError: (e) => toast.error(messaggio(e)),
  });

  /**
   * Scrive sulla riga della commessa l'unità dell'ordine, solo dove è sicuro
   * (statoMateriale.allineaA: 1 pezzo contro 1 «a corpo»). L'ordine non si tocca.
   */
  const allineaUnita = useMutation({
    mutationFn: async (righe: { id: string; unita: string }[]) => {
      const perUnita = new Map<string, string[]>();
      for (const r of righe) perUnita.set(r.unita, [...(perUnita.get(r.unita) ?? []), r.id]);
      for (const [unita, ids] of perUnita) {
        const { error } = await supabase.from("order_items").update({ unita_misura: unita }).in("id", ids);
        if (error) throw error;
      }
      return righe.length;
    },
    onSuccess: (n) => { toast.success(n === 1 ? "Unità allineata" : `${n} unità allineate`); aggiorna(); },
    onError: (e) => toast.error(messaggio(e)),
  });

  return { cambiaStato, aggiornaMateriale, spostaInFase, assegnaFornitore, richiediOfferta, creaOrdini, elimina, allineaUnita };
}
