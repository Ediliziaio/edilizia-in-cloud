import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { VoceEditor } from "@/lib/computo/editorNativo";
import { applicaVerifica, fontiDichiarate, voceRichiesta, type RisposteDomande } from "@/lib/preventivi/coordinatore/computo";
import { coordinaVerifica, descriviCandidato, memoriaVuota, MAX_VOCI_VERIFICA, type EsitoVerifica, type MemoriaCoordinatore } from "@/lib/preventivi/coordinatore/coordinatore";
import type { DbLettura } from "@/lib/preventivi/coordinatore/agenti";
import { FASCIA_MARGINE_ABITUALE, margineValido, type VoceRichiesta } from "@/lib/preventivi/coordinatore/tipi";
import { numeroEditor } from "@/lib/computo/editorNativo";
import { Label } from "@/components/ui/label";

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const oggiIso = () => new Date().toLocaleDateString("en-CA");
const titolo = (v: VoceRichiesta) => (v.descrizione.trim().split("\n")[0] || "Voce senza descrizione").slice(0, 110);

const chiaveMargine = (companyId: string) => `eic:margine-obiettivo:${companyId}`;
function margineRicordato(companyId: string): string {
  try { return localStorage.getItem(chiaveMargine(companyId)) ?? ""; } catch { return ""; }
}
const ORIGINE = { indicato: "scelto da te", azienda: "quello dell'azienda", standard: "standard" } as const;

// Le letture restano in memoria finché la pagina è aperta: riaprire la verifica dopo aver cambiato una quantità non rilegge i listini.
const memorie = new Map<string, MemoriaCoordinatore>();

export interface VerificaApplicata { voci: VoceEditor[]; applicate: number; risposteScritte: number; cambiateNelFrattempo: number }

/**
 * «Verifica prezzi e fonti»: una schermata sola. In alto ciò che manca e che solo l'utente sa (le domande),
 * poi le proposte con la fonte e la differenza dal valore attuale, infine le cose da guardare.
 * Un prezzo scritto a mano parte NON selezionato: si cambia solo se lo si spunta.
 */
