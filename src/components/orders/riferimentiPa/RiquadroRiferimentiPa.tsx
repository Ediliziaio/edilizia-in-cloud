/**
 * Riquadro «Dati appalto e fatturazione PA» in Panoramica (lotto 3): i codici in evidenza con il
 * pulsante copia, i valori lunghi interi, cosa manca come avviso, «Modifica» per chi può
 * modificare la commessa, e i CIG/CUP già scritti su contratto generale o computo da importare.
 */
import { useState } from "react";
import { Check, Copy, Download, Landmark, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRiferimentiPaCommessa } from "@/hooks/useRiferimentiPaCommessa";
import {
  bozzaDaFonte, bozzaDaRiga, bozzaHaErrori, controllaRiferimento, ETICHETTA_FONTE, etichettaLotto, etichettaTipoRiferimento,
  type BozzaRiferimentoPa, type FonteRiferimentoEsistente, type RiferimentoPa,
} from "@/lib/orders/riferimentiPa";
import { RiferimentiPaEditor } from "./RiferimentiPaEditor";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

const dataIt = (d: string | null) => (d ? d.split("-").reverse().join("/") : null);

function Codice({ etichetta, valore, mono = true }: { etichetta: string; valore: string; mono?: boolean }) {
  const t = useT();
  const [copiato, setCopiato] = useState(false);
  const copia = () => {
    void navigator.clipboard?.writeText(valore)
      .then(() => { setCopiato(true); toast.success(t("{etichetta} copiato", { etichetta })); setTimeout(() => setCopiato(false), 1500); })
      .catch(() => toast.error(t("Non è stato possibile copiare")));
  };
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{etichetta}</dt>
      <dd className="flex items-start gap-1">
        <span className={`min-w-0 break-all text-sm font-semibold ${mono ? "font-mono" : ""}`}>{valore}</span>
        <button type="button" onClick={copia} className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={t("Copia {etichetta}", { etichetta })}>
          {copiato ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </dd>
    </div>
  );
}

function Testo({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{etichetta}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm">{valore}</dd>
    </div>
  );
}

/**
 * Una riga di riferimenti: la usano la Panoramica della commessa e la scheda cliente.
 * `compatta` (colonna stretta della scheda cliente): una voce per riga invece di tre colonne.
 * `nomeUfficio`: la descrizione dell'ufficio scelto, quando chi chiama la conosce.
 */
export function RigaRiferimentoPa({ r, compatta = false, nomeUfficio }: { r: RiferimentoPa; compatta?: boolean; nomeUfficio?: string | null }) {
  const t = useT();
  const { mancanze } = controllaRiferimento(bozzaDaRiga(r));
  const titolo = [etichettaTipoRiferimento(r.tipo), r.numero && `n. ${r.numero}`, r.data && `del ${dataIt(r.data)}`].filter(Boolean).join(" ");
  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="break-words text-sm font-semibold">{titolo}</span>
        {r.lotto && <span className="text-xs text-slate-600">{etichettaLotto(r.lotto)}</span>}
        {r.fonte !== "manuale" && <span className="text-xs text-slate-500">({ETICHETTA_FONTE[r.fonte]})</span>}
      </div>
      <dl className={compatta ? "grid grid-cols-1 gap-2" : "grid gap-3 sm:grid-cols-3"}>
        {r.cig ? <Codice etichetta="CIG" valore={r.cig} />
          : r.cig_non_dovuto ? <Testo etichetta="CIG" valore={`${t("Non dovuto")}${r.cig_motivo_esclusione ? `: ${r.cig_motivo_esclusione}` : ""}`} /> : null}
        {r.cup ? <Codice etichetta="CUP" valore={r.cup} /> : r.cup_non_dovuto ? <Testo etichetta="CUP" valore={t("Non dovuto")} /> : null}
        {nomeUfficio && <Testo etichetta={t("Ufficio")} valore={nomeUfficio} />}
        {r.codice_univoco_ufficio && <Codice etichetta="Codice Univoco Ufficio" valore={r.codice_univoco_ufficio} />}
        {r.numero && <Codice etichetta={`Numero ${etichettaTipoRiferimento(r.tipo).toLowerCase()}`} valore={r.numero} mono={false} />}
        {r.impegno_spesa && <Codice etichetta="Impegno di spesa" valore={r.impegno_spesa} mono={false} />}
        {r.determina && <Testo etichetta="Determina / atto di affidamento" valore={r.determina} />}
        {r.note_fatturazione && <div className={compatta ? "" : "sm:col-span-3"}><Testo etichetta={t("Note per la fatturazione")} valore={r.note_fatturazione} /></div>}
      </dl>
      {mancanze.length > 0 && <p className="text-xs text-amber-800">{t("Manca ancora: {mancanze}", { mancanze: mancanze.join(" · ") })}</p>}
    </li>
  );
}

