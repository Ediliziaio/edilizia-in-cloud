// src/components/settings/ModelliPagamentoConfig.tsx
import { useEffect, useRef, useState } from "react";
import { Banknote, Copy, Loader2, Pencil, Plus, RotateCcw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

export default function ModelliPagamentoConfig() {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders;
  const { modelli, offerti, inizializzati, predefinito, disponibile, isLoading, salva, elimina, inizializza, impostazioni } = useModelliPagamento();
  const [bozza, setBozza] = useState<BozzaModelloPagamento | null>(null);
  const [daEliminare, setDaEliminare] = useState<ModelloPagamento | null>(null);

  // La prima volta, chi può modificare porta i modelli di partenza tra i suoi: da lì sono come gli altri.
  const preparaModelli = inizializza.mutate;
  const avviata = useRef(false);
  useEffect(() => {
    if (avviata.current || isLoading || !disponibile || inizializzati || !puoModificare) return;
    avviata.current = true;
    preparaModelli({ modelli: modelliPagamentoPerInizializzare(), soloMancanti: false });
  }, [isLoading, disponibile, inizializzati, puoModificare, preparaModelli]);

  const mancanti = inizializzati ? modelliPagamentoMancanti(modelli) : 0;
  const preparazione = disponibile && !inizializzati && puoModificare;
  const puoAgire = puoModificare && disponibile;

  const ripristina = () =>
    inizializza.mutate(
      { modelli: modelliPagamentoPerInizializzare(), soloMancanti: true },
      { onSuccess: (n) => toast.success(n === 1 ? "1 modello rimesso" : `${n} modelli rimessi`) },
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-4 w-4" />I modelli di pagamento</CardTitle>
            <CardDescription>
              Sono i tuoi: nel modulo di nuova commessa e nei pagamenti di una commessa scegli «Come si paga» fra questi. Ogni rata è una percentuale del
              totale con IVA e dice quando si incassa: alla firma, a un SAL, a fine lavori. Con la stella ne scegli uno per le commesse nuove.
              Le commesse già fatte non cambiano.
            </CardDescription>
          </div>
          {puoAgire && (
            <Button size="sm" onClick={() => setBozza(bozzaPagamentoVuota())}><Plus className="mr-1 h-4 w-4" />Nuovo modello</Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {!isLoading && !disponibile && <p className={AVVISO}>Non riesco a leggere i modelli in questo momento. Riprova tra poco.</p>}
          {preparazione && !inizializza.isError && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Preparo i tuoi modelli…</p>
          )}
          {preparazione && inizializza.isError && (
            <div className={`${AVVISO} flex items-center justify-between gap-3`}>
              <span>Non sono riuscito a preparare i modelli.</span>
              <Button size="sm" variant="outline" onClick={() => preparaModelli({ modelli: modelliPagamentoPerInizializzare(), soloMancanti: false })}>Riprova</Button>
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
                  <li key={m.id} className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {m.nome}
                        {diPartenza && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Per le commesse nuove</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{riepilogoModello(m.righe)}</p>
                    </div>
                    {puoAgire && dellAzienda && (
                      <>
                        <Button
                          variant="ghost" size="icon" className={`h-8 w-8 ${diPartenza ? "text-amber-600" : ""}`}
                          aria-label={diPartenza ? `Togli ${m.nome} dalle commesse nuove` : `Usa ${m.nome} per le commesse nuove`}
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
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">{testoMancanti(mancanti)}</p>
              <Button size="sm" variant="outline" disabled={inizializza.isPending} onClick={ripristina}>
                <RotateCcw className="mr-1 h-4 w-4" />Ripristina i predefiniti
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ModelloPagamentoEditor
        aperto={bozza !== null}
        bozzaIniziale={bozza}
        salvataggio={salva.isPending}
        onChiudi={() => setBozza(null)}
        onSalva={(payload) => salva.mutate(payload, { onSuccess: () => setBozza(null) })}
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
            <AlertDialogAction onClick={() => { if (daEliminare) elimina.mutate(daEliminare.id); setDaEliminare(null); }}>Elimina il modello</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
