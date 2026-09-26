/**
 * Scheda POS di Sicurezza cantiere: l'elenco dei POS con stato, revisione e
 * completezza, e la creazione di un POS nuovo sul modello ufficiale a partire
 * dalla commessa (i dati li riprende l'app, niente AI).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight, FileDown, HardHat, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { usePermissions } from "@/hooks/usePermissions";
import { useCreaPos, useEliminaPos, usePosElenco, type PosRiga } from "@/hooks/usePos";
import { costruisciHtmlPos } from "@/lib/sicurezza/posHtml";
import {
  RUOLO_IMPRESA_LABEL, completezzaPercento, vociMancanti, type RuoloImpresa,
} from "../../../supabase/functions/_shared/posModello";

interface Props {
  orders: Array<{ id: string; description: string | null; order_code: string | null }>;
}

function dataIt(iso: string | null | undefined) {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function PosElencoTab({ orders }: Props) {
  const navigate = useNavigate();
  const perms = usePermissions();
  const puoScrivere = (perms.canViewSicurezzaCantiere || perms.isAdmin) && !perms.solaLettura;
  const { data: elenco = [], isLoading, isError, refetch } = usePosElenco();
  const crea = useCreaPos();
  const elimina = useEliminaPos();

  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [ruolo, setRuolo] = useState<RuoloImpresa>("affidataria_esecutrice");
  const [daEliminare, setDaEliminare] = useState<PosRiga | null>(null);
  const [stampa, setStampa] = useState<{ html: string; nome: string } | null>(null);

  const conPos = useMemo(() => new Set(elenco.map((p) => p.order_id)), [elenco]);

  const creaPos = async () => {
    if (!orderId) return;
    try {
      const r = await crea.mutateAsync({ orderId, ruoloImpresa: ruolo });
      setNuovoAperto(false);
      navigate(`/azienda/sicurezza-cantiere/pos/${r.pos_id}`, { state: { avvisi: r.avvisi } });
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  return (
    <div className="space-y-4 max-sm:space-y-2">
      {/* Mobile no: il POS si compila al computer (editor del modello ministeriale).
          Senza la frase sul decreto: resta il bottone, a destra. */}
      <div className="flex flex-wrap items-center justify-end gap-2 max-sm:hidden">
        {puoScrivere && (
          <Button size="sm" onClick={() => { setOrderId(""); setRuolo("affidataria_esecutrice"); setNuovoAperto(true); }} className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600">
            <Plus className="mr-1 h-4 w-4" />Nuovo POS
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Non riesco a caricare i POS.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>Riprova</button>
        </div>
      ) : elenco.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center max-sm:py-5">
          <HardHat className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40 max-sm:hidden" />
          <p className="font-medium max-sm:text-sm">Nessun POS</p>
          <p className="mt-1 text-sm text-muted-foreground max-sm:hidden">Crea il primo dalla commessa: l'app riprende committente, cantiere, impresa, figure e lavoratori.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {elenco.map((p) => {
            const approvato = p.status === "approvato";
            const mancanti = p.daCompilare ? null : vociMancanti(p.contenuto).length;
            const percento = p.daCompilare ? 0 : completezzaPercento(p.contenuto);
            const titolo = [p.commessa?.order_code, p.commessa?.description].filter(Boolean).join(" — ") || "Commessa";
            return (
              // Da 640 PDF ed Elimina sono icone a destra della riga, non una
              // seconda fascia sotto ogni POS.
              <li key={p.id} className="rounded-xl border bg-card sm:flex sm:items-center">
                <button type="button" onClick={() => navigate(`/azienda/sicurezza-cantiere/pos/${p.id}`)}
                  className="flex w-full min-w-0 items-start gap-3 p-4 text-left hover:bg-muted/30 max-sm:gap-2 max-sm:px-3 max-sm:py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium max-sm:text-[13px]">{titolo}</span>
                      <Badge variant="outline" className={approvato ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>
                        {approvato ? "Approvato" : "Bozza"}
                      </Badge>
                      <Badge variant="outline" className="max-sm:hidden">Rev. {p.revisione}</Badge>
                      {p.daCompilare && (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">Da rifare sul modello ufficiale</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground max-sm:text-[11px]">
                      {approvato && p.approvato_da_nome
                        ? `Approvato da ${p.approvato_da_nome}${p.approvato_il ? ` il ${dataIt(p.approvato_il)}` : ""}`
                        : `Creato il ${dataIt(p.created_at)}`}
                    </p>
                    {!p.daCompilare && !approvato && (
                      <div className="mt-2 flex items-center gap-2 max-sm:mt-0.5">
                        <Progress value={percento} className="h-1.5 max-w-xs max-sm:hidden" aria-label={`Completezza ${percento}%`} />
                        <span className="text-xs text-muted-foreground max-sm:text-[11px]">
                          {mancanti ? `${mancanti} ${mancanti === 1 ? "voce" : "voci"} da completare` : "Pronto da approvare"}
                        </span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground sm:hidden" aria-hidden="true" />
                </button>
                {/* Mobile no: PDF (niente export da telefono) ed eliminazione. */}
                <div className="flex shrink-0 items-center gap-1 pr-3 max-sm:hidden">
                  {!p.daCompilare && (
                    <Button size="icon" variant="ghost" className="h-9 w-9" title="Scarica il PDF" aria-label="Scarica il PDF" onClick={() => setStampa({
                      html: costruisciHtmlPos({
                        contenuto: p.contenuto, stato: p.status, revisione: p.revisione, revisioni: p.revisioni,
                        approvatoDa: p.approvato_da_nome, approvatoIl: p.approvato_il, codiceCommessa: p.commessa?.order_code,
                      }),
                      nome: `POS-${p.commessa?.order_code ?? p.id.slice(0, 8)}-rev${p.revisione}`,
                    })}>
                      <FileDown className="h-4 w-4" />
                    </Button>
                  )}
                  {puoScrivere && !approvato && (
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" title="Elimina il POS" aria-label="Elimina il POS" onClick={() => setDaEliminare(p)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={nuovoAperto} onOpenChange={setNuovoAperto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo POS</DialogTitle>
            <DialogDescription className="max-sm:sr-only">
              L'app compila il modello ufficiale con i dati che ha: committente e indirizzo del cantiere, impresa, figure della sicurezza, lavoratori della commessa e la loro formazione. Il resto lo completi tu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nuovo-pos-commessa">Commessa</Label>
              <Select value={orderId || undefined} onValueChange={setOrderId}>
                <SelectTrigger id="nuovo-pos-commessa"><SelectValue placeholder="Scegli la commessa" /></SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code ? `${o.order_code} — ` : ""}{o.description}{conPos.has(o.id) ? " (ha già un POS)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {orderId && conPos.has(orderId) && (
                <p className="flex items-center gap-1 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" />Questa commessa ha già un POS: per cambiarlo di solito basta una nuova revisione.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>La tua impresa in questo cantiere è</Label>
              <RadioGroup value={ruolo} onValueChange={(v) => setRuolo(v as RuoloImpresa)} className="space-y-1">
                {(Object.keys(RUOLO_IMPRESA_LABEL) as RuoloImpresa[]).map((r) => (
                  <Label key={r} htmlFor={`nuovo-ruolo-${r}`} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm font-normal">
                    <RadioGroupItem id={`nuovo-ruolo-${r}`} value={r} />{RUOLO_IMPRESA_LABEL[r]}
                  </Label>
                ))}
              </RadioGroup>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="max-sm:hidden" onClick={() => setNuovoAperto(false)}>Annulla</Button>
            <Button onClick={creaPos} disabled={!orderId || crea.isPending}>
              {crea.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Crea il POS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo POS?</AlertDialogTitle>
            <AlertDialogDescription>
              Il POS in bozza di «{daEliminare?.commessa?.order_code || daEliminare?.commessa?.description || "commessa"}» sparisce con le sue revisioni.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daEliminare && elimina.mutate(daEliminare.id)}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {stampa && (
        <PrintPreviewModal htmlContent={stampa.html} fileName={stampa.nome} title="Anteprima del POS" open={!!stampa}
          onOpenChange={(o) => !o && setStampa(null)} />
      )}
    </div>
  );
}
