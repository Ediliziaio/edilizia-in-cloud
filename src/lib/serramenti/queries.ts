/**
 * src/lib/serramenti/queries.ts — React Query hooks centralizzati
 *
 * Mirror del pattern src/lib/fotovoltaico/queries.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  listProgetti, getProgetto, createProgetto, updateProgetto, deleteProgetto,
  addSerramento, updateSerramento, deleteSerramento,
  addAccessorio, updateAccessorio, deleteAccessorio,
  getTemplatePdf, upsertTemplatePdf,
  generaPdf, importDaSopralluogo, convertiInOrdine,
  uploadMedia, deleteMedia,
  listRenderSessions, importRender,
  listCrmContacts,
  listListinoFamilies, listListinoFamiliesByIds, listGrigliaByFamily,
  listMacrocategorie, listCategorieByMacro,
  listMacroFields, createMacroField, updateMacroField, deleteMacroField,
  seedMacroFieldsFromVertical,
  listTariffeManodopera, addManodopera, updateManodopera, deleteManodopera,
  duplicaProgetto,
  type SrCreateProgettoInput,
  type UploadMediaInput,
  type ListinoMacroField,
} from "./api";
import type { SrManodoperaRow } from "@/types/serramenti";
import type {
  SrProgettoRow, SrSerramentoRow, SrAccessorioRow, SrTemplatePdfRow,
  SrStatoProgetto,
} from "@/types/serramenti";
import { toast } from "sonner";
import { markSurveyConverted } from "@/lib/api/surveys";

export const SR_QK = {
  progetti: (stato?: SrStatoProgetto) => ["sr-progetti", stato ?? "all"] as const,
  progetto: (id: string) => ["sr-progetto", id] as const,
  template: (companyId?: string) => ["sr-template-pdf", companyId ?? "none"] as const,
};

export function useProgetti(opts?: { stato?: SrStatoProgetto }) {
  return useQuery({
    queryKey: SR_QK.progetti(opts?.stato),
    queryFn: () => listProgetti(opts),
  });
}

export function useProgetto(id: string | undefined) {
  return useQuery({
    queryKey: id ? SR_QK.progetto(id) : ["sr-progetto", "none"],
    queryFn: () => getProgetto(id!),
    enabled: !!id,
  });
}

export function useCreateProgetto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SrCreateProgettoInput) => createProgetto(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sr-progetti"] });
      toast.success("Progetto creato");
    },
    onError: (e) => toast.error("Creazione progetto fallita", { description: String(e) }),
  });
}

/**
 * Duplica preventivo come nuova revisione (parent_id linked).
 * Vedi `duplicaProgetto` in api.ts per i dettagli del clone.
 */
export function useDuplicaProgetto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (originalId: string) => duplicaProgetto(originalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sr-progetti"] });
    },
    onError: (e) => toast.error("Duplica revisione fallita", {
      description: e instanceof Error ? e.message : String(e),
    }),
  });
}

export function useUpdateProgetto(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["sr-progetto-autosave", id],
    mutationFn: (patch: Partial<SrProgettoRow>) => {
      if (!id) throw new Error("Progetto id mancante");
      return updateProgetto(id, patch);
    },
    onSuccess: () => {
      if (id) qc.invalidateQueries({ queryKey: SR_QK.progetto(id) });
      qc.invalidateQueries({ queryKey: ["sr-progetti"] });
    },
    onError: (e) => toast.error("Salvataggio fallito", { description: String(e) }),
  });
}

export function useDeleteProgetto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProgetto(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sr-progetti"] });
      toast.success("Progetto eliminato");
    },
    onError: (e) => toast.error("Eliminazione fallita", { description: String(e) }),
  });
}

// ─── Serramenti BOM ─────────────────────────────────────────────────────────

export function useAddSerramento(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: Partial<SrSerramentoRow>) => {
      if (!progettoId) throw new Error("Progetto id mancante");
      return addSerramento(progettoId, s);
    },
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
    },
    onError: (e) => toast.error("Aggiunta serramento fallita", { description: String(e) }),
  });
}

