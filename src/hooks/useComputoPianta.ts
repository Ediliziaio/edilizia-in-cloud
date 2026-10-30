/**
 * Computo di commessa ↔ piante (fase 4 delle Planimetrie).
 *
 * - `usePianteDelComputo`: le piante usate dalle righe di misura, con le quantità
 *   della versione usata da ogni riga e di quella corrente. Da qui escono l'origine
 *   delle misure (stimate o no) e l'avviso «La pianta è cambiata».
 * - `useAggiungiMisureDaPianta`: le righe nuove di «Prendi dalla pianta».
 * - `useAggiornaMisureDaPianta`: aggiorna le righe alla versione nuova, solo su conferma.
 * - `usePeriziaDaPianta`: computo contrattuale, la pianta non lo cambia: le differenze
 *   vanno nella perizia di variante (quella aperta, o una nuova).
 *
 * Le scritture sono più chiamate in fila (righe, poi la voce): se la voce non si
 * aggiorna, le righe appena create si tolgono. Il blocco del contrattuale lo fa il
 * database (trigger di 20281023053000), qui si evita solo di provarci.
 */
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { VoceComputo } from "@/lib/computo/alberoComputo";
import { caricaVersione, chiaviPlanimetrie } from "@/lib/planimetrie/archivio";
import {
  confrontaRighe, valoreChiavi, voceDopo,
  type ConfrontoRiga, type MisuraConPianta, type RigaDaPianta,
} from "@/lib/planimetrie/computo";
import type { Origine } from "../../shared/planimetrie/modello.ts";
import { calcolaQuantita, type MappaQuantita } from "../../shared/planimetrie/quantita.ts";
import type { ComputoCommessa } from "./useComputoCommessa";

export interface PiantaUsata {
  id: string;
  titolo: string;
  versioneCorrente: number;
}

/** Le righe di una voce che vengono da una pianta, nella forma del confronto. */
export function misureConPianta(voci: readonly VoceComputo[]): MisuraConPianta[] {
  return voci.flatMap(v => v.misure
    .filter(m => m.id && m.planimetria_id && m.planimetria_versione && m.planimetria_chiavi?.length)
    .map(m => ({
      id: m.id!, voceId: v.id, descrizione: m.descrizione, quantita: m.quantita,
      planimetriaId: m.planimetria_id!, versione: m.planimetria_versione!, chiavi: m.planimetria_chiavi!,
    })));
}

const chiaveVersione = (id: string, numero: number) => `${id}#${numero}`;

/** Piante, versioni e quantità che servono alle righe di misura del computo. */
export function usePianteDelComputo(voci: readonly VoceComputo[]) {
  const misure = misureConPianta(voci);
  const ids = [...new Set(misure.map(m => m.planimetriaId))].sort();
  const piante = useQuery({
    queryKey: ["planimetrie", "del-computo", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("planimetrie" as never).select("id, titolo, versione_corrente").in("id", ids);
      if (error) throw new Error("Piante del computo non disponibili: riprova tra qualche secondo.");
      return ((data ?? []) as unknown as Array<{ id: string; titolo: string; versione_corrente: number }>)
        .map(r => ({ id: r.id, titolo: r.titolo, versioneCorrente: r.versione_corrente }));
    },
  });
  const perId = new Map((piante.data ?? []).map(p => [p.id, p]));
  const servono = new Map<string, { id: string; numero: number }>();
  for (const m of misure) servono.set(chiaveVersione(m.planimetriaId, m.versione), { id: m.planimetriaId, numero: m.versione });
  for (const p of perId.values()) servono.set(chiaveVersione(p.id, p.versioneCorrente), { id: p.id, numero: p.versioneCorrente });
  const elenco = [...servono.values()];
  const versioni = useQueries({
    queries: elenco.map(v => ({
      queryKey: chiaviPlanimetrie.versione(v.id, v.numero),
      staleTime: Infinity,
      queryFn: () => caricaVersione(v.id, v.numero),
    })),
  });
  // Le quantità si ricalcolano dal documento (la copia salvata accanto può venire da
  // una versione più vecchia della libreria): è la stessa regola per vecchia e nuova.
  const mappe = new Map<string, MappaQuantita>();
  versioni.forEach((q, i) => { if (q.data) mappe.set(chiaveVersione(elenco[i].id, elenco[i].numero), calcolaQuantita(q.data.documento)); });

  /** Origine di una riga: quella delle quantità della versione da cui è stata presa. */
  const origineMisura = (m: { planimetria_id?: string | null; planimetria_versione?: number | null; planimetria_chiavi?: string[] | null }): Origine | null => {
    if (!m.planimetria_id || !m.planimetria_versione || !m.planimetria_chiavi?.length) return null;
    const mappa = mappe.get(chiaveVersione(m.planimetria_id, m.planimetria_versione));
    return mappa ? valoreChiavi(mappa, m.planimetria_chiavi).origine : null;
  };

  const negativa = new Map(voci.map(v => [v.id, v.is_detrazione]));
  /** Per ogni pianta cambiata: le righe ferme a una versione vecchia, col confronto. */
  const cambiate: Array<{ pianta: PiantaUsata; confronto: ConfrontoRiga[]; ferme: MisuraConPianta[] }> = [];
  for (const p of perId.values()) {
    const ferme = misure.filter(m => m.planimetriaId === p.id && m.versione < p.versioneCorrente);
    const nuova = mappe.get(chiaveVersione(p.id, p.versioneCorrente));
    if (!ferme.length || !nuova) continue;
    cambiate.push({ pianta: p, confronto: confrontaRighe(ferme, nuova, id => !!negativa.get(id)), ferme });
  }

  return {
    piante: perId,
    origineMisura,
    cambiate,
    caricamento: piante.isLoading || versioni.some(q => q.isLoading),
    errore: (piante.error ?? versioni.find(q => q.error)?.error ?? null) as Error | null,
  };
}

