import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import type { DDTRiga } from "@/hooks/useDDTRicezione";
import type { RigaOrdine } from "@/lib/ddt/abbinaRigheOrdine";
import type { PropostaDdtAI } from "../../../supabase/functions/_shared/confrontoDdtOrdiniAI";
export function ProposteOrdiniDDT({
  ddtId,
  righe,
  ordini,
  compatto=false,
}: {
  compatto?:boolean;
  ddtId: string;
  righe: DDTRiga[];
  ordini: RigaOrdine[];
}) {
  const [proposte, setProposte] = useState<PropostaDdtAI[]>([]);
  const [impronta, setImpronta] = useState("");
  const qc = useQueryClient();
  const analisi = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "ddt-confronta-ordini",
        { body: { ddt_id: ddtId, richiesta_id: crypto.randomUUID() } },
      );
      if (error || data?.error)
        throw new Error(
          data?.error ||
            "Analisi non disponibile. Riprova o abbina le righe a mano.",
        );
      return data as { righe: PropostaDdtAI[]; impronta: string };
    },
    onSuccess: (data) => {
      setProposte(data.righe);
      setImpronta(data.impronta);
    },
  });
  const accetta = useMutation({
    mutationFn: async ({ riga, ordine }: { riga: DDTRiga; ordine: string }) => {
      const { data, error } = await db.rpc("ddt_accetta_abbinamento_ai", {
        p_ddt: ddtId,
        p_riga: riga.id,
        p_ordine_riga: ordine,
        p_impronta: impronta,
      });
      if (error) throw error;
      if (!data)
        throw new Error(
          "Riga già ricevuta o non modificabile. Aggiorna il confronto.",
        );
      return { riga: riga.id, impronta: String(data.impronta) };
    },
    onSuccess: (data) => {
      setProposte((p) => p.filter((r) => r.riga_id !== data.riga));
      setImpronta(data.impronta);
      void qc.invalidateQueries({ queryKey: ["ddt-ricezione"] });
      void qc.invalidateQueries({ queryKey: ["ddt-controllo-ordini"] });
      void qc.invalidateQueries({ queryKey: ["ddt-righe-ordine"] });
      toast.success(
        "Abbinamento salvato. Conferma separatamente le quantità arrivate.",
      );
    },
    onError: (e: Error) =>
      toast.error("Abbinamento non salvato", { description: e.message }),
  });
  return (
    <div className={compatto?"space-y-2":"space-y-3 rounded-xl border border-violet-100 bg-violet-50/30 p-3"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium">
            Controllo delle corrispondenze
          </p>
          <p className="text-xs text-muted-foreground">
            L’AI confronta gli articoli; le quantità e gli arrivi restano da
            controllare.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={
            analisi.isPending ||
            accetta.isPending ||
            !righe.length ||
            !ordini.length
          }
          onClick={() => {
            setProposte([]);
            analisi.mutate();
          }}
        >
          {analisi.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          Controlla con AI
        </Button>
      </div>
      {analisi.isError && (
        <p role="alert" className="text-sm text-destructive">
          {analisi.error.message}
        </p>
      )}
      {!!proposte.length && (
        <ul className="max-h-44 divide-y overflow-auto rounded-lg border bg-white">
          {proposte.map((p) => {
            const r = righe.find((r) => r.id === p.riga_id);
            if (!r) return null;
            return (
              <li key={p.riga_id} className="space-y-2 p-3 text-sm">
                <p className="font-medium">{r.descrizione}</p>
                <p className="text-xs text-muted-foreground">{p.motivo}</p>
                {p.ordine_righe.length ? (
                  <div className="flex flex-wrap gap-2">
                    {p.ordine_righe.map((id) => {
                      const o = ordini.find((o) => o.id === id);
                      return (
                        <Button
                          key={id}
                          variant="outline"
                          size="sm"
                          className="h-auto max-w-full whitespace-normal text-left"
                          disabled={
                            accetta.isPending ||
                            !!r.arrivo_registrato_il ||
                            r.purchase_order_item_id === id
                          }
                          onClick={() =>
                            accetta.mutate({ riga: r, ordine: id })
                          }
                        >
                          {r.purchase_order_item_id === id
                            ? "Già abbinata"
                            : "Usa"}{" "}
                          · {o?.oda_number} · {o?.description}
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-amber-800">
                    Articolo senza corrispondenza: controlla se è fuori ordine.
                  </p>
                )}
                {p.ordine_righe.length > 1 && (
                  <p className="text-xs text-amber-800">
                    Più ordini possibili: scegli la destinazione della merce.
                    Puoi ripartire le quantità in “Consegne e materiali”.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