export function useUpdateSerramento(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["sr-progetto-autosave", progettoId],
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SrSerramentoRow> }) =>
      updateSerramento(id, patch),
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
    },
    onError: (e) => toast.error("Modifica serramento fallita", { description: String(e) }),
  });
}

export function useDeleteSerramento(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSerramento(id),
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
      toast.success("Serramento eliminato");
    },
    onError: (e) => toast.error("Eliminazione fallita", { description: String(e) }),
  });
}

// ─── Accessori BOM ──────────────────────────────────────────────────────────

export function useAddAccessorio(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: Partial<SrAccessorioRow>) => {
      if (!progettoId) throw new Error("Progetto id mancante");
      return addAccessorio(progettoId, a);
    },
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
    },
    onError: (e) => toast.error("Aggiunta accessorio fallita", { description: String(e) }),
  });
}

export function useUpdateAccessorio(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["sr-progetto-autosave", progettoId],
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SrAccessorioRow> }) =>
      updateAccessorio(id, patch),
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
    },
    onError: (e) => toast.error("Modifica accessorio fallita", { description: String(e) }),
  });
}

export function useDeleteAccessorio(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAccessorio(id),
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
      toast.success("Accessorio eliminato");
    },
    onError: (e) => toast.error("Eliminazione fallita", { description: String(e) }),
  });
}

// ─── CRM contacts picker ────────────────────────────────────────────────────

export function useCrmContacts(searchQuery: string = "") {
  return useQuery({
    queryKey: ["sr-crm-contacts", searchQuery],
    queryFn: () => listCrmContacts(searchQuery, 50),
    staleTime: 60 * 1000,
  });
}

// ─── Listino manodopera (tariffe_aziendali) ────────────────────────────────

export function useTariffeManodopera(searchQuery: string = "") {
  return useQuery({
    queryKey: ["sr-tariffe-manodopera", searchQuery],
    queryFn: () => listTariffeManodopera(searchQuery),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAddManodopera(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["sr-progetto-autosave", progettoId],
    mutationFn: (m: Partial<SrManodoperaRow>) => {
      if (!progettoId) throw new Error("Progetto id mancante");
      return addManodopera(progettoId, m);
    },
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
    },
    onError: (e) => toast.error("Aggiunta manodopera fallita", { description: String(e) }),
  });
}

export function useUpdateManodopera(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["sr-progetto-autosave", progettoId],
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SrManodoperaRow> }) =>
      updateManodopera(id, patch),
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
    },
    onError: (e) => toast.error("Modifica manodopera fallita", { description: String(e) }),
  });
}

export function useDeleteManodopera(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteManodopera(id),
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
      toast.success("Voce manodopera eliminata");
    },
    onError: (e) => toast.error("Eliminazione fallita", { description: String(e) }),
  });
}

// ─── Listino prodotti picker ────────────────────────────────────────────────

