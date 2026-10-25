import { useEffect, useRef, useState } from "react";
import { usePrezzarioFonti, usePrezzarioVociPerCodici } from "@/lib/prezzario/queries";
import { ThinkingPromptInput, ThinkingProgress } from "@/components/ui/thinking-prompt-input";
import { QuoteLivePreviewPanel } from "@/components/quotes/QuoteLivePreviewPanel";
import { calcolaTotaliPreventivo } from "@/hooks/usePreventivoCosti";
import { formatCurrency } from "@/lib/formatters";
import {
  advanceApartment, apartmentCodes, apartmentQuestions, apartmentQuoteItems, apartmentSimulations,
  APARTMENT_GAPS, buildApartmentLines, type ApartmentConversation, type ApartmentKey, type ApartmentOverride, type ApartmentStep,
} from "@/lib/preventivi/devLombardiaApartment";

type Message = { role: "user" | "assistant"; text: string };
const fresh = (): ApartmentConversation => ({ step: "request", measurements: {} });
const startingMessages = (): Message[] => [{ role: "assistant", text: apartmentQuestions.request }];
const suggestions: Record<ApartmentStep, string[]> = {
  request: [apartmentSimulations[0].answers[0]],
  floor: ["80 mq netti, rimuovo e rifaccio", "80 mq netti, mantengo il pavimento", "non so"],
  paint: ["240 mq", "non so"], tiles: ["22 mq", "non so"],
  layout: ["invariata", "12 mq demolizione; 12 mq cartongesso", "non so"],
  fixtures: ["1 WC, 1 lavabo, 1 bidet, 1 doccia", "non so"], review: [],
};
const numberInput = (value: string) => {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? n : null;
};

/** DEV route only, behind the existing Demo2 + loopback guard. Regional data
 * is read-only, shared published catalogue; all quote edits stay in memory. */
