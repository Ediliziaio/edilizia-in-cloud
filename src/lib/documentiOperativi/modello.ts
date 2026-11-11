import type { Company } from "@/types/auth";
export type TipoDocumentoOperativo =
  "richiesta" | "materiali" | "servizi" | "trasporti" | "economia";
export const TITOLI: Record<TipoDocumentoOperativo, string> = {
  richiesta: "Richiesta di offerta",
  materiali: "Ordine fornitore materiali",
  servizi: "Ordine di servizi e lavori",
  trasporti: "Rapporto trasporti mensile",
  economia: "Rapporto lavori in economia",
};
export interface RigaDocumentoOperativo {
  /** Metadati della versione inviata: non alterano il testo o il PDF. */
  origineId?: string;
  specifiche?: {
    riferimento?: string | null;
    sku?: string | null;
    misure?: Record<string, unknown> | null;
    colore?: string | null;
    apertura?: string | null;
    dettagli?: string | null;
  };
  nota?: string | null;
  descrizione: string;
  unita: string;
  quantita: number;
  prezzo: number | null;
  sconto?: number;
  iva?: number | null;
  importo?: number;
  gruppo?: string;
  data?: string;
  carico?: string;
  scarico?: string;
  mezzo?: string;
  oreUomo?: number;
  oreMezzo?: number;
  ddt?: string;
}
export interface DocumentoOperativo {
  prezziDaConfermare?: boolean;
  fornitoreId?: string;
  referenteEmail?: string | null;
  referenteTelefono?: string | null;
  referentiFornitore?: import("@/lib/suppliers/anagraficaFornitore").ReferenteFornitore[];
  indirizzoCantiere?: string | null;
  destinazioneTipo?: "cantiere" | "magazzino" | "ritiro" | "altro";
  magazzinoId?: string | null;
  ritiroIndirizzo?: string | null;
  ritiroNote?: string | null;
  referenteConsegna?: string | null;

