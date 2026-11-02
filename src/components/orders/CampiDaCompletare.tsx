/**
 * Un rapportino arrivato da WhatsApp, dal vocale o da un'app vecchia non ha i campi obbligatori dell'azienda: non si
 * blocca, ma l'ufficio vede cosa manca e può compilarlo. L'approvazione resta possibile.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CampiModulo } from "@/components/campo/CampiModulo";
import {
  campiPerContesto, componiValori, daCompletare, leggiValori, mancanti, valoriInBozza, type ModuloSchema,
} from "../../../supabase/functions/_shared/moduliCantiere";

interface Rapportino {
  id: string;
  descrizione_lavori?: string | null;
  role_type?: string | null;
  lavoro_completato?: boolean | null;
  approvato?: boolean | null;
  stato?: string | null;
  campi_extra?: unknown;
}

export function CampiDaCompletare({ report, schema, puoModificare, onSalvato }: {
  report: Rapportino; schema: ModuloSchema; puoModificare: boolean; onSalvato: () => void;
}) {
  const precedenti = leggiValori(report.campi_extra);
  const fineLavori = report.lavoro_completato === true;
  const manca = daCompletare(schema, {
    descrizione: report.descrizione_lavori ?? "", subappaltatore: report.role_type === "subcontractor", fineLavori, valori: precedenti,
  });
  const [aperto, setAperto] = useState(false);
  const [valori, setValori] = useState<Record<string, unknown>>(() => valoriInBozza(precedenti));
  const [errori, setErrori] = useState(false);
  const campi = campiPerContesto(schema, { ruolo: "ufficio", momento: fineLavori ? "fine_lavori" : "giornaliero", subappaltatore: false, soloOre: false });

  const salva = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.from("campo_rapportini") as unknown as {
        update: (v: unknown) => { eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => { select: (c: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> } } } };
      }).update({ pdf_url: null, campi_extra: componiValori(campi, valori, precedenti) }).eq("id", report.id).eq("approvato", false).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("cambiato");
    },
    onSuccess: () => { setAperto(false); onSalvato(); },
    onError: (e) => toast.error(e instanceof Error && e.message === "cambiato"
      ? "Il rapportino è cambiato nel frattempo: ricarica e riprova."
      : "Campi non salvati. Riprova."),
  });

  if (manca.length === 0) return null;
  const modificabile = puoModificare && report.approvato !== true && report.stato !== "approvato";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>Da completare: {manca.join(", ")}</span>
      {modificabile && <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setAperto(true)}>Completa</Button>}
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Completa il rapportino</DialogTitle></DialogHeader>
          <CampiModulo campi={campi} valori={valori} onChange={(k, v) => setValori(p => ({ ...p, [k]: v }))} mostraErrori={errori} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAperto(false)}>Annulla</Button>
            <Button disabled={salva.isPending} onClick={() => {
              setErrori(true);
              if (mancanti(campi, valori).length === 0) salva.mutate();
            }}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