export default function LombardiaApartmentLab({ companyName }: { companyName: string }) {
  const fonti = usePrezzarioFonti();
  const [selectedSource, setSelectedSource] = useState("");
  const sources = fonti.data?.filter(f => f.regione === "Lombardia") ?? [];
  const source = sources.find(f => f.id === selectedSource) ?? (selectedSource ? undefined : sources.find(f => f.anno === 2025));
  const catalog = usePrezzarioVociPerCodici(source?.id ?? null, apartmentCodes);
  const [accepted, setAccepted] = useState(false);
  const [conversation, setConversation] = useState<ApartmentConversation>(fresh);
  const [overrides, setOverrides] = useState<Partial<Record<ApartmentKey, ApartmentOverride>>>({});
  const [messages, setMessages] = useState<Message[]>(startingMessages);
  const [input, setInput] = useState("");
  const [fixture, setFixture] = useState(0);
  const [replayed, setReplayed] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages]);
  // At most 12 requirements × 24 returned rows; edits stay entirely local.
  const lines = source && !catalog.isFetching && !catalog.isError
    ? buildApartmentLines(source, catalog.data ?? [], conversation.measurements, overrides, accepted) : [];
  const items = apartmentQuoteItems(lines);
  const totals = calcolaTotaliPreventivo(items, 0, 0);
  const reset = () => { setConversation(fresh()); setOverrides({}); setMessages(startingMessages()); setInput(""); setReplayed(false); };
  const send = (answer = input) => {
    if (!answer.trim()) return;
    const result = advanceApartment(conversation, answer);
    setConversation(result.next); setInput("");
    setMessages(prev => [...prev, { role: "user" as const, text: answer.slice(0, 3000) }, { role: "assistant" as const, text: result.reply }].slice(-40));
  };
  const replay = () => {
    let state = fresh(); const transcript = startingMessages();
    for (const answer of apartmentSimulations[fixture].answers) {
      const result = advanceApartment(state, answer); state = result.next;
      transcript.push({ role: "user", text: answer }, { role: "assistant", text: result.reply });
    }
    setConversation(state); setMessages(transcript); setOverrides({}); setInput(""); setReplayed(true);
  };
  const edit = (key: ApartmentKey, patch: ApartmentOverride) => setOverrides(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const reading = fonti.isLoading || (!!source && catalog.isFetching);
  const error = fonti.error ?? catalog.error;
  return <>
    <section className="simulation-controls" aria-label="Prezzario regionale esistente">
      <label>Fonte <select aria-label="Fonte Lombardia" value={source?.id ?? ""} onChange={e => { setSelectedSource(e.target.value); setAccepted(false); setOverrides({}); }}>
        <option value="" disabled>Scegli un prezzario pubblicato</option>
        {sources.map(f => <option key={f.id} value={f.id}>{f.nome} · metadati {f.versione ?? "edizione non indicata"}</option>)}
      </select></label>
      <label className="simulation-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} disabled={!source || source.anno !== 2025} />Confermo l’uso dell’edizione {source?.anno ?? "da scegliere"}, non dell’anno corrente</label>
    </section>
    <p className="simulation-disclaimer">Solo lettura dal listino regionale già presente; nessuna importazione o adozione. I nomi/edizioni sono mostrati come registrati: eventuali incongruenze non vengono corrette automaticamente. I prezzi non sono i costi interni dell’azienda.</p>
    {reading && <ThinkingProgress status="thinking" steps={[{ id: "catalog", text: "Leggo la fonte pubblicata e al massimo 12 codici esatti dalla libreria esistente", status: "active" }]} />}
    {error && <div role="alert" className="regional-alert">Lettura del prezzario non riuscita: {error.message}. Nessun prezzo sintetico sostitutivo. <button onClick={() => { void fonti.refetch(); void catalog.refetch(); }}>Riprova lettura</button></div>}
    {!fonti.isLoading && !source && !error && <p role="alert">Non trovo l’edizione Lombardia 2025 pubblicata. Scegli una fonte disponibile; questo caso non traduce automaticamente codici di altri anni.</p>}
    <div className="simulation-controls regional-cases">
      <label>Simulazione <select aria-label="Caso appartamento" value={fixture} onChange={e => setFixture(Number(e.target.value))}>{apartmentSimulations.map((s, i) => <option value={i} key={s.name}>{s.name}</option>)}</select></label>
      <button onClick={replay}>Carica risposte di esempio</button><button onClick={reset}>Riparti dalla chat</button>
    </div>
    {replayed && <p className="simulation-disclaimer">Risposte di esempio caricate: 240/260 m² di pittura, 22/24 m² di rivestimento e le altre misure sono ipotesi DEMO, non rilievi né deduzioni dagli 80 m². Puoi sostituirle sotto.</p>}
    <div className="simulation-columns regional-layout">
      <section className="simulation-work">
        <section className="quote-lab-chat" aria-label="Chat appartamento Lombardia">
          <header><span>Appartamento · 80 m² · un bagno</span><small>Dialogo guidato di prova · prezzi regionali reali, misure da confermare · nessuna chiamata LLM</small></header>
          <div className="quote-lab-messages" role="log" aria-live="polite" ref={transcript}>{messages.map((m, i) => <article className={`quote-lab-message ${m.role}`} key={i}><small>{m.role === "user" ? "Tu / esempio" : "Assistente · prova guidata"}</small><p>{m.text}</p></article>)}</div>
          <div className="quote-lab-suggestions">{suggestions[conversation.step].map(text => <button key={text} onClick={() => send(text)}>{text}</button>)}</div>
          <ThinkingPromptInput value={input} onValueChange={setInput} onSubmit={() => send()} onStop={() => {}} busy={false} />
          <p className="quote-lab-caption">Le risposte numeriche suggerite sono esempi. «Non so» lascia la voce da misurare, mai a zero.</p>
        </section>
        <h2 className="regional-heading">Voci candidate dalla libreria</h2>
        <p className="quote-lab-caption">Apri le specifiche prima di includere una voce. Cambiare un numero revoca la conferma di quella voce. Nessuna riga viene duplicata o aggiunta al listino.</p>
        <div className="regional-lines">{lines.map(line => <article key={line.key}>
          <div className="regional-line-heading"><strong>{line.title}</strong><label><input type="checkbox" aria-label={`Conferma ${line.title}`} checked={line.included} disabled={!!line.issue} onChange={e => edit(line.key, { approved: e.target.checked })} />Includi</label></div>
          <small className="regional-code">{line.code}</small>
          <div className="regional-inputs">
            <label>Quantità ({line.unit})<input aria-label={`Quantità ${line.title}`} type="number" min="0.01" max="1000000" step="0.01" value={line.quantity ?? ""} onChange={e => edit(line.key, { quantity: numberInput(e.target.value), approved: false })} placeholder="Da misurare" /></label>
            <label>Prezzo netto / {line.unit}<input aria-label={`Prezzo ${line.title}`} type="number" min="0.01" max="1000000" step="0.01" value={line.price ?? ""} onChange={e => edit(line.key, { price: numberInput(e.target.value), approved: false })} placeholder="Non disponibile" /></label>
          </div>
          {line.manualPrice && <p className="regional-warning">Prezzo manuale · riferimento {line.referencePrice == null ? "assente" : formatCurrency(line.referencePrice)}. <button onClick={() => setOverrides(prev => { const next = { ...prev }; const { price: _price, ...rest } = next[line.key] ?? {}; next[line.key] = { ...rest, approved: false }; return next; })}>Ripristina prezzo regionale</button></p>}
          {line.issue ? <p className="regional-warning">{line.issue}</p> : <p className="regional-valid">{line.included ? "Inclusa nel parziale" : "Da confermare: leggi inclusioni, esclusioni e caratteristiche"}</p>}
          {line.description && <details><summary>Specifiche, inclusioni ed esclusioni originali</summary><p>{line.description}</p></details>}
        </article>)}</div>
      </section>
      <aside>
        <QuoteLivePreviewPanel template={{ name: `Computo PARZIALE · ${source?.nome ?? "Fonte da scegliere"}`, primary_color: "#173f39", show_validity_date: false, show_payment_terms: false }}
          companyName={companyName} clientName="Cliente DEMO" title="Trilocale 80 m² · ristrutturazione da completare" validityDays={30}
          items={items} subtotal={totals.subtotale} net={totals.subtotale_netto} total={totals.subtotale_netto} vatBreakdown={{}}
          discountPercent={0} manualPrice={false} showPrices onlyTotal={false} showDiscounts={false} showNotes showConditions={false} showSignature={false}
          notes={`Solo ${items.length} voci confermate su ${lines.length} candidate, non l’intera ristrutturazione. ${APARTMENT_GAPS.join(". ")}`}
          paymentMethod="" paymentPhases={[]} taxPending previewNotice="SIMULAZIONE PARZIALE, non un’offerta. Nessun salvataggio, invio o PDF contrattuale. IVA, tempi e costi aziendali ancora da definire." />
        <section className="simulation-journal"><h2>Copertura e dati da completare</h2><p>{items.length} voci confermate · {lines.filter(r => r.issue).length} candidate bloccate · 0 scritture · 0 chiamate AI</p><p>Nessun ricarico automatico, nessun margine presunto. Prezzo di riferimento e prezzo modificato rimangono distinti.</p><details><summary>Completamenti ancora da valutare ({APARTMENT_GAPS.length})</summary><ul>{APARTMENT_GAPS.map(gap => <li key={gap}>{gap}</li>)}</ul></details></section>
      </aside>
    </div>
  </>;
}