  tipo: TipoDocumentoOperativo;
  numero: string;
  data?: string | null;
  destinatario: {
    nome: string;
    indirizzo?: string | null;
    partitaIva?: string | null;
    email?: string | null;
  };
  commessa?: string | null;
  codiceCliente?: string | null;
  luogo?: string | null;
  periodo?: string | null;
  riferimento?: string | null;
  consegna?: string | null;
  scadenzaOfferta?: string | null;
  referente?: string | null;
  inizioLavori?: string | null;
  fineLavori?: string | null;
  pagamento?: string | null;
  banca?: string | null;
  iban?: string | null;
  note?: string | null;
  noteConsegna?: string | null;
  noteNelMessaggio?: boolean;
  condizioni?: string | null;
  inversioneContabile?: boolean;
  /** Quale lettera dell'art. 17 c. 6 cita il documento; senza, la dicitura generica. */
  clausolaInversione?: ClausolaInversione | null;
  righe: RigaDocumentoOperativo[];
  totali?: { imponibile: number; iva: number; totale: number };
}
export type ClausolaInversione = "a" | "a-ter";
export const CLAUSOLE_INVERSIONE: { value: ClausolaInversione; label: string; norma: string }[] = [
  { value: "a", label: "Subappalto edile (lett. a)", norma: "art. 17 c. 6 lett. a DPR 633/72" },
  { value: "a-ter", label: "Pulizia, demolizione, impianti, completamento (lett. a-ter)", norma: "art. 17 c. 6 lett. a-ter DPR 633/72" },
];
/** La frase stampata su PDF: una sola, per PDF e anteprime. */
export function testoInversioneContabile(d: Pick<DocumentoOperativo, "clausolaInversione">): string {
  const norma = CLAUSOLE_INVERSIONE.find((c) => c.value === d.clausolaInversione)?.norma ?? "art. 17 c. 6 DPR 633/72";
  return `Inversione contabile, ${norma}: fattura senza IVA.`;
}
export type AziendaDocumento = Pick<Company, "id" | "name"> & Partial<Company> & {
  /** I dati societari, per il piè di pagina: li carica `generaPdfOperativo`. */
  righeSocietarie?: string[];
  /** Il carattere del piè, in base64, per le aziende che ne hanno uno proprio: lo carica `generaPdfOperativo`. */
  fontPiede?: string | null;
};
export const testo = (v: unknown) => String(v ?? "").trim();
export const esc = (v: unknown) =>
  testo(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export const dataIt = (v?: string | null) =>
  v && /^\d{4}-\d{2}-\d{2}/.test(v)
    ? v.slice(0, 10).split("-").reverse().join("/")
    : testo(v);
export const numeroIt = (v: number) =>
  v.toLocaleString("it-IT", { maximumFractionDigits: 2 });
/** Le ore di un viaggio: «—» se non ci sono, non «0» (10/11/2026). */
export const oreIt = (v?: number | null) =>
  v != null && Number.isFinite(v) && v > 0 ? numeroIt(v) : "—";
/**
 * 1.234,56 sempre col separatore delle migliaia: l'it-IT di ICU non lo mette sotto le 5 cifre («4570,24»),
 * mentre gli altri documenti scrivono «4.570,24» (10/11/2026, stile unico).
 */
export const importoIt = (v: number) => {
  const [intero, decimali] = Math.abs(v).toFixed(2).split(".");
  return `${v < 0 ? "-" : ""}${intero.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimali}`;
};
export const euro = (v: number) => `${importoIt(v)} €`;
export const importoRiga = (r: RigaDocumentoOperativo) =>
  r.importo ??
  Math.round(r.quantita * (r.prezzo ?? 0) * (1 - (r.sconto ?? 0) / 100) * 100) /
    100;
/** Cambiare quantità o prezzo ricalcola anche una riga con importo già valorizzato. */
export function modificaNumeroRigaDocumento(r: RigaDocumentoOperativo, key: string, value: string): RigaDocumentoOperativo {
  if (!["quantita", "prezzo", "sconto", "iva", "oreUomo", "oreMezzo"].includes(key)) throw new Error("Campo numerico non valido");
  return { ...r, ...(["quantita", "prezzo", "sconto"].includes(key) ? { importo: undefined } : {}), [key]: value === "" ? null : Number(value) };
}
/**
 * Cosa conta il totale dei lavori in economia (11/11/2026), scritto sotto il totale in 8 pt.
 * Il rendiconto d'appalto sullo stesso periodo dà un altro numero (vedi RendicontoAppaltoPDF):
 * finché il titolare non decide se unirli, ciascuno dice cosa comprende.
 *   · manodopera: le ore delle presenze, straordinari compresi (campo_presenze_effettive);
 *   · voci extra del rapportino (quadro.voci), col loro prezzo di vendita;
 *   · materiali e mezzi: righe con le quantità e prezzo «Da definire» → nel totale solo se
 *     qualcuno ci scrive un prezzo (importoRiga con prezzo null vale 0).
 */
export const NOTA_TOTALE_ECONOMIA =
  "Comprende manodopera, straordinari e voci extra dei rapportini; materiali e mezzi sono elencati con le quantità e contano nel totale solo se hanno un prezzo.";

export function totaliDocumento(d: DocumentoOperativo) {
  if (d.tipo === "economia") {
    // Rapporto delle quantità e tariffe IVA escluse, come il modello approvato.
    const imponibile =
      Math.round(d.righe.reduce((sum, r) => sum + importoRiga(r), 0) * 100) /
      100;
    return { imponibile, iva: 0, totale: imponibile };
  }
  if (d.totali) return d.totali;
  const imponibile = d.righe.reduce((s, r) => s + importoRiga(r), 0);
  const iva = d.inversioneContabile
    ? 0
    : d.righe.reduce(
        (s, r) => s + Math.round(importoRiga(r) * (r.iva ?? 0)) / 100,
        0,
      );
  return {
    imponibile: Math.round(imponibile * 100) / 100,
    iva: Math.round(iva * 100) / 100,
    totale: Math.round((imponibile + iva) * 100) / 100,
  };
}
export function footerAzienda(a: AziendaDocumento): [string, string] {
  const sede = [
    a.legal_address,
    a.legal_postal_code,
    a.legal_city,
    a.legal_province,
  ]
    .filter(Boolean)
    .join(" ");
  const operativa = [
    a.operational_address,
    a.operational_postal_code,
    a.operational_city,
    a.operational_province,
  ]
    .filter(Boolean)
    .join(" ");
  return [
    [
      a.business_name || a.name,
      sede && `Sede legale: ${sede}`,
      a.vat_number && `P.IVA ${a.vat_number}`,
      a.fiscal_code && `C.F. ${a.fiscal_code}`,
    ]
      .filter(Boolean)
      .join(" · "),
    [
      operativa && operativa !== sede && `Sede operativa: ${operativa}`,
      a.phone,
      a.email,
      a.pec && `PEC ${a.pec}`,
      a.website,
    ]
      .filter(Boolean)
      .join(" · "),
  ];
}
export const senzaPrezzi = (d: DocumentoOperativo) =>
  !!d.prezziDaConfermare && (d.tipo === "materiali" || d.tipo === "servizi");
export const TESTO_PREZZI_DA_CONFERMARE =
  "Prezzi da confermare dal fornitore. Vi chiediamo di inviare la vostra conferma d’ordine originale con prezzi, importi e condizioni economiche.";
export function condizioniDocumento(d: DocumentoOperativo): string {
  const rif = `${d.numero}${d.commessa ? ` - Commessa ${d.commessa}` : ""}`;
  const standard =
    d.tipo === "richiesta"
      ? `Rispondete alla email con cui avete ricevuto questa richiesta, lasciando il riferimento ${d.numero} nell'oggetto.\nLe voci che non fornite lasciatele vuote o segnatele come «non disponibile».\nQuesta è una richiesta di prezzo: non è un ordine e non ci impegna all'acquisto.`
      : d.tipo === "materiali"
        ? `Confermateci data di consegna e prezzi rispondendo alla email con cui ricevete questo ordine.\nRiportate «Ordine ${rif}» su DDT e fattura: così li abbiniamo subito all'ordine.\nAvvisateci almeno il giorno prima dello scarico. Merce diversa dall'ordine o prezzi diversi vanno concordati prima della consegna.`
        : d.tipo === "servizi"
          ? `Il prezzo comprende quanto descritto in questo ordine e nel preventivo richiamato.\nLavori extra o varianti si eseguono e si pagano solo se approvati da noi per iscritto prima di farli.\nIn fattura riportate «Ordine ${rif}».`
          : d.tipo === "trasporti"
            ? "Riepilogo dei trasporti eseguiti: non è una fattura. Verificate i DDT citati e allegateli prima dell'invio. Si richiede conferma delle quantità e degli importi prima della fatturazione."
            : "La firma vale come conferma delle quantità eseguite in economia. Il rapporto non è una fattura.";
  return [
    senzaPrezzi(d) &&
    !(d.condizioni ?? "").startsWith(TESTO_PREZZI_DA_CONFERMARE)
      ? TESTO_PREZZI_DA_CONFERMARE
      : null,
    d.condizioni ?? standard,
  ]
    .filter(Boolean)
    .join("\n");
}
export function dettagliDocumento(d: DocumentoOperativo): [string, string][] {
  return (
    [
      ["Commessa", d.commessa],
      ["Nostro codice cliente", d.codiceCliente],
      [
        d.tipo === "servizi"
          ? "Luogo dei lavori"
          : "Luogo di consegna / intervento",
        d.luogo,
      ],
      ["Periodo", d.periodo],
      ["Riferimento", d.riferimento],
      ["Consegna richiesta", dataIt(d.consegna)],
      ["Rispondere entro", dataIt(d.scadenzaOfferta)],
      [
        "Referente fornitore",
        [d.referente, d.referenteEmail, d.referenteTelefono]
          .filter(Boolean)
          .join(" · "),
      ],
      ["Referente consegna", d.referenteConsegna],
      ["Inizio lavori", dataIt(d.inizioLavori)],
      ["Fine lavori", dataIt(d.fineLavori)],
      ["Pagamento", d.pagamento],
      ["Istruzioni di consegna / accesso", d.noteConsegna],
      ["Banca", d.banca],
      ["IBAN", d.iban],
    ] as [string, string | null | undefined][]
  ).filter((v): v is [string, string] => !!testo(v[1]));
}
export function colonneDocumento(d: DocumentoOperativo): string[] {
  if (senzaPrezzi(d)) return ["N.", "Descrizione", "U.M.", "Q.tà"];
  if (d.tipo === "economia")
    return ["Voce", "U.M.", "Q.tà", "Prezzo", "Importo"];
  if (d.tipo === "trasporti")
    return [
      "Data",
      "Carico / scarico",
      "Mezzo",
      "Ore uomo",
      "Ore mezzo",
      "DDT",
      "Importo",
    ];
  return [
    "N.",
    "Descrizione",
    "U.M.",
    "Q.tà",
    "Prezzo unit.",
    "Sc. %",
    "Importo",
    ...(d.tipo === "richiesta" ? [] : ["IVA"]),
  ];
}
export function celleRiga(
  d: DocumentoOperativo,
  r: RigaDocumentoOperativo,
  i: number,
): string[] {
  if (d.tipo === "economia")
    return [
      [r.descrizione, r.nota].filter(Boolean).join("\n"),
      r.unita,
      numeroIt(r.quantita),
      r.prezzo == null ? "Da definire" : euro(r.prezzo),
      r.prezzo == null && r.importo == null
        ? "Da definire"
        : euro(importoRiga(r)),
    ];
  if (d.tipo === "trasporti")
    return [
      dataIt(r.data),
      [r.carico, r.scarico].filter(Boolean).join(" → ") || r.descrizione,
      r.mezzo || "—",
      oreIt(r.oreUomo),
      oreIt(r.oreMezzo),
      r.ddt || "—",
      r.prezzo == null && r.importo == null
        ? "Da definire"
        : euro(importoRiga(r)),
    ];
  if (senzaPrezzi(d))
    return [
      String(i + 1),
      [r.descrizione, r.nota].filter(Boolean).join("\n"),
      r.unita,
      numeroIt(r.quantita),
    ];
  const richiesta = d.tipo === "richiesta";
  return [
    String(i + 1),
    [r.descrizione, r.nota].filter(Boolean).join("\n"),
    r.unita,
    numeroIt(r.quantita),
    richiesta ? "" : r.prezzo == null ? "Da definire" : euro(r.prezzo),
    richiesta ? "" : numeroIt(r.sconto ?? 0),
    richiesta
      ? ""
      : r.prezzo == null && r.importo == null
        ? "Da definire"
        : euro(importoRiga(r)),
    ...(richiesta
      ? []
      : [
          d.inversioneContabile
            ? "Inv. cont."
            : r.iva == null
              ? "Da definire"
              : `${numeroIt(r.iva)}%`,
        ]),
  ];
}
export function documentoIncompleto(d: DocumentoOperativo): boolean {
  return (
    d.tipo !== "richiesta" &&
    d.righe.some(
      (r) =>
        (r.prezzo == null && r.importo == null) ||
        (d.tipo !== "economia" && !d.inversioneContabile && r.iva == null),
    )
  );
}
export const haImportiDocumento = (d: DocumentoOperativo): boolean => d.righe.some((r) => r.prezzo != null || r.importo != null);
export function corpoDocumento(
  d: DocumentoOperativo,
  a: AziendaDocumento,
  allegato = false,
): string {
  if (allegato)
    return `<p>Spett.le ${esc(d.destinatario.nome)},</p><p>in allegato ${esc(TITOLI[d.tipo].toLowerCase())} <strong>${esc(d.numero)}</strong>${d.commessa ? `, commessa ${esc(d.commessa)}` : ""}.</p>${senzaPrezzi(d) ? `<p><strong>${esc(TESTO_PREZZI_DA_CONFERMARE)}</strong></p>` : ""}${d.noteNelMessaggio && d.note ? `<p style="white-space:pre-line"><strong>Note:</strong> ${esc(d.note)}</p>` : ""}<p>Vi chiediamo cortese riscontro rispondendo a questa email e mantenendo il riferimento nell’oggetto.</p><p>Cordiali saluti,<br>${esc(a.business_name || a.name)}</p>`;
  const head = colonneDocumento(d)
    .map(
      (v) =>
        `<th style="padding:6px;border:1px solid #ddd;text-align:left">${esc(v)}</th>`,
    )
    .join("");
  const rows = d.righe
    .map(
      (r, i) =>
        `${r.gruppo && r.gruppo !== d.righe[i - 1]?.gruppo ? `<tr><td colspan="${colonneDocumento(d).length}" style="padding:8px;background:#f1f5f9"><strong>${esc(r.gruppo)}</strong></td></tr>` : ""}<tr>${celleRiga(
          d,
          r,
          i,
        )
          .map(
            (v) =>
              `<td style="padding:6px;border:1px solid #ddd;white-space:pre-line">${esc(v)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  const t = totaliDocumento(d);
  return `<p>Spett.le ${esc(d.destinatario.nome)},</p><h2>${esc(TITOLI[d.tipo])}</h2><p><strong>${esc(d.numero)}</strong> ${dataIt(d.data) ? `del ${esc(dataIt(d.data))}` : ""}</p>${d.destinatario.indirizzo ? `<p>${esc(d.destinatario.indirizzo)}</p>` : ""}${d.destinatario.partitaIva ? `<p>P.IVA ${esc(d.destinatario.partitaIva)}</p>` : ""}<ul>${dettagliDocumento(
    d,
  )
    .map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`)
    .join(
      "",
    )}</ul><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>${d.tipo === "richiesta" || senzaPrezzi(d) ? "" : `<p>${documentoIncompleto(d) ? "<strong>Riepilogo da completare: prezzi o IVA mancanti. Gli importi seguenti riguardano solo le voci valorizzate.</strong><br>" : ""}${d.tipo === "economia" ? `Totale IVA esclusa: ${haImportiDocumento(d) ? euro(t.imponibile) : "Da definire"}` : `Imponibile: ${euro(t.imponibile)}<br>IVA: ${d.inversioneContabile ? "Inversione contabile" : euro(t.iva)}<br><strong>Totale: ${euro(t.totale)}</strong>`}</p>`}${d.note ? `<p style="white-space:pre-line"><strong>Note:</strong> ${esc(d.note)}</p>` : ""}<p>${esc(condizioniDocumento(d))}</p><p>Cordiali saluti,<br>${esc(a.business_name || a.name)}</p>`;
}
export const nomeFileDocumento = (d: DocumentoOperativo) =>
  `${d.numero}-${d.tipo}`.replace(/[^a-zA-Z0-9_-]/g, "_") + ".pdf";

/** Controlli prima dell'email: l'anteprima può mostrare una bozza incompleta. */
export function erroriDocumento(d: DocumentoOperativo): string[] {
  const errors: string[] = [];
  if (!testo(d.numero)) errors.push("Indica il numero del documento.");
  if (!testo(d.destinatario.nome)) errors.push("Indica il destinatario.");
  if (!d.righe.length) errors.push("Aggiungi almeno una voce.");
  d.righe.forEach((r, i) => {
    const n = i + 1;
    if (d.tipo === "trasporti") {
      if (!r.data || !testo(r.carico) || !testo(r.scarico) || !testo(r.mezzo))
        errors.push(`Viaggio ${n}: completa data, carico, scarico e mezzo.`);
      if (
        [r.oreUomo, r.oreMezzo].some(
          (v) => v != null && (!Number.isFinite(v) || v < 0),
        )
      )
        errors.push(`Viaggio ${n}: le ore devono essere positive o zero.`);
    } else if (!testo(r.descrizione))
      errors.push(`Voce ${n}: indica la descrizione.`);
    if (!Number.isFinite(r.quantita) || r.quantita <= 0)
      errors.push(`Voce ${n}: indica una quantità maggiore di zero.`);
    if (senzaPrezzi(d)) return;
    if (d.tipo !== "richiesta" && r.prezzo == null && r.importo == null)
      errors.push(`Voce ${n}: indica il prezzo concordato.`);
    if (r.prezzo != null && (!Number.isFinite(r.prezzo) || r.prezzo < 0))
      errors.push(`Voce ${n}: il prezzo non può essere negativo.`);
    if (
      r.sconto != null &&
      (!Number.isFinite(r.sconto) || r.sconto < 0 || r.sconto > 100)
    )
      errors.push(`Voce ${n}: lo sconto deve essere tra 0 e 100.`);
    if (
      d.tipo !== "richiesta" &&
      d.tipo !== "economia" &&
      !d.inversioneContabile &&
      (r.iva == null || !Number.isFinite(r.iva) || r.iva < 0 || r.iva > 100)
    )
      errors.push(
        `Voce ${n}: indica l’aliquota IVA, anche zero se applicabile.`,
      );
  });
  return errors;
}
