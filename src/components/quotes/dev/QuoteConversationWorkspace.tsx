import { useEffect, useRef, useState } from "react";
import { usePrezzarioFonti, usePrezzarioVociPerCodici } from "@/lib/prezzario/queries";
import { ThinkingPromptInput, ThinkingProgress } from "@/components/ui/thinking-prompt-input";
import { QuoteLivePreviewPanel } from "@/components/quotes/QuoteLivePreviewPanel";
import { calcolaTotaliPreventivo } from "@/hooks/usePreventivoCosti";
import { formatCurrency } from "@/lib/formatters";
import { unitaCompatibili } from "@/lib/prezzario/confronto";
import { advanceLabConversation, type LabConversation } from "@/lib/preventivi/devQuoteConversation";
import { parseQuoteChatCommand } from "@/lib/preventivi/devQuoteChatCommands";
import QuoteLineEditor, { type EditableQuoteLine } from "./QuoteLineEditor";
import type { QuoteItemPro } from "@/types/quoteItem";
import { advanceApartment, apartmentCodes, apartmentQuestions, apartmentQuoteItems, apartmentSimulations, APARTMENT_GAPS,
  buildApartmentLines, type ApartmentConversation, type ApartmentKey, type ApartmentLine, type ApartmentOverride, type ApartmentStep } from "@/lib/preventivi/devLombardiaApartment";
import "./QuoteAiSimulation.css";

type Action = { label: string; command: string };
type Message = { role: "user" | "assistant"; text: string; actions?: Action[]; lines?: ApartmentLine[] };
const action = (command: string): Action => ({ label: command, command });
const intro = (): Message[] => [{ role: "assistant", text: "Che lavoro vuoi preventivare? Scrivi qui richiesta, listino, misure e successive correzioni: il computo prende forma a destra. Questa è ancora una prova guidata locale, non una conversazione LLM libera.", actions: [action(apartmentSimulations[0].answers[0]), action("Un campo da tennis")] }];
const initialApartment = (): ApartmentConversation => ({ step: "request", measurements: {} });
const signature = (rows: ApartmentLine[]) => JSON.stringify(rows.map(r => [r.sourceId, r.referenceId, r.key, r.title, r.description, r.unit, r.quantity, r.price, r.issue]));
const answers: Record<ApartmentStep, string[]> = {
  request: [], floor: ["80 mq netti, rimuovo e rifaccio", "80 mq netti, mantengo il pavimento", "non so"],
  paint: ["240 mq", "non so"], tiles: ["22 mq", "non so"], layout: ["invariata", "12 mq demolizione; 12 mq cartongesso", "non so"],
  fixtures: ["1 WC, 1 lavabo, 1 bidet, 1 doccia", "non so"], review: ["Mostra voci", "Cosa manca?"],
};

