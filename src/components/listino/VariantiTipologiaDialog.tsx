/**
 * Colori e varianti di UNA tipologia: per ogni valore (colore fuori standard,
 * vetro antisonoro, motore…) la maggiorazione sulla vendita e sull'acquisto,
 * se resta acceso, qual è quello di serie. Vale per tutti i prodotti della
 * tipologia in un colpo solo.
 *
 * Prima ogni valore si cambiava prodotto per prodotto, e i prodotti finivano
 * per non essere d'accordo: nel listino di Renova il colore fuori standard era
 * a +15% sull'alzante e a zero sulle altre 22 finestre. Qui si vede dove non lo
 * sono, e si manda solo quello che cambia: un valore non toccato resta com'è
 * in ogni prodotto.
 */
import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { MaggiorazioneTipo } from "@/types/articleFamily";
import type { TipologiaListino } from "@/lib/listino/lineeListino";
import {
  datiAsseVarianti,
  formVarianti,
  leggiPercentuale,
  MODI_MAGGIORAZIONE,
  problemaVarianti,
  riepilogoVarianti,
  type AsseVariantiDati,
  type VarianteForm,
} from "@/lib/listino/organizzaListino";

interface Props {
  tipologia: TipologiaListino;
  inCorso: boolean;
  onChiudi: () => void;
  onSalva: (assi: AsseVariantiDati[]) => void;
}

const prodotti = (n: number) => `${n} ${n === 1 ? "prodotto" : "prodotti"}`;

