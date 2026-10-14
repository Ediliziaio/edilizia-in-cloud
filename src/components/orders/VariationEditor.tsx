import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/formatters";
import { prepareVariation, variationImpact, variationDecimal, variationDatePreview, VARIATION_KINDS, type VariationDraft, type VariationKind } from "@/lib/orders/variationDraft";

import type {VariationContext} from "@/lib/orders/variationDocumentContext";
export type {VariationContext} from "@/lib/orders/variationDocumentContext";
export function VariationEditor({ draft, setDraft, phases, context, busy, review, onBack, error,showPdfPreview=true,persistentDraft=false }: {
  draft: VariationDraft; setDraft: (draft: VariationDraft) => void; phases: {id: string; name: string; end_date?: string | null}[];
  context: VariationContext; busy: boolean; review: boolean; onBack: () => void; error?: string;showPdfPreview?:boolean;persistentDraft?:boolean;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfReady, setPdfReady] = useState<{url:string;snapshot:string} | null>(null);
  let prepared: ReturnType<typeof prepareVariation> | null = null;
  try { prepared = prepareVariation(draft); } catch { /* Validation appears on review, not on each keystroke. */ }
  const impact = prepared ? variationImpact(context.currentNet, prepared.impatto_economico, context.vatRate) : null;
  const cost = draft.estimatedCost?.trim() ? variationDecimal(draft.estimatedCost) : null;
  const phaseEnd = (draft.phaseId ? phases.find(p => p.id === draft.phaseId) : phases.filter(p => p.name === draft.phase).length === 1 ? phases.find(p => p.name === draft.phase) : undefined)?.end_date;
  const projectedEnd = variationDatePreview(phaseEnd,draft.days,draft.dayUnit);
  const pdfSnapshot = prepared ? JSON.stringify([prepared.titolo,prepared.descrizione,prepared.motivazione,prepared.richiesto_da,prepared.impatto_economico,context]) : "";
  const set = <K extends keyof VariationDraft>(key: K, value: VariationDraft[K]) => setDraft({...draft, [key]: value});
  const input = (key: "title" | "description" | "amount" | "days" | "reason" | "requester" | "internalNotes") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value);
  return <div className="space-y-4">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {review && prepared ? <>
      <div className="rounded-lg border bg-slate-50 p-4 space-y-3" aria-label="Anteprima per il cliente">
        <p className="text-xs text-muted-foreground">Riepilogo per il cliente · non ancora salvato o inviato</p>
        <h3 className="font-semibold break-words">{prepared.titolo}</h3>
        <p className="whitespace-pre-wrap break-words text-sm">{prepared.descrizione}</p>
        {prepared.motivazione && <p className="text-sm whitespace-pre-wrap">Motivazione: {prepared.motivazione}</p>}
        {prepared.richiesto_da && <p className="text-sm">Richiesto da: {prepared.richiesto_da}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={onBack}>Modifica bozza</Button>
        {showPdfPreview && <Button variant="outline" disabled={busy || pdfBusy} onClick={async () => {
          setPdfBusy(true); setPdfError("");
          try { const { variationPreviewPdf } = await import("@/lib/orders/variationPreviewPdf");
            const doc = await variationPreviewPdf(prepared!, context);
            setPdfReady({url:doc.output("datauristring"),snapshot:pdfSnapshot});
          } catch { setPdfError("PDF non disponibile. Riprova: la bozza è conservata."); }
          finally { setPdfBusy(false); }
        }}>{pdfBusy ? "Preparo PDF…" : "Prepara anteprima PDF"}</Button>}
        {showPdfPreview && pdfReady?.snapshot === pdfSnapshot && <a href={pdfReady.url} download="anteprima-variante.pdf" className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium">Scarica PDF pronto</a>}
      </div>
      {pdfError && <p role="alert" className="text-sm text-destructive">{pdfError}</p>}
    </> : <fieldset disabled={busy} className="space-y-4 min-w-0">
      <div className="space-y-1.5"><Label htmlFor="variation-kind">Cosa cambia</Label>
        <select id="variation-kind" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.kind} onChange={e => set("kind", e.target.value as VariationKind)}>
          {Object.entries(VARIATION_KINDS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5"><Label htmlFor="variation-title">Titolo *</Label><Input id="variation-title" value={draft.title} onChange={input("title")} placeholder="Es. Sostituzione pavimento cucina" /></div>
      <div className="space-y-1.5"><Label htmlFor="variation-phase">Lavorazione di riferimento</Label>
        <select id="variation-phase" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.phaseId ?? ""} onChange={e => { const phase = phases.find(p => p.id === e.target.value); setDraft({ ...draft, phaseId: phase?.id, phase: phase?.name ?? "" }); }}>
          <option value="">Tutta la commessa</option>{phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select><p className="text-xs text-muted-foreground">Il riferimento compare nel documento; non cambia assegnazioni o costi della fase.</p>
      </div>
      <div className="space-y-1.5"><Label htmlFor="variation-description">Lavori e condizioni *</Label><Textarea id="variation-description" rows={3} value={draft.description} onChange={input("description")} placeholder="Cosa viene aggiunto, sostituito o eliminato?" /></div>
      <div className="space-y-1.5"><Label htmlFor="variation-pricing">Come definisci il prezzo</Label>
        <select id="variation-pricing" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.pricing} onChange={e => set("pricing", e.target.value as "corpo" | "voci")}><option value="corpo">Prezzo a corpo</option><option value="voci">Dettaglio delle voci</option></select>
      </div>
      {draft.pricing === "corpo" ? <div className="space-y-1.5"><Label htmlFor="variation-amount">{draft.kind === "riduzione" ? "Importo da sottrarre" : "Variazione del prezzo"}, IVA esclusa (€) *</Label>
        <Input id="variation-amount" inputMode="decimal" value={draft.amount} onChange={input("amount")} placeholder="Es. 1250,00" />
        <p className="text-xs text-muted-foreground">{draft.kind === "riduzione" ? "Scrivi un valore positivo: sarà sottratto dal contratto." : draft.kind === "modifica" ? "Indica solo la differenza rispetto al contratto. Il segno meno riduce il prezzo." : "Si aggiunge al contratto solo dopo l'approvazione."}</p>
      </div> : <div className="space-y-2">
        {draft.lines.map((line,i) => <div key={line.id} className="rounded-lg border p-3 space-y-2">
          <Label htmlFor={`variation-line-${i}`}>Voce {i+1}</Label><Input id={`variation-line-${i}`} value={line.description} placeholder="Materiale, manodopera o lavorazione" onChange={e => set("lines", draft.lines.map(l => l.id === line.id ? {...l,description:e.target.value} : l))} />
          <div className="grid grid-cols-2 gap-2">{(["quantity","price"] as const).map(key => <div key={key}><Label htmlFor={`variation-${key}-${i}`}>{key === "quantity" ? "Quantità" : "Prezzo unitario netto (€)"}</Label><Input id={`variation-${key}-${i}`} inputMode="decimal" value={line[key]} onChange={e => set("lines",draft.lines.map(l => l.id === line.id ? {...l,[key]:e.target.value} : l))} /></div>)}</div>
          <Button size="sm" variant="ghost" onClick={() => set("lines",draft.lines.filter(l => l.id !== line.id))}>Rimuovi voce {i+1}</Button>
        </div>)}
        <Button size="sm" variant="outline" onClick={() => set("lines",[...draft.lines,{id:crypto.randomUUID(),description:"",quantity:"1",price:""}])}>Aggiungi voce</Button>
      </div>}
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Dati del documento e pagamento</summary><div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">Cliente e impresa sono precompilati quando disponibili. Verifica i dati prima di inviare il PDF; non vengono modificate le anagrafiche.</p>
        <Label htmlFor="variation-company">Impresa / ragione sociale</Label><Input id="variation-company" value={draft.documentCompanyName ?? context.companyName ?? ""} onChange={e=>set("documentCompanyName",e.target.value)} />
        <Label htmlFor="variation-company-details">Indirizzo e dati fiscali impresa</Label><Textarea id="variation-company-details" rows={2} value={draft.documentCompanyDetails ?? context.companyDetails ?? ""} onChange={e=>set("documentCompanyDetails",e.target.value)} placeholder="Indirizzo, P.IVA e contatti da riportare sul PDF"/>
        <Label htmlFor="variation-customer">Cliente / committente</Label><Input id="variation-customer" value={draft.documentCustomerName ?? context.customerName ?? ""} onChange={e=>set("documentCustomerName",e.target.value)} />
        <Label htmlFor="variation-customer-details">Indirizzo e dati fiscali cliente</Label><Textarea id="variation-customer-details" rows={2} value={draft.documentCustomerDetails ?? context.customerAddress ?? ""} onChange={e=>set("documentCustomerDetails",e.target.value)} />
        <Label htmlFor="variation-reference">Preventivo / contratto di riferimento</Label><Input id="variation-reference" value={draft.contractReference ?? ""} onChange={e=>set("contractReference",e.target.value)} placeholder="Es. Preventivo PRE-2026-015 del 10/10/2026"/>
        <Label htmlFor="variation-payment">Pagamento dei lavori extra</Label><Textarea id="variation-payment" rows={2} value={draft.paymentTerms ?? ""} onChange={e=>set("paymentTerms",e.target.value)} placeholder="Condizioni concordate con il cliente; non si generano rate o incassi"/>
      </div></details>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Testi e condizioni del modello</summary><div className="mt-3 space-y-3">
        <Label htmlFor="variation-heading">Titolo del documento PDF</Label><Input id="variation-heading" maxLength={120} value={draft.documentHeading ?? ""} onChange={e => set("documentHeading", e.target.value)} placeholder="Proposta di variazione e lavori extra" />
        <Label htmlFor="variation-intro">Introduzione del documento</Label><Textarea id="variation-intro" rows={2} value={draft.documentIntro ?? ""} onChange={e => set("documentIntro", e.target.value)} />
        <Label htmlFor="variation-terms">Condizioni specifiche della variante</Label><Textarea id="variation-terms" rows={3} value={draft.additionalTerms ?? ""} onChange={e => set("additionalTerms", e.target.value)} />
      </div></details>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Tempi e dettagli facoltativi</summary><div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="variation-days">Giorni aggiuntivi</Label><Input id="variation-days" inputMode="numeric" value={draft.days} onChange={input("days")} /></div><div><Label htmlFor="variation-day-unit">Tipo di giorni</Label><select id="variation-day-unit" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.dayUnit} onChange={e => set("dayUnit",e.target.value as "calendario" | "lavorativi")}><option value="calendario">Calendario</option><option value="lavorativi">Lavorativi</option></select></div></div>
        <p className="text-xs text-muted-foreground">Una richiesta di tempo in più non sposta automaticamente le date del cantiere.</p>
        <Label htmlFor="variation-reason">Motivazione</Label><Textarea id="variation-reason" rows={2} value={draft.reason} onChange={input("reason")} />
        <Label htmlFor="variation-requester">Richiesto da</Label><Input id="variation-requester" list="variation-requesters" value={draft.requester} onChange={input("requester")} /><datalist id="variation-requesters">{context.customerName && <option value={context.customerName}/>}<option value="Direzione lavori"/><option value="Impresa"/></datalist>
        <Label htmlFor="variation-notes">{persistentDraft ? "Note interne · non visibili al cliente" : "Appunti privati della bozza · non salvati"}</Label><Textarea id="variation-notes" rows={2} value={draft.internalNotes} onChange={input("internalNotes")} />
        <Label htmlFor="variation-estimated-cost">Variazione costo previsto (€) · solo interna</Label><Input id="variation-estimated-cost" inputMode="decimal" value={draft.estimatedCost} onChange={e=>set("estimatedCost",e.target.value)} placeholder="Facoltativa, es. 350,00"/>
        <p className="text-xs text-muted-foreground">Positivo = costo in più; negativo = risparmio. {persistentDraft ? "Si conserva nella bozza, ma non registra un costo consuntivo." : "Solo per questa anteprima: non si salva e non registra un costo consuntivo."}</p>
      </div></details>
    </fieldset>}
    {impact && <div className="rounded-lg border p-3 text-sm space-y-1" aria-label="Impatto economico">
      <p className="flex justify-between gap-2">Variazione netta <strong>{formatCurrency(impact.delta)}</strong></p>
      {impact.vat !== null && <><p className="flex justify-between gap-2">IVA stimata ({impact.rate}%) <span>{formatCurrency(impact.vat)}</span></p><p className="flex justify-between gap-2">Differenza IVA inclusa <strong>{formatCurrency(impact.grossDelta)}</strong></p></>}
      {impact.revisedNet !== null && <p className="flex justify-between gap-2 border-t pt-2">Nuovo contratto netto, se approvata <strong>{formatCurrency(impact.revisedNet)}</strong></p>}
      <p className="text-xs text-muted-foreground">Stima con l'IVA della commessa. Verifica l'aliquota dei lavori extra prima dell'invio; eventuali aliquote diverse vanno specificate nelle condizioni.</p>
    </div>}
    {impact && cost !== null && <p className="rounded-lg border p-3 text-sm">Solo per l'impresa · variazione margine prevista: <strong>{formatCurrency(impact.delta-cost)}</strong>. {persistentDraft ? "Conservata nella bozza; esclusa dal PDF per il cliente." : "Non salvata e non inclusa nel PDF per il cliente."}</p>}
    {projectedEnd && Number(draft.days)>0 && <p className="rounded-lg border p-3 text-xs text-muted-foreground">Ipotesi fine della fase: {phaseEnd?.split("-").reverse().join("/")} → {projectedEnd.split("-").reverse().join("/")}. {draft.dayUnit === "lavorativi" ? "Esclusi sabato e domenica; festività e chiusure aziendali non considerate. " : ""}Nessuna data viene modificata; dopo l'approvazione aggiorna il cronoprogramma.</p>}
  </div>;
}
