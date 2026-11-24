/**
 * «Annulla costo» (16/11/2026, docs/piano-punti-aperti-20261116.md §3): vale per tutti i costi.
 *
 * Prima dice cosa succede (scadenze e rate che si annullano) o cosa lo impedisce (un pagamento
 * già registrato). Se l'unico ostacolo è un pagamento in prima nota senza banca, «Storna il
 * pagamento» lo toglie da qui con la riga di storno, poi si annulla. Un costo annullato si
 * ripristina dallo stesso punto. Le regole stanno tutte nel database (costo_annulla).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import {
  annullabile, annullaCosto, leggiAnteprimaAnnullo, ripristinaCosto, stornaPagamentiCosto, stornoRisolve,
} from "@/lib/costi/annulloCosto";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  costId: string | null;
  nome?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Motivo già scritto (per esempio «Bolletta doppia»): si può cambiare. */
  motivoIniziale?: string;
  onFatto?: () => void;
}

const dataOra = (iso: string) => new Date(iso).toLocaleString(intlCampo(), { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" });

export function AnnullaCostoDialog({ costId, nome, open, onOpenChange, motivoIniziale = "", onFatto }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState(motivoIniziale);
  useEffect(() => { if (open) setMotivo(motivoIniziale); }, [open, motivoIniziale]);

  const anteprima = useQuery({
    queryKey: ["costo-annullo-anteprima", costId],
    enabled: open && !!costId,
    queryFn: () => leggiAnteprimaAnnullo(costId!),
  });

  const aggiorna = () => {
    refreshFinancialQueries(qc);
    void qc.invalidateQueries({ queryKey: ["costo-annullo-anteprima", costId] });
    void qc.invalidateQueries({ queryKey: ["costs"] });
    void qc.invalidateQueries({ queryKey: ["utenze-bollette"] });
    void qc.invalidateQueries({ queryKey: ["cdg-controllo-doppi"] });
    void qc.invalidateQueries({ queryKey: ["contabilita-da-verificare"] });
    void qc.invalidateQueries({ queryKey: ["scadenze"] });
  };

  const storna = useMutation({
    mutationFn: () => stornaPagamentiCosto(costId!),
    onSuccess: () => { toast.success(t("Pagamento stornato: in prima nota c'è la riga di storno")); aggiorna(); },
    onError: (e: Error) => toast.error(t("Storno non riuscito"), { description: e.message }),
  });
  const annulla = useMutation({
    mutationFn: () => annullaCosto(costId!, motivo.trim()),
    onSuccess: (r) => {
      const extra = [r?.scadenze_annullate ? t("{n} scadenze annullate", { n: r.scadenze_annullate }) : null, r?.rate_annullate ? t("{n} rate annullate", { n: r.rate_annullate }) : null].filter(Boolean).join(", ");
      toast.success(t("Costo annullato"), { description: extra || t("Esce da controllo di gestione, commesse e cassa prevista.") });
      aggiorna(); onFatto?.(); onOpenChange(false);
    },
    onError: (e: Error) => { toast.error(t("Costo non annullato"), { description: e.message }); aggiorna(); },
  });
  const ripristina = useMutation({
    mutationFn: () => ripristinaCosto(costId!),
    onSuccess: () => { toast.success(t("Costo ripristinato con le sue scadenze")); aggiorna(); onFatto?.(); onOpenChange(false); },
    onError: (e: Error) => toast.error(t("Costo non ripristinato"), { description: e.message }),
  });

  const a = anteprima.data;
  const occupato = storna.isPending || annulla.isPending || ripristina.isPending;
  const motivoOk = motivo.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{a?.annullato ? t("Costo annullato") : t("Annulla costo")}</DialogTitle>
          <DialogDescription>
            {nome ? `«${nome}»` : t("Il costo")}
            {a?.importo != null ? ` · ${formatCurrency(a.importo)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {anteprima.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">{t("Controllo pagamenti e scadenze…")}</p>
        ) : anteprima.isError ? (
          <p role="alert" className="text-sm text-destructive">{(anteprima.error as Error).message}</p>
        ) : a?.annullato ? (
          <div className="space-y-2 text-sm">
            <p>{a.annullato_il ? t("Annullato il {data}. Motivo: {motivo}.", { data: dataOra(a.annullato_il), motivo: a.annullato_motivo ?? "—" }) : t("Annullato. Motivo: {motivo}.", { motivo: a.annullato_motivo ?? "—" })}</p>
            <p className="text-muted-foreground">{t("Non conta nel controllo di gestione, nelle commesse e nella cassa prevista. Ripristinandolo tornano l'importo e le scadenze annullate con lui.")}</p>
          </div>
        ) : a ? (
          <div className="space-y-3 text-sm">
            {a.ostacoli.length > 0 ? (
              <div role="alert" className="space-y-2 rounded-md border border-amber-300 bg-amber-50/70 p-3 dark:bg-amber-950/20">
                <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-amber-600" />{t("Non si può annullare ancora")}</p>
                <ul className="list-disc space-y-1 pl-5">
                  {a.ostacoli.map((o) => <li key={o.codice}>{o.testo}</li>)}
                </ul>
                {stornoRisolve(a) && (
                  <Button size="sm" variant="outline" disabled={occupato} onClick={() => storna.mutate()}>
                    {storna.isPending ? t("Storno…") : t("Storna il pagamento")}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">
                {t("Il costo resta nell'elenco come annullato, con data, nome e motivo, ed esce da controllo di gestione, commesse, cassa prevista e scadenzario.")}
                {a.scadenze_da_annullare > 0 && ` ${a.scadenze_da_annullare === 1 ? t("Si annulla anche la scadenza non pagata.") : t("Si annullano anche {n} scadenze non pagate.", { n: a.scadenze_da_annullare })}`}
                {a.rate_da_annullare > 0 && ` ${a.rate_da_annullare === 1 ? t("Si annulla anche la rata del fornitore.") : t("Si annullano anche {n} rate del fornitore.", { n: a.rate_da_annullare })}`}
                {" "}{t("Si può ripristinare.")}
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor="motivo-annullo">{t("Motivo")}</Label>
              <Textarea id="motivo-annullo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
                placeholder={t("Per esempio: bolletta doppia, fattura rifiutata, inserito per sbaglio")} disabled={!annullabile(a)} />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={occupato}>{t("Chiudi")}</Button>
          {a?.annullato ? (
            <Button onClick={() => ripristina.mutate()} disabled={occupato}>
              <RotateCcw className="mr-1 h-4 w-4" />{ripristina.isPending ? t("Ripristino…") : t("Ripristina")}
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => annulla.mutate()} disabled={occupato || !annullabile(a) || !motivoOk}>
              <Ban className="mr-1 h-4 w-4" />{annulla.isPending ? t("Annullo…") : t("Annulla costo")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
