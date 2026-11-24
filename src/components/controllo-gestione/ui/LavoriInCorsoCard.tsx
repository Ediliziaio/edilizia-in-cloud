/**
 * «Hai questo lavoro fatto e non fatturato.»
 *
 * Il numero serve anche da solo — dice quanto vale il lavoro già eseguito che
 * non è ancora una fattura — ma la parte importante è quello che gli sta
 * intorno: quante commesse copre, quante no, e che cosa manca perché entri nel
 * conto economico. Un numero del genere senza il suo perimetro è peggio di
 * nessun numero.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { HardHat, TriangleAlert } from "lucide-react";
import {
  useLavoriInCorso,
  useRegistraRimanenza,
  type LavoriInCorso,
} from "@/hooks/controlloGestione/useLavoriInCorso";
import { useT, intlCampo, sostituisci } from "@/lib/campo/lingua/LinguaCampo";

export function serveLavoriInCorso(d: LavoriInCorso | null | undefined): boolean {
  if (!d) return false;
  return d.commesse_senza_avanzamento > 0 || d.rimanenza_registrata !== null ||
    !!d.ultime_rimanenze?.length || (d.commesse_misurate > 0 && (d.lavori_in_corso > 0 || d.anticipi > 0));
}

/** Il testo che spiega se la voce 02 è entrata nel conto economico, e perché no. */
export function spiegaVariazione(d: LavoriInCorso, anno: number, tr: (testo: string, valori?: Record<string, string | number>) => string = sostituisci): string {
  if (d.rimanenza_iniziale === null) {
    return tr("Nel conto economico non entra ancora: serve la rimanenza al 31/12/{anno}. Senza quella non si sa quanto di questo lavoro è stato fatto quest'anno, e darla per zero gonfierebbe il margine di tutto il lavoro cominciato prima.", { anno: anno - 1 });
  }
  if (d.ultime_rimanenze?.length === 0 && d.rimanenza_registrata === null) {
    return tr("Per includere la variazione nel conto economico, registra una rimanenza alla fine di un mese.");
  }
  const v = d.variazione_nel_ce;
  if (v === 0) {
    return tr("Nel conto economico la variazione è zero: il lavoro in corso è uguale a quello del 31/12/{anno} ({importo}).", { anno: anno - 1, importo: formatCurrency(d.rimanenza_iniziale) });
  }
  return v > 0
    ? tr("Nel conto economico entra come variazione positiva di {importo}: è il lavoro eseguito quest'anno in più rispetto al 31/12/{anno}.", { importo: formatCurrency(v), anno: anno - 1 })
    : tr("Nel conto economico entra come variazione negativa di {importo}: quest'anno hai fatturato più lavoro di quello che hai eseguito, quindi la rimanenza è scesa.", { importo: formatCurrency(Math.abs(v)) });
}

interface LavoriInCorsoCardProps {
  anno: number;
}