export function useListinoFamilies(opts?: {
  searchQuery?: string;
  macroId?: string | null;
  /** @deprecated post-refactor 20270513200000. Usa macroId. */
  categoriaId?: string | null;
}) {
  return useQuery({
    queryKey: ["sr-listino-families", opts?.searchQuery ?? "", opts?.macroId ?? null, opts?.categoriaId ?? null],
    queryFn: () => listListinoFamilies(opts),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch mirato delle famiglie listino per IDs noti. Da usare quando si
 * ha gia' una lista di family_id (es. righe BOM di un preventivo) e
 * serve recuperare i dati completi. Evita il LIMIT 100 di
 * useListinoFamilies() senza parametri, che falliva quando una riga BOM
 * referenziava un articolo oltre i primi 100 ordine alfabetico.
 *
 * Sort dei IDs prima del queryKey -> caching stabile indipendente
 * dall'ordine in cui arrivano.
 */
export function useListinoFamiliesByIds(ids: string[]) {
  // Stabilizza la queryKey: il sort crea un nuovo array reference, ma
  // tanstack-query confronta queryKey via JSON deep-equal -> stesso
  // contenuto = stessa cache. Il sort serve a tollerare ordering diverso
  // negli IDs in input senza buster cache inutilmente.
  // Non serve useMemo: tanstack lo gestisce.
  const sortedIds = [...ids].sort();
  return useQuery({
    queryKey: ["sr-listino-families-by-ids", sortedIds],
    queryFn: () => listListinoFamiliesByIds(sortedIds),
    enabled: sortedIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMacrocategorie(opts?: {
  onlyWithFamilies?: boolean;
  vertical?: string | null;
  /** Filtro tipo (principale/accessorio). Migration 20270513230000. */
  tipo?: "principale" | "accessorio" | null;
}) {
  const onlyWithFamilies = opts?.onlyWithFamilies ?? true;
  const vertical = opts?.vertical ?? null;
  const tipo = opts?.tipo ?? null;
  return useQuery({
    queryKey: ["sr-listino-macrocategorie", onlyWithFamilies, vertical, tipo],
    queryFn: () => listMacrocategorie({ onlyWithFamilies, vertical, tipo }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCategorieByMacro(
  macroId: string | null,
  opts?: { onlyWithFamilies?: boolean }
) {
  const onlyWithFamilies = opts?.onlyWithFamilies ?? true;
  return useQuery({
    queryKey: ["sr-listino-categorie", macroId, onlyWithFamilies],
    queryFn: () => listCategorieByMacro(macroId, { onlyWithFamilies }),
    enabled: macroId !== undefined,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Scheda tecnica: campi tipizzati per macrocategoria ────────────────────

export function useMacroFields(macroId: string | null | undefined) {
  return useQuery({
    queryKey: ["sr-listino-macro-fields", macroId],
    queryFn: () => listMacroFields(macroId!),
    enabled: !!macroId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateMacroField(macroId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ListinoMacroField, "id">) => createMacroField(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sr-listino-macro-fields", macroId] });
      toast.success("Campo aggiunto alla scheda tecnica");
    },
    onError: (e) => toast.error("Creazione campo fallita", { description: String(e) }),
  });
}

export function useUpdateMacroField(macroId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["sr-macro-field-autosave", macroId],
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<ListinoMacroField, "id" | "macrocategoria_id">> }) =>
      updateMacroField(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sr-listino-macro-fields", macroId] });
    },
    onError: (e) => toast.error("Aggiornamento campo fallito", { description: String(e) }),
  });
}

export function useDeleteMacroField(macroId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMacroField(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sr-listino-macro-fields", macroId] });
      toast.success("Campo eliminato");
    },
    onError: (e) => toast.error("Eliminazione fallita", { description: String(e) }),
  });
}

export function useSeedMacroFields(macroId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vertical }: { vertical: string }) => {
      if (!macroId) throw new Error("Macrocategoria id mancante");
      return seedMacroFieldsFromVertical(macroId, vertical);
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["sr-listino-macro-fields", macroId] });
      toast.success(`${count} campi standard aggiunti alla scheda tecnica`);
    },
    onError: (e) => toast.error("Bootstrap scheda tecnica fallito", { description: String(e) }),
  });
}

export function useListinoGriglia(familyId: string | null | undefined) {
  return useQuery({
    queryKey: ["sr-listino-griglia", familyId],
    queryFn: () => listGrigliaByFamily(familyId!),
    enabled: !!familyId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Render Infissi ─────────────────────────────────────────────────────────

export function useRenderSessions() {
  return useQuery({
    queryKey: ["sr-render-sessions"],
    queryFn: () => listRenderSessions({ limit: 30 }),
    staleTime: 60 * 1000,
  });
}

export function useImportRender(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { render_session_id: string; result_index?: number; caption?: string }) => {
      if (!progettoId) throw new Error("Progetto id mancante");
      return importRender({ progetto_id: progettoId, ...input });
    },
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
      toast.success("Render aggiunto al preventivo");
    },
    onError: (e) => toast.error("Aggiunta render fallita", { description: String(e) }),
  });
}

// ─── Media (foto) ───────────────────────────────────────────────────────────

export function useUploadMedia(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, ...opts }: { file: File } & Omit<UploadMediaInput, "progetto_id">) => {
      if (!progettoId) throw new Error("Progetto id mancante");
      return uploadMedia(file, { ...opts, progetto_id: progettoId });
    },
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
      toast.success("Foto caricata");
    },
    onError: (e) => toast.error("Upload fallito", { description: String(e) }),
  });
}

