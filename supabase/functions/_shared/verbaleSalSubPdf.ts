/**
 * Il PDF del verbale SAL di un subappaltatore.
 *
 * 10/11/2026: rifatto nello stile unico dei documenti (stileDocumenti.ts), come il verbale SAL del
 * committente: testata con il logo a sinistra e il titolo a destra, i tre numeri che contano in
 * riquadri (lordo, ritenuta, netto), la tabella dei lavori misurati, il benestare alla fatturazione,
 * le firme con il timbro. Prima ogni sezione aveva un paragrafo di avvertenze grigie e le righe
 * «non registrato» riempivano il foglio: ora si mostra solo quello che c'è, e le avvertenze sono una.
 * I conti (verificaVerbaleSalSub, benestareFatturazione, quadro delle garanzie) non cambiano.
 */
import pdfMake from "pdfmake";
import vfs from "pdfmake-fonts";
import { benestareFatturazione, type VerbaleSalSub, verificaVerbaleSalSub } from "./verbaleSalSub.ts";
import { colore, pagina, riquadro, sezione, tabella, testata } from "./stileDocumenti.ts";
pdfMake.addVirtualFileSystem(vfs);

// «always»: senza, in italiano 4000 resta senza il punto delle migliaia.
const euro = (n: unknown) =>
  Number(n).toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions);
const quantita = (n: unknown) =>
  Number(n).toLocaleString("it-IT", { maximumFractionDigits: 3, useGrouping: "always" } as Intl.NumberFormatOptions);
