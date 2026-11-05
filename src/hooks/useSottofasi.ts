// src/hooks/useSottofasi.ts
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { messaggioErrore, SOTTOFASI_NELLA_FASE, sottofasiDalleFasi, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";

// La tabella non è ancora nei tipi generati: cast localizzato, come useOrderWorkPhases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface DatiVoce { quantita: number; unita: string | null; costoManodopera: number; costoMateriali: number; importo?: number | null }

/** Le sottofasi di una commessa e i comandi per cambiarle. */
export function useSottofasi(orderId: string | null | undefined) {
  const qc = useQueryClient();
  // Cambiare una sottofase cambia la fase (e la commessa): si aggiorna tutto il giro.
  const aggiorna = () => refreshWorkQueries(qc, orderId);
  const onError = (e: unknown) => toast.error(messaggioErrore(e));

  const query = useQuery({
    queryKey: ["order_work_subphases", orderId],
    enabled: !!orderId,
    staleTime: 30_000,
    queryFn: async (): Promise<Sottofase[]> => {
      // Le sottofasi non hanno la commessa: si parte dalle fasi della commessa.
      const { data, error } = await db
        .from("order_work_phases")
        .select(`id, ${SOTTOFASI_NELLA_FASE}`)
        .eq("order_id", orderId!);
      if (error) throw error;
      return sottofasiDalleFasi(data as Record<string, unknown>[] | null);
    },
  });

  const perFase = useMemo(() => sottofasiPerFase(query.data ?? []), [query.data]);
  // In fondo: dopo un'eliminazione «quante sono» ripeterebbe una posizione già usata.
  const prossimaPosizione = (phaseId: string) => (perFase.get(phaseId) ?? []).reduce((m, s) => Math.max(m, s.position + 1), 0);

  // Su una commessa grande il giro di aggiornamento dura secondi: la riga cambia subito, e torna com'era se il database rifiuta.
  const chiave = ["order_work_subphases", orderId];
  const subito = async (id: string, cambia: (s: Sottofase) => Sottofase) => {
    await qc.cancelQueries({ queryKey: chiave });
    const prima = qc.getQueryData<Sottofase[]>(chiave);
    qc.setQueryData<Sottofase[]>(chiave, (righe) => righe?.map((s) => (s.id === id ? cambia(s) : s)));
    return { prima };
  };
  const annulla = (e: unknown, _v: unknown, ctx?: { prima?: Sottofase[] }) => {
    if (ctx?.prima) qc.setQueryData(chiave, ctx.prima);
    onError(e);
    // Con due clic ravvicinati la copia di prima può essere vecchia: fa fede il database.
    void aggiorna();
  };

  const segna = useMutation({
    mutationFn: async ({ id, fatta }: { id: string; fatta: boolean }) => {
      const { error } = await db.from("order_work_subphases").update({ fatta }).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, fatta }) => subito(id, (s) => ({ ...s, fatta, percentuale: fatta ? 100 : (s.percentuale ?? 0) >= 100 ? 0 : s.percentuale })),
    onSuccess: aggiorna,
    onError: annulla,
  });

  // Tante righe insieme: una scrittura sola e un solo aggiornamento alla fine.
  const segnaTutte = useMutation({
    mutationFn: async ({ ids, fatta }: { ids: string[]; fatta: boolean }) => {
      const { error } = await db.from("order_work_subphases").update({ fatta }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  const aggiungi = useMutation({
    mutationFn: async ({ phaseId, nome }: { phaseId: string; nome: string }) => {
      const { error } = await db.from("order_work_subphases").insert({
        phase_id: phaseId, name: nome, position: prossimaPosizione(phaseId),
      });
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  // Un elenco incollato: tutte insieme, nell'ordine in cui sono scritte.
  const aggiungiTante = useMutation({
    mutationFn: async ({ phaseId, nomi }: { phaseId: string; nomi: string[] }) => {
      const base = prossimaPosizione(phaseId);
      const { error } = await db.from("order_work_subphases").insert(nomi.map((name, i) => ({ phase_id: phaseId, name, position: base + i })));
      if (error) throw error;
      return nomi.length;
    },
    onSuccess: (n) => { aggiorna(); toast.success(`${n} sottofasi aggiunte`); },
    onError,
  });

  // Quantità, unità e prezzi stanno sulla voce: una sottofase scritta a mano non ne ha una, e nasce qui.
  const salvaVoce = useMutation({
    mutationFn: async ({ riga, dati }: { riga: { voceId: string | null; sottofaseId: string | null; faseId: string; descrizione: string }; dati: DatiVoce }) => {
      const valori = {
        quantita: dati.quantita, unita: dati.unita, costo_manodopera: dati.costoManodopera, costo_materiali: dati.costoMateriali,
        ...(dati.importo !== undefined ? { importo: dati.importo } : {}),
      };
      if (riga.voceId) {
        const { data, error } = await db.from("order_work_phase_voci").update(valori).eq("id", riga.voceId).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("Non puoi modificare questa voce.");
        return;
      }
      if (!riga.sottofaseId) throw new Error("Crea prima la sottofase.");
      const { data: fase, error: erroreFase } = await db.from("order_work_phases").select("company_id").eq("id", riga.faseId).single();
      if (erroreFase) throw erroreFase;
      const { error } = await db.from("order_work_phase_voci").insert({
        ...valori, company_id: fase.company_id, order_id: orderId, phase_id: riga.faseId, subphase_id: riga.sottofaseId,
        descrizione: riga.descrizione, position: prossimaPosizione(riga.faseId), origine: "listino", origine_id: riga.sottofaseId,
      });
      if (error) throw error;
    },
    onSuccess: () => { aggiorna(); void qc.invalidateQueries({ queryKey: ["voci-previste-fasi"] }); toast.success("Salvato"); },
    onError,
  });

  const rinomina = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await db.from("order_work_subphases").update({ name: nome }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  // A che punto è. «fatta» va scritta insieme: le sottofasi fatte prima di questa colonna hanno percentuale 0,
  // e riportarne una a 0 senza cambiare niente non farebbe scattare l'allineamento nel database.
  const avanza = useMutation({
    mutationFn: async ({ id, percentuale, quantita_fatta }: { id: string; percentuale: number; quantita_fatta: number | null }) => {
      const { error } = await db.from("order_work_subphases").update({ percentuale, quantita_fatta, fatta: percentuale >= 100 }).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, percentuale, quantita_fatta }) => subito(id, (s) => ({ ...s, percentuale, quantita_fatta, fatta: percentuale >= 100 })),
    onSuccess: aggiorna,
    onError: annulla,
  });

  // Date e tempo necessario: fine e giorni mancanti li completa il database, e la
  // fase si allarga se la sottofase esce dalle sue date (20281029213000).
  const pianifica = useMutation({
    mutationFn: async ({ id, data_inizio, data_fine, giorni }: { id: string; data_inizio: string | null; data_fine: string | null; giorni: number | null }) => {
      const { error } = await db.from("order_work_subphases").update({ data_inizio, data_fine, giorni }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  // Il piano in fila (pianoInSequenza): giorni e date di più sottofasi in una volta.
  const pianificaTutte = useMutation({
    mutationFn: async (passi: ReadonlyArray<{ id: string; data_inizio: string | null; data_fine: string | null; giorni: number | null }>) => {
      // Una scrittura sola: tutto o niente, anche con centinaia di righe.
      const { error } = await db.rpc("sottofasi_pianifica_in_blocco", { p_passi: passi });
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  // L'ordine conta: il piano in fila le mette una dopo l'altra in quest'ordine.
  const riordina = useMutation({
    mutationFn: async (ids: ReadonlyArray<string>) => {
      const { error } = await db.rpc("sottofasi_riordina", { p_ids: ids });
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  // Insieme alla precedente invece che dopo.
  const parallelo = useMutation({
    mutationFn: async ({ id, in_parallelo }: { id: string; in_parallelo: boolean }) => {
      const { error } = await db.from("order_work_subphases").update({ in_parallelo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  // Quante persone ci lavorano.
  const risorse = useMutation({
    mutationFn: async ({ id, risorse: n }: { id: string; risorse: number | null }) => {
      const { error } = await db.from("order_work_subphases").update({ risorse: n }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  // Una sottofase per ogni voce del computo che non ce l'ha (sottofasi_dalle_voci).
  const dalleVoci = useMutation({
    mutationFn: async (phaseId: string) => {
      // Il database ne crea al massimo 100 per volta: si continua finché le voci non sono finite.
      let totale = 0;
      for (let giro = 0; giro < 100; giro += 1) {
        const { data, error } = await db.rpc("sottofasi_dalle_voci", { p_phase_id: phaseId });
        if (error) throw error;
        const fatte = Number(data) || 0;
        totale += fatte;
        if (fatte < 100) break;
      }
      return totale;
    },
    onSuccess: () => { aggiorna(); void qc.invalidateQueries({ queryKey: ["voci-previste-fasi"] }); },
    onError,
  });

  // Il peso di ogni sottofase diventa il suo tempo necessario (pesiDaGiorni).
  const pesa = useMutation({
    mutationFn: async (pesi: ReadonlyArray<{ id: string; peso: number }>) => {
      for (const { id, peso } of pesi) {
        const { error } = await db.from("order_work_subphases").update({ peso }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: aggiorna,
    onError,
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("order_work_subphases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  return { sottofasi: query.data ?? [], perFase, isLoading: query.isLoading, isError: query.isError, segna, segnaTutte, avanza, aggiungi, aggiungiTante, salvaVoce, rinomina, pianifica, pianificaTutte, riordina, parallelo, risorse, dalleVoci, pesa, elimina };
}
