/**
 * BonusLinesCard — ripartizione della commessa su più bonus edilizi.
 *
 * Serve a chi spezza un contratto su due agevolazioni distinte (es. metà
 * Ecobonus infissi, metà misure antintrusione): sono DUE pratiche, quindi il
 * cliente deve fare DUE bonifici parlanti con causali diverse. Qui si decide
 * quanto va su ciascuna, si vede la ritenuta 11% riga per riga e si copia la
 * causale pronta da passare al cliente.
 *
 * Compare solo se l'azienda ha acceso "Bonus edilizi multipli" in Impostazioni.
 */
import { useState } from "react";
import { Plus, Trash2, Copy, Percent, TriangleAlert, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import { parseDecimalIT, formatDecimalIT } from "@/lib/parseDecimalIT";
import { DETRAZIONI_EDILIZIE } from "@/lib/fatturazione/detrazioniEdilizie";
import {
  type BonusLine,
  type DatiCausale,
  bonusLineFromPreset,
  bonusLineVuota,
  assorbiResiduoSullUltima,
  residuoBonus,
  lordoRiga,
  ritenutaRiga,
  detrazioneRiga,
  sforaTetto,
  totaliBonus,
  validaBonusLines,
  causaleBonificoParlante,
  getPreset,
} from "@/lib/orders/bonusFiscali";

interface Props {
  lines: BonusLine[];
  onChange: (lines: BonusLine[]) => void;
  /** Imponibile della commessa: è la cifra che le righe devono ricoprire. */
  totaleCommessa: number;
  vatRate: number;
  readOnly?: boolean;
  /** CF cliente / P.IVA impresa per comporre la causale del bonifico. */
  datiCausale?: DatiCausale;
}

export function BonusLinesCard({
  lines,
  onChange,
  totaleCommessa,
  vatRate,
  readOnly = false,
  datiCausale,
}: Props) {
  const { toast } = useToast();
  // `raw` tiene SOLO le righe in corso di digitazione: l'utente scrive "10.000"
  // e lo rileggiamo al blur (stessa regola degli altri campi importo). Fuori da
  // quel momento il campo mostra il valore vero, formattato — così non serve
  // nessun effetto di sincronizzazione (che andrebbe fuori sync a ogni riordino).
  const [raw, setRaw] = useState<Record<number, string>>({});
  const [causaleAperta, setCausaleAperta] = useState<Record<number, boolean>>({});

  const valoreCampo = (line: BonusLine) =>
    raw[line.position] ?? (line.imponibile > 0 ? formatDecimalIT(line.imponibile) : "");

  const rinumera = (next: BonusLine[]) => next.map((l, i) => ({ ...l, position: i }));

  const patch = (position: number, p: Partial<BonusLine>) =>
    onChange(lines.map((l) => (l.position === position ? { ...l, ...p } : l)));

  const aggiungi = () => {
    const residuo = Math.max(0, residuoBonus(totaleCommessa, lines));
    onChange(rinumera([...lines, bonusLineVuota(lines.length, residuo)]));
  };

  const rimuovi = (position: number) => {
    setRaw({});
    onChange(rinumera(lines.filter((l) => l.position !== position)));
  };

  const importoChange = (position: number, testo: string) =>
    setRaw((p) => ({ ...p, [position]: testo }));

  const scegliPreset = (position: number, presetId: string) => {
    const riga = lines.find((l) => l.position === position);
    const base = bonusLineFromPreset(presetId, position, riga?.imponibile ?? 0);
    // La causale scritta a mano dall'utente non va persa: si sovrascrive solo
    // se era ancora quella (vuota o generata dal preset precedente).
    const causaleToccata =
      !!riga?.causale &&
      riga.causale !== getPreset(riga.presetId)?.clausola;
    patch(position, { ...base, causale: causaleToccata ? riga!.causale : base.causale });
  };

  const importoBlur = (position: number) => {
    if (raw[position] === undefined) return; // campo non toccato
    const valore = parseDecimalIT(raw[position] || "");
    // Uscendo dal campo la riga torna a mostrare il valore vero: è l'unico
    // momento in cui l'utente vede come è stato letto quello che ha digitato.
    setRaw((p) => {
      const next = { ...p };
      delete next[position];
      return next;
    });
    patch(position, { imponibile: valore > 0 ? valore : 0 });
  };

  const quadra = () => {
    setRaw({});
    onChange(assorbiResiduoSullUltima(totaleCommessa, lines));
  };

  const copiaCausale = async (line: BonusLine) => {
    const testo = line.causale?.trim() || causaleBonificoParlante(line, datiCausale);
    try {
      await navigator.clipboard.writeText(testo);
      toast({ title: "Causale copiata", description: "Incollala nel bonifico del cliente." });
    } catch {
      toast({ title: "Copia non riuscita", description: "Seleziona il testo e copialo a mano.", variant: "destructive" });
    }
  };

  const residuo = residuoBonus(totaleCommessa, lines);
  const totali = totaliBonus(lines, vatRate);
  const esito = validaBonusLines(totaleCommessa, lines, vatRate);
  const quadrato = Math.abs(residuo) <= 0.01 && lines.length > 0;

  return (
    <div className="rounded-lg border bg-amber-50/40 dark:bg-amber-950/10 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Percent className="h-4 w-4 text-amber-600" />
            Ripartizione tra agevolazioni
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Ogni agevolazione è una pratica a sé: il cliente deve fare un bonifico parlante distinto
            per ciascuna, con la sua causale.
          </p>
        </div>
        <Badge variant={quadrato ? "secondary" : "destructive"} className="shrink-0 tabular-nums">
          {quadrato
            ? "Ripartizione completa"
            : residuo > 0
              ? `Da assegnare ${formatCurrency(residuo)}`
              : `Eccedenza ${formatCurrency(Math.abs(residuo))}`}
        </Badge>
      </div>

      {lines.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nessuna agevolazione: aggiungine una per dividere il contratto.
        </p>
      )}

      <div className="space-y-3">
        {lines.map((line) => {
          const preset = getPreset(line.presetId);
          const lordo = lordoRiga(line, vatRate);
          const ritenuta = ritenutaRiga(line);
          const detrazione = detrazioneRiga(line, vatRate);
          const sfora = sforaTetto(line, vatRate);
          return (
            <div key={line.position} className="rounded-md border bg-background p-2.5 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 min-w-0 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Agevolazione</Label>
                  <Select
                    value={line.presetId ?? undefined}
                    onValueChange={(v) => scegliPreset(line.position, v)}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Scegli l'agevolazione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {DETRAZIONI_EDILIZIE.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-2">
                            <span>{p.label}</span>
                            <span className="text-[10px] rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                              {p.aliquota}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full sm:w-44 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Imponibile</Label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                    <Input
                      inputMode="decimal"
                      value={valoreCampo(line)}
                      onChange={(e) => importoChange(line.position, e.target.value)}
                      onBlur={() => importoBlur(line.position)}
                      placeholder="0,00"
                      className="h-9 pl-5 tabular-nums"
                      disabled={readOnly}
                    />
                  </div>
                </div>

                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => rimuovi(line.position)}
                    aria-label="Rimuovi agevolazione"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
                <span className="text-muted-foreground">
                  Bonifico lordo <span className="font-medium text-foreground tabular-nums">{formatCurrency(lordo)}</span>
                </span>
                <span className="text-muted-foreground">
                  Ritenuta 11% <span className="font-medium text-amber-700 tabular-nums">−{formatCurrency(ritenuta)}</span>
                </span>
                <span className="text-muted-foreground">
                  Ti arriva <span className="font-medium text-foreground tabular-nums">{formatCurrency(lordo - ritenuta)}</span>
                </span>
                <span className="text-muted-foreground">
                  Detrazione cliente{" "}
                  <span className="font-medium text-emerald-700 tabular-nums">{formatCurrency(detrazione)}</span>
                </span>
              </div>

              {sfora && preset?.tettoSpesa != null && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
                  <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  La spesa supera il tetto indicativo di {formatCurrency(preset.tettoSpesa)}: la detrazione si
                  ferma lì.
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() =>
                    setCausaleAperta((p) => ({ ...p, [line.position]: !p[line.position] }))
                  }
                >
                  {causaleAperta[line.position] ? "Nascondi causale" : "Causale bonifico parlante"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => copiaCausale(line)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copia
                </Button>
              </div>

              {causaleAperta[line.position] && (
                <div className="space-y-1">
                  <Textarea
                    value={line.causale}
                    onChange={(e) => patch(line.position, { causale: e.target.value })}
                    placeholder={causaleBonificoParlante(line, datiCausale)}
                    rows={3}
                    maxLength={1000}
                    className="text-[11px] leading-relaxed"
                    disabled={readOnly}
                  />
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() =>
                        patch(line.position, { causale: causaleBonificoParlante(line, datiCausale) })
                      }
                    >
                      <Wand2 className="h-3 w-3 mr-1" />
                      Rigenera con CF e P.IVA
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={aggiungi}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Aggiungi agevolazione
          </Button>
          {lines.length > 0 && !quadrato && (
            <Button type="button" variant="secondary" size="sm" className="h-8" onClick={quadra}>
              Assegna il resto all'ultima riga
            </Button>
          )}
        </div>
      )}

      {lines.length > 0 && (
        <div className="rounded-md bg-background/70 border p-2.5 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Totale bonifici (IVA inclusa)</span>
            <span className="tabular-nums">{formatCurrency(totali.lordo)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ritenuta 11% trattenuta dalla banca</span>
            <span className="tabular-nums text-amber-700">−{formatCurrency(totali.ritenuta)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t pt-1">
            <span>Incasso netto</span>
            <span className="tabular-nums">{formatCurrency(totali.netto)}</span>
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Detrazione stimata per il cliente</span>
            <span className="tabular-nums text-emerald-700">{formatCurrency(totali.detrazione)}</span>
          </div>
        </div>
      )}

      {(esito.errori.length > 0 || esito.avvisi.length > 0) && (
        <ul className="space-y-1">
          {esito.errori.map((e) => (
            <li key={e} className="flex items-start gap-1.5 text-[11px] text-destructive">
              <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {e}
            </li>
          ))}
          {esito.avvisi.map((a) => (
            <li key={a} className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {a}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-muted-foreground">
        Aliquote e tetti sono indicativi: verificali col commercialista prima di inviare le pratiche.
      </p>
    </div>
  );
}
