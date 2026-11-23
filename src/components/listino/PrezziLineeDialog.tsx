/**
 * Prezzi delle linee di UNA tipologia: lo scostamento di ogni linea, quali
 * restano accese e, se serve, il prezzo al metro quadro della linea di
 * riferimento.
 *
 * Parte da com'è il listino adesso. Il dialog di prima valeva per tutti i
 * serramenti dell'azienda, partiva vuoto e spegneva ogni linea che non si
 * riscriveva: aprirlo per cambiare un numero poteva togliere una serie da
 * tutti i preventivi.
 */
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { TipologiaListino } from "@/lib/listino/lineeListino";
import {
  leggiImporto,
  leggiPercentuale,
  lineeDaAsse,
  prezzoMqPrevalente,
  problemaPrezziLinee,
  scriviPercentuale,
  type PrezzoLineaForm,
} from "@/lib/listino/organizzaListino";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const EURO = { format: (n: number) => new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR" }).format(n) };

export interface DatiPrezziLinee {
  linee: Array<{ nome: string; pct: number; attiva: boolean }>;
  prezzoVenditaMq: number | null;
  prezzoAcquistoMq: number | null;
}

interface Props {
  tipologia: TipologiaListino;
  inCorso: boolean;
  onChiudi: () => void;
  onSalva: (dati: DatiPrezziLinee) => void;
}

export function PrezziLineeDialog({ tipologia, inCorso, onChiudi, onSalva }: Props) {
  const t = useT();
  const iniziali = useMemo<PrezzoLineaForm[]>(
    () => lineeDaAsse(tipologia).map((l) => ({ nome: l.nome, pct: scriviPercentuale(l.scostamentoPct), attiva: true })),
    [tipologia],
  );
  const aCifraFissa = useMemo(
    () => new Set(lineeDaAsse(tipologia).filter((l) => l.scostamentoPct == null).map((l) => l.nome)),
    [tipologia],
  );
  const prezzo = useMemo(() => prezzoMqPrevalente(tipologia), [tipologia]);
  const [linee, setLinee] = useState<PrezzoLineaForm[]>(iniziali);
  const [vendita, setVendita] = useState("");
  const [acquisto, setAcquisto] = useState("");

  const problema = problemaPrezziLinee(linee, vendita, acquisto);
  const base = (vendita.trim() ? leggiImporto(vendita) : null) ?? prezzo.vendita;

  const cambia = (indice: number, patch: Partial<PrezzoLineaForm>) =>
    setLinee((prima) => prima.map((l, i) => (i === indice ? { ...l, ...patch } : l)));

  const salva = () => {
    if (problema) return;
    onSalva({
      linee: linee.map((l) => ({ nome: l.nome, pct: leggiPercentuale(l.pct) ?? 0, attiva: l.attiva })),
      prezzoVenditaMq: vendita.trim() ? leggiImporto(vendita) : null,
      prezzoAcquistoMq: acquisto.trim() ? leggiImporto(acquisto) : null,
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !inCorso) onChiudi();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Prezzi delle linee di {nome}", { nome: tipologia.nome })}</DialogTitle>
          <DialogDescription>
            {t("Vale solo per i {n} prodotti di {nome}. Una linea spenta non si propone più nei preventivi, ma i preventivi fatti restano com'erano.", { n: tipologia.articoli, nome: tipologia.nome })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t("Linea")}</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">{t("Scostamento %")}</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">{t("Al m²")}</th>
                  <th className="w-20 px-3 py-2 text-center font-medium">{t("Accesa")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linee.map((l, i) => {
                  const pct = leggiPercentuale(l.pct);
                  const alMq = base != null && pct != null ? base * (1 + pct / 100) : null;
                  return (
                    <tr key={l.nome} className={cn(!l.attiva && "text-muted-foreground")}>
                      <td className="px-3 py-2">
                        <span className="block">{l.nome}</span>
                        {aCifraFissa.has(l.nome) && (
                          <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                            {t("Oggi è a cifra fissa: scrivi lo scostamento in %")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          value={l.pct}
                          onChange={(e) => cambia(i, { pct: e.target.value })}
                          inputMode="decimal"
                          aria-label={t("Scostamento di {nome}", { nome: l.nome })}
                          className="h-9 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{alMq != null ? EURO.format(alMq) : "—"}</td>
                      <td className="px-3 py-2 text-center">
                        <Switch
                          checked={l.attiva}
                          onCheckedChange={(v) => cambia(i, { attiva: v })}
                          aria-label={t("{nome} accesa", { nome: l.nome })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {prezzo.prodotti > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("Prezzo al m² della linea di riferimento")}</legend>
              <p className="text-xs text-muted-foreground">
                {t("Vale per i {n} prodotti venduti a metro quadro. Vuoto = resta com'è", { n: prezzo.prodotti })}
                {prezzo.vendita != null ? ` ${t("(oggi {importo} di vendita)", { importo: EURO.format(prezzo.vendita) })}` : ""}.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="prezzi-vendita">{t("Vendita €/m²")}</Label>
                  <Input
                    id="prezzi-vendita"
                    value={vendita}
                    onChange={(e) => setVendita(e.target.value)}
                    inputMode="decimal"
                    placeholder={prezzo.vendita != null ? String(prezzo.vendita).replace(".", ",") : ""}
                    className="h-10 text-right"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prezzi-acquisto">{t("Acquisto €/m²")}</Label>
                  <Input
                    id="prezzi-acquisto"
                    value={acquisto}
                    onChange={(e) => setAcquisto(e.target.value)}
                    inputMode="decimal"
                    placeholder={prezzo.acquisto != null ? String(prezzo.acquisto).replace(".", ",") : ""}
                    className="h-10 text-right"
                  />
                </div>
              </div>
            </fieldset>
          )}

          {problema && <p className="text-sm text-destructive">{problema}</p>}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button variant="ghost" onClick={onChiudi} disabled={inCorso} className="h-10 w-full sm:w-auto">
            {t("Annulla")}
          </Button>
          <Button onClick={salva} disabled={inCorso || !!problema} className="h-10 w-full sm:w-auto">
            {inCorso ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {t("Salvataggio…")}
              </>
            ) : (
              t("Salva i prezzi")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
