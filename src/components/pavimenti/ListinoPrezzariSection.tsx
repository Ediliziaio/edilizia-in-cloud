/**
 * ListinoPrezzariSection — gestione del LISTINO lavorazioni dell'azienda +
 * import dai prezzari regionali ufficiali + lookup tariffe manodopera.
 *
 * NB: è dato di prezzo usato nei COMPUTI, NON fa parte del template PDF.
 * Per questo vive in una pagina dedicata (PavimentiListino) e non
 * dentro l'editor del template (che configura solo l'aspetto del preventivo).
 *
 *  1) ImportaPrezzarioDialog → adotta voci ufficiali in `pav_listino_voci`
 *  2) ManodoperaLookup → tariffe manodopera di riferimento per regione
 *  3) ListinoLavorazioniEditor → editor completo del listino (capitoli + voci)
 */
import { lazy, Suspense, useState } from "react";
import { Library, HardHat, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ImportaPrezzarioDialog } from "@/components/pavimenti/ImportaPrezzarioDialog";
import { ManodoperaLookup } from "@/components/pavimenti/ManodoperaLookup";
import { REGIONI_ITALIANE } from "@/lib/prezzario/tipi";

// PERF: il listino lavorazioni è pesante (accordion + tabelle editabili +
// query multiple) → lazy.
const ListinoLavorazioniEditor = lazy(() =>
  import("@/components/pavimenti/ListinoLavorazioniEditor").then((m) => ({
    default: m.ListinoLavorazioniEditor,
  })),
);

export function ListinoPrezzariSection() {
  const [prezzarioOpen, setPrezzarioOpen] = useState(false);
  const [manodoperaOpen, setManodoperaOpen] = useState(false);
  const [regione, setRegione] = useState<string | undefined>(undefined);

  return (
    <div className="space-y-4">
      {/* Card entry-point: import prezzari + lookup manodopera */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Library className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm">Listino lavorazioni &amp; Prezzari regionali</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Popola il tuo listino partendo dai prezzari regionali ufficiali e consulta le
                tariffe manodopera di riferimento.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Importa da prezzario regionale */}
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">Importa da prezzario regionale</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Aggiungi al tuo listino le voci dei prezzari regionali ufficiali
                  (Lombardia, ecc.), poi usale nei computi. Vengono copiate con il
                  margine scelto e la nota della fonte.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setPrezzarioOpen(true)}
                className="shrink-0 gap-1.5 bg-orange-500 hover:bg-orange-600"
              >
                <Library className="h-4 w-4" />
                Importa da prezzario regionale
              </Button>
            </div>

            {/* Tariffe manodopera di riferimento (collassabile) */}
            <Collapsible
              open={manodoperaOpen}
              onOpenChange={setManodoperaOpen}
              className="rounded-lg border"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2">
                    <HardHat className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-medium">Tariffe manodopera di riferimento</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      manodoperaOpen && "rotate-180",
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 border-t px-3 py-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Regione</Label>
                  <Select value={regione} onValueChange={setRegione}>
                    <SelectTrigger className="max-w-xs">
                      <SelectValue placeholder="Scegli una regione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONI_ITALIANE.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ManodoperaLookup regione={regione} />
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CardContent>
      </Card>

      {/* Editor completo del listino (include già l'import in toolbar) */}
      <Card>
        <CardContent className="pt-6">
          <Suspense
            fallback={
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-orange-600" /> Caricamento listino…
              </div>
            }
          >
            <ListinoLavorazioniEditor />
          </Suspense>
        </CardContent>
      </Card>

      <ImportaPrezzarioDialog open={prezzarioOpen} onOpenChange={setPrezzarioOpen} />
    </div>
  );
}

export default ListinoPrezzariSection;
