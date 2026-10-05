/**
 * «Cosa ti ha detto il cliente?»: le esigenze del cliente (freddo, spifferi, muffa,
 * bolletta alta…) scelte per il singolo preventivo, con un tocco. Nel PDF escono dove il
 * documento già parla delle richieste del cliente (negli edili il capitolo «Il progetto»,
 * in Serramenti la prima pagina); nell'anteprima a destra si vedono subito.
 *
 * È FACOLTATIVO e non cambia lo standard: senza nessuna scelta il PDF resta quello di
 * sempre. Le voci vengono dalla libreria dell'azienda (le «esigenze» del suo modello
 * PDF); se non ne ha ancora, da quelle di serie del modulo, così si usa da subito.
 * Spuntare una voce ne COPIA il testo nel preventivo: cambiare la libreria dopo non
 * tocca i preventivi già fatti, e il venditore può ritoccare il testo per quel cliente.
 */
import { useState } from "react";
import { Check, MessageCircle, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type EsigenzaCliente,
  alternaEsigenza,
  chiaveEsigenza,
  esigenzaScelta,
} from "@/lib/preventivatore/esigenze";

interface Props {
  /** Le esigenze scelte per questo preventivo. */
  valore: EsigenzaCliente[];
  onChange: (valore: EsigenzaCliente[]) => void;
  /** L'elenco scritto dall'azienda nel suo modello (la sua libreria). */
  libreria?: EsigenzaCliente[];
  /** Le voci pronte del modulo, per chi non ha ancora una libreria. */
  dellaCasa: EsigenzaCliente[];
  /** Dove escono nel PDF di questo modulo, detto a chi sceglie. */
  nelPdf?: string;
  /** Quante il PDF ne stampa al massimo (Serramenti: 3). Oltre, chi sceglie lo sa. */
  massimoNelPdf?: number;
  disabled?: boolean;
  className?: string;
}

/** Dove escono nei PDF dei moduli a computo (DocumentoEdilePDF). */
export const ESIGENZE_NEL_PDF_EDILE = "nel capitolo «Il progetto», sotto «Da dove partiamo»";

