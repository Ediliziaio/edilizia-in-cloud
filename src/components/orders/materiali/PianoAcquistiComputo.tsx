import { useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, Package, Search } from "lucide-react";
import type { AcquistoPianificato } from "@/lib/distinta/pianoAcquisti";
import { normalizzaTesto } from "@/lib/distinta/generaDistinta";
import { corrispondeRicercaArticolo } from "@/lib/distinta/navigazioneArticoli";
import { DatiDocumentoMateriale } from "./DatiDocumentoMateriale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const numeroBase = (n: number) => n.toLocaleString(intlCampo(), { maximumFractionDigits: 2 });
const data = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
type Filtro = "tutti" | "comprare" | "verificare" | "coperti" | "date";
const inVerifica = (r: AcquistoPianificato) => r.nuovoOrdine === null;
const senzaData = (r: AcquistoPianificato) => r.nuovoOrdine !== 0 && !r.dataServe;

export function PianoAcquistiComputo({ righe, nomeFase, vociDaScomporre = 0, oggi = new Date().toLocaleDateString("en-CA"), soloDaVerificareIniziale = false, onCompleta, onData, onGestisci }: {
  righe: AcquistoPianificato[]; nomeFase: (id: string | null) => string; vociDaScomporre?: number; oggi?: string; soloDaVerificareIniziale?: boolean;
  onCompleta?: (chiave: string) => void; onData?: (chiave: string) => void; onGestisci?: (chiavi: string[]) => void;
}) {
  const t = useT();
  const numero = (n: number | null) => n === null ? t("Da verificare") : numeroBase(n);
  const [filtro, setFiltro] = useState<Filtro>(soloDaVerificareIniziale ? "verificare" : "tutti");
  const [cerca, setCerca] = useState("");
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const filtra = (f: Filtro) => { setFiltro(f); setScelti(new Set()); };
  const gruppi = [
    { id: "comprare" as const, nome: t("Da comprare"), icona: Package, righe: righe.filter(r => r.nuovoOrdine !== null && r.nuovoOrdine > 0), colore: "text-primary" },
    { id: "verificare" as const, nome: t("Da completare"), icona: AlertCircle, righe: righe.filter(inVerifica), colore: "text-amber-700" },
    { id: "coperti" as const, nome: t("Senza nuovo ordine"), icona: CheckCircle2, righe: righe.filter(r => r.nuovoOrdine === 0), colore: "text-emerald-700" },
    { id: "date" as const, nome: t("Senza data"), icona: CalendarClock, righe: righe.filter(senzaData), colore: "text-muted-foreground" },
  ];
  const visibili = (filtro === "tutti" ? righe : gruppi.find(g => g.id === filtro)!.righe).filter(r =>
    corrispondeRicercaArticolo({ name: r.materiale.descrizione, description: nomeFase(r.materiale.phase_id), specifiche: r.materiale.specifiche,
      origini: r.materiale.origini, posizioni: null, locale: r.materiale.locale }, cerca));
  const selezionati = visibili.filter(r => scelti.has(r.chiave));
  const tuttiScelti = visibili.length > 0 && visibili.every(r => scelti.has(r.chiave));
  const seleziona = (chiavi: string[], si: boolean) => setScelti(prima => {
    const dopo = new Set(prima); chiavi.forEach(k => si ? dopo.add(k) : dopo.delete(k)); return dopo;
  });
  return <section className="space-y-4 text-sm" aria-label={t("Piano acquisti del computo")}>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label={t("Riepilogo piano acquisti")}>
      {gruppi.map(g => <button type="button" key={g.id} aria-label={g.righe.length + " " + g.nome} aria-pressed={filtro === g.id} onClick={() => filtra(filtro === g.id ? "tutti" : g.id)}
        className={cn("flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/40", filtro === g.id && "border-primary bg-primary/5 ring-1 ring-primary/20")}>
        <g.icona className={cn("h-5 w-5 shrink-0", g.colore)} aria-hidden /><span className="min-w-0"><span className="block text-xl font-semibold tabular-nums">{g.righe.length}</span><span className="block text-xs text-muted-foreground">{g.nome}</span></span>
      </button>)}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-40 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input className="pl-9" aria-label={t("Cerca nel piano acquisti")} placeholder={t("Cerca materiale, fase o codice…")} value={cerca}
          onChange={e => { setCerca(e.target.value); setScelti(new Set()); }} /></div>
      <Button type="button" size="sm" variant={filtro === "tutti" ? "secondary" : "ghost"} aria-pressed={filtro === "tutti"} onClick={() => filtra("tutti")}>{t("Tutti ({n})", { n: righe.length })}</Button>
      {(filtro !== "tutti" || cerca) && <Button type="button" size="sm" variant="ghost" onClick={() => { filtra("tutti"); setCerca(""); }}>{t("Azzera filtri")}</Button>}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">{t("Quantità al netto di ordini e disponibilità. Il magazzino proposto va riservato alla commessa; le righe da completare richiedono una verifica prima dell'acquisto.")}</p>
    {vociDaScomporre > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{t("Piano parziale: {n} voci richiedono ancora la scomposizione dei materiali.", { n: vociDaScomporre })}</p>}
    {!righe.length ? <p>{t("Non ci sono ancora materiali nel piano. Inseriscili dal computo o aggiungili nella commessa.")}</p> : !visibili.length ? <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{t("Nessun materiale con questi filtri.")}</p> :
      <div className="overflow-hidden rounded-xl border bg-card">
      <table className="block w-full text-left lg:table">
        <caption className="sr-only">{t("Quantità, coperture e scadenze degli acquisti")}</caption>
        <thead className="hidden border-b bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground lg:table-header-group"><tr>
          {onGestisci && <th className="w-9 p-3"><input type="checkbox" aria-label={t("Seleziona i materiali visibili del piano")} checked={tuttiScelti} onChange={e => seleziona(visibili.map(r => r.chiave), e.target.checked)} /></th>}
          <th className="p-3 font-medium">{t("Materiale / fase")}</th><th className="p-3 text-right font-medium">{t("Fabbisogno")}</th><th className="p-3 text-right font-medium">{t("Già ordinato")}</th><th className="p-3 text-right font-medium">{t("Da magazzino")}</th><th className="p-3 text-right font-medium">{t("Da comprare")}</th><th className="p-3 font-medium">{t("Quando / azioni")}</th>
        </tr></thead>
        <tbody className="block divide-y lg:table-row-group">{visibili.map(r => {
          const specifiche = r.materiale.specifiche;
          const ripetute = specifiche && normalizzaTesto(specifiche).includes(normalizzaTesto(r.materiale.descrizione));
          const avvisi = [...new Set(r.avvisi)];
          const daRiservare = r.giacenze.reduce((somma, g) => somma + g.quantita, 0);
          const quantita = (valore: number | null) => valore === 0 ? <span className="text-muted-foreground" aria-label={t("Nessuna quantità")}>—</span> : <>{numero(valore)} {valore !== null && r.materiale.unita_misura}</>;
          return <tr key={r.chiave} className="grid grid-cols-2 gap-x-3 gap-y-3 p-3 align-top text-xs lg:table-row lg:p-0" data-acquisto={r.materiale.descrizione}>
            {onGestisci && <td className="col-span-2 lg:w-9 lg:p-3"><input type="checkbox" aria-label={t("Seleziona {nome} nel piano", { nome: r.materiale.descrizione })} checked={scelti.has(r.chiave)} onChange={e => seleziona([r.chiave], e.target.checked)} /></td>}
            <td className="col-span-2 min-w-0 lg:max-w-sm lg:p-3"><p className="line-clamp-2 text-sm font-medium leading-5" title={r.materiale.descrizione}>{r.materiale.descrizione}</p>
              <p className="mt-1 text-xs text-muted-foreground">{nomeFase(r.materiale.phase_id)}</p>
              {(avvisi.length > 0 || r.materiale.dati_documentali || (specifiche && !ripetute)) && <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">{inVerifica(r) ? t("Cosa manca e fonti") : t("Dettagli e fonti")}</summary>
                {specifiche && !ripetute && <p className="mt-2 leading-5 text-muted-foreground">{specifiche}</p>}
                {avvisi.length > 0 && <ul className="mt-2 space-y-1.5 leading-5 text-amber-800">{avvisi.map(a => <li key={a}>{a}</li>)}</ul>}
                <DatiDocumentoMateriale dati={r.materiale.dati_documentali} />
              </details>}
            </td>
            <td className="tabular-nums lg:p-3 lg:text-right"><span className="mb-1 block text-[11px] text-muted-foreground lg:hidden">{t("Fabbisogno")}</span>{quantita(r.necessario)}</td>
            <td className="tabular-nums lg:p-3 lg:text-right"><span className="mb-1 block text-[11px] text-muted-foreground lg:hidden">{t("Già ordinato")}</span>{quantita(r.ordinato)}</td>
            <td className="tabular-nums lg:p-3 lg:text-right"><span className="mb-1 block text-[11px] text-muted-foreground lg:hidden">{t("Da magazzino")}</span>{quantita(r.daMagazzino)}{r.daMagazzino > 0 && <p className="mt-1 text-emerald-700">{daRiservare > 0 ? r.daMagazzino > daRiservare ? t("{riservati} già riservati · {daRiservare} da riservare", { riservati: numero(r.daMagazzino - daRiservare), daRiservare: numero(daRiservare) }) : t("Da riservare") : t("Già riservato")}</p>}</td>
            <td className="tabular-nums lg:p-3 lg:text-right"><span className="mb-1 block text-[11px] text-muted-foreground lg:hidden">{t("Da comprare")}</span>
              <strong className={cn("text-sm", inVerifica(r) || (r.nuovoOrdine === 0 && r.giacenze.length) ? "text-amber-800" : r.nuovoOrdine === 0 ? "text-emerald-700" : "text-foreground")}>{inVerifica(r) ? t("Da verificare") : r.nuovoOrdine === 0 ? r.giacenze.length ? t("Da riservare") : t("Coperto") : quantita(r.daComprare)}</strong>
              {r.inBozza > 0 && <p className="mt-1 text-muted-foreground">{t("{n} già in bozza: completa l'ordine esistente", { n: numero(r.inBozza) })}</p>}
              {r.acquisto && r.nuovoOrdine! > 0 && <p className="mt-1 text-muted-foreground">{t("Nuovo ordine: {quantita} {unita}", { quantita: numero(r.acquisto.quantita), unita: r.acquisto.unita })}</p>}
            </td>
            <td className="col-span-2 lg:min-w-40 lg:p-3"><div className="flex flex-col items-start gap-2">
              {inVerifica(r) ? <>{onCompleta && r.materiale.verifica_acquisto?.stato === "da_verificare"
                ? <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => onCompleta(r.chiave)}>{t("Completa i dati")}</Button>
                : <p className="text-amber-800">{t("Verifica disponibilità e unità prima di ordinare.")}</p>}</>
                : r.nuovoOrdine! <= 0 ? <p className="text-emerald-700">{r.giacenze.length ? t("Riserva la merce proposta prima di procedere.") : t("Nessun nuovo ordine")}</p> : <>
                  {r.ordinaEntro ? <p className={cn("font-medium", r.ordinaEntro < oggi && "text-red-700")}>{r.ordinaEntro < oggi ? t("Ordina entro {data} · In ritardo", { data: data(r.ordinaEntro) }) : t("Ordina entro {data}", { data: data(r.ordinaEntro) })}</p> : <p className="text-amber-800">{t("Manca la data della fase")}</p>}
                  <p className="text-muted-foreground">{r.fonteAnticipo === "fornitore" ? t("{n} giorni · dal fornitore", { n: r.anticipo }) : t("{n} giorni · stima da confermare", { n: r.anticipo })}</p>
                </>}
              {r.dataServe && <p className="text-muted-foreground">{t("Serve il {data}", { data: data(r.dataServe) })}</p>}
              {onData && <Button type="button" variant="ghost" size="sm" className="h-7 px-0 text-xs" onClick={() => onData(r.chiave)}>{r.dataServe ? t("Modifica data") : t("Imposta data")}</Button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{t("{visibili} di {totale} materiali", { visibili: visibili.length, totale: righe.length })}</span>
      {onGestisci && selezionati.length > 0 && <div className="flex flex-wrap items-center gap-2"><span>{t("{n} selezionati", { n: selezionati.length })}</span><Button type="button" size="sm" onClick={() => onGestisci(selezionati.map(r => r.chiave))}>{t("Gestisci gli articoli selezionati")}</Button></div>}
    </div>
  </section>;
}