function invalida(qc: ReturnType<typeof useQueryClient>, uploadId: string | undefined) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["computo-commessa-voci", uploadId] }),
    qc.invalidateQueries({ queryKey: ["planimetrie", "del-computo"] }),
  ]);
}

const messaggio = (e: { message?: string } | null, ripiego: string) =>
  e?.message?.startsWith("Computo contrattuale") ? e.message : ripiego;

async function aggiornaVoce(v: Pick<VoceComputo, "id" | "quantita" | "prezzo_unitario_computo" | "unita_misura">, differenza: number) {
  const { quantita, importo } = voceDopo(v, differenza);
  const { error } = await supabase.from("computo_voci_estratte")
    .update({ quantita, importo_computo: importo, is_modified: true }).eq("id", v.id);
  if (error) throw new Error(messaggio(error, "Quantità della voce non salvata: riprova tra qualche secondo."));
}

export interface NuoveMisureDaPianta {
  voce: VoceComputo;
  companyId: string;
  planimetriaId: string;
  versione: number;
  righe: RigaDaPianta[];
}

/** Le righe di «Prendi dalla pianta», in fondo a quelle della voce; poi la quantità della voce. */
export function useAggiungiMisureDaPianta(uploadId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ voce, companyId, planimetriaId, versione, righe }: NuoveMisureDaPianta) => {
      if (!righe.length) throw new Error("Scegli almeno un locale.");
      const da = Math.max(0, ...voce.misure.map(m => m.ordine)) + 1;
      const { data, error } = await supabase.from("computo_voci_misure").insert(righe.map((r, i) => ({
        company_id: companyId, voce_id: voce.id, ordine: da + i, descrizione: r.descrizione, quantita: r.quantita,
        planimetria_id: planimetriaId, planimetria_versione: versione, planimetria_chiavi: r.chiavi,
      })) as never).select("id");
      if (error) throw new Error(messaggio(error, "Righe di misura non salvate: riprova tra qualche secondo."));
      try {
        await aggiornaVoce(voce, righe.reduce((s, r) => s + r.quantita, 0));
      } catch (e) {
        const nuove = ((data ?? []) as Array<{ id: string }>).map(r => r.id);
        if (nuove.length) await supabase.from("computo_voci_misure").delete().in("id", nuove);
        throw e;
      }
      return righe.length;
    },
    onSettled: () => invalida(qc, uploadId),
  });
}

/** Righe alla versione nuova e voci ricalcolate. Le righe uguali cambiano solo la versione. */
async function scriviAggiornamento(confronto: readonly ConfrontoRiga[], versione: number, voci: ReadonlyMap<string, VoceComputo>, idMisura = (c: ConfrontoRiga) => c.misura.id) {
  const perVoce = new Map<string, number>();
  for (const c of confronto) {
    const { error } = await supabase.from("computo_voci_misure")
      .update({ quantita: c.nuova, planimetria_versione: versione } as never).eq("id", idMisura(c));
    if (error) throw new Error(messaggio(error, "Righe di misura non aggiornate: riprova tra qualche secondo."));
    perVoce.set(c.misura.voceId, (perVoce.get(c.misura.voceId) ?? 0) + c.differenza);
  }
  for (const [voceId, differenza] of perVoce) {
    const v = voci.get(voceId);
    if (v && differenza !== 0) await aggiornaVoce(v, differenza);
  }
}

export function useAggiornaMisureDaPianta(uploadId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ confronto, versione, voci }: { confronto: ConfrontoRiga[]; versione: number; voci: VoceComputo[] }) =>
      scriviAggiornamento(confronto, versione, new Map(voci.map(v => [v.id, v]))),
    onSettled: () => invalida(qc, uploadId),
  });
}

