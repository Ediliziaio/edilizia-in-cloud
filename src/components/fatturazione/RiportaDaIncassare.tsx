import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { invalidaFattureImportate } from "./GestionaleEsterno";

/**
 * Il contrario di «Segna incassata» sulle fatture emesse importate da XML, che arrivano
 * spesso già «pagate» senza alcun incasso registrato. Per chi è collegato a un gestionale
 * il dato torna da là: si annulla dallo storico degli incassi.
 */
export function siRiportaDaIncassare(doc: { origine?: string; external_provider?: string | null; stato?: string; tipo?: string }): boolean {
  return doc.origine === "importata"
    && doc.external_provider === "xml_import"
    && doc.tipo !== "nota_credito"
    && (doc.stato === "pagata" || doc.stato === "parzialmente_pagata");
}

export function RiportaDaIncassareDialog({ fattura, onClose }: { fattura: { id: string; numero: string } | null; onClose: () => void }) {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const riporta = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("fattura_importata_torna_da_incassare" as never, { p_invoice_id: id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidaFattureImportate(queryClient, companyId);
      void queryClient.invalidateQueries({ queryKey: ["incassi-fattura"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      void queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      toast.success(`Fattura ${fattura?.numero ?? ""} di nuovo da incassare`);
      onClose();
    },
    onError: (e) => toast.error("Non sono riuscito a riportarla da incassare", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <AlertDialog open={!!fattura} onOpenChange={(aperto) => { if (!aperto && !riporta.isPending) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Riportare da incassare la fattura {fattura?.numero}?</AlertDialogTitle>
          <AlertDialogDescription>
            Tolgo gli incassi registrati: anche la scadenza e la rata della commessa tornano aperte. Se c'era un bonifico abbinato viene sganciato e torna libero.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={riporta.isPending}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            disabled={riporta.isPending}
            onClick={(e) => { e.preventDefault(); if (fattura) riporta.mutate(fattura.id); }}
          >
            Riporta da incassare
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
