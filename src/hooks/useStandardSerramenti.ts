/**
 * Applica lo standard del listino infissi a un gruppo di tipologie.
 *
 * Scrive in tre punti: il prezzo al metro quadro sulla tipologia, le linee come
 * variante "Linea" (la prima è quella base), le percentuali sulle varianti
 * colore e vetro già presenti. Le linee che l'azienda non usa più vengono
 * disattivate, non cancellate: un preventivo vecchio le nomina ancora.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { chiaveTesto } from "@/lib/listino/areeStandard";
import { nomeDiceCodice } from "@/lib/listino/organizzaListino";
import { CODICE_ASSE, variantiLinea, type StandardSerramenti } from "@/lib/listino/standardSerramenti";
import { invalidaListinoNelPreventivatore } from "@/lib/serramenti/cacheListino";

interface Input {
  companyId: string;
  /** Le tipologie a cui applicare lo standard. */
  familyIds: string[];
  standard: StandardSerramenti;
  /**
   * Le percentuali di colore e vetro da scrivere, per codice del valore: solo
   * quelle cambiate nel dialog. Prima si riscrivevano tutte a ogni «Applica», e
   * un +15% messo su una finestra tornava a zero.
   */
  opzioni?: Record<string, number> | null;
}

export interface EsitoStandard {
  tipologie: number;
  lineeScritte: number;
  varianti: number;
}

