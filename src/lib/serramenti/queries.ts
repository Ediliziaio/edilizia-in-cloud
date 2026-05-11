/**
 * src/lib/serramenti/queries.ts — React Query hooks centralizzati
 *
 * Mirror del pattern src/lib/fotovoltaico/queries.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listProgetti, getProgetto, createProgetto, updateProgetto, deleteProgetto,
  createProgettoDaSopralluogo,
  addSerramento, updateSerramento, deleteSerramento,
  addAccessorio, updateAccessorio, deleteAccessorio,
  getTemplatePdf, upsertTemplatePdf,
  generaPdf, importDaSopralluogo, convertiInOrdine,
  uploadMedia, deleteMedia,
  listRenderSessions, importRender,
  listCrmContacts,
  listListinoFamilies, listGrigliaByFamily,
  listMacrocategorie, listCategorieByMacro,
  listTariffeManodopera, addManodopera, updateManodopera, deleteManodopera,
  type SrCreateProgettoInput,
  type UploadMediaInput,
} from "./api";
import type { SrManodoperaRow } from "@/types/serramenti";
import type {
  SrProgettoRow, SrSerramentoRow, SrAccessorioRow, SrTemplatePdfRow,
  SrStatoProgetto,
} from "@/types/serramenti";
import { toast } from "sonner";

export const SR_QK = {
  progetti: (stato?: SrStatoProgetto) => ["sr-progetti", stato ?? "all"] as const,
  progetto: (id: string) => ["sr-progetto", id] as const,
  template: () => ["sr-template-pdf"] as const,
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

export function useCreateProgettoDaSopralluogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sopralluogo_id, cliente_id }: { sopralluogo_id: string; cliente_id?: string }) =>
      createProgettoDaSopralluogo(sopralluogo_id, cliente_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sr-progetti"] });
      toast.success("Progetto creato dal sopralluogo");
    },
    onError: (e) => toast.error("Creazione da sopralluogo fallita", { description: String(e) }),
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

export function useListinoFamilies(opts?: { searchQuery?: string; categoriaId?: string | null }) {
  return useQuery({
    queryKey: ["sr-listino-families", opts?.searchQuery ?? "", opts?.categoriaId ?? null],
    queryFn: () => listListinoFamilies(opts),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMacrocategorie() {
  return useQuery({
    queryKey: ["sr-listino-macrocategorie"],
    queryFn: () => listMacrocategorie(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCategorieByMacro(macroId: string | null) {
  return useQuery({
    queryKey: ["sr-listino-categorie", macroId],
    queryFn: () => listCategorieByMacro(macroId),
    enabled: macroId !== undefined,
    staleTime: 5 * 60 * 1000,
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
  return useQuery({
    queryKey: SR_QK.template(),
    queryFn: () => getTemplatePdf(),
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
      toast.success("Preventivo generato", { description: "Apri il documento per visualizzarlo o stamparlo." });
      // Auto-open in nuova tab
      if (data.html_url) window.open(data.html_url, "_blank");
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
    mutationFn: ({ sopralluogo_id, replace }: { sopralluogo_id: string; replace?: boolean }) => {
      if (!progettoId) throw new Error("Progetto id mancante");
      return importDaSopralluogo({ progetto_id: progettoId, sopralluogo_id, replace });
    },
    onSuccess: (data) => {
      if (progettoId) qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
      toast.success("Sopralluogo importato", {
        description: `${data.imported_count} serramenti e ${data.accessori_imported} accessori aggiunti.`,
      });
    },
    onError: (e) => toast.error("Import fallito", { description: String(e) }),
  });
}

export function useUpsertTemplatePdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<SrTemplatePdfRow>) => upsertTemplatePdf(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SR_QK.template() });
      toast.success("Template salvato");
    },
    onError: (e) => toast.error("Salvataggio template fallito", { description: String(e) }),
  });
}
