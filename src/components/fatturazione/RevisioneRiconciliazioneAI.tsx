import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  Sparkles,
  Undo2,
  X,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";
import type { RigaConfronto } from "@/lib/fatturazione/confrontoDocumenti";
import type { DocumentoConfronto } from "@/hooks/useConfrontoFattura";
import type {
  AnalisiFatturaAI,
  useRiconciliazioneFatturaAI,
} from "@/hooks/useRiconciliazioneFatturaAI";
import type { DecisioneRiconciliazione } from "../../../supabase/functions/_shared/riconciliazioneFattureAI.ts";

import { EquivalenzeFornitoreFattura } from "./EquivalenzeFornitoreFattura";
import { RipartizioneQuantitaFattura } from "./RipartizioneQuantitaFattura";

type Ai = ReturnType<typeof useRiconciliazioneFatturaAI>;
type Props = {
  ai: Ai;
  righe: RigaConfronto[];
  documenti: DocumentoConfronto[];
  puoModificare: boolean;
  onRiga: (indice: number) => void;
  aperta: boolean;
  onApertura: (aperta: boolean) => void;
};
const titoli = {
  coerente: "Coerente",
  scostamento: "Scostamento",
  da_controllare: "Da controllare",
  senza_riferimento: "Da abbinare",
};
const colori = {
  coerente: "border-emerald-200 bg-emerald-50 text-emerald-800",
  scostamento: "border-red-200 bg-red-50 text-red-800",
  da_controllare: "border-amber-200 bg-amber-50 text-amber-900",
  senza_riferimento: "border-slate-200 bg-slate-50 text-slate-600",
};
const numero = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("it-IT", { maximumFractionDigits: 4 });
const griglia =
  "sm:grid-cols-[2.5rem_minmax(0,1.5fr)_minmax(0,1fr)_8rem_7rem_2rem]";

