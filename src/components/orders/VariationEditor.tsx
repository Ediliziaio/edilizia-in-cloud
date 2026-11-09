import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/formatters";
import { CONDIZIONI_STANDARD_VARIANTE, prepareVariation, variationDocumentParts, variationImpact, variationDecimal, variationDatePreview, VARIATION_KINDS, type VariationDraft, type VariationKind } from "@/lib/orders/variationDraft";

import type {VariationContext} from "@/lib/orders/variationDocumentContext";
import { OfficeSelect } from "./OfficeSelect";
export type {VariationContext} from "@/lib/orders/variationDocumentContext";
export function VariationEditor({ draft, setDraft, phases, chiPuo, context, busy, review, onBack, error,showPdfPreview=true,persistentDraft=false }: {
  draft: VariationDraft; setDraft: (draft: VariationDraft) => void; phases: {id: string; name: string; end_date?: string | null}[];
  /** Persone e ditte/squadre per «chi lo farà»; senza, il riquadro non chiede chi. */
  chiPuo?: { persone: { id: string; nome: string }[]; ditte: { id: string; nome: string; squadra?: boolean }[] };
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
            const doc = await variationPreviewPdf(prepared!, {...context,parti:variationDocumentParts(draft)});
            setPdfReady({url:doc.output("datauristring"),snapshot:pdfSnapshot});
          } catch { setPdfError("PDF non disponibile. Riprova: la bozza è conservata."); }
          finally { setPdfBusy(false); }
        }}>{pdfBusy ? "Preparo PDF…" : "Prepara anteprima PDF"}</Button>}
        {showPdfPreview && pdfReady?.snapshot === pdfSnapshot && <a href={pdfReady.url} download="anteprima-variante.pdf" className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium">Scarica PDF pronto</a>}
      </div>
      {pdfError && <p role="alert" className="text-sm text-destructive">{pdfError}</p>}
    </> : <fieldset disabled={busy} className="space-y-4 min-w-0">
      <div className="grid gap-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="space-y-1.5"><Label htmlFor="variation-kind">Cosa cambia</Label>
        <OfficeSelect id="variation-kind" label="Cosa cambia" value={draft.kind} onValueChange={v => set("kind", v as VariationKind)}
          options={Object.entries(VARIATION_KINDS).map(([key,label]) => ({ value: key, label }))} />
      </div>
      <div className="space-y-1.5"><Label htmlFor="variation-title">Titolo *</Label><Input id="variation-title" value={draft.title} onChange={input("title")} placeholder="Es. Sostituzione pavimento cucina" /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="variation-description">Descrizione dei lavori *</Label><Textarea id="variation-description" rows={3} value={draft.description} onChange={input("description")} placeholder="Cosa viene aggiunto, sostituito o eliminato?" /></div>
      <div className="space-y-1.5"><Label htmlFor="variation-pricing">Come definisci il prezzo</Label>
        <OfficeSelect id="variation-pricing" label="Come definisci il prezzo" value={draft.pricing} onValueChange={v => set("pricing", v as "corpo" | "voci")}
          options={[{ value: "corpo", label: "Prezzo a corpo" }, { value: "voci", label: "Dettaglio delle voci" }]} />
      </div>
      {draft.pricing === "corpo" ? <div className="space-y-1.5"><Label htmlFor="variation-amount">{draft.kind === "riduzione" ? "Importo da sottrarre" : "Variazione del prezzo"}, IVA esclusa (€) *</Label>
        <Input id="variation-amount" inputMode="decimal" value={draft.amount} onChange={input("amount")} placeholder="Es. 1250,00" />
        <p className="text-xs text-muted-foreground">{draft.kind === "riduzione" ? "Scrivi un valore positivo: sarà sottratto dal contratto." : draft.kind === "modifica" ? "Indica solo la differenza rispetto al contratto. Il segno meno riduce il prezzo." : "Si aggiunge al contratto solo dopo l'approvazione."}</p>
      </div> : <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Le voci diventano la tabella del PDF. Prezzi IVA esclusa.</p>
        {draft.lines.map((line,i) => {
          const quantita = variationDecimal(line.quantity), prezzo = variationDecimal(line.price);
          const setLine = (patch: Partial<typeof line>) => set("lines",draft.lines.map(l => l.id === line.id ? {...l,...patch} : l));
          return <div key={line.id} className="grid grid-cols-2 items-end gap-2 rounded-lg border p-2.5 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_7rem_6.5rem_auto]">
            <div className="col-span-2 sm:col-span-1"><Label htmlFor={`variation-line-${i}`} className="text-xs">Voce {i+1}</Label><Input id={`variation-line-${i}`} value={line.description} placeholder="Materiale, manodopera o lavorazione" onChange={e => setLine({description:e.target.value})} /></div>
            <div><Label htmlFor={`variation-quantity-${i}`} className="text-xs">Quantità</Label><Input id={`variation-quantity-${i}`} inputMode="decimal" value={line.quantity} onChange={e => setLine({quantity:e.target.value})} /></div>
            <div><Label htmlFor={`variation-unit-${i}`} className="text-xs">U.M.</Label><Input id={`variation-unit-${i}`} maxLength={20} value={line.unit ?? ""} placeholder="mq" onChange={e => setLine({unit:e.target.value})} /></div>
            <div><Label htmlFor={`variation-price-${i}`} className="text-xs">Prezzo unitario netto (€)</Label><Input id={`variation-price-${i}`} inputMode="decimal" value={line.price} onChange={e => setLine({price:e.target.value})} /></div>
            <p className="pb-2 text-right text-sm font-medium tabular-nums" aria-label={`Importo voce ${i+1}`}>{quantita !== null && prezzo !== null ? formatCurrency(Math.round(quantita*prezzo*100)/100) : "—"}</p>
            <Button size="sm" variant="ghost" className="col-span-2 sm:col-span-1" onClick={() => set("lines",draft.lines.filter(l => l.id !== line.id))}>Rimuovi voce {i+1}</Button>
          </div>;
        })}
        <Button size="sm" variant="outline" onClick={() => set("lines",[...draft.lines,{id:crypto.randomUUID(),description:"",quantity:"1",price:""}])}>Aggiungi voce</Button>
      </div>}
      {draft.kind !== "riduzione" && <fieldset className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/40 p-3" aria-label="Nelle Lavorazioni">
        <legend className="px-1 text-sm font-medium">Nelle Lavorazioni, quando il cliente accetta</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Dove va il lavoro extra">
          <Button type="button" size="sm" variant={(draft.destinazione ?? "nuova") === "nuova" ? "default" : "outline"} aria-pressed={(draft.destinazione ?? "nuova") === "nuova"} onClick={() => setDraft({ ...draft, destinazione: "nuova" })}>
            In una fase nuova
          </Button>
          <Button type="button" size="sm" variant={draft.destinazione === "fase" ? "default" : "outline"} aria-pressed={draft.destinazione === "fase"} onClick={() => setDraft({ ...draft, destinazione: "fase", phaseId: draft.phaseId ?? phases[0]?.id, phase: draft.phase || phases[0]?.name || "" })}>
            Dentro una fase che c'è già
          </Button>
        </div>
        {draft.destinazione === "fase" ? <div className="space-y-1">
          <Label htmlFor="variation-phase">In quale fase</Label>
          <OfficeSelect id="variation-phase" label="Fase" className="h-9" value={draft.phaseId ?? ""}
            onValueChange={v => { const phase = phases.find(p => p.id === v); setDraft({ ...draft, phaseId: phase?.id, phase: phase?.name ?? "" }); }}
            options={[{ value: "", label: "Scegli la fase" }, ...phases.map(p => ({ value: p.id, label: p.name }))]} />
        </div> : <p className="text-xs text-muted-foreground">Si chiamerà «Lavoro extra · {draft.title.trim() || "titolo"}», in fondo alle Lavorazioni.</p>}
        <p className="text-xs text-muted-foreground">{draft.pricing === "voci" ? "Ogni voce diventa una sottofase, con quantità e prezzo." : "Diventa una sottofase col titolo, a corpo."} Il contratto della commessa sale dell'importo; nessuna data viene spostata.</p>
        {chiPuo && <div className="space-y-1.5">
          <Label htmlFor="variation-chi">Chi lo farà</Label>
          <div className="flex flex-wrap gap-1">
            {(draft.chi ?? []).map((c) => <span key={c.id} className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-900">{c.nome}
              <button type="button" aria-label={`Togli ${c.nome}`} className="hover:text-rose-700" onClick={() => set("chi", (draft.chi ?? []).filter((x) => x.id !== c.id))}>×</button></span>)}
          </div>
          <OfficeSelect id="variation-chi" label="Chi lo farà" className="h-9" value=""
            placeholder="+ Persona, squadra o ditta…"
            onValueChange={(v) => { const [tipo, id] = v.split(":"); const nome = tipo === "p" ? chiPuo.persone.find((x) => x.id === id)?.nome : chiPuo.ditte.find((x) => x.id === id)?.nome;
              if (id && nome && !(draft.chi ?? []).some((x) => x.id === id)) set("chi", [...(draft.chi ?? []), { tipo: tipo === "p" ? "persona" : "ditta", id, nome }]); }}
            options={[
              ...chiPuo.ditte.filter((d) => d.squadra).map((d) => ({ value: `d:${d.id}`, label: d.nome, group: "Squadre" })),
              ...chiPuo.persone.map((d) => ({ value: `p:${d.id}`, label: d.nome, group: "Persone" })),
              ...chiPuo.ditte.filter((d) => !d.squadra).map((d) => ({ value: `d:${d.id}`, label: d.nome, group: "Ditte" })),
            ]} />
          <p className="text-xs text-muted-foreground">Non compare nel documento del cliente. Costi e accessi si danno poi dalla fase, come per le altre.</p>
        </div>}
      </fieldset>}
      {draft.kind === "riduzione" && <div className="space-y-1.5"><Label htmlFor="variation-phase-rid">Lavorazione di riferimento</Label>
        <OfficeSelect id="variation-phase-rid" label="Lavorazione di riferimento" value={draft.phaseId ?? ""}
          onValueChange={v => { const phase = phases.find(p => p.id === v); setDraft({ ...draft, phaseId: phase?.id, phase: phase?.name ?? "" }); }}
          options={[{ value: "", label: "Tutta la commessa" }, ...phases.map(p => ({ value: p.id, label: p.name }))]} /><p className="text-xs text-muted-foreground">Compare nel documento. Una riduzione non crea lavorazioni.</p>
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
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Condizioni contrattuali</summary><div className="mt-3 space-y-3">
        <div className="rounded-md bg-muted/30 p-3"><p className="text-xs font-medium">Valgono per ogni variante e stanno già nel PDF</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">{CONDIZIONI_STANDARD_VARIANTE.map(c => <li key={c}>{c}</li>)}</ol></div>
        <Label htmlFor="variation-terms">Condizioni specifiche di questa variante</Label><Textarea id="variation-terms" rows={3} value={draft.additionalTerms ?? ""} onChange={e => set("additionalTerms", e.target.value)} placeholder="Si aggiungono a quelle sopra" />
        <Label htmlFor="variation-heading">Titolo del documento PDF</Label><Input id="variation-heading" maxLength={120} value={draft.documentHeading ?? ""} onChange={e => set("documentHeading", e.target.value)} placeholder="Variante al contratto" />
        <Label htmlFor="variation-intro">Introduzione del documento</Label><Textarea id="variation-intro" rows={2} value={draft.documentIntro ?? ""} onChange={e => set("documentIntro", e.target.value)} />
      </div></details>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Tempi e dettagli facoltativi</summary><div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="variation-days">Giorni aggiuntivi</Label><Input id="variation-days" inputMode="numeric" value={draft.days} onChange={input("days")} /></div><div><Label htmlFor="variation-day-unit">Tipo di giorni</Label><OfficeSelect id="variation-day-unit" label="Tipo di giorni" value={draft.dayUnit} onValueChange={v => set("dayUnit", v as "calendario" | "lavorativi")}
          options={[{ value: "calendario", label: "Calendario" }, { value: "lavorativi", label: "Lavorativi" }]} /></div></div>
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