export function useDeleteMedia(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMedia(id),
    onSuccess: () => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
    },
    onError: (e) => toast.error("Eliminazione foto fallita", { description: String(e) }),
  });
}

// ─── Template PDF ────────────────────────────────────────────────────────────

export function useTemplatePdf() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id as string | undefined;
  return useQuery({
    // La chiave include companyId: il super_admin in "visualizza come" vede
    // la cache separata per ogni azienda impersonata.
    queryKey: SR_QK.template(companyId),
    queryFn: () => getTemplatePdf(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Edge functions ──────────────────────────────────────────────────────────

export function useGeneraPdf(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!progettoId) throw new Error("Progetto id mancante");
      return generaPdf(progettoId);
    },
    onSuccess: (data) => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
      qc.invalidateQueries({ queryKey: ["sr-progetti"] });
      // Auto-open in nuova tab. Se il popup blocker del browser blocca l'apertura,
      // window.open ritorna null → mostriamo un toast con link cliccabile come
      // fallback per non lasciare l'utente senza CTA.
      const targetUrl = data.public_url ?? data.html_url;
      const win = targetUrl ? window.open(targetUrl, "_blank") : null;
      if (targetUrl && !win) {
        toast.success("Preventivo generato", {
          description: "Apertura automatica bloccata dal browser.",
          action: {
            label: "Apri pagina firma",
            onClick: () => window.open(targetUrl, "_blank"),
          },
          duration: 10000,
        });
      } else if (data.public_url) {
        toast.success("Pagina firma generata", { description: "Il link pubblico cliente è pronto." });
      } else {
        toast.success("Preventivo generato", { description: "Link HTML firmato pronto per la revisione." });
      }
    },
    onError: (e) => toast.error("Generazione PDF fallita", { description: String(e) }),
  });
}

export function useConvertiInOrdine(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!progettoId) throw new Error("Progetto id mancante");
      return convertiInOrdine(progettoId);
    },
    onSuccess: (ordineId) => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
      qc.invalidateQueries({ queryKey: ["sr-progetti"] });
      toast.success("Commessa creata", { description: "Stato progetto: Accettato." });
      // Naviga alla pagina della nuova commessa
      window.location.href = `/azienda/ordini/${ordineId}`;
    },
    onError: (e) => toast.error("Conversione in commessa fallita", { description: String(e) }),
  });
}

export function useImportDaSopralluogo(progettoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sopralluogo_id, replace }: { sopralluogo_id: string; replace?: boolean }) => {
      if (!progettoId) throw new Error("Progetto id mancante");
      const result = await importDaSopralluogo({ progetto_id: progettoId, sopralluogo_id, replace });
      // Chiude il cerchio lato Sopralluoghi: le misure rilevate sono confluite nel
      // preventivo → marca il sopralluogo come "Convertito". Best-effort: un errore
      // qui non deve invalidare un import gia riuscito.
      try {
        await markSurveyConverted(sopralluogo_id);
      } catch (e) {
        console.warn("[serramenti] mark sopralluogo 'converted' fallito (import comunque ok)", e);
      }
      return { ...result, sopralluogo_id };
    },
    onSuccess: (data) => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
      // Riflette subito lo stato "Convertito" in lista e dettaglio sopralluoghi.
      qc.invalidateQueries({ queryKey: ["sopralluoghi-list"] });
      qc.invalidateQueries({ queryKey: ["sopralluogo", data.sopralluogo_id] });
      toast.success("Sopralluogo importato", {
        description: `${data.imported_count} serramenti e ${data.accessori_imported} accessori aggiunti.`,
      });
    },
    onError: (e) => toast.error("Import fallito", { description: String(e) }),
  });
}

export function useUpsertTemplatePdf() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id as string | undefined;
  return useMutation({
    mutationFn: (patch: Partial<SrTemplatePdfRow>) => {
      if (!companyId) throw new Error("Azienda non trovata");
      return upsertTemplatePdf(patch, companyId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: SR_QK.template(companyId) });
      await qc.refetchQueries({ queryKey: SR_QK.template(companyId), type: "active" });
      toast.success("Template salvato");
    },
    onError: (e) => toast.error("Salvataggio template fallito", { description: String(e) }),
  });
}