export default function QuoteConversationWorkspace({ companyName = "Demo Azienda 2", onOpenPlan, onOpenReal }: { companyId?: string; companyName?: string; onOpenPlan?: () => void; onOpenReal?: () => void }) {
  const [intent, setIntent] = useState<"regional" | "synthetic" | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const fonti = usePrezzarioFonti(intent === "regional");
  const sources = fonti.data?.filter(f => f.regione === "Lombardia") ?? [];
  const source = sources.find(f => f.id === sourceId);
  const catalog = usePrezzarioVociPerCodici(sourceId, apartmentCodes);
  const [apartment, setApartment] = useState<ApartmentConversation>(initialApartment);
  const [synthetic, setSynthetic] = useState<LabConversation>({ scenario: "bagno", step: "request" });
  const [syntheticItems, setSyntheticItems] = useState<QuoteItemPro[]>([]);
  const [syntheticEdits, setSyntheticEdits] = useState<Record<string, ApartmentOverride>>({});
  const [discount, setDiscount] = useState(0);
  const [overrides, setOverrides] = useState<Partial<Record<ApartmentKey, ApartmentOverride>>>({});
  const [messages, setMessages] = useState<Message[]>(intro);
  const [input, setInput] = useState("");
  const transcript = useRef<HTMLDivElement>(null);
  const notices = useRef(new Set<string>());
  const append = (message: Message) => setMessages(prev => [...prev, message].slice(-50));
  const reading = intent === "regional" && (fonti.isFetching || !!sourceId && catalog.isFetching);
  const lines = source && !catalog.isFetching && !catalog.isError ? buildApartmentLines(source, catalog.data ?? [], apartment.measurements, overrides, true) : [];
  const syntheticRows: EditableQuoteLine[] = syntheticItems.map((item, index) => {
    const change = syntheticEdits[String(index)] ?? {};
    const title = change.title ?? item.name; const unit = change.unit ?? item.unit_of_measure ?? "mq";
    const quantity = Object.hasOwn(change, "quantity") ? change.quantity ?? null : item.quantity;
    const price = Object.hasOwn(change, "price") ? change.price ?? null : item.unit_price;
    const issue = !title.trim() || !unit.trim() ? "Titolo e unità sono obbligatori." : quantity == null || price == null ? "Completa quantità e prezzo." : null;
    return { id: String(index), title, description: change.description ?? item.description ?? "", unit, quantity, price, issue,
      included: !issue && change.approved !== false, reference: "Esempio sintetico, non un prezzo regionale" };
  });
  const effectiveSynthetic = syntheticRows.filter(r => r.included).map(r => ({ ...syntheticItems[Number(r.id)], name: r.title, description: r.description, quantity: r.quantity!, unit_price: r.price!, unit_of_measure: r.unit, is_optional: false }));
  const items = intent === "regional" ? apartmentQuoteItems(lines) : effectiveSynthetic;
  const totals = calcolaTotaliPreventivo(items, 0, discount);
  useEffect(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages, reading]);
  useEffect(() => {
    if (intent !== "regional" || fonti.isFetching) return;
    const key = fonti.error ? "sources:error" : fonti.data ? "sources:ready" : "";
    if (!key || notices.current.has(key)) return;
    notices.current.add(key);
    const available = fonti.data?.filter(f => f.regione === "Lombardia") ?? [];
    setMessages(prev => [...prev, { role: "assistant" as const,
      text: fonti.error ? "Non riesco a leggere la libreria esistente. Nessun prezzo inventato. Scrivi «riprova lettura»." : available.length
        ? "Nel gestionale è disponibile questa fonte. Conferma in chat l’edizione da usare. Nome ed edizione nei metadati sono mostrati separatamente: l’incongruenza non viene corretta automaticamente."
        : "Non trovo una fonte Lombardia pubblicata. Non creo né importo un listino sostitutivo.",
      actions: available.map(f => ({ label: `${f.nome} · metadati ${f.versione ?? "non indicati"}`, command: `usa fonte ${f.id}` })),
    }].slice(-50));
  }, [intent, fonti.data, fonti.error, fonti.isFetching]);
  useEffect(() => {
    if (intent !== "regional" || !sourceId || catalog.isFetching) return;
    const key = `${sourceId}:${catalog.isError ? "error" : catalog.data ? "ready" : "waiting"}`;
    if (!catalog.isError && !catalog.data || notices.current.has(key)) return;
    notices.current.add(key);
    setMessages(prev => [...prev, { role: "assistant" as const,
      text: catalog.isError ? "Lettura delle voci non riuscita. Non applico prezzi precedenti o sintetici. Scrivi «riprova lettura»."
        : `Ho letto ${catalog.data?.length ?? 0} corrispondenze per 12 codici candidati, senza importare nulla. Prezzi e specifiche sono quelli dell’edizione confermata, non costi aziendali. ${apartmentQuestions.floor}`,
      actions: catalog.isError ? [action("Riprova lettura")] : [...answers.floor.map(action), action("Simula caso base")],
    }].slice(-50));
  }, [intent, sourceId, catalog.data, catalog.isError, catalog.isFetching]);

  const send = (raw = input, display = raw) => {
    const text = raw.trim(); const lower = text.toLowerCase();
    if (!text || text.length > 3000 || reading) return;
    append({ role: "user", text: display }); setInput("");
    const reply = (text: string, actions?: Action[], snapshot?: ApartmentLine[]) => append({ role: "assistant", text, actions, lines: snapshot });
    if (lower === "ricomincia") {
      setIntent(null); setSourceId(null); setApartment(initialApartment()); setSynthetic({ scenario: "bagno", step: "request" });
      setOverrides({}); setSyntheticItems([]); setSyntheticEdits({}); setDiscount(0); notices.current.clear(); setMessages(intro()); return;
    }
    if (lower === "riprova lettura") {
      notices.current.clear(); if (sourceId) void catalog.refetch(); else void fonti.refetch(); return;
    }
    if (/^(cosa manca\??|mostra cosa manca)$/.test(lower)) { reply(APARTMENT_GAPS.join("\n\n")); return; }
    if (intent === "regional" && /^(usa fonte |usa lombardia\s+2025$)/.test(lower)) {
      const options = lower.startsWith("usa fonte ") ? sources.filter(f => f.id === text.slice(10)) : sources.filter(f => f.anno === 2025);
      if (options.length !== 1 || options[0].anno !== 2025) { reply("Per questo caso sono verificati solo i codici Lombardia 2025. Non traduco i codici tra edizioni e non scelgo una fonte ambigua."); return; }
      if (options[0].id === sourceId) { reply("Questa fonte è già attiva: mantengo misure, prezzi manuali e conferme. Scrivi «Mostra voci» per rivederle."); return; }
      setSourceId(options[0].id); setOverrides({}); reply(`Edizione confermata: ${options[0].nome}. Leggo solo i codici candidati dalla libreria esistente.`); return;
    }
    if (intent === "regional" && !source) { reply("Conferma prima la fonte proposta qui in chat. Puoi scrivere «Usa Lombardia 2025»."); return; }
    if (intent === "regional" && (!catalog.data || catalog.isError)) { reply("Il listino non è ancora leggibile. Scrivi «riprova lettura»: non userò prezzi di riserva."); return; }
    if (intent === "regional" && /^simula (caso base|misure sconosciute|pavimento mantenuto|distribuzione modificata)$/.test(lower)) {
      const index = ["simula caso base", "simula misure sconosciute", "simula pavimento mantenuto", "simula distribuzione modificata"].indexOf(lower);
      let state = initialApartment();
      for (const answer of apartmentSimulations[index].answers) state = advanceApartment(state, answer).next;
      setApartment(state); setOverrides({});
      reply(`Caso di prova «${apartmentSimulations[index].name}». Risposte DEMO, non rilievi: ${apartmentSimulations[index].answers.slice(1).join("; ")}. Non sono dedotte dagli 80 mq. Apro le voci candidate nel prossimo messaggio.`, [action("Mostra voci"), action("Simula misure sconosciute"), action("Simula pavimento mantenuto"), action("Simula distribuzione modificata")]); return;
    }
    if (intent === "regional" && lower === "mostra voci") {
      reply("Ecco le voci candidate. Leggi le specifiche; solo quelle confermate entrano nel parziale. Comandi: «Conferma voce 1», «Escludi voce 1», «Prezzo voce 2: 55 €», «Quantità voce 2: 70 mq», «Ripristina prezzo voce 2». I numeri seguono questa lista, non cambiano con l’inclusione.", [action("Conferma tutte le voci disponibili"), action("Cosa manca?")], lines); return;
    }
    if (intent === "regional" && lower === "conferma tutte le voci disponibili") {
      const valid = lines.filter(r => !r.issue);
      setOverrides(prev => { const next = { ...prev }; valid.forEach(r => { next[r.key] = { ...next[r.key], approved: true }; }); return next; });
      const blocked = lines.filter(r => r.issue).length;
      reply(`${valid.length} voci confermate nella bozza locale. ${blocked === 1 ? "1 voce resta bloccata" : `${blocked} voci restano bloccate`}. È un parziale netto, non il prezzo della ristrutturazione completa. IVA, costi aziendali e tempi non sono stati inventati.`, [action("Mostra voci"), action("Cosa manca?")]); return;
    }
    const command = parseQuoteChatCommand(text);
    if (command && intent === "regional") {
      const line = lines[command.index];
      if (!line) { reply("Questa voce non esiste nella lista corrente. Scrivi «Mostra voci»."); return; }
      if (command.kind === "include" && line.issue) { reply(`Non posso includere la voce ${command.index + 1}: ${line.issue}`); return; }
      if (command.kind === "quantity" && command.unit && !unitaCompatibili(command.unit, line.unit)) { reply(`Unità incompatibile: per questa voce serve ${line.unit}. Nessuna modifica applicata.`); return; }
      setOverrides(prev => {
        const next = { ...prev }; const old = next[line.key] ?? {};
        if (command.kind === "restore") { const { price: _price, ...rest } = old; next[line.key] = rest; }
        else if (command.kind === "include" || command.kind === "exclude") next[line.key] = { ...old, approved: command.kind === "include" };
        else if ("value" in command) next[line.key] = { ...old, [command.kind === "price" ? "price" : "quantity"]: command.value };
        return next;
      });
      reply(`Voce ${command.index + 1} aggiornata solo nella bozza locale. ${command.kind === "price" ? "Prezzo manuale distinto dal riferimento regionale, che rimane conservato." : ""} Il parziale a destra è ricalcolato dal motore del gestionale.`, [action("Mostra voci")]); return;
    }
    if (command && intent === "synthetic") {
      const item = syntheticRows[command.index];
      if (!item || command.kind === "include" && item.issue) { reply("La voce manca o è incompleta: controlla i campi sotto la chat."); return; }
      if (command.kind === "quantity" && command.unit && !unitaCompatibili(command.unit, item.unit)) { reply("Unità incompatibile: nessuna modifica applicata."); return; }
      setSyntheticEdits(prev => {
        const next = { ...prev }; const old = next[item.id] ?? {};
        if (command.kind === "restore") { const { price: _price, ...rest } = old; next[item.id] = rest; }
        else if (command.kind === "include" || command.kind === "exclude") next[item.id] = { ...old, approved: command.kind === "include" };
        else if ("value" in command) next[item.id] = { ...old, [command.kind === "price" ? "price" : "quantity"]: command.value };
        return next;
      });
      reply("Voce sintetica aggiornata in locale. Prezzi e IVA di questo esempio non sono quelli di un prezzario."); return;
    }
    if (!intent && /lombardia|ristruttur.*80\s*(?:mq|m²|m2)/i.test(text)) {
      const turn = advanceApartment(initialApartment(), text);
      if (turn.next.step === "request") { reply(turn.reply); return; }
      setIntent("regional"); setApartment(turn.next); reply("Cerco il prezzario Lombardia già pubblicato nel gestionale. Prima ti chiederò di confermare l’edizione, poi le misure mancanti."); return;
    }
    if (intent === "regional") {
      const turn = advanceApartment(apartment, text); setApartment(turn.next);
      reply(turn.reply, answers[turn.next.step].map(action)); return;
    }
    const turn = advanceLabConversation(synthetic, text);
    if (turn.next.step === "request") { reply("Posso provare il trilocale 80 mq con la libreria Lombardia, oppure bagno, cappotto e tennis con dati dichiaratamente sintetici. La chat LLM generale non è ancora collegata."); return; }
    setIntent("synthetic"); setSynthetic(turn.next);
    if (turn.row) { const patch = turn.row; setSyntheticItems(prev => { const next = [...prev]; next[patch.index] = { ...next[patch.index], ...patch.value, item_type: "service", item_category: "posa", discount_percent: 0, vat_rate: 22, sort_order: patch.index, prezzo_acquisto: null, mostra_nel_pdf: true, is_optional: false } as QuoteItemPro; return next; }); }
    if (turn.discount != null) setDiscount(turn.discount);
    reply(turn.next.step === "ready" ? "Bozza sintetica composta. Puoi correggerla sempre qui: «Prezzo voce 1: 50 €», «Quantità voce 1: 600 mq», «sconto del 10%». Nessun salvataggio o invio." : turn.reply);
  };

  const editorRows: EditableQuoteLine[] = intent === "regional" ? lines.filter(r => apartment.step === "review" || Object.hasOwn(apartment.measurements, r.key)).map(r => ({
    id: r.key, title: r.title, description: r.description, quantity: r.quantity, price: r.price, unit: r.unit, included: r.included, issue: r.issue,
    reference: `${r.code} · riferimento ${r.referencePrice == null ? "assente" : formatCurrency(r.referencePrice)} / ${r.referenceUnit ?? "unità mancante"}${r.manualUnit ? " · unità modificata, valori manuali" : r.manualPrice ? " · prezzo manuale" : ""}`,
    originalDescription: r.referenceDescription,
  })) : syntheticRows;
  const editRow = (id: string, patch: ApartmentOverride) => {
    const row = editorRows.find(r => r.id === id); if (!row) return;
    const changedUnit = patch.unit != null && !unitaCompatibili(patch.unit, row.unit);
    const safePatch = changedUnit ? { ...patch, quantity: null, price: null, approved: false } : patch;
    if (intent === "regional") setOverrides(prev => ({ ...prev, [id]: { ...prev[id as ApartmentKey], ...safePatch } }));
    else setSyntheticEdits(prev => ({ ...prev, [id]: { ...prev[id], ...safePatch } }));
  };
  const resetRow = (id: string) => {
    if (intent === "regional") setOverrides(prev => { const next = { ...prev }; delete next[id as ApartmentKey]; return next; });
    else setSyntheticEdits(prev => { const next = { ...prev }; delete next[id]; return next; });
  };

  return <main className="simulation-shell chat-only-workspace">
    <header className="simulation-head"><div><span className="simulation-kicker">{companyName.toUpperCase()} · PROVA LOCALE</span><h1>Dal dialogo al preventivo.</h1><p>Creazione e listini nella chat. Ogni voce resta modificabile anche sotto.</p></div><span className="simulation-safe">Nessun invio · Nessuna scrittura</span></header>
    <div className="simulation-columns regional-layout">
      <div className="chat-editing-column"><section className="quote-lab-chat" aria-label="Chat unica preventivo">
        <header className="chat-workspace-header"><div><span>Assistente preventivi</span><small>Prototipo guidato · nessuna chiamata AI a pagamento</small></div><span className={`chat-operation-status ${reading ? 'working' : ''}`}><i aria-hidden="true" />{reading ? "Consulto il listino" : "Pronto"}</span></header>
        <div className="quote-lab-messages" ref={transcript} role="log" aria-live="polite">
          {messages.length === 1 && onOpenPlan && <article className="quote-lab-message assistant"><small>Nuovo caso di prova</small><p>Prova anche il progetto dalla planimetria: misure parziali, ambito e voci da confermare. Simulazione dichiarata, senza OCR o LLM.</p><div className="quote-lab-suggestions"><button onClick={onOpenPlan}>Simula dalla planimetria</button>{onOpenReal && <button onClick={onOpenReal}>Apri chat AI locale</button>}</div></article>}
          {messages.map((m, i) => <article key={i} className={`quote-lab-message ${m.role}`}><small>{m.role === "user" ? "Tu" : "Assistente · prova locale"}</small><p>{m.text}</p>
            {m.lines && <ol className="chat-source-lines">{m.lines.map((line, index) => <li key={line.key}><strong>{index + 1}. {line.title}</strong><p>{line.quantity ?? "Da misurare"} {line.unit} × {line.price == null ? "Prezzo mancante" : formatCurrency(line.price)} · {line.included ? "Inclusa" : line.issue ?? "Da confermare"}</p><small>{line.code}{line.manualPrice ? ` · prezzo manuale; riferimento ${line.referencePrice == null ? "assente" : formatCurrency(line.referencePrice)}` : ""}</small><details><summary>Leggi specifiche originali del listino</summary><p>{line.referenceDescription || line.issue}</p></details></li>)}</ol>}
            {m.actions && <div className="quote-lab-suggestions">{m.actions.map(a => <button key={a.command} disabled={reading} onClick={() => {
              if (m.lines && signature(m.lines) !== signature(lines)) { append({ role: "assistant", text: "Le voci sono cambiate rispetto a quel messaggio: verifica questo elenco aggiornato prima di confermare.", lines, actions: [action("Conferma tutte le voci disponibili")] }); return; }
              send(a.command, a.label);
            }}>{a.label}</button>)}</div>}
          </article>)}
          {reading && <ThinkingProgress status="thinking" steps={[{ id: "regional-read", text: sourceId ? "Leggo i codici esatti dalla fonte confermata" : "Verifico le fonti pubblicate già presenti", status: "active" }]} />}
        </div>
        <ThinkingPromptInput value={input} onValueChange={setInput} onSubmit={() => send()} busy={reading} onStop={() => { setIntent(null); setSourceId(null); notices.current.clear(); append({ role: "assistant", text: "Lettura interrotta: nessun risultato tardivo verrà applicato. Scrivi «ricomincia» per un nuovo progetto." }); }} />
        <p className="quote-lab-caption">Invio per rispondere · «Mostra voci» per i dettagli · «Ricomincia» per un nuovo progetto. Numeri suggeriti e simulazioni non sostituiscono un rilievo.</p>
      </section><QuoteLineEditor rows={editorRows} onPatch={editRow} onReset={resetRow} /></div>
      <aside><QuoteLivePreviewPanel template={{ name: source ? `PARZIALE · ${source.nome}` : "Bozza locale · dati da confermare", primary_color: "#173f39", show_validity_date: false, show_payment_terms: false }} companyName={companyName} clientName="Cliente DEMO" title={intent === "regional" ? "Trilocale 80 m² · ristrutturazione" : "Preventivo in composizione"} validityDays={30}
        items={items} subtotal={totals.subtotale} net={totals.subtotale_netto} total={intent === "regional" ? totals.subtotale_netto : totals.totale} vatBreakdown={intent === "regional" ? {} : totals.iva_breakdown}
        discountPercent={discount} manualPrice={false} showPrices onlyTotal={false} showDiscounts showNotes showConditions={false} showSignature={false} paymentMethod="" paymentPhases={[]}
        taxPending={intent !== "synthetic"} offerOnly animateChanges notes={intent === "regional" ? `${items.length} voci confermate. Impianti, completamenti, tempi e costi interni ancora da valutare: chiedi «Cosa manca?» in chat. Non è un preventivo completo.` : "Misure, prezzi e IVA sintetici, solo per provare l’esperienza. Non è un’offerta."}
        previewNotice="PROVA LOCALE. Creazione in chat, modifiche anche nella tabella sotto. Nessun documento reale viene salvato o inviato." />
      </aside>
    </div>
  </main>;
}
