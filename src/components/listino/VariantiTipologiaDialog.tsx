/**
 * Colori e varianti di UNA tipologia: per ogni valore (colore fuori standard,
 * vetro antisonoro, motore…) la maggiorazione sulla vendita e sull'acquisto,
 * se resta acceso, qual è quello di serie e cosa comprende. Vale per tutti i
 * prodotti della tipologia in un colpo solo.
 *
 * Prima ogni valore si cambiava prodotto per prodotto, e i prodotti finivano
 * per non essere d'accordo: nel listino di Renova il colore fuori standard era
 * a +15% sull'alzante e a zero sulle altre 22 finestre. Qui si vede dove non lo
 * sono, e si manda solo quello che cambia: un valore non toccato resta com'è
 * in ogni prodotto.
 *
 * «Cosa comprende» è l'elenco dentro un valore: «Colore Standard +10%» è la
 * fascia di prezzo, i colori veri (Grigio antracite RAL 7016…) si scrivono lì e
 * nel preventivo se ne sceglie uno. «+ Variante» dà a tutti i prodotti una
 * variante che non hanno (maniglia, soglia), anche da un modello pronto.
 */
import { Fragment, useMemo, useState, type ClipboardEvent } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { MaggiorazioneTipo } from "@/types/articleFamily";
import { chiaveTesto } from "@/lib/listino/areeStandard";
import type { TipologiaListino } from "@/lib/listino/lineeListino";
import {
  datiAsseVarianti,
  formVariantePronta,
  formVarianti,
  leggiPercentuale,
  MODI_MAGGIORAZIONE,
  problemaNuovaVariante,
  problemaVarianti,
  riepilogoVarianti,
  VARIANTI_PRONTE_SERRAMENTI,
  type AsseVariante,
  type AsseVariantiDati,
  type VariantePronta,
  type VarianteForm,
} from "@/lib/listino/organizzaListino";
import { dividiVoci, paroleVoci, pulisciVoci, suggerimentiVoci, type ParoleVoci } from "@/lib/listino/scelteVariante";

interface Props {
  tipologia: TipologiaListino;
  /** L'area della tipologia: i modelli pronti di «+ Variante» sono dei serramenti. */
  area?: string | null;
  inCorso: boolean;
  onChiudi: () => void;
  onSalva: (assi: AsseVariantiDati[]) => void;
}

const prodotti = (n: number) => `${n} ${n === 1 ? "prodotto" : "prodotti"}`;