export function VariantiTipologiaDialog({ tipologia, inCorso, onChiudi, onSalva }: Props) {
  const riepilogo = useMemo(() => riepilogoVarianti(tipologia), [tipologia]);
  const iniziali = useMemo(
    () => new Map(riepilogo.assi.map((a) => [a.chiave, formVarianti(a)] as const)),
    [riepilogo],
  );
  const [scelto, setScelto] = useState(() => riepilogo.assi[0]?.chiave ?? "");
  const [valori, setValori] = useState(() => new Map(iniziali));
  const [completa, setCompleta] = useState<Set<string>>(() => new Set());
  const [baseToccata, setBaseToccata] = useState<Set<string>>(() => new Set());

  const stato = riepilogo.assi.map((asse) => {
    const lista = valori.get(asse.chiave) ?? [];
    const prima = iniziali.get(asse.chiave) ?? [];
    const conCompleta = completa.has(asse.chiave);
    const forzaBase = baseToccata.has(asse.chiave);
    return {
      asse,
      problema: problemaVarianti(asse, prima, lista, conCompleta, forzaBase),
      dati: datiAsseVarianti(asse, prima, lista, conCompleta, riepilogo.prodotti, forzaBase),
    };
  });
  const daSalvare = stato.filter((s) => s.dati !== null);
  const bloccante = daSalvare.find((s) => s.problema) ?? null;
  const asse = (stato.find((s) => s.asse.chiave === scelto) ?? stato[0])?.asse ?? null;
  const righe = asse ? valori.get(asse.chiave) ?? [] : [];

  const aggiornaRighe = (chiave: string, cambio: (lista: VarianteForm[]) => VarianteForm[]) =>
    setValori((prima) => new Map(prima).set(chiave, cambio(prima.get(chiave) ?? [])));

  const cambia = (indice: number, patch: Partial<VarianteForm>) => {
    if (!asse) return;
    aggiornaRighe(asse.chiave, (lista) =>
      // Un solo valore di serie per variabile.
      lista.map((v, i) => (i === indice ? { ...v, ...patch } : patch.base ? { ...v, base: false } : v)),
    );
  };

  const scegliBase = (indice: number) => {
    if (!asse) return;
    cambia(indice, { base: true });
    // Con prodotti in disaccordo, sceglierlo (anche lo stesso) vuol dire metterlo uguale in tutti.
    if (asse.baseDiversaIn > 0) setBaseToccata((prima) => new Set(prima).add(asse.chiave));
  };

  const aggiungi = () => {
    if (!asse) return;
    aggiornaRighe(asse.chiave, (lista) => [
      ...lista,
      { chiave: null, nome: "", tipo: "percentuale", vendita: "0", acquisto: "0", attivo: true, base: false, prodotti: 0 },
    ]);
    // Un valore nuovo esiste solo se lo si mette nei prodotti.
    setCompleta((prima) => new Set(prima).add(asse.chiave));
  };

  const togli = (indice: number) => {
    if (!asse) return;
    aggiornaRighe(asse.chiave, (lista) => lista.filter((_, i) => i !== indice));
  };

  const cambiaCompleta = (acceso: boolean) => {
    if (!asse) return;
    setCompleta((prima) => {
      const dopo = new Set(prima);
      if (acceso) dopo.add(asse.chiave);
      else dopo.delete(asse.chiave);
      return dopo;
    });
  };

  const mancanti: string[] = [];
  if (asse) {
    if (asse.prodotti < riepilogo.prodotti) {
      mancanti.push(`${asse.nome} manca in ${prodotti(riepilogo.prodotti - asse.prodotti)}`);
    }
    for (const v of righe) {
      if (v.prodotti === 0) mancanti.push(`«${v.nome.trim() || "valore nuovo"}» è nuovo`);
      else if (v.prodotti < asse.prodotti) mancanti.push(`«${v.nome}» manca in ${prodotti(asse.prodotti - v.prodotti)}`);
    }
  }

  const salva = () => {
    if (bloccante || daSalvare.length === 0) return;
    onSalva(daSalvare.flatMap((s) => (s.dati ? [s.dati] : [])));
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !inCorso) onChiudi();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Colori e varianti di {tipologia.nome}</DialogTitle>
          <DialogDescription>
            Valgono per tutti i {prodotti(riepilogo.prodotti)} di {tipologia.nome}. Un valore spento non si propone più;
            le righe dei preventivi già fatti cambiano prezzo solo se si cambia una scelta.
          </DialogDescription>
        </DialogHeader>

        {!asse ? (
          <p className="text-sm text-muted-foreground">
            I prodotti di {tipologia.nome} non hanno varianti oltre alle linee. Colori e vetri si aggiungono aprendo un
            prodotto, nelle sue varianti.
          </p>
        ) : (
          <div className="space-y-3">
            {stato.length > 1 && (
              <div role="tablist" aria-label={`Varianti di ${tipologia.nome}`} className="flex flex-wrap gap-1.5">
                {stato.map(({ asse: a, dati }) => {
                  const selezionata = a.chiave === asse.chiave;
                  return (
                    <button
                      key={a.chiave}
                      type="button"
                      role="tab"
                      aria-selected={selezionata}
                      onClick={() => setScelto(a.chiave)}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selezionata
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background hover:border-primary/50 hover:bg-muted",
                      )}
                    >
                      {a.nome}
                      {dati && (
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full", selezionata ? "bg-primary-foreground" : "bg-primary")}
                          aria-label="da salvare"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {asse.baseDiversaIn > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                In {prodotti(asse.baseDiversaIn)} il valore di serie di {asse.nome} è un altro o manca: scegli quello
                giusto qui sotto per averlo uguale in tutti.
              </p>
            )}

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{asse.nome}</th>
                    <th className="w-40 px-2 py-2 text-left font-medium">Maggiorazione</th>
                    <th className="w-24 px-2 py-2 text-right font-medium">Vendita</th>
                    <th className="w-24 px-2 py-2 text-right font-medium">Acquisto</th>
                    <th className="w-16 px-2 py-2 text-center font-medium">Di serie</th>
                    <th className="w-16 px-2 py-2 text-center font-medium">Acceso</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {righe.map((v, i) => {
                    const oggi = v.chiave ? asse.valori.find((x) => x.chiave === v.chiave) : undefined;
                    const vendita = leggiPercentuale(v.vendita || "0");
                    const acquisto = leggiPercentuale(v.acquisto || "0");
                    const acquistoFermo = v.tipo === "percentuale" && !!vendita && acquisto === 0;
                    const etichetta = v.nome.trim() || "valore nuovo";
                    return (
                      <tr key={v.chiave ?? `nuovo-${i}`} className={cn("align-top", !v.attivo && "text-muted-foreground")}>
                        <td className="px-3 py-2">
                          {v.chiave ? (
                            <span className="block font-medium">{v.nome}</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Input
                                value={v.nome}
                                onChange={(e) => cambia(i, { nome: e.target.value })}
                                placeholder="es. Antracite RAL 7016"
                                aria-label="Nome del valore nuovo"
                                className="h-8"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => togli(i)}
                                aria-label={`Togli ${etichetta}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            </div>
                          )}
                          <span className="block text-[11px] text-muted-foreground">
                            {v.prodotti === 0
                              ? "nuovo"
                              : v.prodotti === asse.prodotti
                                ? `in tutti i ${prodotti(asse.prodotti)}`
                                : `in ${v.prodotti} su ${prodotti(asse.prodotti)}`}
                          </span>
                          {oggi && oggi.diverse.length > 0 && (
                            <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                              Oggi non è uguale: {oggi.diverse.map((d) => `${d.testo} in ${d.prodotti}`).join(", ")}
                            </span>
                          )}
                          {oggi?.attivoInParte && (
                            <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                              Oggi è spento in alcuni prodotti
                            </span>
                          )}
                          {acquistoFermo && (
                            <button
                              type="button"
                              className="block text-left text-[11px] font-medium text-primary hover:underline"
                              onClick={() => cambia(i, { acquisto: v.vendita })}
                            >
                              L&apos;acquisto resta fermo e il margine sale: metti {v.vendita}% anche lì
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={v.tipo} onValueChange={(t) => cambia(i, { tipo: t as MaggiorazioneTipo })}>
                            <SelectTrigger className="h-8 text-xs" aria-label={`Come si applica la maggiorazione di ${etichetta}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MODI_MAGGIORAZIONE.map((m) => (
                                <SelectItem key={m.tipo} value={m.tipo} className="text-xs">
                                  {m.etichetta}
                                </SelectItem>
                              ))}
                              {!MODI_MAGGIORAZIONE.some((m) => m.tipo === v.tipo) && (
                                <SelectItem value={v.tipo} className="text-xs">
                                  € al m³
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={v.vendita}
                            onChange={(e) => cambia(i, { vendita: e.target.value })}
                            inputMode="decimal"
                            aria-label={`Maggiorazione di vendita di ${etichetta}`}
                            className="h-8 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={v.acquisto}
                            onChange={(e) => cambia(i, { acquisto: e.target.value })}
                            inputMode="decimal"
                            aria-label={`Maggiorazione sull'acquisto di ${etichetta}`}
                            className="h-8 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="radio"
                            name={`base-${asse.chiave}`}
                            checked={v.base}
                            onChange={() => scegliBase(i)}
                            onClick={() => v.base && scegliBase(i)}
                            aria-label={`${etichetta} di serie`}
                            className="h-4 w-4 accent-primary"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Switch
                            checked={v.attivo}
                            onCheckedChange={(acceso) => cambia(i, { attivo: acceso })}
                            aria-label={`${etichetta} acceso`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={aggiungi}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Valore
            </Button>

            {mancanti.length > 0 && (
              <label className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={completa.has(asse.chiave)}
                  onCheckedChange={(acceso) => cambiaCompleta(acceso === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block">Metti i valori mancanti in tutti i {prodotti(riepilogo.prodotti)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {mancanti.slice(0, 3).join(" · ")}
                    {mancanti.length > 3 ? ` · e altri ${mancanti.length - 3}` : ""}
                  </span>
                </span>
              </label>
            )}

            {bloccante && <p className="text-sm text-destructive">{bloccante.problema}</p>}
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button variant="ghost" onClick={onChiudi} disabled={inCorso} className="h-10 w-full sm:w-auto">
            Annulla
          </Button>
          <Button
            onClick={salva}
            disabled={inCorso || daSalvare.length === 0 || !!bloccante}
            className="h-10 w-full sm:w-auto"
          >
            {inCorso ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Salvataggio…
              </>
            ) : daSalvare.length > 1 ? (
              `Salva ${daSalvare.length} varianti`
            ) : (
              "Salva"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
