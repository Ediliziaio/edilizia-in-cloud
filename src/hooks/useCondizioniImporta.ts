/**
 * «Quello che ho già»: trovare e portare nell'archivio le condizioni scritte prima (07/11/2026).
 *
 * Florin: «non devi perdere le condizioni contrattuali importate da Renova, da Dimora Torino e dagli altri».
 * Qui si LEGGE da tre posti e si SCRIVE solo nell'archivio: le righe di partenza non vengono toccate, né
 * cancellate, né modificate. Se l'importazione va storta, basta archiviare i modelli nuovi.
 *
 * Le regole di cosa entra e cosa no stanno in `src/lib/condizioni/importa.ts`, provate da sole.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { clausoleDaImportare, modelliDaImportare, type CandidatoClausola, type CandidatoModello } from "@/lib/condizioni/importa";
import type { Clausola } from "@/lib/condizioni/archivio";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** I modelli PDF dei moduli di vendita: una tabella per famiglia, stessa colonna. */
const TABELLE_MODULI: ReadonlyArray<[string, string]> = [
  ["sr_template_pdf", "Serramenti"], ["fv_template_pdf", "Fotovoltaico"], ["rst_template_pdf", "Ristrutturazione"],
  ["bgn_template_pdf", "Bagni"], ["tet_template_pdf", "Tetti"], ["clm_template_pdf", "Climatizzazione"],
  ["ele_template_pdf", "Elettrico"], ["idr_template_pdf", "Termoidraulico"], ["pav_template_pdf", "Pavimenti"],
  ["pis_template_pdf", "Piscine"],
];

export interface DaImportare {
  clausole: CandidatoClausola[];
  modelli: CandidatoModello[];
}

export function useCondizioniImporta(a: {
  attivo: boolean;
  clausoleNellArchivio: ReadonlyArray<{ titolo: string; testo: string }>;
  modelliNellArchivio: ReadonlyArray<{ nome: string; clausole: Clausola[] }>;
}) {
  const { effectiveCompany } = useAuth();
  const azienda = effectiveCompany?.id;
  const qc = useQueryClient();

  const trovate = useQuery({
    queryKey: ["condizioni-da-importare", azienda, a.clausoleNellArchivio.length, a.modelliNellArchivio.length],
    enabled: a.attivo && !!azienda,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<DaImportare> => {
      const [clausoleFirma, modelliPreventivo, ...moduli] = await Promise.all([
        db.from("quote_clause_templates").select("title, content, category, active, applicable_to").eq("company_id", azienda).limit(500),
        db.from("quote_templates").select("name, kind, body_html, contractual_terms_text, legal_terms_text, show_contractual_terms, show_legal_terms, linked_terms_id, linked_legal_id, is_active").eq("company_id", azienda).limit(200),
        ...TABELLE_MODULI.map(([tabella]) =>
          db.from(tabella).select("condizioni_legali_testo, condizioni_legali_attivo").eq("company_id", azienda).limit(20)),
      ]);

      const modelliModulo: { nome: string; testo: string }[] = [];
      moduli.forEach((risposta: { data?: unknown[] | null; error?: unknown }, i: number) => {
        if (risposta.error) return; // una famiglia non installata non ferma le altre
        for (const raw of (risposta.data ?? []) as Array<Record<string, unknown>>) {
          if (raw.condizioni_legali_attivo === false) continue;
          const testo = typeof raw.condizioni_legali_testo === "string" ? raw.condizioni_legali_testo : "";
          if (testo.trim()) modelliModulo.push({ nome: `${TABELLE_MODULI[i][1]} · condizioni del modulo`, testo });
        }
      });

      return {
        clausole: clausoleFirma.error ? [] : clausoleDaImportare(clausoleFirma.data ?? [], a.clausoleNellArchivio),
        modelli: modelliDaImportare({
          quoteTemplates: modelliPreventivo.error ? [] : (modelliPreventivo.data ?? []),
          modelliModulo,
          giaNellArchivio: a.modelliNellArchivio,
        }),
      };
    },
  });

  const importa = useMutation({
    mutationFn: async (scelte: DaImportare) => {
      if (scelte.clausole.length) {
        const { error } = await db.from("condizioni_clausole").insert(scelte.clausole.map((c, i) => ({
          company_id: azienda, categoria: c.categoria, titolo: c.titolo, testo: c.testo,
          vessatoria: c.vessatoria, attiva: true, ordine: i,
        })));
        if (error) throw new Error(error.message);
      }
      if (scelte.modelli.length) {
        // Mai predefinito in automatico: il predefinito cambia cosa esce sui documenti, e lo sceglie il titolare.
        const { error } = await db.from("condizioni_modelli").insert(scelte.modelli.map((m) => ({
          company_id: azienda, nome: m.nome, ambito: m.ambito, clausole: m.clausole,
          predefinito: false, attivo: true, note: `Importato da: ${m.fonte}`,
        })));
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: (_d, scelte) => {
      toast.success(`Importati ${scelte.modelli.length} modelli e ${scelte.clausole.length} clausole. Gli originali non sono stati toccati.`);
      void qc.invalidateQueries({ queryKey: ["condizioni-clausole", azienda] });
      void qc.invalidateQueries({ queryKey: ["condizioni-modelli", azienda] });
      void qc.invalidateQueries({ queryKey: ["condizioni-da-importare"] });
    },
    onError: (e: unknown) => { toast.error(e instanceof Error && e.message ? e.message : "Importazione non riuscita: niente è cambiato."); },
  });

  return {
    inCerca: trovate.isFetching,
    trovate: trovate.data ?? { clausole: [], modelli: [] },
    importa,
  };
}
