/** Human-readable preview from known fields only. Never renders internal metadata/secrets. */
export function SilvioActionSummary({ payload, actionType }: { payload: Record<string, unknown>; actionType: string }) {
  const data = payload.input && typeof payload.input === "object" && !Array.isArray(payload.input)
    ? payload.input as Record<string, unknown> : payload;
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  const recipient = [text(data.client_name) ?? text(data.cliente_nome), text(data.client_email) ?? text(data.cliente_email) ?? text(data.to)].filter(Boolean).join(" · ");
  const amount = data.amount ?? data.amount_eur;
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data.righe) ? data.righe : [];
  const draft = ["create_quote_draft", "crea_preventivo_bozza", "preventivo_bozza", "bozza_preventivo"].includes(actionType);
  const report = actionType === "registra_rapportino";
  const subject = text(data.subject) ?? text(data.title) ?? text(data.titolo);
  return <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
    <p className="font-medium text-slate-700">{draft ? "Crea una bozza di preventivo. Non la invia al cliente." : report ? "Registra il rapportino come inviato all’ufficio. Non lo approva e non registra un pagamento." : "Controlla i dati prima di confermare."}</p>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 leading-relaxed">
      {recipient && <><dt className="text-slate-500">Destinatario</dt><dd className="break-words">{recipient}</dd></>}
      {subject && <><dt className="text-slate-500">Oggetto</dt><dd className="break-words">{subject}</dd></>}
      {typeof amount === "number" && Number.isFinite(amount) && <><dt className="text-slate-500">Importo indicato</dt><dd>{amount.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</dd></>}
      {items.length > 0 && <><dt className="text-slate-500">Voci</dt><dd>{items.length}</dd></>}
      {report && <>
        <dt className="text-slate-500">Commessa</dt><dd className="break-words">{text(data.commessa_codice) ?? "da verificare"}</dd>
        <dt className="text-slate-500">Persona</dt><dd>{text(data.per_utente_nome) ?? "Chi sta scrivendo"}</dd>
        <dt className="text-slate-500">Data lavoro</dt><dd>{text(data.data) ?? "Oggi (Italia)"}</dd>
        <dt className="text-slate-500">Ore ordinarie</dt><dd>{typeof data.ore === "number" && Number.isFinite(data.ore) ? `${data.ore} h` : "da verificare"}</dd>
        <dt className="text-slate-500">Straordinario</dt><dd>{typeof data.straordinario === "number" && Number.isFinite(data.straordinario) ? `${data.straordinario} h` : "0 h"}</dd>
        {text(data.descrizione_lavori) && <><dt className="text-slate-500">Lavori svolti</dt><dd className="break-words whitespace-pre-wrap">{text(data.descrizione_lavori)}</dd></>}
      </>}
    </dl>
    {items.length > 0 && <details>
      <summary className="min-h-8 cursor-pointer py-1.5 font-medium text-blue-800">Controlla le voci e i prezzi</summary>
      <ul className="space-y-2 pt-1">
        {items.map((raw, index) => {
          const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
          const quantity = item.quantity ?? item.quantita;
          const price = item.unit_price ?? item.prezzo_unitario;
          const vat = item.vat_rate ?? data.default_vat_rate ?? data.iva;
          return <li key={index} className="break-words border-t border-slate-200 pt-2">
            <p className="font-medium">{text(item.name) ?? text(item.description) ?? text(item.descrizione) ?? `Voce ${index + 1}`}</p>
            <p className="text-slate-600">Quantità: {typeof quantity === "number" && Number.isFinite(quantity) ? quantity : "da verificare"}{text(item.unit_of_measure) ?? text(item.unita) ? ` ${text(item.unit_of_measure) ?? text(item.unita)}` : ""} · Prezzo unitario: {typeof price === "number" && Number.isFinite(price) ? price.toLocaleString("it-IT", { style: "currency", currency: "EUR" }) : "da verificare"}</p>
            <p className="text-slate-600">IVA: {typeof vat === "number" && Number.isFinite(vat) ? `${vat}%` : "da verificare"}</p>
          </li>;
        })}
      </ul>
    </details>}
  </div>;
}