const data = (s: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(s)
    ? s.slice(0, 10).split("-").reverse().join("/")
    : s;
const ACCENTO = colore.accentoPredefinito;

const STATI: Record<string, { testo: string; colore: string }> = {
  ricevuto: { testo: "Da verificare", colore: colore.avviso },
  verificato: { testo: "Verificato", colore: colore.positivo },
  pagato: { testo: "Pagato", colore: colore.positivo },
  contestato: { testo: "Contestato", colore: "#B91C1C" },
};

/** logoImpresa: data URL PNG/JPEG del logo; resta fuori dal modello salvato del verbale. */
// deno-lint-ignore no-explicit-any
export function layoutVerbaleSalSub(d: VerbaleSalSub, logoImpresa: string | null = null): any {
  const r = verificaVerbaleSalSub(d);
  const benestare = benestareFatturazione(d, r);
  const logo = typeof logoImpresa === "string" && /^data:image\/(png|jpeg);base64,/.test(logoImpresa) ? logoImpresa : null;
  const stato = STATI[d.sal.stato] ?? { testo: d.sal.stato, colore: colore.testoTenue };

  const titoloSezione = (t: string) => ({
    text: t.toUpperCase(),
    style: "sezione",
    headlineLevel: 1,
    margin: [0, sezione.spazioPrima, 0, sezione.spazioDopo],
  });
  // Una funzione, non un oggetto: pdfmake scrive le posizioni dentro il nodo, e un nodo riusato disegna righe vaganti.
  const filettoSezione = () => ({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: sezione.filetto, lineColor: colore.linea }], margin: [0, -4, 0, 6] });
  const nota = (t: string, extra: Record<string, unknown> = {}) => ({ text: t, style: "nota", margin: [0, 3, 0, 3], ...extra });
  const etichetta = (t: string) => ({ text: t.toUpperCase(), style: "etichetta" });
  // Solo le righe che hanno un valore: niente «non registrato».
  const righe = (...v: Array<string | null | undefined | false>) => v.filter((x): x is string => !!x && !!x.trim());
  const sezioneIntera = (titolo: string, corpo: unknown[]) => ({ unbreakable: true, stack: [titoloSezione(titolo), filettoSezione(), ...corpo] });
  const layoutTabella = {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 ? 0 : i === node.table.body.length ? tabella.filettoTotale : tabella.filetto),
    vLineWidth: () => 0,
    hLineColor: () => colore.linea,
    paddingLeft: () => tabella.paddingOrizzontale,
    paddingRight: () => tabella.paddingOrizzontale,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  };
  const th = (t: string, alignment = "left") => ({ text: t.toUpperCase(), style: "th", alignment, fillColor: colore.fondoIntestazione });
  const riga = (a: string, b: string, forte = false) => [
    { text: a, bold: forte },
    { text: b, alignment: "right", bold: forte, noWrap: true },
  ];
  const box = (stack: unknown[], fill: string = colore.fondoTenue) => ({
    table: { widths: ["*"], body: [[{ stack, fillColor: fill, margin: [riquadro.padding - 4, riquadro.padding - 4, riquadro.padding - 4, riquadro.padding - 4] }]] },
    layout: { hLineWidth: () => riquadro.bordo, vLineWidth: () => riquadro.bordo, hLineColor: () => colore.linea, vLineColor: () => colore.linea },
  });

  // ── Testata: logo (o ragione sociale) a sinistra, titolo e stato a destra, filetto d'accento.
  const testataSinistra = logo
    ? { image: logo, fit: [testata.logoLarghezzaMax, testata.logoAltezza], width: testata.logoLarghezzaMax }
    : { width: "*", stack: [{ text: d.impresa.ragione_sociale, fontSize: testata.ragioneSocialeCorpo, bold: true }] };
  const contenuto: unknown[] = [
    {
      columns: [
        testataSinistra,
        {
          width: "*",
          alignment: "right",
          stack: [
            { text: "Verbale SAL del subappaltatore", fontSize: testata.titoloCorpo, bold: true },
            { text: `SAL n. ${d.sal.numero_sal} · ${data(d.sal.data_emissione)} · lavori dal ${data(d.periodo_dal)} al ${data(d.periodo_al)}`, fontSize: testata.sottotitoloCorpo, color: colore.testoTenue, margin: [0, 3, 0, 4] },
            { text: stato.testo.toUpperCase(), fontSize: 7, bold: true, color: stato.colore },
          ],
        },
      ],
      columnGap: 12,
    },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: testata.filettoSpessore, lineColor: ACCENTO }], margin: [0, testata.filettoDistanza, 0, testata.spazioDopo - 4] },

    // ── Le parti e il contratto.
    box([
      {
        columns: [
          { stack: [etichetta("Impresa affidataria"), { text: d.impresa.ragione_sociale, bold: true, margin: [0, 2, 0, 1] },
            ...righe(d.impresa.partita_iva && `P.IVA ${d.impresa.partita_iva}`, d.impresa.indirizzo, d.contratto.responsabile_impresa && `Referente: ${d.contratto.responsabile_impresa}`).map((t) => ({ text: t, color: colore.testoTenue }))] },
          { stack: [etichetta("Subappaltatore"), { text: d.sub.ragione_sociale, bold: true, margin: [0, 2, 0, 1] },
            ...righe(d.sub.piva && `P.IVA ${d.sub.piva}`, d.sub.indirizzo, (d.contratto.referente_subappaltatore || d.sub.responsabile) && `Referente: ${d.contratto.referente_subappaltatore || d.sub.responsabile}`).map((t) => ({ text: t, color: colore.testoTenue }))] },
        ],
        columnGap: 18,
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: colore.linea }], margin: [0, 8, 0, 6] },
      {
        columns: [
          { stack: [etichetta("Contratto"), { text: d.contratto.numero_contratto ? `n. ${d.contratto.numero_contratto}` : "Contratto di subappalto", margin: [0, 2, 0, 0] }] },
          { stack: [etichetta("Commessa"), { text: [d.commessa.order_code, d.commessa.description].filter(Boolean).join(" — ") || "—", margin: [0, 2, 0, 0] }] },
          ...(d.commessa.work_address ? [{ stack: [etichetta("Cantiere"), { text: d.commessa.work_address, margin: [0, 2, 0, 0] }] }] : []),
        ],
        columnGap: 18,
      },
    ]),

    // ── I tre numeri che contano.
    {
      columns: [
        box([etichetta("Lavori di questo SAL"), { text: euro(r.lordo), fontSize: riquadro.numeroCorpo, margin: [0, 3, 0, 0] }, { text: "lordo, IVA esclusa", style: "nota" }]),
        box([etichetta(`Ritenuta di garanzia ${d.sal.ritenuta_pct}%`), { text: euro(r.ritenuta), fontSize: riquadro.numeroCorpo, margin: [0, 3, 0, 0] }, { text: "si paga allo svincolo", style: "nota" }]),
        box([etichetta("Netto del SAL"), { text: euro(r.netto), fontSize: riquadro.numeroCorpo, bold: true, color: ACCENTO, margin: [0, 3, 0, 0] }, { text: "imponibile della fattura", style: "nota" }]),
      ],
      columnGap: 8,
      margin: [0, 10, 0, 0],
    },

    // ── I lavori.
    titoloSezione("Lavori del periodo"),
    filettoSezione(),
    { text: d.contratto.descrizione_lavori, margin: [0, 0, 0, 6] },
  ];

  if (d.lavori?.length) {
    const totale = d.lavori.reduce((s, l) => s + Number(l.importo), 0);
    contenuto.push({
      table: {
        headerRows: 1,
        keepWithHeaderRows: 1,
        widths: ["*", 70, 62, 70],
        body: [
          [th("Lavorazione"), th("Quantità", "right"), th("Prezzo", "right"), th("Importo", "right")],
          ...d.lavori.map((l) => [
            {
              stack: [
                { text: l.descrizione },
                { text: `rilievo del ${data(l.data_rilievo)}${l.riferimento ? ` · ${l.riferimento}` : ""}`, style: "nota" },
              ],
            },
            {
              stack: [
                { text: `${quantita(l.quantita_riconosciuta)} ${l.unita}`, alignment: "right", noWrap: true },
                // La quantità dichiarata dal subappaltatore si mostra solo se diversa da quella riconosciuta.
                ...(Number(l.quantita_dichiarata) !== Number(l.quantita_riconosciuta)
                  ? [{ text: `dichiarata ${quantita(l.quantita_dichiarata)}`, style: "nota", alignment: "right" }]
                  : []),
              ],
            },
            { text: euro(l.prezzo_unitario), alignment: "right", noWrap: true },
            { text: euro(l.importo), alignment: "right", noWrap: true },
          ]),
          [{ text: "Totale lavori del SAL", bold: true }, "", "", { text: euro(totale), bold: true, alignment: "right", noWrap: true }],
        ],
      },
      layout: layoutTabella,
    });
    contenuto.push(nota("Quantità riconosciute dall'impresa dopo la verifica delle misure, ai prezzi del contratto. Per i lavori a corpo 1 quota vale il 100% del lavoro."));
  }
  if (d.sal.note) contenuto.push({ text: d.sal.note, margin: [0, 4, 0, 0] });
  if (d.sal.note_contestazione) contenuto.push({ text: `Contestazione: ${d.sal.note_contestazione}`, color: STATI.contestato.colore, margin: [0, 6, 0, 0] });

  // ── Il riepilogo del contratto.
  const contratto = Number(d.contratto.importo_contrattuale) + Number(d.contratto.oneri_sicurezza);
  const riconosciuto = ["verificato", "pagato"].includes(d.sal.stato);
  contenuto.push(sezioneIntera("Riepilogo del contratto", [
    {
      table: {
        widths: ["*", 120],
        body: [
          riga("Importo del contratto (lavori)", euro(d.contratto.importo_contrattuale)),
          ...(Number(d.contratto.oneri_sicurezza) > 0 ? [riga("Oneri della sicurezza", euro(d.contratto.oneri_sicurezza))] : []),
          riga("SAL precedenti riconosciuti", euro(r.precedenteRiconosciuto)),
          riga(riconosciuto ? "Questo SAL" : "Questo SAL (entra nel cumulativo dopo la verifica)", euro(r.lordo)),
          riga(riconosciuto ? "Lavori riconosciuti a tutto questo SAL" : "Lavori riconosciuti finora", euro(r.cumulativoRiconosciuto), true),
          // Lavori più oneri meno il riconosciuto; oltre il contratto si dice, non si nasconde.
          ...(contratto > 0
            ? [contratto - Number(r.cumulativoRiconosciuto) >= 0
              ? riga("Resta del contratto (lavori e oneri)", euro(contratto - Number(r.cumulativoRiconosciuto)))
              : riga("Oltre il contratto (lavori e oneri)", euro(Number(r.cumulativoRiconosciuto) - contratto), true)]
            : []),
        ],
      },
      layout: layoutTabella,
    },
  ]));

  // ── Il benestare alla fatturazione.
  contenuto.push({
    unbreakable: true,
    margin: [0, 14, 0, 0],
    table: {
      widths: ["*"],
      body: [[{
        fillColor: benestare.autorizzato ? "#ECFDF5" : "#FFFBEB",
        margin: [10, 8, 10, 8],
        stack: [
          { text: benestare.titolo.toUpperCase(), bold: true, fontSize: 9, color: benestare.autorizzato ? colore.positivo : colore.avviso },
          { text: benestare.testo, margin: [0, 4, 0, 4] },
          ...(benestare.righe.length
            ? [{
              table: {
                widths: ["*", 110],
                body: benestare.righe.map(([a, b], i) => [
                  { text: a, bold: i === benestare.righe.length - 1 },
                  { text: b, bold: i === benestare.righe.length - 1, alignment: "right", noWrap: true },
                ]),
              },
              layout: "noBorders",
              margin: [0, 2, 0, 4],
            }]
            : []),
          ...benestare.istruzioni.map((t) => ({ text: `• ${t}`, fontSize: pagina.nota, margin: [0, 1, 0, 1] })),
        ],
      }]],
    },
    layout: { hLineColor: () => (benestare.autorizzato ? "#6EE7B7" : "#FCD34D"), vLineColor: () => (benestare.autorizzato ? "#6EE7B7" : "#FCD34D") },
  });

  // ── Garanzie: solo quello che c'è.
  const garanzie: unknown[] = [];
  const aliquotaContratto = d.contratto.ritenuta_garanzia_pct;
  if (aliquotaContratto != null && Number(aliquotaContratto) !== Number(d.sal.ritenuta_pct)) {
    garanzie.push(nota(`La ritenuta di questo SAL (${d.sal.ritenuta_pct}%) è diversa da quella del contratto (${aliquotaContratto}%): verificare l'accordo valido per il periodo.`, { color: colore.avviso }));
  }
  if (d.garanzie) {
    const voci: Array<[string, number]> = [
      ["Ritenute maturate sui SAL riconosciuti", r.garanzie.maturate],
      ["Ancora trattenute", r.garanzie.trattenute],
      ["Svincolate", r.garanzie.svincolate],
      ["Perse", r.garanzie.perse],
      ["Coperte da fideiussione", r.garanzie.fideiussioni],
    ];
    const conValore = voci.filter(([, v], i) => i === 0 || Math.abs(Number(v)) >= 0.005);
    garanzie.push({ table: { widths: ["*", 120], body: conValore.map(([a, v]) => riga(a, euro(v))) }, layout: layoutTabella });
  }
  if (d.contratto.garanzie) garanzie.push({ text: d.contratto.garanzie, margin: [0, 6, 0, 0] });
  const date = righe(
    d.contratto.durata_garanzia_mesi != null && `durata ${d.contratto.durata_garanzia_mesi} mesi`,
    d.contratto.data_fine_effettiva && `fine lavori ${data(d.contratto.data_fine_effettiva)}`,
    !d.contratto.data_fine_effettiva && d.contratto.data_fine_prevista && `fine lavori prevista ${data(d.contratto.data_fine_prevista)}`,
  );
  if (date.length) garanzie.push(nota(`Garanzia: ${date.join(" · ")}.`));
  for (const a of r.garanzie.avvisi) garanzie.push(nota(a, { color: colore.avviso }));
  if (d.garanzie_non_attribuite) garanzie.push(nota(`${d.garanzie_non_attribuite} garanzie del contratto non sono collegate a un SAL e restano fuori da questo riepilogo.`));
  if (d.garanzie?.length) {
    const numeroSal = (id: string | null) => (id === d.sal.id ? d.sal.numero_sal : d.precedenti.find((s) => s.id === id)?.numero_sal);
    garanzie.push({
      table: {
        headerRows: 1,
        keepWithHeaderRows: 1,
        widths: [32, "*", 70, 110],
        body: [
          [th("SAL"), th("Stato"), th("Importo", "right"), th("Svincolo", "right")],
          ...d.garanzie.map((g) => [
            String(numeroSal(g.sal_id) ?? "—"),
            { stack: [{ text: `${g.stato}${g.fideiussione ? " · fideiussione" : ""}` }, ...(g.note ? [{ text: g.note, style: "nota" }] : [])] },
            { text: euro(g.importo), alignment: "right", noWrap: true },
            { text: g.data_svincolo_effettiva ? `svincolata il ${data(g.data_svincolo_effettiva)}` : g.data_svincolo_prevista ? `prevista il ${data(g.data_svincolo_prevista)}` : "—", alignment: "right" },
          ]),
        ],
      },
      layout: layoutTabella,
      margin: [0, 6, 0, 0],
    });
  }
  if (garanzie.length) contenuto.push(sezioneIntera("Garanzie", garanzie));

  // ── Pagamento: le condizioni, e il pagamento registrato se c'è.
  const pagamento: unknown[] = [];
  // Col benestare le condizioni di pagamento sono già lì dentro.
  if (d.contratto.modalita_pagamento && !benestare.autorizzato) pagamento.push({ text: d.contratto.modalita_pagamento });
  if (d.sal.stato === "pagato") {
    pagamento.push({
      text: `Pagato${d.sal.data_pagamento ? ` il ${data(d.sal.data_pagamento)}` : ""}${d.sal.payment_method ? ` · ${d.sal.payment_method}` : ""}${d.sal.payment_reference ? ` · rif. ${d.sal.payment_reference}` : ""}.`,
      margin: [0, 4, 0, 0],
    });
  }
  if (pagamento.length) contenuto.push(sezioneIntera("Pagamento", pagamento));

  // ── Osservazioni del verbale: le note lunghe possono scorrere tra le pagine.
  if (d.nota_verbale?.trim()) {
    contenuto.push({ unbreakable: d.nota_verbale.length < 1200, stack: [titoloSezione("Osservazioni e riserve"), filettoSezione(), { text: d.nota_verbale }] });
  }

  // ── Allegati.
  if (d.allegati.length) {
    contenuto.push(titoloSezione("Allegati"), filettoSezione());
    contenuto.push({
      table: {
        headerRows: 1,
        keepWithHeaderRows: 1,
        widths: ["*", 70, 40],
        body: [
          [th("Documento"), th("Stato"), th("Pagine", "right")],
          ...d.allegati.map((a) => [
            { stack: [{ text: `${a.titolo}${a.revisione ? ` · rev. ${a.revisione}` : ""}` }, { text: a.file_name, style: "nota" }] },
            a.stato,
            { text: String(a.pagine), alignment: "right" },
          ]),
        ],
      },
      layout: layoutTabella,
    });
    contenuto.push(nota("Le copie sono in coda al verbale; gli originali, con le eventuali firme digitali, sono nel pacchetto ZIP."));
  }

  // ── Firme.
  const firma = (ruolo: string) => ({
    stack: [
      { text: ruolo.toUpperCase(), style: "etichetta" },
      { canvas: [{ type: "line", x1: 0, y1: 34, x2: 230, y2: 34, lineWidth: 0.5, lineColor: colore.inchiostro }] },
      { text: "Firma e timbro · luogo e data", style: "nota", margin: [0, 3, 0, 0] },
    ],
  });
  contenuto.push({
    unbreakable: true,
    margin: [0, 18, 0, 0],
    stack: [
      { text: "Questo verbale riepiloga il SAL registrato: non è una fattura e non registra pagamenti.", style: "nota", margin: [0, 0, 0, 12] },
      { columns: [firma(benestare.autorizzato ? "L'impresa affidataria (benestare)" : "L'impresa affidataria"), firma("Il subappaltatore")], columnGap: 30 },
    ],
  });

  const piede = [d.impresa.ragione_sociale, d.impresa.partita_iva ? `P.IVA ${d.impresa.partita_iva}` : null, d.impresa.indirizzo].filter(Boolean).join(" · ");
  const generato = new Date(d.generato_il).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });
  return {
    pageSize: "A4",
    pageMargins: [pagina.margineLaterale, pagina.margineAlto, pagina.margineLaterale, 52],
    defaultStyle: { font: "Roboto", fontSize: pagina.corpo - 0.5, lineHeight: 1.2, color: colore.inchiostro },
    info: {
      title: `Verbale SAL subappalto ${d.sal.numero_sal}`,
      author: d.impresa.ragione_sociale,
      creator: d.versione,
    },
    watermark: r.bozza ? { text: "BOZZA", color: "gray", opacity: 0.06 } : undefined,
    pageBreakBefore: (
      // deno-lint-ignore no-explicit-any
      node: any,
      // deno-lint-ignore no-explicit-any
      container: any,
    ) => node.headlineLevel === 1 && container.getFollowingNodesOnPage().length === 0,
    content: contenuto,
    styles: {
      sezione: { fontSize: sezione.corpo, bold: true, color: ACCENTO, characterSpacing: sezione.spaziatura },
      etichetta: { fontSize: riquadro.etichettaCorpo, color: colore.testoTenue, characterSpacing: 0.4 },
      nota: { fontSize: pagina.nota, color: colore.testoTenue },
      th: { fontSize: tabella.intestazioneCorpo, bold: true, color: colore.testoTenue },
    },
    footer: (p: number, n: number) => ({
      margin: [pagina.margineLaterale, 10, pagina.margineLaterale, 0],
      stack: [
        { text: `${d.commessa.order_code || "Commessa"} · SAL ${d.sal.numero_sal} · generato il ${generato} · ${d.versione}`, fontSize: 6.5, color: colore.testoTenue, alignment: "center" },
        { text: piede, fontSize: 7, color: colore.testoTenue, alignment: "center", margin: [0, 2, 0, 0] },
        { text: `Pag. ${p} / ${n}`, fontSize: 7, color: colore.testoTenue, alignment: "center" },
      ],
    }),
  };
}
export async function pdfVerbaleSalSub(d: VerbaleSalSub, logoImpresa: string | null = null): Promise<Uint8Array> {
  return new Uint8Array(
    await pdfMake.createPdf(layoutVerbaleSalSub(d, logoImpresa)).getBuffer(),
  );
}
