/**
 * IMPROVEMENT #24 — Toast con UNDO su delete soft
 *
 * Wrapper sopra `supabase.rpc('soft_delete_record')` che mostra un toast
 * Sonner con bottone "Annulla" attivo per N secondi. Se l'utente clicca
 * Annulla → chiama `restore_record` per ripristinare la riga.
 *
 * Usage:
 *   await softDeleteWithUndo({ table: 'orders', id, label: 'Commessa #123' });
 */
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SOFT_DELETABLE_TABLES = [
  "orders",
  "quotes",
  "marketing_contacts",
  "marketing_opportunities",
  "invoices",
] as const;

export type SoftDeletableTable = (typeof SOFT_DELETABLE_TABLES)[number];

interface SoftDeleteOptions {
  table: SoftDeletableTable;
  id: string;
  /** Etichetta human-readable (es. "Commessa #123" o "Cliente Mario Rossi") */
  label: string;
  /** Callback dopo delete confermato (es. invalidate React Query) */
  onAfterDelete?: () => void;
  /** Callback dopo restore (es. invalidate React Query) */
  onAfterRestore?: () => void;
  /** Durata della finestra undo in ms (default 8000) */
  undoMs?: number;
}

export async function softDeleteWithUndo({
  table,
  id,
  label,
  onAfterDelete,
  onAfterRestore,
  undoMs = 8000,
}: SoftDeleteOptions): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("soft_delete_record", {
    p_table: table,
    p_id: id,
  });

  if (error || !(data as { ok?: boolean } | null)?.ok) {
    toast.error("Errore eliminazione", {
      description: error?.message ?? "RPC fallita",
    });
    return false;
  }

  onAfterDelete?.();

  // Toast con UNDO
  toast.success(`${label} eliminato`, {
    description: "Puoi annullare entro pochi secondi.",
    duration: undoMs,
    action: {
      label: "Annulla",
      onClick: async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rData, error: rErr } = await (supabase as any).rpc(
          "restore_record",
          { p_table: table, p_id: id },
        );

        if (rErr || !(rData as { ok?: boolean } | null)?.ok) {
          toast.error("Ripristino fallito", {
            description: rErr?.message ?? "Forse la finestra è scaduta",
          });
          return;
        }

        onAfterRestore?.();
        toast.success(`${label} ripristinato`);
      },
    },
  });

  return true;
}
