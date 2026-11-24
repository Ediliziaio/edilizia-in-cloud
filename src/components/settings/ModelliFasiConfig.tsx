// src/components/settings/ModelliFasiConfig.tsx
import { useState } from "react";
import { Copy, Eye, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useProfiloLavori } from "@/hooks/useProfiloLavori";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import {
  bozzaDaModello, bozzaVuota, modelliDaOffrire, modelliDiPartenzaMancanti, modelliPerInizializzare, totaleSottofasi,
  type BozzaModello, type ModelloFasi,
} from "@/lib/orders/modelliFasi";
import { AnteprimaModelloFasi } from "./AnteprimaModelloFasi";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import ModelloFasiEditor from "./ModelloFasiEditor";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const piega = (testo: string) => testo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const dettaglio = (m: ModelloFasi, t: (testo: string, valori?: Record<string, string | number>) => string): string => {
  const sotto = totaleSottofasi(m);
  return [m.descrizione, t("{n} fasi", { n: m.fasi.length }), sotto > 0 ? t("{n} sottofasi", { n: sotto }) : null].filter(Boolean).join(" · ");
};

const testoMancanti = (n: number, t: (testo: string, valori?: Record<string, string | number>) => string): string => (n === 1 ? t("Ti manca 1 modello di partenza.") : t("Ti mancano {n} modelli di partenza.", { n }));
const AVVISO = "rounded-lg border border-dashed p-4 text-sm text-muted-foreground";