export function VariantiTipologiaDialog({ tipologia, area, inCorso, onChiudi, onSalva }: Props) {
  const riepilogo = useMemo(() => riepilogoVarianti(tipologia), [tipologia]);
  const iniziali = useMemo(
    () => new Map(riepilogo.assi.map((a) => [a.chiave, formVarianti(a)] as const)),
    [riepilogo],
  );
  const [scelto, setScelto] = useState(() => riepilogo.assi[0]?.chiave ?? "");
  const [valori, setValori] = useState(() => new Map(iniziali));
  const [completa, setCompleta] = useState<Set<string>>(() => new Set());
  const [baseToccata, setBaseToccata] = useState<Set<string>>(() => new Set());
  // Varianti che la tipologia non ha ancora: nascono in tutti i prodotti.
  const [nuove, setNuove] = useState<Array<{ chiave: string; nome: string }>>([]);
  const [nomeNuova, setNomeNuova] = useState<string | null>(null);
  const [erroreNuova, setErroreNuova] = useState<string | null>(null);
  // Le righe con l'elenco aperto.
  const [aperti, setAperti] = useState<Set<string>>(() => new Set());

  // Nel fotovoltaico ogni prodotto è un componente del configuratore: le varianti si aggiungono uno per uno.
  const puoiAggiungere = area !== "fotovoltaico";
  const assi: AsseVariante[] = [
    ...riepilogo.assi,
    ...nuove.map(
      (n): AsseVariante => ({ chiave: n.chiave, nome: n.nome, prodotti: 0, obbligatorio: false, baseDiversaIn: 0, valori: [] }),
    ),
  ];
  const eNuova = (chiave: string) => nuove.some((n) => n.chiave === chiave);

  const stato = assi.map((asse) => {
    const lista = valori.get(asse.chiave) ?? [];
    const prima = iniziali.get(asse.chiave) ?? [];
    const conCompleta = eNuova(asse.chiave) || completa.has(asse.chiave);
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
  const parole = asse ? paroleVoci({ codice: asse.chiave, nome: asse.nome }) : null;
  const suggerimenti = asse ? suggerimentiVoci({ codice: asse.chiave, nome: asse.nome }) : [];
  const pronte =
    area === "serramenti" ? VARIANTI_PRONTE_SERRAMENTI.filter((p) => problemaNuovaVariante(p.nome, assi) === null) : [];

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
      { chiave: null, nome: "", tipo: "percentuale", vendita: "0", acquisto: "0", attivo: true, base: false, prodotti: 0, opzioni: [] },
    ]);
    // Un valore nuovo esiste solo se lo si mette nei prodotti.
    if (!eNuova(asse.chiave)) setCompleta((prima) => new Set(prima).add(asse.chiave));
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

  const apriChiudi = (chiave: string) =>
    setAperti((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(chiave)) dopo.delete(chiave);
      else dopo.add(chiave);
      return dopo;
    });

  const aggiungiVariante = (nome: string, pronta: VariantePronta | null) => {
    const problema = problemaNuovaVariante(pronta?.nome ?? nome, assi);
    if (problema) {
      setErroreNuova(problema);
      return;
    }
    const chiave = pronta?.chiave ?? chiaveTesto(nome);
    setNuove((prima) => [...prima, { chiave, nome: pronta?.nome ?? nome.trim() }]);
    setValori((prima) => new Map(prima).set(chiave, formVariantePronta(pronta)));
    setScelto(chiave);
    setNomeNuova(null);
    setErroreNuova(null);
  };

  const togliVariante = (chiave: string) => {
    setNuove((prima) => prima.filter((n) => n.chiave !== chiave));
    setValori((prima) => {
      const dopo = new Map(prima);
      dopo.delete(chiave);
      return dopo;
    });
    setScelto(riepilogo.assi[0]?.chiave ?? nuove.find((n) => n.chiave !== chiave)?.chiave ?? "");
  };

  const mancanti: string[] = [];
  if (asse && !eNuova(asse.chiave)) {
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

  const formNuova =
    nomeNuova === null ? null : (
      <div className="space-y-2 rounded-md border border-dashed p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={nomeNuova}
            onChange={(e) => {
              setNomeNuova(e.target.value);
              setErroreNuova(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                aggiungiVariante(nomeNuova, null);
              }
            }}
            placeholder="Nome della variante, per esempio Maniglia"
            aria-label="Nome della variante nuova"
            className="h-9"
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-9" onClick={() => aggiungiVariante(nomeNuova, null)}>
              Aggiungi
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9"
              onClick={() => {
                setNomeNuova(null);
                setErroreNuova(null);
              }}
            >
              Annulla
            </Button>
          </div>
        </div>
        {pronte.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Pronte:</span>
            {pronte.map((p) => (
              <button
                key={p.chiave}
                type="button"
                onClick={() => aggiungiVariante(p.nome, p)}
                className="rounded-full border px-2.5 py-1 text-left transition-colors hover:border-primary/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-medium">{p.nome}</span>
                <span className="text-muted-foreground"> · {p.valori.map((v) => v.nome).join(", ")}</span>
              </button>
            ))}
          </div>
        )}
        {erroreNuova && <p className="text-xs text-destructive">{erroreNuova}</p>}
      </div>
    );

  const bottoneNuova = puoiAggiungere && nomeNuova === null && (
    <button
      type="button"
      onClick={() => setNomeNuova("")}
      className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      Variante
    </button>
  );

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

        {!asse || !parole ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {puoiAggiungere
                ? `I prodotti di ${tipologia.nome} non hanno ancora varianti oltre alle linee. Aggiungine una: va in tutti i ${prodotti(riepilogo.prodotti)}.`
                : `I prodotti di ${tipologia.nome} non hanno varianti oltre alle linee. Nel fotovoltaico si aggiungono aprendo un prodotto, nelle sue varianti.`}
            </p>
            {bottoneNuova}
            {formNuova}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <div role="tablist" aria-label={`Varianti di ${tipologia.nome}`} className="contents">
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
              {bottoneNuova}
            </div>
            {formNuova}

            {eNuova(asse.chiave) && (
              <p className="text-xs text-muted-foreground">
                Nuova: va in tutti i {prodotti(riepilogo.prodotti)} di {tipologia.nome}, col valore di serie scelto qui.{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => togliVariante(asse.chiave)}
                >
                  Togli
                </button>
              </p>
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
                    const chiaveRiga = `${asse.chiave}|${v.chiave ?? `nuovo-${i}`}`;
                    const aperto = aperti.has(chiaveRiga);
                    return (
                      <Fragment key={v.chiave ?? `nuovo-${i}`}>
                        <tr className={cn("align-top", !v.attivo && "text-muted-foreground")}>
                          <td className="px-3 py-2">
                            {v.chiave ? (
                              <span className="block font-medium">{v.nome}</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={v.nome}
                                  onChange={(e) => cambia(i, { nome: e.target.value })}
                                  placeholder={parole.tante === "colori" ? "es. Colore Standard" : "es. Con chiave"}
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
                            <button
                              type="button"
                              onClick={() => apriChiudi(chiaveRiga)}
                              aria-expanded={aperto}
                              className="block text-left text-[11px] font-medium text-primary hover:underline"
                            >
                              {v.opzioni.length > 0
                                ? `${v.opzioni.length} ${v.opzioni.length === 1 ? parole.singolare : parole.tante}${aperto ? "" : ": " + v.opzioni.slice(0, 2).join(", ") + (v.opzioni.length > 2 ? "…" : "")}`
                                : `+ quali ${parole.tante}`}
                            </button>
                            {oggi && oggi.opzioniDiverse > 0 && (
                              <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                                In {prodotti(oggi.opzioniDiverse)} l&apos;elenco dei {parole.tante} è diverso
                              </span>
                            )}
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
                        {aperto && (
                          <tr>
                            <td colSpan={6} className="bg-muted/30 px-3 pb-3 pt-2">
                              <EditorVoci
                                voci={v.opzioni}
                                onChange={(voci) => cambia(i, { opzioni: voci })}
                                parole={parole}
                                suggerimenti={suggerimenti}
                                nomeValore={etichetta}
                                idLista={`voci-${asse.chiave}-${i}`}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
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

/**
 * L'elenco dentro un valore: le voci come etichette da togliere, una casella
 * per aggiungerne con i suggerimenti più comuni. Incollando un elenco (una voce
 * per riga) entrano tutte insieme.
 */
function EditorVoci({
  voci,
  onChange,
  parole,
  suggerimenti,
  nomeValore,
  idLista,
}: {
  voci: string[];
  onChange: (voci: string[]) => void;
  parole: ParoleVoci;
  suggerimenti: string[];
  nomeValore: string;
  idLista: string;
}) {
  const [testo, setTesto] = useState("");
  const aggiungi = (nuove: string[]) => {
    if (nuove.length === 0) return;
    onChange(pulisciVoci([...voci, ...nuove]));
    setTesto("");
  };
  const incolla = (e: ClipboardEvent<HTMLInputElement>) => {
    const incollato = e.clipboardData.getData("text");
    // Una casella di una riga schiaccerebbe l'elenco in una voce sola.
    if (!/[\r\n;]/.test(incollato)) return;
    e.preventDefault();
    aggiungi(dividiVoci(incollato));
  };
  const presenti = new Set(voci.map((v) => v.toLocaleLowerCase("it-IT")));
  const libere = suggerimenti.filter((s) => !presenti.has(s.toLocaleLowerCase("it-IT")));

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Nel preventivo si sceglie fra questi {parole.tante}, al prezzo di «{nomeValore}»; si può anche lasciare da decidere.
      </p>
      {voci.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${parole.tante} di ${nomeValore}`}>
          {voci.map((voce) => (
            <li
              key={voce}
              className="inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs"
            >
              {voce}
              <button
                type="button"
                onClick={() => onChange(voci.filter((x) => x !== voce))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Togli ${voce}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <Input
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onPaste={incolla}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              aggiungi(dividiVoci(testo));
            }
          }}
          list={libere.length > 0 ? idLista : undefined}
          placeholder={`Aggiungi ${parole.una}, o incolla un elenco`}
          aria-label={`Aggiungi ${parole.una} a ${nomeValore}`}
          className="h-8 bg-background text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 bg-background"
          onClick={() => aggiungi(dividiVoci(testo))}
          disabled={!testo.trim()}
        >
          Aggiungi
        </Button>
      </div>
      {libere.length > 0 && (
        <datalist id={idLista}>
          {libere.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
