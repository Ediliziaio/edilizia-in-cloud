import { UniformSelect } from "@/components/ui/uniform-select";
import React, { useEffect, useMemo, useState } from "react";
import AIQuotePanel from "@/components/quotes/AIQuotePanel";
import { QuoteLivePreviewPanel } from "@/components/quotes/QuoteLivePreviewPanel";
import { calcolaTotaliPreventivo } from "@/hooks/usePreventivoCosti";
import type { QuoteItemPro } from "@/types/quoteItem";
import { formatCurrency } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { demo, subscribe, log, supabase as simulatedService } from "@/lib/preventivi/devSimulation";
import QuoteConversationLab from "./QuoteConversationLab";
import LombardiaApartmentLab from "./LombardiaApartmentLab";
import type { LabScenario } from "@/lib/preventivi/devQuoteConversation";
import "./QuoteAiSimulation.css";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

// Regression fixture only: no application route imports this component.
export default function Simulazione({ companyId = "simulazione-isolata", companyName = "IMPRESA DI PROVA" }: { companyId?: string; companyName?: string }) {
  const t = useT();
  const [scenario, setScenario] = useState<LabScenario>("bagno");
  const [mode, setMode] = useState<"chat" | "technical" | "regional">("chat");
  const [sessione, setSessione] = useState(0);
  const [items, setItems] = useState<QuoteItemPro[]>([]);
  const [sconto, setSconto] = useState(0);
  const [overhead, setOverhead] = useState(10);
  const [lenta, setLenta] = useState(false);
  const [, refresh] = useState(0);
  useEffect(() => subscribe(() => refresh(x => x + 1)), []);
  useEffect(() => { demo.scenario = scenario; demo.lenta = lenta; }, [scenario, lenta]);
  const totals = useMemo(() => calcolaTotaliPreventivo(items, overhead, sconto), [items, overhead, sconto]);
  const titolo = scenario === "bagno" ? "Ristrutturazione bagno" : scenario === "cappotto" ? "Cappotto termico" : "Campo da tennis";
  const reset = (next: LabScenario) => {
    demo.scenario = next; setScenario(next); setItems([]); setSconto(0); setOverhead(10); setSessione(x => x + 1);
    log("Nuova prova locale: nessuna bozza o commessa reale modificata.");
  };
  return <main className="simulation-shell">
    <header className="simulation-head"><div><span className="simulation-kicker">{companyName.toUpperCase()} · {t("SIMULAZIONE LOCALE")}</span><h1>{t("Tu rispondi. Il preventivo prende forma.")}</h1><p>{t("Parla con l’assistente a sinistra: la bozza si compone a destra mentre rispondi. Puoi sempre modificare i numeri direttamente.")}</p></div><span className="simulation-safe">{t("Nessun invio · Nessuna modifica ai dati")}</span></header>
    {mode !== "regional" && <section className="simulation-controls" aria-label={t("Controlli della simulazione")}>
      <label>{t("Scenario")} <UniformSelect value={scenario} onChange={e => reset(e.target.value as LabScenario)}><option value="bagno">{t("Bagno")}</option><option value="cappotto">{t("Cappotto")}</option><option value="tennis">{t("Campo da tennis")}</option></UniformSelect></label>
      <label className="simulation-check"><input type="checkbox" checked={lenta} onChange={e => { demo.lenta = e.target.checked; setLenta(e.target.checked); }} />{t("Analisi lenta per provare l’interruzione")}</label>
      <button type="button" onClick={() => reset(scenario)}>{t("Ricomincia la prova")}</button>
    </section>}
    {mode !== "regional" && <p className="simulation-disclaimer">{t("Tutti gli importi, costi, misure e aliquote di questi tre casi sono fittizi. Per il listino esistente usa «Lombardia · 80 m²». Questa pagina non genera documenti contrattuali.")}</p>}
    <nav className="simulation-mode" aria-label={t("Modalità della prova")}><button aria-pressed={mode === "chat"} onClick={() => { if (mode !== "chat") { setMode("chat"); reset(scenario); } }}>{t("Chat e preventivo")}</button><button aria-pressed={mode === "technical"} onClick={() => { if (mode !== "technical") { setMode("technical"); reset(scenario); } }}>{t("Verifiche tecniche AI")}</button><button aria-pressed={mode === "regional"} onClick={() => setMode("regional")}>{t("Lombardia · 80 m²")}</button></nav>
    {mode === "regional" ? <LombardiaApartmentLab companyName={companyName} /> : <div className="simulation-columns"><section className="simulation-work">
      {mode === "chat" ? <QuoteConversationLab key={`chat:${sessione}`} scenario={scenario} slow={lenta} onScenario={next => { demo.scenario = next; setScenario(next); setItems([]); setSconto(0); }} onRow={(index, row) => {
        setItems(prev => {
          const next = [...prev];
          next[index] = { ...next[index], item_type: "service", item_category: "posa", name: row.name, description: "Dati sintetici della simulazione, non un prezzo di mercato.", quantity: row.quantity, unit_price: row.unit_price, unit_of_measure: row.unit_of_measure, discount_percent: 0, vat_rate: 22, sort_order: index, prezzo_acquisto: 10, mostra_nel_pdf: true, is_optional: false } as QuoteItemPro;
          return next;
        });
        log(`Chat: lavorazione ${index + 1} aggiornata nella sola bozza locale.`);
      }} onDiscount={setSconto} /> : <>
      <div className="simulation-step"><span>1</span><div><h2>{t("Descrivi il lavoro")}</h2><p>{t("Apri “Genera con AI”, scrivi una richiesta e genera. Una voce resterà da completare, per mostrare cosa succede quando un dato manca.")}</p></div></div>
      <AIQuotePanel key={`${scenario}:${sessione}`} companyId={companyId} tipoLavoro={titolo} generazioneSimulata={(body, signal) => simulatedService.functions.invoke("ai-genera-preventivo-v2", { signal })} onRigheGenerate={async sezioni => {
        const rows = sezioni.flatMap(s => s.righe).map((r, i) => ({
          item_type: r.item_category === "prodotto" ? "product" : "service", item_category: r.item_category,
          name: r.nome, description: r.descrizione, quantity: r.quantita, unit_price: r.unit_price,
          discount_percent: 0, vat_rate: 22, unit_of_measure: r.unita_misura, sort_order: i,
          // Deliberately fictional unit cost, shown as editable in the lab only.
          prezzo_acquisto: 10, mostra_nel_pdf: true, is_optional: false,
        }) as QuoteItemPro);
        setItems(prev => [...prev, ...rows]);
        log(`Inserite ${rows.length} righe nella sola memoria della simulazione.`);
      }} />
      </>}
      <div className="simulation-step"><span>2</span><div><h2>{t("Modifica la bozza quando vuoi")}</h2><p>{t("Quantità, prezzo e costo si modificano localmente: non richiamano l’AI. Il costo unitario iniziale di 10 € è un valore fittizio da provare.")}</p></div></div>
      {items.length === 0 ? <div className="simulation-empty">{mode === "chat" ? t("Le lavorazioni compariranno qui mentre rispondi, appena i dati della voce sono completi.") : t("Qui appariranno le righe dopo la conferma dell’anteprima AI.")}</div> : <div className="simulation-table"><table><thead><tr><th>{t("Lavorazione")}</th><th>{t("Quantità")}</th><th>{t("Prezzo netto")}</th><th>{t("Costo unitario")}</th></tr></thead><tbody>{items.map((r, i) => <tr key={i}><td>{r.name}</td>{([['quantity', 'Quantità'], ['unit_price', 'Prezzo'], ['prezzo_acquisto', 'Costo']] as const).map(([key, label]) => <td key={key}><Input type="number" min="0" step="0.01" aria-label={t("{campo} riga {n}", { campo: t(label), n: i + 1 })} value={r[key]} onChange={e => { const n = Number(e.target.value); setItems(prev => prev.map((row, idx) => idx === i ? { ...row, [key]: Number.isFinite(n) && n >= 0 ? n : 0 } : row)); }} /></td>)}</tr>)}</tbody></table></div>}
      <div className="simulation-values"><label>{t("Sconto %")} <Input aria-label={t("Sconto simulato")} type="number" min="0" max="100" value={sconto} onChange={e => setSconto(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /></label><label>{t("Spese generali %")} <Input aria-label={t("Spese generali simulate")} type="number" min="0" max="100" value={overhead} onChange={e => setOverhead(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /></label></div>
      <div className="simulation-metrics"><div><small>{t("Costo diretto sintetico")}</small><strong>{formatCurrency(totals.costo_totale)}</strong></div><div><small>{t("Spese generali sintetiche")}</small><strong>{formatCurrency(totals.overhead_totale)}</strong></div><div><small>{t("Margine dopo spese generali")}</small><strong>{totals.costi_completi ? `${totals.margine_totale_pct.toFixed(1)}%` : t("Da completare")}</strong></div></div>
    </section><aside><QuoteLivePreviewPanel template={{ name: "Bozza locale in composizione · da verificare", primary_color: "#173f39" }} companyName={companyName} clientName="Cliente sintetico" title={titolo} validityDays={30} items={items} subtotal={totals.subtotale} net={totals.subtotale_netto} total={totals.totale} vatBreakdown={totals.iva_breakdown} discountPercent={sconto} manualPrice={false} showPrices onlyTotal={false} showDiscounts showNotes showConditions={false} showSignature={false} notes="SIMULAZIONE: documento non utilizzabile come offerta." paymentMethod="Simulazione, nessun pagamento" paymentPhases={[]} />
      <section className="simulation-journal"><h2>{t("Registro della prova")}</h2><p><strong data-testid="demo-request-count">{demo.richieste}</strong> {t("analisi simulate")} · <strong>0</strong> {t("chiamate AI reali")} · <strong>0</strong> {t("scritture sul server")}</p><ol>{demo.eventi.map((event, i) => <li key={i}>{event}</li>)}</ol></section>
    </aside></div>}
  </main>;
}