export function EsigenzeCliente({
  valore,
  onChange,
  libreria = [],
  dellaCasa,
  nelPdf = ESIGENZE_NEL_PDF_EDILE,
  massimoNelPdf,
  disabled,
  className,
}: Props) {
  const haLibreria = libreria.length > 0;
  // Con una libreria dell'azienda si parte da quella e le idee pronte si aprono a richiesta;
  // senza, le idee pronte sono già lì.
  const [ideeAperte, setIdeeAperte] = useState(false);
  const [nuova, setNuova] = useState<{ titolo: string; descrizione: string } | null>(null);
  // Il testo di una voce scelta si apre a richiesta: con tre o quattro scelte la scheda resta bassa.
  const [inModifica, setInModifica] = useState<ReadonlySet<string>>(new Set());
  const alternaModifica = (titolo: string) =>
    setInModifica((prima) => {
      const k = chiaveEsigenza(titolo);
      const dopo = new Set(prima);
      if (dopo.has(k)) dopo.delete(k); else dopo.add(k);
      return dopo;
    });

  const chiaviLibreria = new Set(libreria.map((v) => chiaveEsigenza(v.titolo)));
  const ideePronte = dellaCasa.filter((v) => !chiaviLibreria.has(chiaveEsigenza(v.titolo)));
  const opzioni = haLibreria ? [...libreria, ...(ideeAperte ? ideePronte : [])] : dellaCasa;
  // Le voci scritte a mano per questo cliente non stanno in nessun elenco, né nella libreria né tra le
  // idee pronte (anche se queste sono chiuse): si vedono comunque nelle scelte, segnate.
  const chiaviNote = new Set([...libreria, ...dellaCasa].map((v) => chiaveEsigenza(v.titolo)));
  const soloSue = valore.filter((v) => !chiaviNote.has(chiaveEsigenza(v.titolo)));

  const aggiornaDescrizione = (titolo: string, descrizione: string) =>
    onChange(valore.map((v) => (chiaveEsigenza(v.titolo) === chiaveEsigenza(titolo) ? { ...v, descrizione } : v)));

  const aggiungiSua = () => {
    const titolo = nuova?.titolo.trim() ?? "";
    if (!titolo) return;
    if (!esigenzaScelta(valore, { titolo })) onChange([...valore, { titolo, descrizione: nuova?.descrizione.trim() || null }]);
    setNuova(null);
  };

  return (
    <Card className={cn("mb-4", className)} data-esigenze-cliente>
      <CardContent className="space-y-3 p-4 max-sm:p-3">
        <div className="flex flex-wrap items-center gap-2">
          <MessageCircle className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-900">Cosa ti ha detto il cliente?</h3>
          <Badge variant="outline" className="text-[10px] font-medium text-slate-500">Facoltativo</Badge>
          {valore.length > 0 && <span className="ml-auto text-xs text-slate-500">{valore.length} {valore.length === 1 ? "scelta" : "scelte"}</span>}
        </div>
        <p className="text-xs text-slate-500">
          Un preventivo che parla del problema del cliente convince di più. Tocca quelli che ti ha detto: nel PDF escono {nelPdf}.
          Se non scegli niente, il PDF resta quello di sempre.
        </p>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Esigenze del cliente">
          {opzioni.map((o) => {
            const scelta = esigenzaScelta(valore, o);
            return (
              <button
                key={chiaveEsigenza(o.titolo)}
                type="button"
                disabled={disabled}
                aria-pressed={scelta}
                title={o.descrizione ?? undefined}
                onClick={() => onChange(alternaEsigenza(valore, o))}
                className={cn(
                  "tap-compact inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  scelta
                    ? "border-orange-500 bg-orange-50 text-orange-900"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                {scelta && <Check className="h-3 w-3" aria-hidden="true" />}
                {o.titolo}
              </button>
            );
          })}
        </div>

        {massimoNelPdf != null && valore.length > massimoNelPdf && (
          <p role="status" className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
            Nel PDF escono le prime {massimoNelPdf}, nell'ordine in cui le hai scelte. Le altre restano fuori.
          </p>
        )}

        {valore.length > 0 && (
          <ul className="space-y-1.5 border-t border-slate-100 pt-3" aria-label="Esigenze scelte">
            {valore.map((v) => {
              const aperto = inModifica.has(chiaveEsigenza(v.titolo));
              const haTesto = Boolean(v.descrizione?.trim());
              return (
                <li key={chiaveEsigenza(v.titolo)} className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {v.titolo}
                        {soloSue.includes(v) && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700">solo per questo cliente</span>}
                      </p>
                      {!aperto && haTesto && <p className="truncate text-xs text-slate-500">{v.descrizione}</p>}
                    </div>
                    {!disabled && (
                      <>
                        <button
                          type="button"
                          aria-expanded={aperto}
                          aria-label={`${aperto ? "Chiudi" : haTesto ? "Modifica" : "Aggiungi"} il testo di «${v.titolo}»`}
                          onClick={() => alternaModifica(v.titolo)}
                          className="tap-compact shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-orange-700 hover:bg-orange-50"
                        >
                          {aperto ? "Chiudi" : haTesto ? "Modifica testo" : "Aggiungi testo"}
                        </button>
                        <button
                          type="button"
                          aria-label={`Togli «${v.titolo}»`}
                          onClick={() => onChange(valore.filter((s) => chiaveEsigenza(s.titolo) !== chiaveEsigenza(v.titolo)))}
                          className="tap-compact shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                  {(aperto || (disabled && haTesto)) && (
                    <Textarea
                      value={v.descrizione ?? ""}
                      disabled={disabled}
                      rows={2}
                      aria-label={`Testo di «${v.titolo}» nel PDF`}
                      placeholder="Come lo racconti a questo cliente (facoltativo)"
                      onChange={(e) => aggiornaDescrizione(v.titolo, e.target.value)}
                      className="mt-1.5 min-h-0 bg-white text-xs"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {nuova && !disabled && (
          <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-2.5">
            <Input
              autoFocus
              value={nuova.titolo}
              maxLength={60}
              placeholder="Il problema, in poche parole (es. «Rumore dalla strada»)"
              aria-label="Titolo della nuova esigenza"
              onChange={(e) => setNuova({ ...nuova, titolo: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungiSua(); } }}
              className="h-9 text-sm"
            />
            <Textarea
              value={nuova.descrizione}
              rows={2}
              placeholder="Cosa fai per risolverlo (facoltativo)"
              aria-label="Testo della nuova esigenza"
              onChange={(e) => setNuova({ ...nuova, descrizione: e.target.value })}
              className="min-h-0 text-xs"
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={aggiungiSua} disabled={!nuova.titolo.trim()}>Aggiungi</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setNuova(null)}>Annulla</Button>
            </div>
          </div>
        )}

        {/* Le due azioni di servizio stanno sulla stessa riga: sono secondarie rispetto alle voci da toccare. */}
        {((haLibreria && ideePronte.length > 0) || (!disabled && !nuova)) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {haLibreria && ideePronte.length > 0 && (
              <button
                type="button"
                onClick={() => setIdeeAperte((a) => !a)}
                className="tap-compact text-xs font-medium text-orange-700 underline-offset-2 hover:underline"
              >
                {ideeAperte ? "Nascondi le idee pronte" : `Altre idee pronte (${ideePronte.length})`}
              </button>
            )}
            {!disabled && !nuova && (
              <button
                type="button"
                onClick={() => setNuova({ titolo: "", descrizione: "" })}
                className="tap-compact inline-flex items-center gap-1 text-xs font-medium text-orange-700 underline-offset-2 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Aggiungi una tua
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
