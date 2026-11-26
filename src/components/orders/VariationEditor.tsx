import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/formatters";
import { CONDIZIONI_STANDARD_VARIANTE, prepareVariation, variationDocumentParts, variationImpact, variationDecimal, variationDatePreview, VARIATION_KINDS, type VariationDraft, type VariationKind } from "@/lib/orders/variationDraft";

import type {VariationContext} from "@/lib/orders/variationDocumentContext";
import { OfficeSelect } from "./OfficeSelect";
import { opzioniUnita, unitaNormalizzata } from "@/lib/orders/rigaAcquisto";
import { CercaNelListino } from "./CercaNelListino";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export type {VariationContext} from "@/lib/orders/variationDocumentContext";
export function VariationEditor({ draft, setDraft, phases, chiPuo, context, busy, review, onBack, error,showPdfPreview=true,persistentDraft=false,orderId }: {
  draft: VariationDraft; setDraft: (draft: VariationDraft) => void; phases: {id: string; name: string; end_date?: string | null}[];
  /** Persone e ditte/squadre per «chi lo farà»; senza, il riquadro non chiede chi. */
  chiPuo?: { persone: { id: string; nome: string }[]; ditte: { id: string; nome: string; squadra?: boolean }[] };
  context: VariationContext; busy: boolean; review: boolean; onBack: () => void; error?: string;showPdfPreview?:boolean;persistentDraft?:boolean;
  /** La commessa, per cercare nel listino col prezzo giusto (cantiere → committente → generale). */
  orderId?: string;
}) {
  const t = useT();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfReady, setPdfReady] = useState<{url:string;snapshot:string} | null>(null);
  let prepared: ReturnType<typeof prepareVariation> | null = null;
  try { prepared = prepareVariation(draft); } catch { /* Validation appears on review, not on each keystroke. */ }
  const impact = prepared ? variationImpact(context.currentNet, prepared.impatto_economico, context.vatRate) : null;
  // Quanto fa la tabella mentre la si scrive: l'impatto economico sotto appare
  // solo quando la bozza è completa, e intanto non si sa a che punto si è.
  const totaleVoci = draft.lines.reduce((s, l) => {
    const q = variationDecimal(l.quantity), p = variationDecimal(l.price);
    return q !== null && p !== null ? s + Math.round(q * p * 100) / 100 : s;
  }, 0);
  // Costo delle voci che vengono dal listino (26/11/2026): il listino sa quanto costa una
  // lavorazione, non solo quanto si vende. Le voci scritte a mano non hanno costo e restano
  // fuori dal conto; se nessuna ce l'ha, la riga del margine non compare.
  const costoVoci = costoDelleVoci(draft.lines);
  // 26/11/2026: il contratto che cambia si vede mentre si scrive, non solo al passo «Rivedi».
  // `prepared` è nullo finché titolo e descrizione non ci sono: qui basta il numero.
  const segnoVariazione = draft.kind === "riduzione" ? -1 : 1;
  const deltaScritto = draft.pricing === "voci"
    ? (draft.lines.length ? segnoVariazione * totaleVoci : null)
    : (variationDecimal(draft.amount) === null ? null : segnoVariazione * (variationDecimal(draft.amount) as number));
  const contrattoDopo = deltaScritto !== null && deltaScritto !== 0
    && context.currentNet !== undefined && Number.isFinite(context.currentNet)
    ? (context.currentNet as number) + deltaScritto : null;
  const rigaContratto = contrattoDopo === null ? null : (
    <p className="text-xs text-muted-foreground" aria-label={t("Il contratto se il cliente accetta")}>
      {t("Contratto: {prima} → {dopo}", { prima: formatCurrency(context.currentNet as number), dopo: formatCurrency(contrattoDopo) })}
      <span className="ml-1">{t("IVA esclusa, se il cliente accetta")}</span>
    </p>
  );
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
      <div className="rounded-lg border bg-slate-50 p-4 space-y-3" aria-label={t("Anteprima per il cliente")}>
        <p className="text-xs text-muted-foreground">{t("Riepilogo per il cliente · non ancora salvato o inviato")}</p>
        <h3 className="font-semibold break-words">{prepared.titolo}</h3>
        <p className="whitespace-pre-wrap break-words text-sm">{prepared.descrizione}</p>
        {prepared.motivazione && <p className="text-sm whitespace-pre-wrap">{t("Motivazione: {testo}", { testo: prepared.motivazione })}</p>}
        {prepared.richiesto_da && <p className="text-sm">{t("Richiesto da: {nome}", { nome: prepared.richiesto_da })}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={onBack}>{t("Modifica bozza")}</Button>
        {showPdfPreview && <Button variant="outline" disabled={busy || pdfBusy} onClick={async () => {
          setPdfBusy(true); setPdfError("");
          try { const { variationPreviewPdf } = await import("@/lib/orders/variationPreviewPdf");
            const doc = await variationPreviewPdf(prepared!, {...context,parti:variationDocumentParts(draft)});
            setPdfReady({url:doc.output("datauristring"),snapshot:pdfSnapshot});
          } catch { setPdfError(t("PDF non disponibile. Riprova: la bozza è conservata.")); }
          finally { setPdfBusy(false); }
        }}>{pdfBusy ? t("Preparo PDF…") : t("Prepara anteprima PDF")}</Button>}
        {showPdfPreview && pdfReady?.snapshot === pdfSnapshot && <a href={pdfReady.url} download="anteprima-variante.pdf" className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium">{t("Scarica PDF pronto")}</a>}
      </div>
      {pdfError && <p role="alert" className="text-sm text-destructive">{pdfError}</p>}
    </> : <fieldset disabled={busy} className="space-y-4 min-w-0">
      <div className="grid gap-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="space-y-1.5"><Label htmlFor="variation-kind">{t("Cosa cambia")}</Label>
        <OfficeSelect id="variation-kind" label={t("Cosa cambia")} value={draft.kind} onValueChange={v => set("kind", v as VariationKind)}
          options={Object.entries(VARIATION_KINDS).map(([key,label]) => ({ value: key, label: t(label) }))} />
      </div>
      <div className="space-y-1.5"><Label htmlFor="variation-title">{t("Titolo *")}</Label><Input id="variation-title" value={draft.title} onChange={input("title")} placeholder={t("Es. Sostituzione pavimento cucina")} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="variation-description">{t("Descrizione dei lavori *")}</Label><Textarea id="variation-description" rows={3} value={draft.description} onChange={input("description")} placeholder={t("Cosa viene aggiunto, sostituito o eliminato?")} /></div>
      {/* 26/11/2026: due scelte in vista, non una tendina. Il modo «a voci» — quello che fa
          la variante come un piccolo computo, con quantità e prezzi — restava nascosto dentro
          il menu e quasi nessuno lo apriva. Scegliendolo nasce già la prima riga. */}
      <div className="space-y-1.5">
        <span className="block text-sm font-medium">{t("Come definisci il prezzo")}</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Come definisci il prezzo")}>
          <Button type="button" size="sm" variant={draft.pricing === "corpo" ? "default" : "outline"} role="radio" aria-checked={draft.pricing === "corpo"}
            onClick={() => set("pricing", "corpo")}>{t("Un prezzo a corpo")}</Button>
          <Button type="button" size="sm" variant={draft.pricing === "voci" ? "default" : "outline"} role="radio" aria-checked={draft.pricing === "voci"}
            onClick={() => setDraft({ ...draft, pricing: "voci", lines: draft.lines.length ? draft.lines : [{ id: crypto.randomUUID(), description: "", quantity: "1", price: "" }] })}>{t("Voce per voce, come un computo")}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{draft.pricing === "voci"
          ? t("Quantità, unità e prezzo riga per riga, IVA esclusa: la tabella finisce nel PDF e ogni voce diventa una sottofase.")
          : t("Un importo unico per tutto il lavoro extra.")}</p>
      </div>
      {draft.pricing === "corpo" ? <div className="space-y-1.5"><Label htmlFor="variation-amount">{draft.kind === "riduzione" ? t("Importo da sottrarre, IVA esclusa (€) *") : t("Variazione del prezzo, IVA esclusa (€) *")}</Label>
        <Input id="variation-amount" inputMode="decimal" value={draft.amount} onChange={input("amount")} placeholder={t("Es. 1250,00")} />
        <p className="text-xs text-muted-foreground">{draft.kind === "riduzione" ? t("Scrivi un valore positivo: sarà sottratto dal contratto.") : draft.kind === "modifica" ? t("Indica solo la differenza rispetto al contratto. Il segno meno riduce il prezzo.") : t("Si aggiunge al contratto solo dopo l'approvazione.")}</p>
        {rigaContratto}
      </div> : <div className="space-y-2">
        {/* 26/11/2026: le voci si possono prendere dal listino invece di scriverle, come nei
            rapportini. Il prezzo è quello che vale per questa commessa (eccezione di cantiere →
            listino del committente → listino generale); quantità e unità restano modificabili. */}
        {orderId && <CercaNelListino dove={{ orderId, data: null }}
          segnaposto={t("Prendi dal listino: lavorazione, materiale, manodopera…")}
          onScegli={(m) => {
            const voce = { id: crypto.randomUUID(), description: m.descrizione, quantity: "1",
              unit: unitaNormalizzata(m.unita) || m.unita || "cad",
              price: m.prezzo == null ? "" : String(m.prezzo).replace(".", ","),
              // Il costo arriva solo a chi ha il permesso di vedere i costi: lo decide la funzione
              // del listino, non il browser. Senza, la voce resta senza costo e il margine non si dà.
              ...(m.costo_unitario == null ? {} : { cost: String(m.costo_unitario).replace(".", ",") }) };
            // La riga vuota appena nata viene riempita, non lasciata lì sopra.
            const vuota = (l: { description: string; price: string }) => !l.description.trim() && !l.price.trim();
            const righe = draft.lines.length === 1 && vuota(draft.lines[0]) ? [voce] : [...draft.lines, voce];
            // Il costo previsto della variante si compila da sé finché nessuno l'ha scritto a mano:
            // se il campo è vuoto o è ancora il totale calcolato prima, lo aggiorniamo.
            const primaCosto = costoDelleVoci(draft.lines), dopoCosto = costoDelleVoci(righe);
            const scrittoAMano = !!draft.estimatedCost?.trim()
              && (primaCosto === null || draft.estimatedCost.trim() !== numeroItaliano(primaCosto));
            setDraft({ ...draft, lines: righe,
              ...(scrittoAMano || dopoCosto === null ? {} : { estimatedCost: numeroItaliano(dopoCosto) }) });
            // La quantità è la prima cosa da cambiare su una voce a mq o a ml: il cursore va lì.
            const posizione = righe.length - 1;
            requestAnimationFrame(() => {
              const campo = document.getElementById(`variation-quantity-${posizione}`);
              if (campo instanceof HTMLInputElement) { campo.focus(); campo.select(); }
            });
          }} />}
        {/* Le intestazioni stanno in cima una volta sola: ripetute su ogni riga
            mandavano «Prezzo unitario €» a capo e allungavano il popup. */}
        {draft.lines.length > 0 && <div className="hidden gap-2 px-2.5 text-xs text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_7.5rem_6.5rem_2.25rem]" aria-hidden="true">
          <span>{t("Voce")}</span><span>{t("Quantità")}</span><span>{t("U.M.")}</span><span>{t("Prezzo unitario €")}</span><span className="text-right">{t("Importo")}</span><span />
        </div>}
        {draft.lines.map((line,i) => {
          const quantita = variationDecimal(line.quantity), prezzo = variationDecimal(line.price);
          const setLine = (patch: Partial<typeof line>) => set("lines",draft.lines.map(l => l.id === line.id ? {...l,...patch} : l));
          // Sul telefono ogni campo tiene la sua etichetta; sullo schermo grande
          // la dice la colonna, e l'etichetta resta per chi usa il lettore.
          const etichetta = "text-xs sm:sr-only";
          return <div key={line.id} className="grid grid-cols-2 items-center gap-2 rounded-lg border p-2.5 sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_7.5rem_6.5rem_2.25rem]">
            <div className="col-span-2 space-y-1 sm:col-span-1 sm:space-y-0"><Label htmlFor={`variation-line-${i}`} className={etichetta}>{t("Voce {n}", { n: i+1 })}</Label><Input id={`variation-line-${i}`} value={line.description} placeholder={t("Materiale, manodopera o lavorazione")} onChange={e => setLine({description:e.target.value})} /></div>
            <div className="space-y-1 sm:space-y-0"><Label htmlFor={`variation-quantity-${i}`} className={etichetta}>{t("Quantità")}</Label><Input id={`variation-quantity-${i}`} inputMode="decimal" className="text-right tabular-nums" value={line.quantity} onChange={e => setLine({quantity:e.target.value})} /></div>
            <div className="space-y-1 sm:space-y-0"><Label htmlFor={`variation-unit-${i}`} className={etichetta}>{t("U.M.")}</Label>
              <OfficeSelect id={`variation-unit-${i}`} label={t("Unità di misura voce {n}", { n: i+1 })} value={unitaNormalizzata(line.unit) || "mq"}
                className="h-10 px-2 [&_.spiega]:hidden"
                options={opzioniUnita(line.unit || "mq").map(o => ({ value: o.value, label: <>{o.breve}{o.nota && <span className="spiega"> — {o.nota}</span>}</> }))}
                onValueChange={v => setLine({unit:v})} />
            </div>
            <div className="space-y-1 sm:space-y-0"><Label htmlFor={`variation-price-${i}`} className={etichetta}>{t("Prezzo unitario €")}</Label><Input id={`variation-price-${i}`} inputMode="decimal" className="text-right tabular-nums" value={line.price} onChange={e => setLine({price:e.target.value})} /></div>
            <p className="col-span-2 text-right text-sm font-medium tabular-nums sm:col-span-1" aria-label={t("Importo voce {n}", { n: i+1 })}>{quantita !== null && prezzo !== null ? formatCurrency(Math.round(quantita*prezzo*100)/100) : "—"}</p>
            <Button size="icon" variant="ghost" aria-label={t("Rimuovi voce {n}", { n: i+1 })} title={t("Rimuovi voce {n}", { n: i+1 })} className="col-span-2 h-9 w-full text-muted-foreground hover:text-destructive sm:col-span-1 sm:w-9" onClick={() => set("lines",draft.lines.filter(l => l.id !== line.id))}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /><span className="ml-2 sm:hidden">{t("Rimuovi voce {n}", { n: i+1 })}</span>
            </Button>
          </div>;
        })}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="outline" onClick={() => set("lines",[...draft.lines,{id:crypto.randomUUID(),description:"",quantity:"1",price:""}])}>{t("Aggiungi voce")}</Button>
          {draft.lines.length > 0 && <p className="text-sm tabular-nums" aria-label={t("Totale delle voci")}>{t("Totale voci:")} <strong>{formatCurrency(totaleVoci)}</strong></p>}
        </div>
        {rigaContratto}
        {costoVoci !== null && totaleVoci > 0 && <p className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900" aria-label={t("Margine del lavoro extra")}>
          {t("Vendi {vendita} · ti costa {costo} · margine {margine}", { vendita: formatCurrency(totaleVoci), costo: formatCurrency(costoVoci), margine: formatCurrency(totaleVoci - costoVoci) })}
          {totaleVoci > 0 ? ` · ${Math.round((1 - costoVoci / totaleVoci) * 100)}%` : ""}
          {draft.lines.some(l => !l.cost) ? ` · ${t("le voci scritte a mano non hanno un costo")}` : ""}
        </p>}
      </div>}
      {draft.kind !== "riduzione" && <fieldset className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/40 p-3" aria-label={t("Nelle Lavorazioni")}>
        <legend className="px-1 text-sm font-medium">{t("Nelle Lavorazioni, quando il cliente accetta")}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Dove va il lavoro extra")}>
          <Button type="button" size="sm" variant={(draft.destinazione ?? "nuova") === "nuova" ? "default" : "outline"} aria-pressed={(draft.destinazione ?? "nuova") === "nuova"} onClick={() => setDraft({ ...draft, destinazione: "nuova" })}>
            {t("In una fase nuova")}
          </Button>
          <Button type="button" size="sm" variant={draft.destinazione === "fase" ? "default" : "outline"} aria-pressed={draft.destinazione === "fase"} onClick={() => setDraft({ ...draft, destinazione: "fase", phaseId: draft.phaseId ?? phases[0]?.id, phase: draft.phase || phases[0]?.name || "" })}>
            {t("Dentro una fase che c'è già")}
          </Button>
        </div>
        {draft.destinazione === "fase" ? <div className="space-y-1">
          <Label htmlFor="variation-phase">{t("In quale fase")}</Label>
          <OfficeSelect id="variation-phase" label={t("Fase")} className="h-9" value={draft.phaseId ?? ""}
            onValueChange={v => { const phase = phases.find(p => p.id === v); setDraft({ ...draft, phaseId: phase?.id, phase: phase?.name ?? "" }); }}
            options={[{ value: "", label: t("Scegli la fase") }, ...phases.map(p => ({ value: p.id, label: p.name }))]} />
        </div> : <p className="text-xs text-muted-foreground">{t("Si chiamerà «Lavoro extra · {titolo}», in fondo alle Lavorazioni.", { titolo: draft.title.trim() || t("titolo") })}</p>}
        <p className="text-xs text-muted-foreground">{draft.pricing === "voci" ? t("Ogni voce diventa una sottofase, con quantità e prezzo.") : t("Diventa una sottofase col titolo, a corpo.")} {t("Il contratto della commessa sale dell'importo; nessuna data viene spostata.")}</p>
        {chiPuo && <div className="space-y-1.5">
          <Label htmlFor="variation-chi">{t("Chi lo farà")}</Label>
          <div className="flex flex-wrap gap-1">
            {(draft.chi ?? []).map((c) => <span key={c.id} className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-900">{c.nome}
              <button type="button" aria-label={t("Togli {nome}", { nome: c.nome })} className="hover:text-rose-700" onClick={() => set("chi", (draft.chi ?? []).filter((x) => x.id !== c.id))}>×</button></span>)}
          </div>
          <OfficeSelect id="variation-chi" label={t("Chi lo farà")} className="h-9" value=""
            placeholder={t("+ Persona, squadra o ditta…")}
            onValueChange={(v) => { const [tipo, id] = v.split(":"); const nome = tipo === "p" ? chiPuo.persone.find((x) => x.id === id)?.nome : chiPuo.ditte.find((x) => x.id === id)?.nome;
              if (id && nome && !(draft.chi ?? []).some((x) => x.id === id)) set("chi", [...(draft.chi ?? []), { tipo: tipo === "p" ? "persona" : "ditta", id, nome }]); }}
            options={[
              ...chiPuo.ditte.filter((d) => d.squadra).map((d) => ({ value: `d:${d.id}`, label: d.nome, group: t("Squadre") })),
              ...chiPuo.persone.map((d) => ({ value: `p:${d.id}`, label: d.nome, group: t("Persone") })),
              ...chiPuo.ditte.filter((d) => !d.squadra).map((d) => ({ value: `d:${d.id}`, label: d.nome, group: t("Ditte") })),
            ]} />
          <p className="text-xs text-muted-foreground">{t("Non compare nel documento del cliente. Costi e accessi si danno poi dalla fase, come per le altre.")}</p>
        </div>}
      </fieldset>}
      {draft.kind === "riduzione" && <div className="space-y-1.5"><Label htmlFor="variation-phase-rid">{t("Lavorazione di riferimento")}</Label>
        <OfficeSelect id="variation-phase-rid" label={t("Lavorazione di riferimento")} value={draft.phaseId ?? ""}
          onValueChange={v => { const phase = phases.find(p => p.id === v); setDraft({ ...draft, phaseId: phase?.id, phase: phase?.name ?? "" }); }}
          options={[{ value: "", label: t("Tutta la commessa") }, ...phases.map(p => ({ value: p.id, label: p.name }))]} /><p className="text-xs text-muted-foreground">{t("Compare nel documento. Una riduzione non crea lavorazioni.")}</p>
      </div>}
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{t("Dati del documento e pagamento")}</summary><div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">{t("Cliente e impresa sono precompilati quando disponibili. Verifica i dati prima di inviare il PDF; non vengono modificate le anagrafiche.")}</p>
        <Label htmlFor="variation-company">{t("Impresa / ragione sociale")}</Label><Input id="variation-company" value={draft.documentCompanyName ?? context.companyName ?? ""} onChange={e=>set("documentCompanyName",e.target.value)} />
        <Label htmlFor="variation-company-details">{t("Indirizzo e dati fiscali impresa")}</Label><Textarea id="variation-company-details" rows={2} value={draft.documentCompanyDetails ?? context.companyDetails ?? ""} onChange={e=>set("documentCompanyDetails",e.target.value)} placeholder={t("Indirizzo, P.IVA e contatti da riportare sul PDF")}/>
        <Label htmlFor="variation-customer">{t("Cliente / committente")}</Label><Input id="variation-customer" value={draft.documentCustomerName ?? context.customerName ?? ""} onChange={e=>set("documentCustomerName",e.target.value)} />
        <Label htmlFor="variation-customer-details">{t("Indirizzo e dati fiscali cliente")}</Label><Textarea id="variation-customer-details" rows={2} value={draft.documentCustomerDetails ?? context.customerAddress ?? ""} onChange={e=>set("documentCustomerDetails",e.target.value)} />
        <Label htmlFor="variation-reference">{t("Preventivo / contratto di riferimento")}</Label><Input id="variation-reference" value={draft.contractReference ?? ""} onChange={e=>set("contractReference",e.target.value)} placeholder={t("Es. Preventivo PRE-2026-015 del 10/10/2026")}/>
        <Label htmlFor="variation-payment">{t("Pagamento dei lavori extra")}</Label><Textarea id="variation-payment" rows={2} value={draft.paymentTerms ?? ""} onChange={e=>set("paymentTerms",e.target.value)} placeholder={t("Condizioni concordate con il cliente; non si generano rate o incassi")}/>
      </div></details>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{t("Condizioni contrattuali")}</summary><div className="mt-3 space-y-3">
        <div className="rounded-md bg-muted/30 p-3"><p className="text-xs font-medium">{t("Valgono per ogni variante e stanno già nel PDF")}</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">{CONDIZIONI_STANDARD_VARIANTE.map(c => <li key={c}>{c}</li>)}</ol></div>
        <Label htmlFor="variation-terms">{t("Condizioni specifiche di questa variante")}</Label><Textarea id="variation-terms" rows={3} value={draft.additionalTerms ?? ""} onChange={e => set("additionalTerms", e.target.value)} placeholder={t("Si aggiungono a quelle sopra")} />
        <Label htmlFor="variation-heading">{t("Titolo del documento PDF")}</Label><Input id="variation-heading" maxLength={120} value={draft.documentHeading ?? ""} onChange={e => set("documentHeading", e.target.value)} placeholder="Variante al contratto" />
        <Label htmlFor="variation-intro">{t("Introduzione del documento")}</Label><Textarea id="variation-intro" rows={2} value={draft.documentIntro ?? ""} onChange={e => set("documentIntro", e.target.value)} />
      </div></details>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{t("Tempi e dettagli facoltativi")}</summary><div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="variation-days">{t("Giorni aggiuntivi")}</Label><Input id="variation-days" inputMode="numeric" value={draft.days} onChange={input("days")} /></div><div><Label htmlFor="variation-day-unit">{t("Tipo di giorni")}</Label><OfficeSelect id="variation-day-unit" label={t("Tipo di giorni")} value={draft.dayUnit} onValueChange={v => set("dayUnit", v as "calendario" | "lavorativi")}
          options={[{ value: "calendario", label: t("Calendario") }, { value: "lavorativi", label: t("Lavorativi") }]} /></div></div>
        <p className="text-xs text-muted-foreground">{t("Una richiesta di tempo in più non sposta automaticamente le date del cantiere.")}</p>
        <Label htmlFor="variation-reason">{t("Motivazione")}</Label><Textarea id="variation-reason" rows={2} value={draft.reason} onChange={input("reason")} />
        <Label htmlFor="variation-requester">{t("Richiesto da")}</Label><Input id="variation-requester" list="variation-requesters" value={draft.requester} onChange={input("requester")} /><datalist id="variation-requesters">{context.customerName && <option value={context.customerName}/>}<option value="Direzione lavori"/><option value="Impresa"/></datalist>
        <Label htmlFor="variation-notes">{persistentDraft ? t("Note interne · non visibili al cliente") : t("Appunti privati della bozza · non salvati")}</Label><Textarea id="variation-notes" rows={2} value={draft.internalNotes} onChange={input("internalNotes")} />
        <Label htmlFor="variation-estimated-cost">{t("Variazione costo previsto (€) · solo interna")}</Label><Input id="variation-estimated-cost" inputMode="decimal" value={draft.estimatedCost} onChange={e=>set("estimatedCost",e.target.value)} placeholder={t("Facoltativa, es. 350,00")}/>
        <p className="text-xs text-muted-foreground">{t("Positivo = costo in più; negativo = risparmio.")} {persistentDraft ? t("Si conserva nella bozza, ma non registra un costo consuntivo.") : t("Solo per questa anteprima: non si salva e non registra un costo consuntivo.")}</p>
      </div></details>
    </fieldset>}
    {impact && <div className="rounded-lg border p-3 text-sm space-y-1" aria-label={t("Impatto economico")}>
      <p className="flex justify-between gap-2">{t("Variazione netta")} <strong>{formatCurrency(impact.delta)}</strong></p>
      {impact.vat !== null && <><p className="flex justify-between gap-2">{t("IVA stimata ({pct}%)", { pct: impact.rate })} <span>{formatCurrency(impact.vat)}</span></p><p className="flex justify-between gap-2">{t("Differenza IVA inclusa")} <strong>{formatCurrency(impact.grossDelta)}</strong></p></>}
      {impact.revisedNet !== null && <p className="flex justify-between gap-2 border-t pt-2">{t("Nuovo contratto netto, se approvata")} <strong>{formatCurrency(impact.revisedNet)}</strong></p>}
      <p className="text-xs text-muted-foreground">{t("Stima con l'IVA della commessa. Verifica l'aliquota dei lavori extra prima dell'invio; eventuali aliquote diverse vanno specificate nelle condizioni.")}</p>
    </div>}
    {impact && cost !== null && <p className="rounded-lg border p-3 text-sm">{t("Solo per l'impresa · variazione margine prevista:")} <strong>{formatCurrency(impact.delta-cost)}</strong>. {persistentDraft ? t("Conservata nella bozza; esclusa dal PDF per il cliente.") : t("Non salvata e non inclusa nel PDF per il cliente.")}</p>}
    {projectedEnd && Number(draft.days)>0 && <p className="rounded-lg border p-3 text-xs text-muted-foreground">{t("Ipotesi fine della fase: {da} → {a}.", { da: phaseEnd?.split("-").reverse().join("/") ?? "", a: projectedEnd.split("-").reverse().join("/") })} {draft.dayUnit === "lavorativi" ? `${t("Esclusi sabato e domenica; festività e chiusure aziendali non considerate.")} ` : ""}{t("Nessuna data viene modificata; dopo l'approvazione aggiorna il cronoprogramma.")}</p>}
  </div>;
}

/** Somma dei costi unitari presi dal listino. `null` se nessuna voce ne ha uno. */
function costoDelleVoci(lines: VariationDraft["lines"]): number | null {
  let trovato = false, totale = 0;
  for (const l of lines) {
    if (!l.cost) continue;
    const q = variationDecimal(l.quantity), c = variationDecimal(l.cost);
    if (q === null || c === null) continue;
    trovato = true;
    totale += Math.round(q * c * 100) / 100;
  }
  return trovato ? Math.round(totale * 100) / 100 : null;
}

/** 1400 → «1400», 1400.5 → «1400,5»: la stessa forma che accetta `variationDecimal`. */
function numeroItaliano(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}
