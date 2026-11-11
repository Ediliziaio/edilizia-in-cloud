import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { esigiRigaSalvata } from "@/lib/fatturazione/salvataggioFattura";
import { abbinamentiCertiPiuOrdini, ordinateNonInBolla, ordiniDellaBolla, type RigaOrdine } from "@/lib/ddt/abbinaRigheOrdine";
import type { DDTRiga } from "@/hooks/useDDTRicezione";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const COLONNE = "id, purchase_order_id, description, sku, unit_of_measure, quantity, quantity_received, riferimento, misure, order_items(gruppo_id, measure_status)";

type RigaLetta = RigaOrdine & { order_items?: { gruppo_id: string | null; measure_status: string | null } | null };
const STATI_APERTI = ["inviato", "confermato", "parziale"];

/**
 * Le righe degli ordini che la bolla può consegnare, senza prezzi: l'ordine collegato, gli altri
 * aperti dello stesso fornitore e quelli già abbinati (anche se nel frattempo chiusi).
 */
export function useAbbinamentoBolla(
  ddtId: string | null | undefined,
  odaId: string | null | undefined,
  righe: DDTRiga[],
  modificabile: boolean,
  fornitoreId?: string | null,
) {
  const queryClient = useQueryClient();
  const invalida = () => queryClient.invalidateQueries({ queryKey: queryKeys.ddtRicezione.righe(ddtId ?? undefined) });

  const giaAbbinate = useMemo(
    () => [...new Set(righe.map((r) => r.purchase_order_item_id).filter((x): x is string => !!x))].sort(),
    [righe],
  );
  const { data: ordine = [] } = useQuery<RigaOrdine[]>({
    queryKey: ["ddt-righe-ordine", odaId, fornitoreId, giaAbbinate],
    enabled: !!odaId || !!fornitoreId,
    staleTime: 60 * 1000,
    placeholderData: (prima) => prima,
    queryFn: async () => {
      let fornitore = fornitoreId ?? null;
      if (!fornitore && odaId) {
        const { data, error } = await db.from("purchase_orders").select("supplier_id").eq("id", odaId).maybeSingle();
        if (error) throw error;
        fornitore = data?.supplier_id ?? null;
      }
      const [aperti, collegati] = await Promise.all([
        fornitore ? loadCatalogPages<{ id: string }>((a, b) => db.from("purchase_orders").select("id").eq("supplier_id", fornitore).in("status", STATI_APERTI).order("id").range(a, b)) : [],
        ddtId ? loadCatalogPages<{ id: string; purchase_order_id: string }>((a, b) => db.from("ddt_ordini_collegati").select("id,purchase_order_id").eq("ddt_id", ddtId).order("purchase_order_id").range(a, b)) : [],
      ]);
      const idOrdini = [...new Set([...(odaId ? [odaId] : []), ...aperti.map((o) => o.id), ...collegati.map((o) => o.purchase_order_id)])];
      const [diOrdini, abbinate] = await Promise.all([
        idOrdini.length ? db.from("purchase_order_items").select(COLONNE).in("purchase_order_id", idOrdini).order("sort_order") : { data: [], error: null },
        giaAbbinate.length ? db.from("purchase_order_items").select(COLONNE).in("id", giaAbbinate) : { data: [], error: null },
      ]);
      if (diOrdini.error) throw diOrdini.error;
      if (abbinate.error) throw abbinate.error;
      const perId = new Map<string, RigaOrdine>();
      for (const { order_items: riga, ...r } of [...(diOrdini.data ?? []), ...(abbinate.data ?? [])] as RigaLetta[]) {
        perId.set(r.id, { ...r, su_misura: !!riga?.gruppo_id || !!riga?.measure_status });
      }
      const tutte = [...perId.values()];
      const ordini = [...new Set(tutte.map((r) => r.purchase_order_id).filter(Boolean))];
      const numeri = ordini.length ? await db.from("purchase_orders").select("id, oda_number").in("id", ordini) : { data: [], error: null };
      if (numeri.error) throw numeri.error;
      const numero = new Map<string, string>((numeri.data ?? []).map((o: { id: string; oda_number: string }) => [o.id, o.oda_number]));
      return tutte.map((r) => ({ ...r, oda_number: numero.get(r.purchase_order_id ?? "") ?? null }));
    },
  });

  const certi = useMemo(() => abbinamentiCertiPiuOrdini(righe, ordine, odaId), [righe, ordine, odaId]);

  // Una volta sola per riga: se il salvataggio non passa non si riprova a ogni giro.
  const tentate = useRef(new Set<string>());
  useEffect(() => {
    if (!modificabile) return;
    const nuove = Object.entries(certi).filter(([riga]) => !tentate.current.has(riga));
    if (nuove.length === 0) return;
    nuove.forEach(([riga]) => tentate.current.add(riga));
    void (async () => {
      const esiti = await Promise.all(nuove.map(([riga, poi]) =>
        db.from("ddt_righe").update({ purchase_order_item_id: poi, abbinamento: "auto" }).eq("id", riga).eq("ddt_ricezione_id", ddtId).is("purchase_order_item_id", null).is("arrivo_registrato_il", null).select("id").maybeSingle()));
      if (esiti.some((e: { data: unknown }) => !!e.data)) {
        invalida(); void queryClient.invalidateQueries({ queryKey: ["ddt-controllo-ordini"] });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certi, modificabile]);

  /** Scelta di una persona: `null` vuol dire «non è merce di questo ordine». */
  const abbina = useMutation({
    mutationFn: async ({ riga, poi }: { riga: string; poi: string | null }) => {
      esigiRigaSalvata(await db.from("ddt_righe").update({ purchase_order_item_id: poi, abbinamento: "manuale" }).eq("id", riga).eq("ddt_ricezione_id", ddtId).select("id").maybeSingle());
    },
    onSuccess: () => { invalida(); void queryClient.invalidateQueries({ queryKey: ["ddt-controllo-ordini"] }); },
    onError: (e: Error) => toast.error("Abbinamento non salvato", { description: e.message }),
  });

  /** Porta le quantità della bolla sugli ordini. Il controllo vero lo fa il database. */
  const registraArrivo = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("bolla_registra_arrivo", { p_ddt: ddtId });
      if (error) throw error;
      return data as { ordini: number; righe: number; errori: Array<{ errore?: string }> };
    },
    onSuccess: (esito) => {
      invalida();
      for (const k of [queryKeys.ddtRicezione.all, queryKeys.purchaseOrders.all, ["ddt-righe-ordine"], ["arrivo-elenco"]]) {
        void queryClient.invalidateQueries({ queryKey: k });
      }
      const problemi = esito.errori.filter((e) => e.errore !== "gia_completa").length;
      if (problemi > 0) toast.warning(`Registrate ${esito.righe} righe, ${problemi} non registrate`);
      else if (esito.righe === 0) toast.info("Era già tutto registrato sugli ordini");
      else toast.success(`Arrivo registrato su ${esito.ordini === 1 ? "1 ordine" : `${esito.ordini} ordini`}`);
    },
    onError: (e: Error) => toast.error("Arrivo non registrato", { description: e.message }),
  });

  return {
    ordine,
    abbina,
    registraArrivo,
    nonInBolla: useMemo(() => ordinateNonInBolla(righe, ordine, odaId), [righe, ordine, odaId]),
    ordiniToccati: useMemo(() => ordiniDellaBolla(righe, ordine, odaId), [righe, ordine, odaId]),
  };
}
