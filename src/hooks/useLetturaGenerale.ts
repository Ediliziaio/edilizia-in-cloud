// Commessa generale dai documenti: la lettura vera, dal database (lotto 1 del piano
// docs/piano-commessa-generale-da-documenti.md). Si interroga ogni 2 secondi finché lavora;
// a lettura finita o in pausa si ferma.
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { COLONNE_LETTURA, COLONNE_PAGINA, letturaFerma, type RigaLettura, type RigaPagina } from "@/lib/orders/generali/daDocumenti/foto";

// Tabelle nuove: i tipi generati arrivano col prossimo giro di scripts/genera-tipi-database.mjs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const LAVORA = new Set(["in_lettura", "estrazione"]);

export const chiaveLettura = (id: string | null) => ["generale-lettura", id] as const;

export function useLetturaGenerale(id: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: chiaveLettura(id),
    enabled: !!id,
    queryFn: async () => {
      const [l, p] = await Promise.all([
        db.from("generale_letture").select(COLONNE_LETTURA).eq("id", id).maybeSingle(),
        db.from("generale_lettura_pagine").select(COLONNE_PAGINA).eq("lettura_id", id).order("file_id").order("numero").limit(2000),
      ]);
      if (l.error) throw new Error(l.error.message);
      if (p.error) throw new Error(p.error.message);
      return { lettura: l.data as RigaLettura | null, pagine: (p.data ?? []) as RigaPagina[] };
    },
    refetchInterval: (query) => (query.state.data?.lettura && LAVORA.has(query.state.data.lettura.stato) ? 2000 : false),
  });

  const avvia = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generale-documenti-leggi", { body: { modo: "avvia", lettura_id: id } });
      if (error) throw new Error((await error.context?.json?.().catch((): null => null))?.error ?? error.message);
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiaveLettura(id) }),
  });

  // Un giro morto (lease scaduto, nessuna pagina mossa da 4 minuti): si riprende da sé, una volta.
  const ripreso = useRef<string | null>(null);
  const dati = q.data;
  useEffect(() => {
    if (!dati?.lettura || !id || avvia.isPending) return;
    if (letturaFerma(dati.lettura, dati.pagine) && ripreso.current !== dati.lettura.updated_at) {
      ripreso.current = dati.lettura.updated_at;
      avvia.mutate();
    }
  }, [dati, id, avvia]);

  return { ...q, avvia };
}

/** Le letture non finite di chi è collegato, per riprenderle. */
export function useLettureInSospeso() {
  const { user, effectiveCompany } = useAuth();
  return useQuery({
    queryKey: ["generale-letture-sospese", effectiveCompany?.id, user?.id],
    enabled: !!effectiveCompany?.id && !!user?.id,
    queryFn: async () => {
      const { data, error } = await db.from("generale_letture").select("id, tipo, stato, file, created_at, updated_at")
        .eq("company_id", effectiveCompany!.id).eq("created_by", user!.id)
        .in("stato", ["preparata", "in_lettura", "in_pausa", "estrazione", "pronta", "errore", "usata"])
        .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
        .order("created_at", { ascending: false }).limit(5);
      if (error) throw new Error(error.message);
      // Una lettura già usata resta riapribile per un giorno: lì c'è «Annulla tutto».
      const ieri = Date.now() - 86_400_000;
      return ((data ?? []) as Pick<RigaLettura, "id" | "tipo" | "stato" | "file" | "created_at" | "updated_at">[])
        .filter((l) => l.stato !== "usata" || Date.parse(l.updated_at) > ieri);
    },
  });
}

export async function domandaSuiDocumenti(letturaId: string, domanda: string): Promise<{ risposta: string; costo_eur: number }> {
  const { data, error } = await supabase.functions.invoke("generale-documenti-leggi", { body: { modo: "domanda", lettura_id: letturaId, domanda } });
  if (error) throw new Error((await error.context?.json?.().catch((): null => null))?.error ?? error.message);
  return data as { risposta: string; costo_eur: number };
}
