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

/** Vero quando c'è qualcosa da mostrare: un lavoro in corso o un acconto. */
export function serveLavoriInCorso(d: LavoriInCorso | null | undefined): boolean {
  if (!d) return false;
  return d.commesse_misurate > 0 && (d.lavori_in_corso > 0 || d.anticipi > 0);
}

/** Il testo che spiega se la voce 02 è entrata nel conto economico, e perché no. */
export function spiegaVariazione(d: LavoriInCorso, anno: number): string {
  if (d.rimanenza_iniziale === null) {
    return `Nel conto economico non entra ancora: serve la rimanenza al 31/12/${anno - 1}. Senza quella non si sa quanto di questo lavoro è stato fatto quest'anno, e darla per zero gonfierebbe il margine di tutto il lavoro cominciato prima.`;
  }
  const v = d.variazione_nel_ce;
  if (v === 0) {
    return `Nel conto economico la variazione è zero: il lavoro in corso è uguale a quello del 31/12/${anno - 1} (${formatCurrency(d.rimanenza_iniziale)}).`;
  }
  return v > 0
    ? `Nel conto economico entra come variazione positiva di ${formatCurrency(v)}: è il lavoro eseguito quest'anno in più rispetto al 31/12/${anno - 1}.`
    : `Nel conto economico entra come variazione negativa di ${formatCurrency(Math.abs(v))}: quest'anno hai fatturato più lavoro di quello che hai eseguito, quindi la rimanenza è scesa.`;
}

interface LavoriInCorsoCardProps {
  anno: number;
}

export function LavoriInCorsoCard({ anno }: LavoriInCorsoCardProps) {
  const query = useLavoriInCorso(anno);
  const registra = useRegistraRimanenza();
  const [apri, setApri] = useState(false);
  const [importo, setImporto] = useState("");

  const d = query.data;
  if (!serveLavoriInCorso(d) || !d) return null;

  const copertura =
    d.commesse_senza_avanzamento > 0
      ? `${d.commesse_misurate} commesse su ${d.commesse_misurate + d.commesse_senza_avanzamento}`
      : `tutte le ${d.commesse_misurate} commesse`;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4 text-muted-foreground" />
          Lavori in corso su ordinazione
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Lavoro già eseguito che non è ancora una fattura. Calcolato oggi sull'avanzamento delle
          fasi di {copertura}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Riquadro titolo="Eseguito" valore={d.maturato} />
          <Riquadro titolo="Fatturato" valore={d.fatturato} />
          <Riquadro titolo="Lavoro in corso" valore={d.lavori_in_corso} forte />
          <Riquadro
            titolo="Acconti dai clienti"
            valore={d.anticipi}
            nota="fatturato più di quanto eseguito"
          />
        </div>

        <p className="text-sm text-muted-foreground">{spiegaVariazione(d, anno)}</p>

        {d.commesse_senza_avanzamento > 0 && (
          <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/30">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Fuori dal conto restano {d.commesse_senza_avanzamento}{" "}
              {d.commesse_senza_avanzamento === 1 ? "commessa" : "commesse"} per{" "}
              {formatCurrency(d.valore_senza_avanzamento)}: non hanno fasi con un avanzamento, e
              senza avanzamento il lavoro eseguito non si può misurare. Non vale zero: vale che non
              lo sappiamo. Segna le percentuali sulle fasi e rientrano.
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {d.rimanenza_registrata !== null && (
            <Badge variant="outline" className="font-normal">
              Rimanenza registrata al 31/12/{anno}: {formatCurrency(d.rimanenza_registrata)}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setApri(true)}>
            Registra la rimanenza
          </Button>
        </div>
      </CardContent>

      <Dialog open={apri} onOpenChange={setApri}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registra la rimanenza dei lavori in corso</DialogTitle>
            <DialogDescription>
              È il valore del lavoro eseguito e non fatturato al 31 dicembre. Si registra una volta
              per esercizio, perché l'avanzamento delle fasi è un dato di oggi e non si può
              ricostruire a una data passata. Serve al conto economico dell'anno dopo come
              rimanenza iniziale.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rimanenza-esercizio">Esercizio</Label>
              <Input id="rimanenza-esercizio" value={anno} readOnly className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rimanenza-importo">Importo</Label>
              <Input
                id="rimanenza-importo"
                type="number"
                min="0"
                step="0.01"
                placeholder={String(d.lavori_in_corso)}
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Lasciandolo vuoto si registra quello che il sistema calcola adesso:{" "}
                {formatCurrency(d.lavori_in_corso)}.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApri(false)}>
              Annulla
            </Button>
            <Button
              disabled={registra.isPending}
              onClick={() => {
                const n = importo.trim() === "" ? null : Number(importo.replace(",", "."));
                if (n !== null && (Number.isNaN(n) || n < 0)) {
                  return;
                }
                registra.mutate(
                  { esercizio: anno, importo: n },
                  { onSuccess: () => { setApri(false); setImporto(""); } },
                );
              }}
            >
              Registra
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
