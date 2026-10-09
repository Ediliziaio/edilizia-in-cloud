// src/components/settings/ModelliPagamentoConfig.tsx
import { useState } from "react";
import { Copy, Loader2, Pencil, Plus, RotateCcw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useModelliPagamento } from "@/hooks/useModelliPagamento";
import {
  bozzaPagamentoDaModello, bozzaPagamentoVuota, modelliPagamentoMancanti, modelliPagamentoPerInizializzare, riepilogoModello,
  type BozzaModelloPagamento, type ModelloPagamento,
} from "@/lib/orders/modelliPagamento";
import ModelloPagamentoEditor from "./ModelloPagamentoEditor";

const testoMancanti = (n: number): string => (n === 1 ? "Ti manca 1 modello di partenza." : `Ti mancano ${n} modelli di partenza.`);
const AVVISO = "rounded-lg border border-dashed p-4 text-sm text-muted-foreground";

/** `evidenziata`: la sezione è quella a cui porta l'indirizzo con l'àncora (`…/modelli-pagamento#modelli`). */
export default function ModelliPagamentoConfig({ evidenziata = false }: { evidenziata?: boolean }) {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders);
  const { modelli, offerti, inizializzati, predefinito, disponibile, isLoading, refetch, salva, elimina, inizializza, impostazioni } = useModelliPagamento();
  const [bozza, setBozza] = useState<BozzaModelloPagamento | null>(null);
  const [daEliminare, setDaEliminare] = useState<ModelloPagamento | null>(null);

  // L'apertura della pagina non scrive dati (come i modelli di fasi, dall'08/10/2026): i modelli di partenza si offrono
  // comunque nel modulo di nuova commessa, e diventano dell'azienda solo quando si preme «Importa modelli standard».
  const preparaModelli = inizializza.mutate;

  const mancanti = inizializzati ? modelliPagamentoMancanti(modelli) : 0;
  const preparazione = disponibile && !inizializzati && puoModificare && !isLoading;
  const busy = salva.isPending || elimina.isPending || inizializza.isPending;
  const puoAgire = puoModificare && disponibile && !isLoading && !busy;

  const importa = () => preparaModelli({ modelli: modelliPagamentoPerInizializzare(), soloMancanti: false });
  const ripristina = () =>
    inizializza.mutate(
      { modelli: modelliPagamentoPerInizializzare(), soloMancanti: true },
      { onSuccess: (n) => toast.success(n === 1 ? "1 modello rimesso" : `${n} modelli rimessi`) },
    );

  return (
    <>
      <SezioneImpostazione
        id="modelli"
        titolo="Come si paga"
        descrizione="I modelli tra cui scegli quando apri una commessa o ne imposti i pagamenti. Ogni rata è una percentuale del totale con IVA e dice quando si incassa: alla firma, a un SAL, a fine lavori. Con la stella scegli quello con cui partono le commesse nuove. Le commesse già fatte non cambiano."
        azione={puoAgire ? <Button size="sm" onClick={() => setBozza(bozzaPagamentoVuota())}><Plus className="mr-1 h-4 w-4" />Nuovo modello</Button> : undefined}
        evidenziata={evidenziata}
      >
        <div className="space-y-3 px-4 py-4">
          {isLoading && <p role="status" className={AVVISO}>Caricamento modelli…</p>}
          {!isLoading && !disponibile && (
            <div role="alert" className={`${AVVISO} flex flex-wrap items-center justify-between gap-3`}>
              <span>Non riesco a leggere i modelli in questo momento. Riprova tra poco.</span>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>Riprova</Button>
            </div>
          )}
          {preparazione && !busy && !inizializza.isError && (
            <div className={`${AVVISO} space-y-2`}>
              <p>Importa gli standard per personalizzarli e per scegliere quello delle commesse nuove. Le commesse esistenti non cambiano.</p>
              <Button size="sm" variant="outline" onClick={importa}>Importa modelli standard</Button>
            </div>
          )}
          {inizializza.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Preparo i tuoi modelli…</p>
          )}
          {preparazione && !busy && inizializza.isError && (
            <div className={`${AVVISO} flex items-center justify-between gap-3`}>
              <span>Non sono riuscito a preparare i modelli.</span>
              <Button size="sm" variant="outline" onClick={importa}>Riprova</Button>
            </div>
          )}
          {disponibile && !inizializzati && !puoModificare && (
            <p className={AVVISO}>Sono i modelli di partenza. Chi gestisce le impostazioni delle commesse li potrà fare suoi e cambiarli.</p>
          )}

          {offerti.length === 0 ? (
            <p className={AVVISO}>Non hai modelli. Creane uno con «Nuovo modello», oppure rimetti quelli di partenza.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {offerti.map((m) => {
                const dellAzienda = m.origine === "azienda";
                const diPartenza = dellAzienda && m.id === predefinito;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 p-3">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="break-words">{m.nome}</span>
                        {diPartenza && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Per le commesse nuove</span>}
                      </p>
                      <p className="break-words text-xs text-muted-foreground">{riepilogoModello(m.righe)}</p>
                    </div>
                    {puoAgire && dellAzienda && (
                      <>
                        <Button
                          variant="ghost" size="icon" className={`h-8 w-8 ${diPartenza ? "text-amber-600" : ""}`}
                          aria-label={diPartenza ? `Togli ${m.nome} dalle commesse nuove` : `Usa ${m.nome} per le commesse nuove`}
                          title={diPartenza ? "Non usare più per le commesse nuove" : "Usa per le commesse nuove"}
                          aria-pressed={diPartenza} disabled={impostazioni.isPending}
                          onClick={() => impostazioni.mutate({ modelloPredefinito: diPartenza ? null : m.id })}
                        >
                          <Star className={`h-4 w-4 ${diPartenza ? "fill-current" : ""}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Modifica ${m.nome}`} onClick={() => setBozza(bozzaPagamentoDaModello(m, false))}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Duplica ${m.nome}`} onClick={() => setBozza(bozzaPagamentoDaModello(m, true))}><Copy className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" aria-label={`Elimina ${m.nome}`} onClick={() => setDaEliminare(m)}><Trash2 className="h-4 w-4" /></Button>
                      </>
                    )}
                  </li>
                );
              })}
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

      <ModelloPagamentoEditor
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
              Le commesse che hanno già usato questo modello restano come sono: cambia solo l'elenco. Se era quello per le commesse nuove, le commesse
              nuove tornano senza modello di partenza. Se era uno dei modelli di partenza, puoi rimetterlo con «Ripristina i predefiniti».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={!puoAgire}
              onClick={(e) => { e.preventDefault(); if (daEliminare && puoAgire) elimina.mutate(daEliminare.id, { onSuccess: () => setDaEliminare(null) }); }}
            >
              Elimina il modello
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
