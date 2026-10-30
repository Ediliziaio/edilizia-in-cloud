// src/components/orders/generali/piano/PrimoPiano.tsx
// Quando il piano non c'è: il prossimo passo, non una tabella di zeri (piano §3.1 punto 4).
// Si parte dalle voci tipiche del modello, da zero o da un foglio Excel.
import { ClipboardPaste, FilePlus2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { euro, nomeMese, nomePiano } from "@/components/orders/generali/piano/formato";
import { messaggioPiano, useNuovaVersionePiano } from "@/hooks/useGeneralePiano";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { CATEGORIE_PIANO, vociDiPartenza } from "@/lib/orders/generali/pianoCategorie";

export function PrimoPiano({ riepilogo, puoModificare, mese, onCreato }: {
  riepilogo: RiepilogoGenerale;
  puoModificare: boolean;
  /** Il mese da cui partono le voci (questo mese). */
  mese: string;
  onCreato: (versioneId: string, incolla: boolean) => void;
}) {
  const g = riepilogo.generale;
  const crea = useNuovaVersionePiano(g.id);
  const voci = vociDiPartenza(g.modello, mese, riepilogo.permessi.importi ? g.valore : null);

  const parti = (conVoci: boolean, incolla = false) =>
    crea.mutate(conVoci ? voci : [], {
      onSuccess: (id) => {
        if (!incolla) toast.success(conVoci ? "Piano creato: scrivi gli importi e correggi i mesi" : "Piano creato");
        onCreato(id, incolla);
      },
      onError: (e) => toast.error(messaggioPiano(e, "il piano")),
    });

  return (
    <section aria-labelledby="primo-piano-titolo" className="rounded-lg border bg-card px-4 py-5 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prossimo passo</p>
      <h2 id="primo-piano-titolo" className="mt-1 text-lg font-semibold">Scrivi {nomePiano(g.modello)}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Ricavi e costi previsti, ognuno con il mese in cui il denaro entra o esce. Da lì l'app confronta il previsto con
        quello che registri sulle commesse e ti dice margine a finire, flusso di cassa e capitale impegnato.
      </p>

      <div className="mt-4 rounded-md border bg-muted/20">
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">Le voci tipiche da cui partire (importi da scrivere, mesi da correggere):</p>
        <ul className="divide-y text-sm">
          {voci.map((v) => (
            <li key={`${v.categoria}-${v.descrizione}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="min-w-0 truncate">
                {v.descrizione}
                <span className="ml-1.5 text-xs text-muted-foreground">{v.tipo === "ricavo" ? "ricavo" : CATEGORIE_PIANO[v.categoria].nome.toLowerCase()}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {v.importo > 0 ? `${euro(v.importo)} · ` : ""}{nomeMese(v.mese)}{v.durataMesi > 1 ? ` per ${v.durataMesi} mesi` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {puoModificare ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => parti(true)} disabled={crea.isPending}>
            {crea.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Parti con queste voci
          </Button>
          <Button variant="outline" onClick={() => parti(false, true)} disabled={crea.isPending}>
            <ClipboardPaste className="mr-1.5 h-4 w-4" /> Incolla da Excel
          </Button>
          <Button variant="ghost" onClick={() => parti(false)} disabled={crea.isPending}>
            <FilePlus2 className="mr-1.5 h-4 w-4" /> Parti da zero
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Il piano lo scrive chi può modificare le commesse, da tablet o computer.</p>
      )}
    </section>
  );
}