/**
 * Computo contrattuale: le differenze della pianta vanno nella perizia di variante.
 * Usa quella aperta sul computo o ne crea una; nella copia ritrova le righe per
 * pianta e chiavi oppure, se la copia non le ha (variante creata prima della
 * migrazione che le copia), per posizione e descrizione.
 */
export function usePeriziaDaPianta(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ computo, computi, voci, confronto, versione, titoloPianta }: {
      computo: ComputoCommessa; computi: ComputoCommessa[]; voci: VoceComputo[]; confronto: ConfrontoRiga[]; versione: number; titoloPianta: string;
    }) => {
      let varianteId = computi.find(c => c.variante_di === computo.id && (c.stato === "bozza" || c.stato === "verificato"))?.id;
      if (!varianteId) {
        const { data, error } = await supabase.rpc("computo_crea_variante", {
          p_upload_id: computo.id, p_titolo: "", p_motivo: `Pianta «${titoloPianta}» cambiata (versione ${versione}): quantità aggiornate dalla pianta.`,
        });
        if (error) throw new Error(error.message);
        varianteId = data as string;
      }
      const { data: righe, error } = await supabase.from("computo_voci_estratte")
        .select("id, voce_origine_id, quantita, prezzo_unitario_computo, unita_misura, is_detrazione, misure:computo_voci_misure(id, ordine, descrizione, quantita, planimetria_id, planimetria_versione, planimetria_chiavi)")
        .eq("computo_upload_id", varianteId);
      if (error) throw new Error("Perizia di variante non leggibile: riprova tra qualche secondo.");
      const vociVariante = (righe ?? []) as unknown as Array<VoceComputo & { voce_origine_id: string | null }>;
      // La voce del contratto → la sua copia: la copia ricorda la voce originaria (anche per le copie di copie).
      const radiceDi = new Map(voci.map(v => [v.id, v.voce_origine_id ?? v.id]));
      const copiaDi = (voceId: string) => vociVariante.find(v => v.voce_origine_id === (radiceDi.get(voceId) ?? voceId));

      const daScrivere: ConfrontoRiga[] = [];
      const idInVariante = new Map<ConfrontoRiga, string>();
      const vociCopia = new Map<string, VoceComputo>();
      const nonTrovate: string[] = [];
      // Due righe uguali (stessa descrizione e quantità) non devono finire sulla stessa copia.
      const usate = new Set<string>();
      for (const c of confronto) {
        const copia = copiaDi(c.misura.voceId);
        const libere = copia?.misure.filter(m => m.id && !usate.has(m.id)) ?? [];
        const misura = libere.find(m => m.planimetria_id === c.misura.planimetriaId && stesseChiavi(m.planimetria_chiavi, c.misura.chiavi))
          ?? libere.find(m => !m.planimetria_id && m.descrizione === c.misura.descrizione && Number(m.quantita) === c.vecchia);
        if (!copia || !misura?.id) { nonTrovate.push(c.misura.descrizione ?? "riga"); continue; }
        usate.add(misura.id);
        // Già portata alla versione nuova in un giro precedente: non si somma due volte.
        if (misura.planimetria_versione != null && misura.planimetria_versione >= versione) continue;
        const differenza = Math.round((c.nuova - Number(misura.quantita ?? 0)) * 100) / 100;
        const riga: ConfrontoRiga = { ...c, vecchia: Number(misura.quantita ?? 0), differenza, misura: { ...c.misura, voceId: copia.id } };
        daScrivere.push(riga);
        idInVariante.set(riga, misura.id);
        vociCopia.set(copia.id, copia);
      }
      // Le righe copiate senza riferimento alla pianta lo riprendono adesso.
      for (const riga of daScrivere) {
        const { error: e } = await supabase.from("computo_voci_misure").update({
          planimetria_id: riga.misura.planimetriaId, planimetria_chiavi: riga.misura.chiavi,
        } as never).eq("id", idInVariante.get(riga)!).is("planimetria_id", null);
        if (e) throw new Error("Perizia di variante non aggiornata: riprova tra qualche secondo.");
      }
      await scriviAggiornamento(daScrivere, versione, vociCopia, r => idInVariante.get(r)!);
      return { varianteId, aggiornate: daScrivere.length, nonTrovate };
    },
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["computo-commessa", orderId] }),
      qc.invalidateQueries({ queryKey: ["computo-commessa-voci"] }),
    ]),
  });
}

function stesseChiavi(a: readonly string[] | null | undefined, b: readonly string[]) {
  return !!a && a.length === b.length && a.every((k, i) => k === b[i]);
}

