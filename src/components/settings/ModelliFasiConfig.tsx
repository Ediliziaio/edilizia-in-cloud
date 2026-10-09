// src/components/settings/ModelliFasiConfig.tsx
import { useState } from "react";
import { Copy, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { PHASE_TEMPLATES } from "@/hooks/useOrderWorkPhases";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import {
  bozzaDaModello, bozzaVuota, modelliDaOffrire, modelliDiPartenzaMancanti, modelliPerInizializzare, totaleSottofasi,
  type BozzaModello, type ModelloFasi,
} from "@/lib/orders/modelliFasi";
import ModelloFasiEditor from "./ModelloFasiEditor";

const dettaglio = (m: ModelloFasi): string => {
  const sotto = totaleSottofasi(m);
  return [m.descrizione, `${m.fasi.length} fasi`, sotto > 0 ? `${sotto} sottofasi` : null].filter(Boolean).join(" · ");
};

const testoMancanti = (n: number): string => (n === 1 ? "Ti manca 1 modello di partenza." : `Ti mancano ${n} modelli di partenza.`);
const AVVISO = "rounded-lg border border-dashed p-4 text-sm text-muted-foreground";

/** `evidenziata`: la sezione è quella a cui porta l'indirizzo con l'àncora (`…/modelli-fasi#modelli`). */
export default function ModelliFasiConfig({ evidenziata = false }: { evidenziata?: boolean }) {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders);
  const { modelli, inizializzati, disponibile, isLoading, isError, refetch, salva, elimina, inizializza } = useModelliFasi();
  const [bozza, setBozza] = useState<BozzaModello | null>(null);
  const [daEliminare, setDaEliminare] = useState<ModelloFasi | null>(null);

  // L'apertura della pagina non scrive dati: gli standard si importano esplicitamente.
  const preparaModelli = inizializza.mutate;

  const elenco = modelliDaOffrire(inizializzati, modelli, PHASE_TEMPLATES);
  const mancanti = inizializzati ? modelliDiPartenzaMancanti(PHASE_TEMPLATES, modelli) : 0;
  const preparazione = disponibile && !inizializzati && puoModificare;
  const busy = salva.isPending || elimina.isPending || inizializza.isPending;
  const puoAgire = puoModificare && disponibile && !isLoading && !isError && !busy;

  const ripristina = () =>
    inizializza.mutate(
      { modelli: modelliPerInizializzare(PHASE_TEMPLATES), soloMancanti: true },
      { onSuccess: (n) => toast.success(n === 1 ? "1 modello rimesso" : `${n} modelli rimessi`) },
    );

  return (
    <>
      <SezioneImpostazione
        id="modelli"
        titolo="Modelli di fasi"
        descrizione="Quando apri una commessa e premi «Scegli le fasi» trovi questi. Ogni fase può avere sottofasi: spuntandole, la fase avanza da sola. Le commesse già avviate non cambiano."
        azione={puoAgire ? <Button size="sm" onClick={() => setBozza(bozzaVuota())}><Plus className="mr-1 h-4 w-4" />Nuovo modello</Button> : undefined}
        evidenziata={evidenziata}
      >
        <div className="space-y-3 px-4 py-4">
          {isLoading && <p role="status" className={AVVISO}>Caricamento modelli…</p>}
          {(isError || (!isLoading && !disponibile)) && <div role="alert" className={AVVISO}><p>Non riesco a leggere i modelli aziendali. Gli standard sotto sono solo un riferimento.</p><Button size="sm" variant="outline" onClick={() => void refetch()}>Riprova</Button></div>}
          {preparazione && !busy && (
            <div className={`${AVVISO} space-y-2`}><p>Importa gli standard per personalizzarli. Le commesse esistenti non cambiano.</p><Button size="sm" variant="outline" onClick={() => preparaModelli({ modelli: modelliPerInizializzare(PHASE_TEMPLATES), soloMancanti: false })}>Importa modelli standard</Button></div>
          )}
          {inizializza.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Preparo i tuoi modelli…</p>
          )}
          {preparazione && inizializza.isError && (
            <div className={`${AVVISO} flex items-center justify-between gap-3`}>
              <span>Non sono riuscito a preparare i modelli.</span>
              <Button size="sm" variant="outline" onClick={() => preparaModelli({ modelli: modelliPerInizializzare(PHASE_TEMPLATES), soloMancanti: false })}>Riprova</Button>
            </div>
          )}
          {disponibile && !inizializzati && !puoModificare && (
            <p className={AVVISO}>Sono i modelli di partenza. Chi gestisce le impostazioni delle commesse li potrà fare suoi e cambiarli.</p>
          )}

          {elenco.length === 0 ? (
            <p className={AVVISO}>
              Non hai modelli. Creane uno con «Nuovo modello», oppure rimetti quelli di partenza. Puoi anche salvare le fasi di una commessa già fatta:
              «Aggiungi fasi» → «Salva come modello».
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {elenco.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{m.nome}</p>
                    <p className="break-words text-xs text-muted-foreground">{dettaglio(m)}</p>
                  </div>
                  {puoAgire && m.origine === "azienda" && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Modifica ${m.nome}`} onClick={() => setBozza(bozzaDaModello(m, false))}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Duplica ${m.nome}`} onClick={() => setBozza(bozzaDaModello(m, true))}><Copy className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" aria-label={`Elimina ${m.nome}`} onClick={() => setDaEliminare(m)}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {puoAgire && mancanti > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">{testoMancanti(mancanti)}</p>
              <Button size="sm" variant="outline" disabled={inizializza.isPending} onClick={ripristina}>
                <RotateCcw className="mr-1 h-4 w-4" />Ripristina i predefiniti
              </Button>
            </div>
          )}
        </div>
      </SezioneImpostazione>

      <ModelloFasiEditor
        aperto={bozza !== null}
        bozzaIniziale={bozza}
        salvataggio={salva.isPending}
        onChiudi={() => setBozza(null)}
        onSalva={(payload) => { if (puoAgire) salva.mutate(payload, { onSuccess: () => setBozza(null) }); }}
      />

      <AlertDialog open={daEliminare !== null} onOpenChange={(o) => { if (!o) setDaEliminare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{daEliminare?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Le commesse che hanno già usato questo modello restano come sono: cambia solo l'elenco. Se era uno dei modelli di partenza,
              puoi rimetterlo con «Ripristina i predefiniti».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction disabled={!puoAgire} onClick={(e) => { e.preventDefault(); if (daEliminare && puoAgire) elimina.mutate(daEliminare.id, { onSuccess: () => setDaEliminare(null) }); }}>Elimina il modello</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