function Scelte({
  analisi,
  ai,
  righe,
  documenti,
  puoModificare,
  onRiga,
  aperta,
  onApertura,
}: Props & { analisi: AnalisiFatturaAI }) {
  const iniziali = Object.fromEntries(
    analisi.proposta.righe.map((r) => [
      r.fattura,
      analisi.decisioni[r.fattura] ?? "da_rivedere",
    ]),
  );
  const [ricorda, setRicorda] = useState(false);
  const [decisioni, setDecisioni] = useState<
    Record<string, DecisioneRiconciliazione>
  >(() => iniziali);
  const [dettagli, setDettagli] = useState<Set<string>>(() => new Set());
  const dirty = analisi.proposta.righe.some(
    (r) => decisioni[r.fattura] !== iniziali[r.fattura],
  );
  const accettate = Object.values(decisioni).filter(
    (d) => d === "accettata",
  ).length;
  const daRivedere = Object.values(decisioni).filter(
    (d) => d === "da_rivedere",
  ).length;
  const problemi = analisi.esiti.filter((e) => e.stato !== "coerente").length;
  const coerenti = analisi.proposta.righe.filter(
    (r, i) =>
      analisi.esiti[i]?.stato === "coerente" &&
      r.affidabilita === "alta" &&
      decisioni[r.fattura] === "da_rivedere",
  );
  const disabilitata = !puoModificare || ai.salva.isPending;
  const scegli = (id: string, scelta: DecisioneRiconciliazione) =>
    setDecisioni((d) => ({ ...d, [id]: scelta }));
  const errore = ai.salva.error ?? ai.analizza.error;
  return (
    <>
      <section
        aria-label="Revisione della riconciliazione AI"
        className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-indigo-50/40 px-4 py-2 sm:px-6"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
          <Sparkles className="h-3.5 w-3.5" />
          Analisi AI pronta
        </span>
        <span className="text-xs text-muted-foreground">
          {accettate}/{righe.length} abbinamenti confermati
          {daRivedere ? ` · ${daRivedere} da rivedere` : ""}
        </span>
        {problemi > 0 && (
          <span className="text-xs text-amber-800">
            {problemi}{" "}
            {problemi === 1 ? "voce da controllare" : "voci da controllare"}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 text-xs text-indigo-800"
          onClick={() => onApertura(true)}
        >
          {dirty ? "Rivedi e salva" : "Rivedi abbinamenti"}
          <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </section>
      <Dialog open={aperta} onOpenChange={onApertura}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Rivedi gli abbinamenti
            </DialogTitle>
            <DialogDescription className="text-xs">
              Conferma le corrispondenze proposte. Quantità e prezzi mancanti o
              diversi restano da controllare.
            </DialogDescription>
          </DialogHeader>
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-muted/20 px-5 py-2.5">
            <p className="mr-auto text-xs">
              <strong>
                {righe.length} {righe.length === 1 ? "voce" : "voci"}
              </strong>
              <span className="text-muted-foreground">
                {" "}
                · {accettate} {accettate === 1 ? "confermata" : "confermate"} ·{" "}
                {daRivedere} da rivedere
              </span>
            </p>
            {ai.dati.data?.contesto && (
              <RipartizioneQuantitaFattura
                key={`${analisi.id}:${analisi.revisione}`}
                analisi={analisi}
                contesto={ai.dati.data.contesto}
                impronta={ai.dati.data.impronta}
                puoModificare={puoModificare && !dirty}
              />
            )}
            {coerenti.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={disabilitata}
                onClick={() =>
                  setDecisioni((d) => ({
                    ...d,
                    ...Object.fromEntries(
                      coerenti.map((r) => [r.fattura, "accettata" as const]),
                    ),
                  }))
                }
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Accetta coerenti ({coerenti.length})
              </Button>
            )}
          </div>
          {errore && (
            <p
              role="alert"
              className="shrink-0 border-b bg-red-50 px-5 py-2 text-xs text-red-700"
            >
              {messaggioSalvataggio(errore)}{" "}
              <button
                className="underline"
                onClick={() => {
                  ai.salva.reset();
                  ai.analizza.reset();
                  void ai.dati.refetch();
                }}
              >
                Aggiorna
              </button>
            </p>
          )}
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <div
              className={`sticky top-0 z-10 hidden gap-3 border-b bg-slate-50 px-5 py-2 text-[11px] font-medium text-muted-foreground sm:grid ${griglia}`}
            >
              <span>Voce</span>
              <span>Articolo in fattura</span>
              <span>DDT e ordini</span>
              <span>Controllo</span>
              <span>Conferma</span>
              <span />
            </div>
            <ol className="divide-y">
              {analisi.proposta.righe.map((r, i) => {
                const f = righe.find((f) => f.id === r.fattura),
                  esito = analisi.esiti[i];
                const fonti = documenti.flatMap((d) =>
                  d.righe
                    .filter((x) => [...r.ddt, ...r.oda].includes(x.id))
                    .map((x) => ({ documento: d, riga: x })),
                );
                const riferimenti = [
                  ...new Set(
                    fonti.map(
                      (v) =>
                        `${v.documento.tipo.toUpperCase()} ${v.documento.numero}`,
                    ),
                  ),
                ];
                const aperti = dettagli.has(r.fattura),
                  scelta = decisioni[r.fattura];
                return (
                  <li key={r.fattura}>
                    <div
                      className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-5 py-3 ${griglia}`}
                    >
                      <button
                        className="rounded border bg-slate-50 px-1.5 py-1 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                        aria-label={`Vedi confronto voce F${i + 1}`}
                        title="Apri questa voce nel confronto affiancato"
                        onClick={() => {
                          onApertura(false);
                          const indice = righe.findIndex(
                            (f) => f.id === r.fattura,
                          );
                          if (indice >= 0) onRiga(indice);
                        }}
                      >
                        F{i + 1}
                      </button>
                      <span
                        className="truncate text-xs font-medium"
                        title={f?.descrizione}
                      >
                        {f?.descrizione ?? "Voce fattura"}
                      </span>
                      <span
                        className="col-span-2 col-start-2 truncate text-[11px] text-muted-foreground sm:col-span-1 sm:col-start-auto"
                        title={riferimenti.join("\n")}
                      >
                        {riferimenti.join(" · ") || "Nessun riferimento"}
                      </span>
                      <span
                        className={`col-start-2 w-fit whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] sm:col-start-auto ${esito ? colori[esito.stato] : colori.da_controllare}`}
                        title={esito?.motivo}
                      >
                        {esito ? titoli[esito.stato] : "Da controllare"}
                      </span>
                      <div
                        className="col-start-3 row-start-1 flex items-center gap-1 sm:col-start-auto sm:row-start-auto"
                        role="group"
                        aria-label={`Scelta per la voce F${i + 1}`}
                      >
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-8 w-8 border ${scelta === "accettata" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-transparent text-muted-foreground"}`}
                          aria-label={`Accetta abbinamento F${i + 1}`}
                          aria-pressed={scelta === "accettata"}
                          title="Conferma che le voci riguardano lo stesso articolo"
                          disabled={
                            disabilitata || (!r.ddt.length && !r.oda.length)
                          }
                          onClick={() => scegli(r.fattura, "accettata")}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-8 w-8 border ${scelta === "rifiutata" ? "border-red-300 bg-red-50 text-red-800" : "border-transparent text-muted-foreground"}`}
                          aria-label={`Rifiuta abbinamento F${i + 1}`}
                          aria-pressed={scelta === "rifiutata"}
                          title="Le voci riguardano articoli diversi"
                          disabled={disabilitata}
                          onClick={() => scegli(r.fattura, "rifiutata")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        {scelta !== "da_rivedere" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground"
                            aria-label={`Rimetti da rivedere F${i + 1}`}
                            title="Rimetti da rivedere"
                            disabled={disabilitata}
                            onClick={() => scegli(r.fattura, "da_rivedere")}
                          >
                            <Undo2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="col-start-3 h-7 w-7 justify-self-end sm:col-start-auto"
                        aria-label={`Dettagli voce F${i + 1}`}
                        aria-expanded={aperti}
                        onClick={() =>
                          setDettagli((v) => {
                            const n = new Set(v);
                            if (n.has(r.fattura)) n.delete(r.fattura);
                            else n.add(r.fattura);
                            return n;
                          })
                        }
                      >
                        {aperti ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {aperti && (
                      <div className="space-y-3 border-t bg-slate-50/70 px-5 py-3 sm:pl-[4.75rem]">
                        <p className="text-xs font-medium">{f?.descrizione}</p>
                        <div className="overflow-x-auto rounded-md border bg-white">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-left text-[11px] text-muted-foreground">
                              <tr>
                                <th className="p-2">Documento / articolo</th>
                                <th className="p-2 text-right">Quantità</th>
                                <th className="p-2">UM</th>
                                <th className="p-2 text-right">Prezzo netto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {f && (
                                <tr className="border-t">
                                  <td className="p-2 font-medium">
                                    Fattura · {f.descrizione}
                                  </td>
                                  <td className="p-2 text-right tabular-nums">
                                    {numero(f.quantita)}
                                  </td>
                                  <td className="p-2">{f.um || "Assente"}</td>
                                  <td className="whitespace-nowrap p-2 text-right">
                                    {f.prezzo == null
                                      ? "Da definire"
                                      : formatCurrency(f.prezzo)}
                                  </td>
                                </tr>
                              )}
                              {fonti.map(({ documento: d, riga: x }) => (
                                <tr
                                  key={`${d.id}:${x.id}`}
                                  className="border-t"
                                >
                                  <td className="p-2">
                                    <span className="text-muted-foreground">
                                      {d.tipo.toUpperCase()} {d.numero}
                                    </span>
                                    <br />
                                    {x.descrizione}
                                  </td>
                                  <td className="p-2 text-right tabular-nums">
                                    {numero(x.quantita)}
                                  </td>
                                  <td className="p-2">{x.um || "Assente"}</td>
                                  <td className="whitespace-nowrap p-2 text-right">
                                    {x.prezzo == null
                                      ? "Da definire"
                                      : formatCurrency(x.prezzo)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {esito && (
                          <p
                            className={`text-xs ${esito.stato === "scostamento" ? "text-red-700" : "text-slate-600"}`}
                          >
                            {esito.motivo}
                            {esito.deltaImporto != null &&
                            Math.abs(esito.deltaImporto) > 0.01
                              ? ` Differenza sulla voce: ${formatCurrency(esito.deltaImporto)}.`
                              : ""}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          <strong className="font-medium">
                            Motivo proposto dall’AI:
                          </strong>{" "}
                          {r.motivo}{" "}
                          <span className="text-[11px]">
                            Affidabilità: {r.affidabilita}.
                          </span>
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {!!ai.dati.data?.contesto?.equivalenze?.length && (
              <EquivalenzeFornitoreFattura
                regole={ai.dati.data.contesto.equivalenze}
                puoModificare={puoModificare}
              />
            )}
            {analisi.proposta.avvisi.length > 0 && (
              <details className="border-t px-5 py-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  Note dell’AI ({analisi.proposta.avvisi.length})
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {analisi.proposta.avvisi.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          {ai.dati.data?.contesto?.fattura.fornitore_id && (
            <label className="flex items-center gap-2 border-t px-5 py-2 text-xs">
              <input
                type="checkbox"
                checked={ricorda}
                disabled={!puoModificare}
                onChange={(e) => setRicorda(e.target.checked)}
              />
              Ricorda gli abbinamenti confermati per questo fornitore
            </label>
          )}
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-slate-50/50 px-5 py-3">
            <div className="mr-auto min-w-0 text-xs text-muted-foreground">
              <p>
                Confermare gli abbinamenti non cambia la verifica della fattura.
              </p>
              {dirty ? (
                <p className="mt-1 text-amber-800">Scelte da salvare</p>
              ) : analisi.rivista_il ? (
                <p
                  role="status"
                  className="mt-1 flex items-center gap-1 text-emerald-800"
                >
                  <Check className="h-3 w-3" />
                  Revisione salvata
                </p>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onApertura(false)}
            >
              Torna al confronto
            </Button>
            <Button
              size="sm"
              disabled={disabilitata || (!dirty && !ricorda)}
              onClick={() =>
                ai.salva.mutate({
                  analisi,
                  decisioni,
                  ...(ricorda ? { ricorda: true } : {}),
                })
              }
            >
              {ai.salva.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Salva revisione
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RevisioneRiconciliazioneAI(props: Props) {
  const { ai } = props,
    analisi = ai.dati.data?.analisi;
  if (analisi)
    return (
      <Scelte
        key={`${analisi.id}:${analisi.revisione}`}
        analisi={analisi}
        {...props}
      />
    );
  const errore = ai.analizza.error ?? ai.salva.error ?? ai.dati.error;
  if (!errore && !ai.analizza.isPending && !ai.dati.data?.superata) return null;
  return (
    <section
      aria-label="Revisione della riconciliazione AI"
      className="shrink-0 border-b bg-muted/20 px-4 py-2 text-xs sm:px-6"
    >
      <p className="flex items-center gap-2">
        {ai.analizza.isPending && (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        )}
        {ai.analizza.isPending
          ? "L’AI sta abbinando le voci…"
          : ai.dati.data?.superata
            ? "Documenti cambiati: aggiorna l’analisi AI per rivedere gli abbinamenti."
            : "Riconciliazione AI non disponibile."}
      </p>
      {errore && (
        <p role="alert" className="mt-1 text-red-700">
          {messaggioSalvataggio(errore)}{" "}
          <button
            className="underline"
            onClick={() => {
              ai.analizza.reset();
              ai.salva.reset();
              void ai.dati.refetch();
            }}
          >
            Aggiorna
          </button>
        </p>
      )}
    </section>
  );
}