export function LavoriInCorsoCard({ anno }: LavoriInCorsoCardProps) {
  const t = useT();
  const query = useLavoriInCorso(anno);
  const registra = useRegistraRimanenza();
  const [apri, setApri] = useState(false);
  const [importo, setImporto] = useState("");
  const [mese, setMese] = useState(0);

  const d = query.data;
  if (query.isError) return <p role="alert" className="rounded-lg border p-3 text-sm text-destructive">
    {t("Lavori in corso non disponibili.")} <button className="underline" onClick={() => void query.refetch()}>{t("Riprova")}</button>
  </p>;
  if (!serveLavoriInCorso(d) || !d) return null;
  const [annoOggi, meseOggi] = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).split("-").map(Number);
  const mesiChiusi = anno < annoOggi ? 12 : anno === annoOggi ? meseOggi - 1 : 0;
  const meseScelto = mese > 0 && mese <= mesiChiusi ? mese : mesiChiusi;
  const valoreRegistrato = meseScelto === 12 ? d.rimanenza_registrata
    : d.ultime_rimanenze?.find((r) => r.mese === meseScelto)?.importo;
  const valore = Number(importo.replace(",", "."));

  const copertura =
    d.commesse_senza_avanzamento > 0
      ? t("{n} commesse su {totale}", { n: d.commesse_misurate, totale: d.commesse_misurate + d.commesse_senza_avanzamento })
      : t("tutte le {n} commesse", { n: d.commesse_misurate });

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4 text-muted-foreground" />
          {t("Lavori in corso su ordinazione")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("Lavoro già eseguito che non è ancora una fattura. Calcolato oggi sull'avanzamento delle fasi di {copertura}.", { copertura })}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {d.commesse_misurate > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Riquadro titolo={t("Eseguito")} valore={d.maturato} />
          <Riquadro titolo={t("Fatturato")} valore={d.fatturato} />
          <Riquadro titolo={t("Lavoro in corso")} valore={d.lavori_in_corso} forte />
          <Riquadro
            titolo={t("Acconti dai clienti")}
            valore={d.anticipi}
            nota={t("fatturato più di quanto eseguito")}
          />
        </div>}

        <p className="text-sm text-muted-foreground">{spiegaVariazione(d, anno, t)}</p>

        {d.commesse_senza_avanzamento > 0 && (
          <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/30">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {(d.commesse_senza_avanzamento === 1 ? t("Fuori dal conto restano {n} commessa per {importo}: non hanno fasi con un avanzamento, e senza avanzamento il lavoro eseguito non si può misurare. Non vale zero: vale che non lo sappiamo. Segna le percentuali sulle fasi e rientrano.", { n: d.commesse_senza_avanzamento, importo: formatCurrency(d.valore_senza_avanzamento) }) : t("Fuori dal conto restano {n} commesse per {importo}: non hanno fasi con un avanzamento, e senza avanzamento il lavoro eseguito non si può misurare. Non vale zero: vale che non lo sappiamo. Segna le percentuali sulle fasi e rientrano.", { n: d.commesse_senza_avanzamento, importo: formatCurrency(d.valore_senza_avanzamento) }))}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {d.rimanenza_registrata !== null && (
            <Badge variant="outline" className="font-normal">{t("Rimanenza al 31/12/{anno} · {rimanenza_registrata}", { anno: String(anno ?? ""), rimanenza_registrata: formatCurrency(d.rimanenza_registrata) })}</Badge>
          )}
          <Button disabled={!mesiChiusi} variant="outline" size="sm" onClick={() => setApri(true)}>
            {t("Registra la rimanenza")}
          </Button>
        </div>
      </CardContent>

      <Dialog open={apri} onOpenChange={setApri}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Registra la rimanenza dei lavori in corso")}</DialogTitle>
            <DialogDescription>
              {t("Inserisci il valore verificato del lavoro eseguito e da fatturare alla fine del mese scelto. La chiusura di dicembre determina anche la rimanenza iniziale dell’anno successivo.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rimanenza-mese">{t("Mese di chiusura")}</Label>
              <select id="rimanenza-mese" className="h-9 w-full rounded-md border bg-background px-3"
                value={meseScelto} onChange={(e) => { setMese(Number(e.target.value)); setImporto(""); }}>
                {Array.from({ length: mesiChiusi }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(anno, i, 1).toLocaleDateString(intlCampo(), { month: "long" })}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rimanenza-esercizio">{t("Esercizio")}</Label>
              <Input id="rimanenza-esercizio" value={anno} readOnly className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rimanenza-importo">{t("Importo")}</Label>
              <Input
                id="rimanenza-importo"
                type="number"
                min="0"
                step="0.01"
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
              />
              {valoreRegistrato != null && <p className="text-xs text-muted-foreground">{t("Valore già registrato per questo mese · {valoreRegistrato}", { valoreRegistrato: formatCurrency(valoreRegistrato) })}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApri(false)}>
              {t("Annulla")}
            </Button>
            <Button
              disabled={registra.isPending || !meseScelto || !importo.trim() || !Number.isFinite(valore) || valore < 0}
              onClick={() => {
                registra.mutate(
                  { esercizio: anno, mese: meseScelto, importo: valore },
                  { onSuccess: () => { setApri(false); setImporto(""); } },
                );
              }}
            >
              {valoreRegistrato != null ? t("Aggiorna rimanenza") : t("Registra")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Riquadro({
  titolo, valore, forte, nota,
}: { titolo: string; valore: number; forte?: boolean; nota?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{titolo}</p>
      <p className={forte ? "text-lg font-semibold tabular-nums" : "text-base tabular-nums"}>
        {formatCurrency(valore)}
      </p>
      {nota && <p className="mt-0.5 text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}
