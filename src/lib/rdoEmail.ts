/**
 * Testo dell'email con cui si chiede un'offerta a un fornitore.
 *
 * Differenza sostanziale rispetto all'email di un ordine: qui i prezzi non
 * ci sono. Si manda l'elenco di cosa serve e per quando, e si chiede quanto
 * costa — quindi la tabella ha una colonna vuota da riempire, non un totale.
 *
 * Il codice della richiesta finisce nell'OGGETTO fra parentesi quadre. Non e'
 * decorazione: e' l'unico appiglio che permette di riconoscere la risposta
 * quando torna nella posta, perche' il client del fornitore se lo porta
 * dietro nel "Re:". Toglierlo significa rimettersi a smistare a mano.
 */

export interface RdoEmailRiga {
  descrizione: string;
  quantita: number | string;
  unita_misura?: string | null;
  note?: string | null;
}

export interface RdoEmailDati {
  rfqNumber: string;
  titolo: string;
  descrizione?: string | null;
  fornitoreNome?: string | null;
  aziendaNome?: string | null;
  dataFabbisogno?: string | null;
  scadenzaOfferte?: string | null;
  commessaCodice?: string | null;
  note?: string | null;
  righe: RdoEmailRiga[];
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const dataIt = (iso?: string | null) =>
  iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : null;

/** Il codice fra parentesi quadre e' cio' che rende riconoscibile la risposta. */
export function buildRdoEmailSubject(d: RdoEmailDati): string {
  return `Richiesta di offerta [${d.rfqNumber}] — ${d.titolo}`;
}

export function buildRdoEmailBody(d: RdoEmailDati): string {
  const fabbisogno = dataIt(d.dataFabbisogno);
  const scadenza = dataIt(d.scadenzaOfferte);

  const righe = d.righe.length
    ? d.righe
        .map(
          (r) => `<tr>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;">${esc(r.descrizione)}${
    r.note ? `<br><span style="color:#888;font-size:11px;">${esc(r.note)}</span>` : ""
  }</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${Number(r.quantita).toLocaleString("it-IT")} ${esc(r.unita_misura || "pz")}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:#bbb;">………</td>
</tr>`,
        )
        .join("")
    : `<tr><td colspan="3" style="padding:10px 8px;color:#888;font-style:italic;">Elenco in allegato.</td></tr>`;

  const condizioni = [
    fabbisogno ? `<li>Ci serve in cantiere entro il <strong>${esc(fabbisogno)}</strong></li>` : "",
    scadenza ? `<li>Vi chiediamo cortese riscontro entro il <strong>${esc(scadenza)}</strong></li>` : "",
    d.commessaCodice ? `<li>Riferimento cantiere: ${esc(d.commessaCodice)}</li>` : "",
  ]
    .filter(Boolean)
    .join("");

  return `<p>Spett.le <strong>${esc(d.fornitoreNome || "Fornitore")}</strong>,</p>
<p>Vi chiediamo cortese offerta per la fornitura seguente${d.titolo ? ` — <strong>${esc(d.titolo)}</strong>` : ""}.</p>
${d.descrizione ? `<p style="font-size:13px;">${esc(d.descrizione)}</p>` : ""}
<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr style="background:#eef2f7;">
    <th style="padding:6px 8px;text-align:left;">Descrizione</th>
    <th style="padding:6px 8px;text-align:right;">Q.tà</th>
    <th style="padding:6px 8px;text-align:right;">Vostro prezzo</th>
  </tr></thead>
  <tbody>${righe}</tbody>
</table>
${condizioni ? `<ul style="font-size:13px;">${condizioni}</ul>` : ""}
${d.note ? `<p style="font-size:13px;"><strong>Note:</strong> ${esc(d.note)}</p>` : ""}
<p style="font-size:13px;">Vi preghiamo di indicare anche <strong>tempi di consegna</strong>, <strong>validità dell'offerta</strong> e condizioni di pagamento.</p>
<p style="font-size:12px;color:#666;">Rispondendo a questa email lasciate pure il riferimento <strong>${esc(d.rfqNumber)}</strong> nell'oggetto: ci permette di abbinare subito la vostra offerta alla richiesta.</p>
<p>Cordiali saluti,<br>${esc(d.aziendaNome || "")}</p>`;
}