export function useStandardSerramenti() {
  const qc = useQueryClient();

  return useMutation<EsitoStandard, Error, Input>({
    mutationFn: async ({ companyId, familyIds, standard, opzioni }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      if (familyIds.length === 0) throw new Error("Nessuna tipologia selezionata");

      // 1. Prezzo al metro quadro sulla tipologia.
      const { error: errFam } = await supabase
        .from("article_families")
        .update({
          modalita_prezzo_base: "mq",
          prezzo_base_mode: "vendita",
          prezzo_base_vendita: standard.prezzoVenditaMq,
          prezzo_base_acquisto: standard.prezzoAcquistoMq,
          updated_at: new Date().toISOString(),
        })
        .in("id", familyIds)
        .eq("company_id", companyId);
      if (errFam) throw errFam;

      // 2. L'asse "Linea": esiste già o va creato, una volta per tipologia.
      const { data: assiEsistenti, error: errAxes } = await supabase
        .from("article_family_axes")
        .select("id, family_id, codice")
        .in("family_id", familyIds)
        .eq("company_id", companyId);
      if (errAxes) throw errAxes;

      const assi = assiEsistenti ?? [];
      const conLinea = new Set(assi.filter((a) => a.codice === CODICE_ASSE.linea).map((a) => a.family_id));
      const daCreare = familyIds.filter((id) => !conLinea.has(id));
      let assiLinea = assi.filter((a) => a.codice === CODICE_ASSE.linea);

      if (daCreare.length > 0) {
        const { data: creati, error: errNuovi } = await supabase
          .from("article_family_axes")
          .insert(
            daCreare.map((family_id) => ({
              family_id,
              company_id: companyId,
              nome: "Linea",
              codice: CODICE_ASSE.linea,
              descrizione:
                "Il modello di profilo. La prima linea è quella di base; le altre si scostano in percentuale.",
              tipo: "discrete",
              obbligatorio: true,
              // Prima di colore e vetro: è la scelta che cambia di più il prezzo.
              sort_order: -1,
            })),
          )
          .select("id, family_id, codice");
        if (errNuovi) throw errNuovi;
        assiLinea = [...assiLinea, ...(creati ?? [])];
      }

      // 3. Le varianti della linea: nuove inserite, esistenti aggiornate,
      //    quelle non più in elenco disattivate.
      const varianti = variantiLinea(standard.linee);
      const idAssiLinea = assiLinea.map((a) => a.id);
      const { data: valoriEsistenti, error: errVal } = await supabase
        .from("article_family_axis_values")
        .select("id, axis_id, valore, label")
        .in("axis_id", idAssiLinea);
      if (errVal) throw errVal;

      // Una linea si riconosce dal codice o dal nome: «PVC Salamander 76» creata
      // dalla libreria ha il codice «salamander_76», da qui sarebbe
      // «pvc_salamander_76». Senza il nome si spegneva e ne nasceva una doppia.
      const perAsse = new Map<string, Array<{ id: string; valore: string; chiave: string }>>();
      for (const v of valoriEsistenti ?? []) {
        const lista = perAsse.get(v.axis_id) ?? [];
        lista.push({ id: v.id, valore: v.valore, chiave: chiaveTesto(v.label || v.valore) });
        perAsse.set(v.axis_id, lista);
      }

      /** Riga nuova della tabella varianti: tipizzata, così l'insert non ha bisogno di forzature. */
      type NuovaVariante = {
        axis_id: string;
        company_id: string;
        attivo: boolean;
        valore: string;
        label: string;
        is_default: boolean;
        maggiorazione_tipo: string;
        maggiorazione_valore: number;
        maggiorazione_acquisto: number;
        sort_order: number;
      };
      const daInserire: NuovaVariante[] = [];
      const daAggiornare: { id: string; variante: (typeof varianti)[number] }[] = [];
      const daDisattivare: string[] = [];

      for (const asse of assiLinea) {
        const presenti = perAsse.get(asse.id) ?? [];
        const usati = new Set<string>();
        for (const variante of varianti) {
          const chiave = chiaveTesto(variante.label);
          const trovato = presenti.find(
            (p) => !usati.has(p.id) && (p.valore === variante.valore || p.chiave === chiave),
          );
          if (trovato) {
            usati.add(trovato.id);
            daAggiornare.push({ id: trovato.id, variante });
          } else {
            daInserire.push({ axis_id: asse.id, company_id: companyId, attivo: true, ...variante });
          }
        }
        for (const p of presenti) {
          if (!usati.has(p.id)) daDisattivare.push(p.id);
        }
      }

      if (daInserire.length > 0) {
        const { error } = await supabase.from("article_family_axis_values").insert(daInserire);
        if (error) throw error;
      }
      // Gli aggiornamenti si raggruppano per variante: una query per linea, non per tipologia.
      for (const variante of varianti) {
        const ids = daAggiornare.filter((x) => x.variante.valore === variante.valore).map((x) => x.id);
        if (ids.length === 0) continue;
        const { error } = await supabase
          .from("article_family_axis_values")
          .update({
            label: variante.label,
            is_default: variante.is_default,
            maggiorazione_tipo: variante.maggiorazione_tipo,
            maggiorazione_valore: variante.maggiorazione_valore,
            maggiorazione_acquisto: variante.maggiorazione_acquisto,
            sort_order: variante.sort_order,
            attivo: true,
          })
          .in("id", ids);
        if (error) throw error;
      }
      if (daDisattivare.length > 0) {
        const { error } = await supabase
          .from("article_family_axis_values")
          .update({ attivo: false })
          .in("id", daDisattivare);
        if (error) throw error;
      }

      // 4. Le percentuali di colore e vetro cambiate nel dialog, dove quelle
      //    varianti esistono già. Un valore rinominato dall'azienda («pellicola
      //    solo un lato», nato come colore standard) non è più quello standard.
      const idAltriAssi = assi
        .filter((a) => a.codice === CODICE_ASSE.colore || a.codice === CODICE_ASSE.vetro)
        .map((a) => a.id);
      const percentuali = Object.entries(opzioni ?? {});
      let varianti_opzioni = 0;
      if (idAltriAssi.length > 0 && percentuali.length > 0) {
        const { data: valoriOpzioni, error: errOpz } = await supabase
          .from("article_family_axis_values")
          .select("id, valore, label")
          .in("axis_id", idAltriAssi);
        if (errOpz) throw errOpz;
        for (const [valore, pct] of percentuali) {
          const ids = (valoriOpzioni ?? [])
            .filter((v) => v.valore === valore && nomeDiceCodice(v.label, valore))
            .map((v) => v.id);
          if (ids.length === 0) continue;
          const { error } = await supabase
            .from("article_family_axis_values")
            .update({
              maggiorazione_tipo: pct === 0 ? "none" : "percentuale",
              maggiorazione_valore: pct,
              maggiorazione_acquisto: pct,
            })
            .in("id", ids);
          if (error) throw error;
          varianti_opzioni += ids.length;
        }
      }

      return {
        tipologie: familyIds.length,
        lineeScritte: varianti.length,
        varianti: daInserire.length + daAggiornare.length + varianti_opzioni,
      };
    },
    onSuccess: (esito) => {
      qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.all });
      invalidaListinoNelPreventivatore(qc);
      toast.success(
        `Listino impostato: ${esito.tipologie} tipologie, ${esito.lineeScritte} linee`,
        { description: "Prezzo al metro quadro e varianti aggiornate." },
      );
    },
    onError: (e) => {
      toast.error("Non sono riuscito a impostare il listino", { description: e.message });
    },
  });
}
