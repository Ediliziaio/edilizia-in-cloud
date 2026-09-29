/**
 * «Copia configurazione su…» — dal modello già configurato di un intervento, il
 * titolare lo copia su altri interventi. La copia è indipendente ed editabile:
 * sono record separati in modelli_libreria_azienda, modificarne uno non tocca gli
 * altri. Il salvataggio passa dalla stessa porta online del salvataggio normale,
 * quindi l'avviso «solo in questo browser» (MODELLO_NON_ONLINE) scatta come sempre
 * ed è la libreria a mostrarlo.
 *
 * Distinzione chiave in UI:
 *  - stesso tipo → «Copia completa» (testi, immagini, impostazioni tecniche);
 *  - tipo diverso → «Solo impostazioni comuni» (azienda, branding, testi generali);
 *    le parti tecniche restano ai valori predefiniti;
 *  - modulo essenziale + tipo diverso → non compatibile (nessun campo in comune).
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Copy, Loader2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import {
  caricaModello, haModelloSalvato, risolviTipoModello, classificaCopia,
  copiaConfigurazioneSuModulo, type AnagraficaDocumento, type TipoModello, type EsitoCopia,
} from "@/lib/moduli-vendita/copiaModello";

interface Sorgente { areaId: string; moduleId: string; titolo: string; areaTitolo: string }

interface Destinazione {
  areaId: string;
  areaTitolo: string;
  moduleId: string;
  titolo: string;
  modo: "completa" | "comune" | "no";
  presente: boolean;
}

const chiaveDi = (areaId: string, moduleId: string) => `${areaId}::${moduleId}`;

export function CopiaConfigurazioneDialog({
  open, onOpenChange, companyId, anagrafica, sorgente, onCopiato,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  anagrafica: AnagraficaDocumento;
  sorgente: Sorgente | null;
  onCopiato?: () => void;
}) {
  const [caricato, setCaricato] = useState<{ template: unknown; tipo: TipoModello } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  const [sovrascrivi, setSovrascrivi] = useState(false);
  const [esiti, setEsiti] = useState<EsitoCopia[] | null>(null);
  const [giro, setGiro] = useState(0);

  // Carica il modello sorgente all'apertura; azzera lo stato del dialog.
  useEffect(() => {
    if (!open || !sorgente) return;
    setSelezione(new Set());
    setSovrascrivi(false);
    setEsiti(null);
    setGiro((g) => g + 1);
    try {
      const record = caricaModello(companyId, sorgente.areaId, sorgente.moduleId);
      if (!record) { setCaricato(null); setErrore("Questo modulo non ha ancora un modello salvato da copiare."); return; }
      setCaricato({ template: record.template, tipo: risolviTipoModello(sorgente.areaId, sorgente.moduleId) });
      setErrore(null);
    } catch (e) {
      setCaricato(null);
      setErrore(e instanceof Error ? e.message : "Impossibile leggere il modello di partenza.");
    }
  }, [open, sorgente, companyId]);

  const tipoSorgente = caricato?.tipo ?? null;

  // Le destinazioni possibili: tutti gli interventi tranne la sorgente, con il
  // tipo di copia e se hanno già un modello. `giro`/`esiti` rinfrescano lo stato
  // «già presente» dopo una copia.
  const gruppi = useMemo(() => {
    if (!sorgente || !tipoSorgente) return [] as { area: string; areaId: string; voci: Destinazione[] }[];
    return SALES_AREAS.map((area) => ({
      area: area.title,
      areaId: area.id,
      voci: area.interventions
        .filter((m) => !(area.id === sorgente.areaId && m.id === sorgente.moduleId))
        .map((m): Destinazione => {
          const tipoDest = risolviTipoModello(area.id, m.id);
          return {
            areaId: area.id, areaTitolo: area.title, moduleId: m.id, titolo: m.title,
            modo: classificaCopia(tipoSorgente, tipoDest),
            presente: haModelloSalvato(companyId, area.id, m.id),
          };
        }),
    })).filter((g) => g.voci.some((v) => v.modo !== "no"));
  }, [sorgente, tipoSorgente, companyId, giro, esiti]);

  const selezionate = useMemo(() => {
    const tutte = gruppi.flatMap((g) => g.voci);
    return tutte.filter((v) => selezione.has(chiaveDi(v.areaId, v.moduleId)));
  }, [gruppi, selezione]);

  const nComuni = selezionate.filter((v) => v.modo === "comune").length;
  const nDaSovrascrivere = selezionate.filter((v) => v.presente).length;

  const commuta = (v: Destinazione) => {
    if (v.modo === "no") return;
    setSelezione((prev) => {
      const next = new Set(prev);
      const k = chiaveDi(v.areaId, v.moduleId);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const selezionaStessoTipo = () => {
    setSelezione(new Set(gruppi.flatMap((g) => g.voci).filter((v) => v.modo === "completa").map((v) => chiaveDi(v.areaId, v.moduleId))));
  };

  const esegui = () => {
    if (!caricato || !sorgente || selezionate.length === 0) return;
    const risultati = selezionate.map((v) => copiaConfigurazioneSuModulo({
      companyId, anagrafica,
      sorgente: { areaId: sorgente.areaId, moduleId: sorgente.moduleId, tipo: caricato.tipo, template: caricato.template },
      destinazione: { areaId: v.areaId, moduleId: v.moduleId },
      sovrascrivi,
    }));
    setEsiti(risultati);
    setSelezione(new Set());
    onCopiato?.();
  };

  const titoloDi = (e: EsitoCopia) => {
    const area = SALES_AREAS.find((a) => a.id === e.areaId);
    const m = area?.interventions.find((i) => i.id === e.moduleId);
    return `${area?.title ?? e.areaId} · ${m?.title ?? e.moduleId}`;
  };
  const copiati = esiti?.filter((e) => e.esito === "copiato") ?? [];
  const saltati = esiti?.filter((e) => e.esito === "saltato") ?? [];
  const errori = esiti?.filter((e) => e.esito === "errore") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Copia configurazione su…</DialogTitle>
          <DialogDescription>
            {sorgente
              ? <>Copia il modello di <strong>{sorgente.titolo}</strong> ({sorgente.areaTitolo}) su altri interventi. Ogni copia è indipendente: potrai modificarla senza toccare l&apos;originale.</>
              : "Scegli i moduli su cui copiare la configurazione."}
          </DialogDescription>
        </DialogHeader>

        {errore && (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {errore}
          </div>
        )}

        {esiti ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-800"><Check className="h-3.5 w-3.5" />{copiati.length} copiati</span>
              {saltati.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-700">{saltati.length} saltati</span>}
              {errori.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-red-800"><AlertTriangle className="h-3.5 w-3.5" />{errori.length} non riusciti</span>}
            </div>
            {(saltati.length > 0 || errori.length > 0) && (
              <ScrollArea className="max-h-52 rounded-lg border">
                <ul className="divide-y text-xs">
                  {errori.map((e) => (
                    <li key={chiaveDi(e.areaId, e.moduleId)} className="px-3 py-2">
                      <span className="font-medium text-red-800">{titoloDi(e)}</span>
                      <span className="text-muted-foreground"> — {e.messaggio}</span>
                    </li>
                  ))}
                  {saltati.map((e) => (
                    <li key={chiaveDi(e.areaId, e.moduleId)} className="px-3 py-2">
                      <span className="font-medium text-slate-700">{titoloDi(e)}</span>
                      <span className="text-muted-foreground"> — {e.messaggio}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
            <p className="text-xs text-muted-foreground">
              I modelli copiati sono salvati per l&apos;azienda. Se qualcosa non arriva online, la libreria lo segnala e puoi riprovare.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEsiti(null)}>Copia su altri moduli</Button>
              <Button onClick={() => onOpenChange(false)}>Chiudi</Button>
            </DialogFooter>
          </div>
        ) : caricato ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Copia completa (stesso tipo)</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Solo impostazioni comuni</span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selezionaStessoTipo}>Seleziona i moduli dello stesso tipo</Button>
            </div>

            <ScrollArea className="max-h-[45vh] rounded-lg border">
              <div className="divide-y">
                {gruppi.map((g) => (
                  <div key={g.areaId} className="p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.area}</p>
                    <ul className="space-y-1">
                      {g.voci.map((v) => {
                        const k = chiaveDi(v.areaId, v.moduleId);
                        const incompatibile = v.modo === "no";
                        return (
                          <li key={k}>
                            <label className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${incompatibile ? "opacity-45" : "cursor-pointer hover:bg-slate-50"}`}>
                              <Checkbox checked={selezione.has(k)} disabled={incompatibile} onCheckedChange={() => commuta(v)} />
                              <span className="flex-1">{v.titolo}</span>
                              {v.presente && !incompatibile && (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">già configurato</span>
                              )}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] ${
                                  incompatibile ? "bg-slate-100 text-slate-500"
                                    : v.modo === "completa" ? "bg-emerald-50 text-emerald-700"
                                      : "bg-sky-50 text-sky-700"
                                }`}
                              >
                                {incompatibile ? "non compatibile" : v.modo === "completa" ? "copia completa" : "solo impostazioni comuni"}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {nComuni > 0 && (
              <p className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs leading-relaxed text-sky-950">
                Sui moduli di tipo diverso vengono copiati solo dati azienda, branding e testi generali; le parti tecniche
                (esigenze, lavorazioni, computo, pagine del PDF) restano ai valori predefiniti del modulo di destinazione.
              </p>
            )}

            {nDaSovrascrivere > 0 && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <Checkbox checked={sovrascrivi} onCheckedChange={(v) => setSovrascrivi(v === true)} className="mt-0.5" />
                <span>
                  <strong>{nDaSovrascrivere}</strong> {nDaSovrascrivere === 1 ? "modulo selezionato ha" : "moduli selezionati hanno"} già un modello salvato.
                  Sovrascrivi{nDaSovrascrivere === 1 ? "lo" : "li"} con questa configurazione. Senza la spunta {nDaSovrascrivere === 1 ? "verrà saltato" : "verranno saltati"}.
                </span>
              </label>
            )}

            <DialogFooter className="items-center gap-2 sm:justify-between">
              <span className="text-xs text-muted-foreground">
                {selezionate.length === 0 ? "Nessun modulo selezionato" : `${selezionate.length} ${selezionate.length === 1 ? "modulo selezionato" : "moduli selezionati"}`}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}><X className="mr-1 h-4 w-4" />Annulla</Button>
                <Button onClick={esegui} disabled={selezionate.length === 0}>
                  <Copy className="mr-1 h-4 w-4" />
                  Copia {selezionate.length > 0 ? `su ${selezionate.length}` : ""}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </DialogFooter>
          </div>
        ) : !errore ? (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carico il modello di partenza…</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