export function RiquadroRiferimentiPa({ orderId, puoModificare }: { orderId: string; puoModificare: boolean }) {
  const t = useT();
  const { data, isLoading, isError, salva } = useRiferimentiPaCommessa(orderId);
  const [bozze, setBozze] = useState<BozzaRiferimentoPa[] | null>(null);
  if (isLoading || isError || !data) return null;
  const { righe, fonti, attivi, clientePa } = data;
  const daImportare = fonti.filter((f) => !f.giaPresente);
  if (!attivi && !clientePa && righe.length === 0 && daImportare.length === 0) return null;

  const apri = () => setBozze(righe.map(bozzaDaRiga));
  const conErrori = (bozze ?? []).some(bozzaHaErrori);
  const conferma = () => {
    if (!bozze || conErrori) return;
    salva.mutate({ bozze, attivi: true }, {
      onSuccess: () => { toast.success(t("Dati appalto salvati")); setBozze(null); },
      onError: (e) => toast.error(t("Dati appalto non salvati"), { description: messaggioErrore(e) }),
    });
  };
  const importa = (f: FonteRiferimentoEsistente) => {
    const nuove = [...righe.map(bozzaDaRiga), bozzaDaFonte(f)];
    // Un riferimento della fonte troppo lungo o col formato sbagliato non si salva così com'è:
    // si apre «Modifica» con la riga già importata, da correggere.
    if (nuove.some(bozzaHaErrori)) { setBozze(nuove); toast.warning(t("Da correggere prima di salvare"), { description: f.etichetta }); return; }
    salva.mutate({ bozze: nuove, attivi: true }, {
      onSuccess: () => toast.success(t("Riferimento importato"), { description: f.problemi.length ? t("Il codice non ha il formato giusto: correggilo con «Modifica».") : f.etichetta }),
      onError: (e) => toast.error(t("Importazione non riuscita"), { description: messaggioErrore(e) }),
    });
  };

  return (
    <section aria-labelledby="riquadro-riferimenti-pa" className="rounded-xl border bg-card p-4" data-testid="riquadro-riferimenti-pa">
      <div className="mb-3 flex items-center gap-2">
        <Landmark className="h-4 w-4 text-slate-600" aria-hidden="true" />
        <h2 id="riquadro-riferimenti-pa" className="text-base font-semibold">{t("Dati appalto e fatturazione PA")}</h2>
        {puoModificare && (
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={apri}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />{t("Modifica")}
          </Button>
        )}
      </div>

      {righe.length === 0 ? (
        <p className="text-sm text-amber-800">{clientePa ? t("Il cliente è una Pubblica Amministrazione: mancano contratto o ordine d'acquisto, CIG e CUP.") : t("Nessun riferimento inserito.")}</p>
      ) : (
        <ol className="divide-y">{righe.map((r) => <RigaRiferimentoPa key={r.id} r={r} />)}</ol>
      )}

      {daImportare.length > 0 && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-xs font-semibold text-slate-700">{t("Già scritti altrove su questa commessa")}</p>
          {daImportare.map((f) => (
            <div key={`${f.fonte}-${f.fonte_id}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-sm">
                <span className="text-slate-600">{f.etichetta}: </span>
                <span className="break-all font-mono">{[f.cig && `CIG ${f.cig}`, f.cup && `CUP ${f.cup}`].filter(Boolean).join(" · ")}</span>
              </p>
              {puoModificare && (
                <Button type="button" size="sm" variant="outline" disabled={salva.isPending} onClick={() => importa(f)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />{t("Importa")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={bozze !== null} onOpenChange={(o) => { if (!o) setBozze(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Dati appalto e fatturazione PA")}</DialogTitle>
            <DialogDescription>{t("Un riferimento per ogni contratto, ordine d'acquisto o convenzione. Nessun campo è obbligatorio.")}</DialogDescription>
          </DialogHeader>
          {bozze && <RiferimentiPaEditor bozze={bozze} onChange={setBozze} fonti={fonti} disabilitato={salva.isPending} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBozze(null)}>{t("Annulla")}</Button>
            <Button type="button" onClick={conferma} disabled={salva.isPending || conErrori}>{salva.isPending ? t("Salvo…") : t("Salva")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