/** `evidenziata`: la sezione è quella a cui porta l'indirizzo con l'àncora (`…/modelli-fasi#modelli`). */
export default function ModelliFasiConfig({ evidenziata = false }: { evidenziata?: boolean }) {
  const t = useT();
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders);
  const { modelli, inizializzati, disponibile, isLoading, isError, refetch, salva, elimina, inizializza } = useModelliFasi();
  const [bozza, setBozza] = useState<BozzaModello | null>(null);
  const [anteprima, setAnteprima] = useState<ModelloFasi | null>(null);
  const [ricerca, setRicerca] = useState("");
  const [daEliminare, setDaEliminare] = useState<ModelloFasi | null>(null);

  // L'apertura della pagina non scrive dati: gli standard si importano esplicitamente.
  const preparaModelli = inizializza.mutate;

  // Gli standard sono quelli dei lavori che l'azienda fa; i modelli suoi si vedono tutti, qui si gestiscono.
  const { modelliStandard } = useProfiloLavori();
  const elenco = modelliDaOffrire(inizializzati, modelli, modelliStandard);
  const filtrati = elenco.filter((m) => piega([m.nome, m.descrizione, ...m.fasi.flatMap((f) => [f.nome, ...f.sottofasi.map((s) => s.nome)])].join(" ")).includes(piega(ricerca.trim())));
  const mancanti = inizializzati ? modelliDiPartenzaMancanti(modelliStandard, modelli) : 0;
  const preparazione = disponibile && !inizializzati && puoModificare;
  const busy = salva.isPending || elimina.isPending || inizializza.isPending;
  const puoAgire = puoModificare && disponibile && !isLoading && !isError && !busy;

  const ripristina = () =>
    inizializza.mutate(
      { modelli: modelliPerInizializzare(modelliStandard), soloMancanti: true },
      { onSuccess: (n) => toast.success(n === 1 ? t("1 modello rimesso") : t("{n} modelli rimessi", { n: String(n ?? "") })) },
    );

  return (
    <>
      <SezioneImpostazione
        id="modelli"
        titolo={t("Modelli di fasi")}
        descrizione={t("Li trovi nella commessa: Lavorazioni → Aggiungi fasi → Usa un modello. Ogni fase può avere sottofasi. Le modifiche si applicano con «Salva modello». Modificare un modello non cambia le commesse già avviate.")}
        azione={puoAgire ? <Button size="sm" onClick={() => setBozza(bozzaVuota())}><Plus className="mr-1 h-4 w-4" />{t("Nuovo modello")}</Button> : undefined}
        evidenziata={evidenziata}
      >
        <div className="space-y-3 px-4 py-4">
          {isLoading && <p role="status" className={AVVISO}>{t("Caricamento modelli…")}</p>}
          {(isError || (!isLoading && !disponibile)) && <div role="alert" className={AVVISO}><p>{t("Non riesco a leggere i modelli aziendali. Gli standard sotto sono solo un riferimento.")}</p><Button size="sm" variant="outline" onClick={() => void refetch()}>{t("Riprova")}</Button></div>}
          {preparazione && !busy && (
            <div className={`${AVVISO} space-y-2`}><p>{t("Importa gli standard per personalizzarli. Le commesse esistenti non cambiano.")}</p><Button size="sm" variant="outline" onClick={() => preparaModelli({ modelli: modelliPerInizializzare(modelliStandard), soloMancanti: false })}>{t("Importa modelli standard")}</Button></div>
          )}
          {inizializza.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("Preparo i tuoi modelli…")}</p>
          )}
          {preparazione && inizializza.isError && (
            <div className={`${AVVISO} flex items-center justify-between gap-3`}>
              <span>{t("Non sono riuscito a preparare i modelli.")}</span>
              <Button size="sm" variant="outline" onClick={() => preparaModelli({ modelli: modelliPerInizializzare(modelliStandard), soloMancanti: false })}>{t("Riprova")}</Button>
            </div>
          )}
          {disponibile && !inizializzati && !puoModificare && (
            <p className={AVVISO}>{t("Sono i modelli di partenza. Chi gestisce le impostazioni delle commesse li potrà fare suoi e cambiarli.")}</p>
          )}

          {elenco.length > 0 && <div className="flex flex-wrap items-center gap-3">
            <Input aria-label={t("Cerca nei modelli di fasi")} placeholder={t("Cerca un modello, una fase o una sottofase…")} value={ricerca} onChange={(e) => setRicerca(e.target.value)} className="max-w-md" />
            <span role="status" className="text-xs text-muted-foreground">{t("{n} di {n2} modelli", { n: filtrati.length, n2: elenco.length })}</span>
          </div>}
          {elenco.length > 0 && filtrati.length === 0 && <p className={AVVISO}>{t("Nessun modello corrisponde alla ricerca.")} <Button variant="link" size="sm" onClick={() => setRicerca("")}>{t("Mostra tutti")}</Button></p>}
          {elenco.length === 0 ? (
            <p className={AVVISO}>
              {t("Non hai modelli. Creane uno con «Nuovo modello», oppure rimetti quelli di partenza. Puoi anche salvare le fasi di una commessa già fatta: «Aggiungi fasi» → «Salva come modello».")}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {filtrati.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{m.nome}</p>
                    <p className="break-words text-xs text-muted-foreground">{dettaglio(m, t)}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-11 w-11" title={t("Anteprima {nome}", { nome: String(m.nome ?? "") })} aria-label={t("Anteprima {nome}", { nome: String(m.nome ?? "") })} onClick={() => setAnteprima(m)}><Eye className="h-4 w-4" /></Button>
                  {puoAgire && m.origine === "azienda" && (
                    <>
                      <Button variant="ghost" size="icon" className="h-11 w-11" title={t("Modifica {nome}", { nome: String(m.nome ?? "") })} aria-label={t("Modifica {nome}", { nome: String(m.nome ?? "") })} onClick={() => setBozza(bozzaDaModello(m, false))}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-11 w-11" title={t("Duplica {nome}", { nome: String(m.nome ?? "") })} aria-label={t("Duplica {nome}", { nome: String(m.nome ?? "") })} onClick={() => setBozza(bozzaDaModello(m, true))}><Copy className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-11 w-11 text-rose-600" title={t("Elimina {nome}", { nome: String(m.nome ?? "") })} aria-label={t("Elimina {nome}", { nome: String(m.nome ?? "") })} onClick={() => setDaEliminare(m)}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {puoAgire && mancanti > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">{testoMancanti(mancanti, t)}</p>
              <Button size="sm" variant="outline" disabled={inizializza.isPending} onClick={ripristina}>
                <RotateCcw className="mr-1 h-4 w-4" />{t("Ripristina i predefiniti")}
              </Button>
            </div>
          )}
        </div>
      </SezioneImpostazione>

      <Dialog open={anteprima !== null} onOpenChange={(o) => { if (!o) setAnteprima(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{t("Anteprima: {nome}", { nome: String(anteprima?.nome ?? "") })}</DialogTitle><DialogDescription>{t("Questa è la sequenza che copierai nella commessa scegliendo il modello. Le commesse esistenti restano come sono.")}</DialogDescription></DialogHeader>
          {anteprima && <AnteprimaModelloFasi fasi={anteprima.fasi} />}
        </DialogContent>
      </Dialog>
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
            <AlertDialogTitle>{t("Eliminare «{nome}»?", { nome: String(daEliminare?.nome ?? "") })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Le commesse che hanno già usato questo modello restano come sono: cambia solo l'elenco. Se era uno dei modelli di partenza, puoi rimetterlo con «Ripristina i predefiniti».")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction disabled={!puoAgire} onClick={(e) => { e.preventDefault(); if (daEliminare && puoAgire) elimina.mutate(daEliminare.id, { onSuccess: () => setDaEliminare(null) }); }}>{t("Elimina il modello")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
