import { ArrowRight, FileCheck2, FileText, Layers3, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComputoOpzione } from "./ComputoPdfControls";
import type { ModelloComputo } from "@/lib/computo/modelloComputo";

const GRUPPI = [
  { titolo: "L'apertura", descrizione: "Presenta l'offerta e il progetto.", icona: FileText, sezioni: [
    ["copertina", "Copertina", "Logo, immagine e titolo del progetto."],
    ["premessa", "Presentazione", "Il messaggio iniziale della tua azienda."],
    ["indice", "Piano dei lavori", "Capitoli con rimando alle relative pagine."],
  ] },
  { titolo: "Il lavoro e gli importi", descrizione: "Scegli il livello di dettaglio per il cliente.", icona: Layers3, sezioni: [
    ["lavorazioni", "Articoli e lavorazioni", "Quantità, prezzi e misure delle singole voci."],
    ["riepilogo", "Riepilogo economico", "Totali dei capitoli, sconti e IVA."],
    ["cronoprogramma", "Programma dei lavori", "Le fasi e le durate, se compilate."],
    ["pagamenti", "Piano dei pagamenti", "Le rate e le scadenze, se presenti."],
    ["detrazione", "Detrazione fiscale", "Il riepilogo, se previsto nel preventivo."],
  ] },
  { titolo: "Contratto e conferma", descrizione: "Il testo contrattuale e la firma si gestiscono separatamente.", icona: Scale, sezioni: [
    ["contrattuali", "Condizioni contrattuali", "Il contratto scelto dall'archivio, nello stesso PDF."],
    ["firme", "Pagina «Per accettazione»", "Riepilogo della proposta e spazi per le firme."],
  ] },
] as const;

export function ComputoPagineModello({ modello: m, onChange, contratto, onGestisciContratto, caricamento }: {
  modello: ModelloComputo; onChange: (patch: Partial<ModelloComputo>) => void;
  contratto?: { nome: string; versione: number } | null; onGestisciContratto: () => void; caricamento?: boolean;
}) {
  const tecnico = m.formatoPredefinito === "tecnico" || m.formatoPredefinito === "senza-prezzi";
  return <div className="space-y-5">
    <div className="rounded-xl bg-slate-50 p-4"><h3 className="text-base font-semibold">Componi il tuo documento</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Attiva le parti utili alla tua offerta. Il PDF le ordina automaticamente; programma, rate e detrazioni compaiono quando hanno dati.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-medium text-slate-600"><span>Apertura</span><ArrowRight className="h-3 w-3" /><span>Lavorazioni e importi</span><ArrowRight className="h-3 w-3" /><span>Contratto e firma</span></div>
    </div>
    {GRUPPI.map(({ titolo, descrizione, icona: Icona, sezioni }) => <section key={titolo} aria-label={titolo} className="space-y-3">
      <div className="flex items-start gap-2"><Icona className="mt-0.5 h-4 w-4 text-muted-foreground" /><div><h4 className="text-sm font-semibold">{titolo}</h4><p className="mt-0.5 text-xs text-muted-foreground">{descrizione}</p></div></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">{sezioni.map(([key, titolo, descrizione]) => {
        const checked = key === "firme" ? m.sezioni.firme && m.mostraFirma : m.sezioni[key];
        const disabled = m.formatoPredefinito === "elenco-prezzi" || tecnico && !["lavorazioni", "riepilogo", "cronoprogramma", "pagamenti", "contrattuali", "firme"].includes(key);
        return <div key={key} className={`rounded-xl border px-3 pb-3 ${checked && !disabled ? "border-slate-200 bg-white" : "border-slate-200/70 bg-slate-50/70"}`}>
          <ComputoOpzione label={tecnico && key === "firme" ? "Firma del tecnico / referente" : titolo} checked={checked} disabled={disabled}
            onChange={v => onChange({ sezioni: { ...m.sezioni, [key]: v }, ...(key === "firme" ? { mostraFirma: v } : {}) })} />
          <p className="text-[11px] leading-relaxed text-muted-foreground">{disabled ? "Non prevista nel formato selezionato." : tecnico && key === "firme" ? "Firma del tecnico in fondo al computo." : descrizione}</p>
        </div>;
      })}</div>
    </section>)}
    <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-4"><p className="flex items-center gap-2 text-xs font-semibold"><Scale className="h-4 w-4" />Il contratto collegato</p>
      <p className="text-xs">{caricamento ? "Verifico l'archivio…" : contratto ? `${contratto.nome} · versione ${contratto.versione}` : m.condizioniContrattuali.trim() ? "Testo conservato dal modello precedente" : "Condizioni di base · nessun modello aziendale associato"}</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{m.formatoPredefinito === "elenco-prezzi" ? "L'elenco prezzi stampa solo le voci unitarie. Per includere il contratto scegli il formato Preventivo cliente." : m.sezioni.contrattuali ? "Le condizioni complete vengono incluse dopo il riepilogo, prima dell'accettazione se attiva." : "Le condizioni contrattuali sono escluse dal PDF. Il collegamento resta disponibile."}</p>
      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onGestisciContratto}>Scegli o verifica il contratto<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
    </div>
    {!m.sezioni.firme || !m.mostraFirma ? <p role="status" className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" />La pagina «Per accettazione» è esclusa. Il PDF termina dopo l'ultima sezione attiva.</p> : <p className="text-[11px] text-muted-foreground">L'accettazione comprende l'approvazione separata delle clausole richieste dal contratto incluso.</p>}
  </div>;
}
