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
  type SrCreateProgettoInput,
} from "./api";
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

// ─── Template PDF ────────────────────────────────────────────────────────────

export function useTemplatePdf() {
  return useQuery({
    queryKey: SR_QK.template(),
    queryFn: () => getTemplatePdf(),
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