export default function VerificaPrezziFonti({ open, onOpenChange, companyId, voci, vediCosti, onApplica, db }: {
  open: boolean; onOpenChange: (open: boolean) => void; companyId: string; voci: VoceEditor[]; vediCosti: boolean;
  onApplica: (esito: VerificaApplicata) => void;
  /** Solo per le prove: il client con cui leggere. */
  db?: DbLettura;
}) {
  const [esito, setEsito] = useState<EsitoVerifica | null>(null);
  const [analizzate, setAnalizzate] = useState<VoceRichiesta[]>([]);
  const [errore, setErrore] = useState("");
  const [inCorso, setInCorso] = useState(open);
  const [accettate, setAccettate] = useState<ReadonlySet<string>>(new Set());
  const [risposte, setRisposte] = useState<Required<RisposteDomande>>({ quantita: {}, prezzi: {} });
  // Il margine obiettivo: vuoto = decide l'azienda o lo standard; scritto = vale quello, e lo si ritrova la volta dopo.
  const [margine, setMargine] = useState(() => (vediCosti ? margineRicordato(companyId) : ""));
  const margineScelto = vediCosti ? numeroEditor(margine) : null;
  const margineDaUsare = margineValido(margineScelto) ? margineScelto : undefined;
  const giro = useRef(0);
  const vociAttuali = useRef(voci);
  useEffect(() => { vociAttuali.current = voci; }, [voci]);

  const avvia = useCallback(async () => {
    // Un solo giro alla volta conta: il risultato di uno superato si butta.
    const mio = ++giro.current;
    setInCorso(true); setErrore("");
    try {
      const richieste = vociAttuali.current.map(v => voceRichiesta(v, vediCosti));
      const client = db ?? (await import("@/integrations/supabase/client")).supabase as unknown as DbLettura;
      const chiave = `${companyId}|${vediCosti}`;
      if (!memorie.has(chiave)) { memorie.clear(); memorie.set(chiave, memoriaVuota()); }
      const risultato = await coordinaVerifica({ companyId, voci: richieste, fontiDichiarate: fontiDichiarate(vociAttuali.current), permessi: { costi: vediCosti }, oggi: oggiIso(), margineObiettivoPct: margineDaUsare }, client, memorie.get(chiave));
      if (mio !== giro.current) return;
      setEsito(risultato); setAnalizzate(richieste); setRisposte({ quantita: {}, prezzi: {} });
      // Di partenza si accetta tutto ciò che non tocca un prezzo scritto a mano.
      setAccettate(new Set(risultato.voci.filter(v => v.proposta && !v.proposta.suManuale).map(v => v.voceId)));
    } catch (e) {
      if (mio === giro.current) setErrore(e instanceof Error ? e.message : "Verifica non riuscita: riprova.");
    } finally {
      if (mio === giro.current) setInCorso(false);
    }
  }, [companyId, vediCosti, db, margineDaUsare]);

  // La verifica parte da sola all'apertura e si rifà quando cambia il margine, dopo che si è smesso di scrivere.
  const primoGiro = useRef(true);
  useEffect(() => {
    if (!open) return;
    const attesa = setTimeout(() => void avvia(), primoGiro.current ? 0 : 500);
    primoGiro.current = false;
    return () => clearTimeout(attesa);
  }, [open, avvia]);
  const cambiaMargine = (testo: string) => {
    setMargine(testo);
    try {
      const n = numeroEditor(testo);
      if (margineValido(n)) localStorage.setItem(chiaveMargine(companyId), testo.trim());
      else if (!testo.trim()) localStorage.removeItem(chiaveMargine(companyId));
    } catch { /* senza memoria del browser il margine vale per questa volta */ }
  };

  const perId = useMemo(() => new Map(analizzate.map(v => [v.id, v])), [analizzate]);
  const proposte = useMemo(() => (esito?.voci ?? []).filter(v => v.proposta && (v.proposta.prezzo !== undefined || v.proposta.costo !== undefined || v.proposta.fonte)), [esito]);
  const domande = (esito?.controlli ?? []).filter(c => c.gravita === "domanda");
  const avvisi = (esito?.controlli ?? []).filter(c => c.gravita === "avviso");
  const risposteDate = Object.values(risposte.quantita).filter(s => s.trim()).length + Object.values(risposte.prezzi).filter(s => s.trim()).length;
  const daApplicare = proposte.filter(p => accettate.has(p.voceId)).length;
  const cambia = (id: string, si: boolean) => setAccettate(prima => { const s = new Set(prima); if (si) s.add(id); else s.delete(id); return s; });

  const applica = () => {
    if (!esito) return;
    const fatto = applicaVerifica(vociAttuali.current, analizzate, esito.voci, accettate, { vediCosti, oggi: oggiIso(), risposte });
    onApplica(fatto);
    onOpenChange(false);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col gap-3 max-sm:p-3">
      <DialogHeader>
        <DialogTitle>Verifica prezzi e fonti</DialogTitle>
        <DialogDescription>
          Confronto ogni voce con il listino dell'azienda, i preventivi già accettati{vediCosti ? ", i listini dei fornitori e gli acquisti" : ""}. Niente cambia finché non applichi.
        </DialogDescription>
      </DialogHeader>
      {voci.length > MAX_VOCI_VERIFICA && <p role="alert" className="text-sm text-destructive">La verifica lavora fino a {MAX_VOCI_VERIFICA} voci: questo preventivo ne ha {voci.length}.</p>}
      {vediCosti && <div className="flex flex-wrap items-end gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-2.5 py-2">
        <div className="space-y-1">
          <Label htmlFor="margine-obiettivo" className="text-xs">Margine obiettivo %</Label>
          <Input id="margine-obiettivo" className="h-8 w-24" inputMode="decimal" maxLength={6} value={margine}
            placeholder={esito ? String(esito.profilo.margineObiettivoPct).replace(".", ",") : "30"} onChange={e => cambiaMargine(e.target.value)} />
        </div>
        <p className="min-w-0 flex-1 pb-1 text-xs text-muted-foreground" data-testid="margine-spiegazione">
          {margine.trim() && !margineValido(margineScelto) ? <span className="text-destructive">Scrivi una percentuale tra 1 e 94.</span>
            : esito ? <>Uso il <strong>{String(esito.profilo.margineObiettivoPct).replace(".", ",")}%</strong> ({ORIGINE[esito.profilo.margineOrigine]}): è margine diretto, sul prezzo. Dove c'è solo il costo, il prezzo nasce da qui: costo 100 € → {euro.format(100 / (1 - esito.profilo.margineObiettivoPct / 100))}.
              {(esito.profilo.margineObiettivoPct < FASCIA_MARGINE_ABITUALE.da || esito.profilo.margineObiettivoPct > FASCIA_MARGINE_ABITUALE.a) && <span className="text-amber-700"> Di solito sta tra {FASCIA_MARGINE_ABITUALE.da}% e {FASCIA_MARGINE_ABITUALE.a}%.</span>}</>
            : `Di solito tra ${FASCIA_MARGINE_ABITUALE.da}% e ${FASCIA_MARGINE_ABITUALE.a}%.`}
        </p>
      </div>}
      {inCorso && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Leggo listini e storico…</p>}
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      {esito && !inCorso && <>
        <p className="text-xs text-muted-foreground" data-testid="riepilogo-verifica">
          {esito.misure.vociTotali} voci · {esito.misure.conFonte} con una fonte{esito.misure.percentualeConFonte !== null ? ` (${String(esito.misure.percentualeConFonte).replace(".", ",")}%)` : ""} · {proposte.length} proposte · {domande.length} da completare · {avvisi.length} da guardare · {esito.misure.letture} letture, nessun costo AI
        </p>
        {esito.economia && esito.economia.vociConCosto > 0 && <p className="text-sm" data-testid="economia-verifica">
          Con queste proposte: ricavo {euro.format(esito.economia.ricavo)}, costo {euro.format(esito.economia.costo)}, margine{" "}
          <strong className={esito.economia.marginePct !== null && esito.economia.marginePct < esito.profilo.margineObiettivoPct - 0.05 ? "text-amber-700" : "text-emerald-700"}>{esito.economia.marginePct === null ? "non calcolabile" : `${String(esito.economia.marginePct).replace(".", ",")}%`}</strong>
          {" "}su {esito.economia.vociConCosto} {esito.economia.vociConCosto === 1 ? "voce" : "voci"} con costo{esito.economia.vociSenzaCosto ? ` · ${esito.economia.vociSenzaCosto} senza costo, fuori dal conto` : ""}.
        </p>}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {domande.length > 0 && <section aria-label="Da completare" className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><HelpCircle className="h-4 w-4 text-blue-700" />Da completare ({domande.length})</h3>
            <ul className="space-y-1.5">{domande.map((d, i) => {
              const v = d.voceId ? perId.get(d.voceId) : undefined;
              const originale = d.voceId ? voci.find(x => x.id === d.voceId) : undefined;
              const campo = d.codice === "quantita_mancante" && originale && !originale.misure.length ? "quantita" as const : d.codice === "prezzo_senza_fonte" ? "prezzi" as const : null;
              return <li key={`${d.codice}-${d.voceId}-${i}`} className="flex flex-wrap items-center gap-2 rounded-md border bg-white px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1">{d.testo}</span>
                {campo && v && <Input className="h-8 w-28" inputMode="decimal" maxLength={20} placeholder={campo === "quantita" ? v.unita || "quantità" : "€ per unità"}
                  aria-label={`${campo === "quantita" ? "Quantità" : "Prezzo"} di ${titolo(v)}`} value={risposte[campo][v.id] ?? ""}
                  onChange={e => setRisposte(r => ({ ...r, [campo]: { ...r[campo], [v.id]: e.target.value } }))} />}
                {d.codice === "quantita_mancante" && originale && originale.misure.length > 0 && <span className="text-xs text-muted-foreground">Completa le misure nella voce.</span>}
              </li>;
            })}</ul>
          </section>}
          {proposte.length > 0 && <section aria-label="Proposte" className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-700" />Proposte ({proposte.length})</h3>
            <ul className="space-y-1.5">{proposte.map(e => {
              const v = perId.get(e.voceId); const p = e.proposta!;
              if (!v) return null;
              const altre = e.candidati.filter(c => c.id !== e.vendita?.id && c.id !== e.costo?.id);
              return <li key={e.voceId} className="rounded-md border bg-white px-2.5 py-1.5 text-sm">
                <label className="flex cursor-pointer items-start gap-2">
                  <Checkbox className="mt-0.5" checked={accettate.has(e.voceId)} onCheckedChange={si => cambia(e.voceId, si === true)} aria-label={`Applica la proposta per ${titolo(v)}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{titolo(v)}</span>
                    {p.prezzo !== undefined && <span className="block">
                      Prezzo: {v.prezzo === null ? "nessuno" : <s className="text-muted-foreground">{euro.format(v.prezzo)}</s>} → <strong>{euro.format(p.prezzo)}</strong>{v.unita ? ` / ${v.unita}` : ""}
                      {p.suManuale && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">sostituisce un prezzo scritto a mano</span>}
                    </span>}
                    {p.costo !== undefined && <span className="block text-muted-foreground">Costo stimato: {euro.format(p.costo)}{e.costo ? ` · ${e.costo.etichetta}` : ""}</span>}
                    <span className="block text-xs text-muted-foreground">
                      {p.regola ? `Calcolato: ${p.regola}. Non viene da un listino: confermalo.` : e.vendita ? `Fonte: ${descriviCandidato(e.vendita)}${e.vendita.condizioni ? ` · ${e.vendita.condizioni}` : ""}` : p.fonte}
                      {e.marginePct !== null ? ` · margine ${String(e.marginePct).replace(".", ",")}%` : ""}
                    </span>
                  </span>
                </label>
                {altre.length > 0 && <details className="ml-6 mt-1 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Altre fonti trovate ({altre.length})</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">{altre.map(c => <li key={c.id}>{c.natura === "costo" ? "Costo · " : ""}{descriviCandidato(c)}{c.condizioni ? ` · ${c.condizioni}` : ""}{c.selezionabile ? "" : " · solo per confronto"}</li>)}</ul>
                </details>}
              </li>;
            })}</ul>
          </section>}
          {avvisi.length > 0 && <section aria-label="Da guardare" className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" />Da guardare ({avvisi.length})</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">{avvisi.map((a, i) => <li key={`${a.codice}-${a.voceId}-${i}`}>{a.testo}</li>)}</ul>
          </section>}
          {!domande.length && !proposte.length && !avvisi.length && <p className="text-sm">Niente da proporre: ogni prezzo ha la sua fonte e i controlli non segnalano nulla.</p>}
          <p className="text-xs text-muted-foreground">Sono controlli su ciò che è scritto: non dicono se manca una lavorazione che nessuno ha indicato.</p>
        </div>
      </>}
      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="outline" size="sm" disabled={inCorso || voci.length > MAX_VOCI_VERIFICA} onClick={() => void avvia()}><RefreshCw className="mr-1 h-4 w-4" />Ricontrolla</Button>
        <span className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Chiudi</Button>
          <Button type="button" size="sm" disabled={inCorso || !esito || (!daApplicare && !risposteDate)} onClick={applica}>
            {daApplicare || risposteDate ? `Applica ${daApplicare + risposteDate} ${daApplicare + risposteDate === 1 ? "modifica" : "modifiche"}` : "Niente da applicare"}
          </Button>
        </span>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
