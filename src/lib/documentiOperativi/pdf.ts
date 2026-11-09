import { jsPDF } from "jspdf";
import {
  normalizzaModelloPdf,
  rgbModello,
  type ModelloPdf,
} from "../../../supabase/functions/_shared/modelliPdfOperativi";
import { STANDARD_DOCUMENTI } from "./standard";
import {
  type AziendaDocumento,
  type DocumentoOperativo,
  type RigaDocumentoOperativo,
  TITOLI,
  senzaPrezzi,
  footerAzienda,
  condizioniDocumento,
  totaliDocumento,
  importoRiga,
  euro,
  numeroIt,
  dataIt,
  documentoIncompleto,
} from "./modello";

/** Layout comune, derivato dai cinque modelli operativi: identità aziendale,
 * fascia titolo, anagrafiche affiancate, tabella e riepiloghi. */
export function creaPdfOperativo(
  d: DocumentoOperativo,
  a: AziendaDocumento,
  logo?: string,
  personalizzazione?: ModelloPdf,
): jsPDF {
  const modello = normalizzaModelloPdf(d.tipo, personalizzazione);
  d = {
    ...d,
    condizioni: d.condizioni?.trim() || modello.condizioni || d.condizioni,
  };
  if (!modello.mostraLogo) logo = undefined;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setProperties({
    title: `${modello.titolo || TITOLI[d.tipo]} ${d.numero}`,
    author: a.business_name || a.name,
    subject: modello.titolo || TITOLI[d.tipo],
  });
  const left = modello.margine || 14,
    width = 210 - left * 2,
    bottom = 268,
    navy: [number, number, number] = modello.colore
      ? rgbModello(modello.colore)
      : [31, 58, 93];
  const riquadro = modello.coloreRiquadri
    ? rgbModello(modello.coloreRiquadri)
    : ([241, 244, 248] as [number, number, number]);
  const testoFascia: [number, number, number] =
    navy[0] * 0.299 + navy[1] * 0.587 + navy[2] * 0.114 > 165
      ? ([28, 40, 57] as [number, number, number])
      : ([255, 255, 255] as [number, number, number]);
  const accentInk: [number, number, number] = testoFascia[0] === 28 ? ([31, 58, 93] as [number, number, number]) : navy;
  const standard = STANDARD_DOCUMENTI[d.tipo];
  let y = 14;
  const safe = (v: string) =>
    v
      .replace(/\u00a0/g, " ")
      .replace(/[–—]/g, "-")
      .replace(/→/g, "> ")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"');
  const font = (size = 8.5, bold = false, muted = false) => {
    pdf.setFont(modello.carattere, bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(
      ...(muted ? ([99, 115, 137] as [number, number, number]) : ([28, 40, 57] as [number, number, number])),
    );
  };
  const lines = (value: string, w: number) =>
    pdf.splitTextToSize(safe(value), w) as string[];
  const head = () => {
    y = 12;
    if (modello.mostraLogo) {
      if (logo) {
        const info = pdf.getImageProperties(logo);
        const w =
          (Math.min(62, (17 * info.width) / info.height) * modello.scalaLogo) /
          100;
        pdf.addImage(
          logo,
          info.fileType,
          left,
          y,
          w,
          (w * info.height) / info.width,
        );
      } else {
        // Nessun logo di un'altra azienda: marchio testuale dell'azienda corrente.
        pdf.setFillColor(...navy);
        const logoScale = modello.scalaLogo / 100;
        pdf.roundedRect(left, y, 12 * logoScale, 12 * logoScale, 1, 1, "F");
        font(13 * logoScale, true);
        pdf.setTextColor(...testoFascia);
        const initials = (a.business_name || a.name)
          .split(/\s+/)
          .slice(0, 2)
          .map((v) => v[0])
          .join("")
          .toUpperCase();
        pdf.text(safe(initials), left + 6 * logoScale, y + 8 * logoScale, {
          align: "center",
        });
        font(12, true);
        pdf.text(
          lines(a.business_name || a.name, 115).slice(0, 2),
          left + 12 * logoScale + 4,
          y + 6,
        );
      }
    }
    y = modello.mostraLogo ? 28 : 12;
    pdf.setFillColor(...navy);
    pdf.roundedRect(left, y, width, 10, 0.6, 0.6, "F");
    font(11.5);
    pdf.setTextColor(...testoFascia);
    const title = modello.titolo || standard.titoloPdf;
    const reference = `N. ${safe(d.numero)}${d.data ? ` del ${dataIt(d.data)}` : ""}`;
    // Due righe nella fascia per titoli/riferimenti lunghi, senza sovrapposizioni.
    const titleWidth = pdf.getTextWidth(title);
    pdf.setFontSize(8);
    const compact = titleWidth + pdf.getTextWidth(reference) > width - 10;
    pdf.setFontSize(11.5);
    if (compact) {
      pdf.setFontSize(10);
      const titleFit = pdf.getTextWidth(title);
      if (titleFit > width - 6) pdf.setFontSize((10 * (width - 6)) / titleFit);
      pdf.text(title, left + 3, y + 4);
      pdf.setFontSize(7.5);
      pdf.text(reference, left + width - 3, y + 8, { align: "right" });
    } else {
      pdf.text(title, left + 3, y + 6.5);
      pdf.setFontSize(8);
      pdf.text(reference, left + width - 3, y + 6.5, { align: "right" });
    }
    y += 16;
  };
  const ensure = (h: number) => {
    if (y + h > bottom) {
      pdf.addPage();
      head();
    }
  };
  const paragraph = (text: string, size = 8.5, bold = false) => {
    size = modello.dimensioneTesto || size;
    const lead = Math.max(4.3, size * 0.5);
    font(size, bold);
    for (const line of lines(text, width)) {
      ensure(lead + 0.5);
      font(size, bold);
      pdf.text(line, left, y);
      y += lead;
    }
    y += 2;
  };
  const section = (title: string) => {
    ensure(10);
    font(8.5, false);
    pdf.setTextColor(...accentInk);
    pdf.text(safe(title), left, y);
    y += 5;
  };
  head();
  if (modello.introduzione) paragraph(modello.introduzione);
  const cardWidth = (width - 4) / 2;
  const recipient = [
    d.destinatario.nome,
    d.destinatario.indirizzo,
    d.destinatario.partitaIva && `P.IVA ${d.destinatario.partitaIva}`,
    d.destinatario.email,
  ].filter(Boolean) as string[];
  const rightTitle =
    d.destinazioneTipo === "ritiro" &&
    (d.tipo === "materiali" || d.tipo === "richiesta")
      ? "RITIRO PRESSO"
      : standard.destinazione;
  const destination =
    d.tipo === "economia"
      ? [
          d.commessa || "Da indicare",
          d.luogo,
          d.periodo && `Periodo ${d.periodo}`,
        ]
      : d.tipo === "trasporti"
        ? [
            d.periodo || "Da indicare",
            `${d.righe.length} viaggi - ${numeroIt(d.righe.reduce((s, r) => s + (r.oreUomo || 0), 0))} ore uomo - ${numeroIt(d.righe.reduce((s, r) => s + (r.oreMezzo || 0), 0))} ore mezzo`,
            d.commessa,
          ]
        : [
            d.luogo || "Da indicare",
            d.tipo === "richiesta" && d.commessa
              ? `Commessa ${d.commessa}`
              : null,
          ];
  const cardLines = (values: (string | null | undefined | false)[]) =>
    values
      .filter((v): v is string => !!v)
      .flatMap((v) => lines(v, cardWidth - 6));
  font(9, true);
  const l = cardLines(recipient),
    r = cardLines(destination);
  const cardH = Math.max(25, 12 + Math.max(l.length, r.length) * 4);
  [0, 1].forEach((i) => {
    const x = left + i * (cardWidth + 4);
    pdf.setDrawColor(210, 219, 231);
    pdf.roundedRect(x, y, cardWidth, cardH, 0.6, 0.6);
    font(7, false, true);
    pdf.text(i === 0 ? standard.destinatario : rightTitle, x + 3, y + 5);
    (i === 0 ? l : r).forEach((v, n) => {
      font(n === 0 ? 9 : 8, n === 0);
      pdf.text(v, x + 3, y + 11 + n * 4);
    });
  });
  y += cardH + 4;
  const meta: [string, string][] =
    d.tipo === "richiesta"
      ? [
          ["Rispondere entro", dataIt(d.scadenzaOfferta) || "Da indicare"],
          ["Materiale in cantiere entro", dataIt(d.consegna) || "Da indicare"],
          ["Referente", d.referenteConsegna || d.referente || "Da indicare"],
        ]
      : [
          ["Commessa", d.commessa || "Acquisto generico"],
          [
            d.tipo === "servizi" ? "Riferimento" : "Consegna richiesta",
            d.tipo === "servizi"
              ? d.riferimento || "Da indicare"
              : dataIt(d.consegna) || "Da indicare",
          ],
          [
            "Referente per la consegna",
            d.referenteConsegna || d.referente || "Da indicare",
          ],
        ];
  if (d.tipo !== "trasporti" && d.tipo !== "economia") {
    const mh =
      Math.max(...meta.map(([, v]) => lines(v, width / 3 - 7).length)) * 4 + 8;
    pdf.setFillColor(...riquadro);
    pdf.rect(left, y, width, mh, "F");
    meta.forEach(([k, v], i) => {
      font(6.5, false, true);
      pdf.text(k, left + (i * width) / 3 + 3, y + 4);
      font(8);
      pdf.text(lines(v, width / 3 - 7), left + (i * width) / 3 + 3, y + 8);
    });
    if (d.tipo === "servizi") {
      [
        ["Inizio lavori", dataIt(d.inizioLavori) || "Da indicare"],
        ["Fine lavori", dataIt(d.fineLavori) || "Da indicare"],
      ].forEach(([k, v], i) => {
        font(6.5, false, true);
        pdf.text(k, left + (i * width) / 3 + 3, y + mh - 5);
        font(8);
        pdf.text(v, left + (i * width) / 3 + 3, y + mh - 1);
      });
    }
    y += mh + 5;
  }
  if (d.riferimento && d.tipo !== "servizi")
    paragraph(`Riferimento: ${d.riferimento}`, 8);
  if (d.codiceCliente)
    paragraph(`Nostro codice cliente: ${d.codiceCliente}`, 8);
  if (d.referenteEmail || d.referenteTelefono)
    paragraph(
      `Referente fornitore: ${[d.referente, d.referenteEmail, d.referenteTelefono].filter(Boolean).join(" - ")}`,
      8,
    );
  if (d.tipo === "richiesta")
    paragraph(
      `Vi chiediamo la vostra migliore offerta per la fornitura qui sotto. Compilate le colonne vuote e rimandateci questo foglio, oppure inviateci la vostra offerta con il riferimento ${d.numero}.`,
      8.5,
    );
  if (d.tipo === "economia") {
    const categorie = [
      { titolo: "Manodopera", match: /manodopera|operaio/i },
      { titolo: "Materiali", match: /material/i },
      { titolo: "Mezzi e noli", match: /mezzo|mezzi|nolo|noli/i },
    ];
    const stats = categorie.map((c) => ({
      titolo: c.titolo,
      totale: d.righe
        .filter((r) => c.match.test(r.descrizione))
        .reduce((sum, r) => sum + importoRiga(r), 0),
    }));
    stats.push({
      titolo: "Totale periodo",
      totale: totaliDocumento(d).imponibile,
    });
    stats.forEach((c, i) => {
      const x = left + (i * (width + 3)) / 4;
      const w = (width - 9) / 4;
      pdf.setFillColor(...(i === 3 ? navy : ([243, 245, 248] as [number, number, number])));
      pdf.roundedRect(x, y, w, 21, 0.6, 0.6, "F");
      font(7, false, true);
      if (i === 3) pdf.setTextColor(...testoFascia);
      pdf.text(c.titolo, x + 2, y + 5);
      font(11, true);
      if (i === 3) pdf.setTextColor(...testoFascia);
      pdf.text(euro(c.totale), x + 2, y + 12);
      font(6.5, false, true);
      if (i === 3) pdf.setTextColor(...testoFascia);
      const entries =
        i < 3
          ? d.righe.filter((r) => categorie[i].match.test(r.descrizione))
          : d.righe;
      const detail =
        i === 3
          ? `${new Set(d.righe.map((r) => r.gruppo || "Intervento")).size} interventi`
          : i === 0
            ? `${numeroIt(entries.reduce((sum, r) => sum + (r.unita.toLowerCase() === "h" ? r.quantita : 0), 0))} ore`
            : `${entries.length} voci`;
      pdf.text(detail, x + 2, y + 17);
    });
    y += 27;
  }
  type Col = {
    title: string;
    width: number;
    align?: "right";
    value: (r: RigaDocumentoOperativo, i: number) => string;
    blank?: boolean;
  };
  const emptyPrices = d.tipo === "richiesta" || senzaPrezzi(d);
  const money = (v: number) =>
    v.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  let cols: Col[];
  if (d.tipo === "trasporti")
    cols = [
      { title: "DATA", width: 20, value: (r) => dataIt(r.data) },
      { title: "CARICO", width: 32, value: (r) => r.carico || r.descrizione },
      { title: "SCARICO", width: 32, value: (r) => r.scarico || "-" },
      { title: "MEZZO", width: 23, value: (r) => r.mezzo || "-" },
      {
        title: "ORE UOMO",
        width: 16,
        align: "right",
        value: (r) => numeroIt(r.oreUomo || 0),
      },
      {
        title: "ORE MEZZO",
        width: 16,
        align: "right",
        value: (r) => numeroIt(r.oreMezzo || 0),
      },
      { title: "DDT", width: 19, value: (r) => r.ddt || "-" },
      {
        title: "IMPORTO",
        width: 24,
        align: "right",
        value: (r) =>
          r.prezzo == null && r.importo == null
            ? "Da definire"
            : money(importoRiga(r)),
      },
    ];
  else {
    const economy = d.tipo === "economia";
    const discount =
      !economy &&
      (d.tipo === "richiesta" || d.righe.some((r) => (r.sconto || 0) > 0));
    const iva = !economy && d.tipo !== "richiesta" && !senzaPrezzi(d);
    const descWidth =
      182 -
      (economy ? 0 : 8) -
      13 -
      14 -
      24 -
      25 -
      (discount ? 18 : 0) -
      (iva ? 14 : 0);
    cols = [
      ...(economy
        ? []
        : [
            {
              title: "N.",
              width: 8,
              value: (_: RigaDocumentoOperativo, i: number) => String(i + 1),
            },
          ]),
      {
        title: economy
          ? "VOCE"
          : d.tipo === "servizi"
            ? "OGGETTO DEI LAVORI"
            : "DESCRIZIONE",
        width: descWidth,
        value: (r) => [r.descrizione, r.nota].filter(Boolean).join("\n"),
      },
      { title: "U.M.", width: 13, value: (r) => r.unita },
      {
        title: "Q.TÀ",
        width: 14,
        align: "right",
        value: (r) => numeroIt(r.quantita),
      },
      {
        title: "PREZZO",
        width: 24,
        align: "right",
        blank: emptyPrices,
        value: (r) =>
          emptyPrices ? "" : r.prezzo == null ? "Da definire" : money(r.prezzo),
      },
      ...(discount
        ? [
            {
              title: "SCONTO %",
              width: 18,
              align: "right" as const,
              blank: emptyPrices,
              value: (r: RigaDocumentoOperativo) =>
                emptyPrices ? "" : numeroIt(r.sconto || 0),
            },
          ]
        : []),
      {
        title: "IMPORTO",
        width: 25,
        align: "right",
        blank: emptyPrices,
        value: (r) =>
          emptyPrices
            ? ""
            : r.prezzo == null && r.importo == null
              ? "Da definire"
              : money(importoRiga(r)),
      },
      ...(iva
        ? [
            {
              title: "IVA",
              width: 14,
              align: "right" as const,
              value: (r: RigaDocumentoOperativo) =>
                d.inversioneContabile
                  ? "inv."
                  : r.iva == null
                    ? "Da definire"
                    : `${r.iva}%`,
            },
          ]
        : []),
    ];
  }
  cols.forEach((c) => {
    c.width *= width / 182;
  });
  const tableHeader = () => {
    ensure(10);
    pdf.setFillColor(...riquadro);
    pdf.rect(left, y, width, 7, "F");
    font(6.8);
    pdf.setTextColor(...accentInk);
    let x = left;
    cols.forEach((c) => {
      const ls = lines(c.title, c.width - 2);
      pdf.text(ls, c.align ? x + c.width - 1.5 : x + 1.5, y + 3.1, {
        align: c.align || "left",
      });
      x += c.width;
    });
    pdf.setDrawColor(...navy);
    pdf.line(left, y + 7, left + width, y + 7);
    y += 7;
  };
  let groupTotal = 0,
    currentGroup = "";
  const groupFooter = () => {
    if (currentGroup) {
      ensure(8);
      font(8, true);
      pdf.text(
        `Totale intervento  ${euro(groupTotal)}`,
        left + width - 2,
        y + 4,
        { align: "right" },
      );
      y += 10;
    }
  };
  if (d.tipo !== "economia") tableHeader();
  d.righe.forEach((row, index) => {
    if (d.tipo === "economia" && (index === 0 || row.gruppo !== currentGroup)) {
      groupFooter();
      currentGroup = row.gruppo || "Lavori in economia";
      groupTotal = 0;
      ensure(22);
      section(currentGroup);
      tableHeader();
    }
    font(8);
    const cells = cols.map((c) => lines(c.value(row, index), c.width - 3));
    const h = Math.max(9, Math.max(...cells.map((c) => c.length)) * 3.7 + 4);
    const reserveSubtotal =
      d.tipo === "economia" &&
      (index === d.righe.length - 1 ||
        d.righe[index + 1]?.gruppo !== row.gruppo)
        ? 10
        : 0;
    if (y + h + reserveSubtotal > bottom) {
      pdf.addPage();
      head();
      if (currentGroup) section(`${currentGroup} (segue)`);
      tableHeader();
    }
    // Ogni riga resta intera quando possibile; descrizioni molto lunghe proseguono con testata ripetuta.
    const count = Math.max(1, ...cells.map((c) => c.length));
    let segmentStart = y;
    for (let n = 0; n < count; n++) {
      if (y + 7 > bottom) {
        pdf.addPage();
        head();
        tableHeader();
        segmentStart = y;
      }
      if (modello.righeAlternate && index % 2 === 1) {
        pdf.setFillColor(...riquadro);
        pdf.rect(
          left,
          y,
          width,
          n === count - 1 ? Math.max(6.7, 9 - (count - 1) * 3.7) : 3.7,
          "F",
        );
      }
      let x = left;
      cols.forEach((c, i) => {
        if (cells[i][n]) {
          font(8);
          pdf.text(
            cells[i][n],
            c.align ? x + c.width - 1.5 : x + 1.5,
            y + 4.5,
            { align: c.align || "left" },
          );
        }
        x += c.width;
      });
      y += 3.7;
    }
    y = Math.max(y + 3, segmentStart + 9);
    let x = left;
    cols.forEach((c) => {
      if (c.blank) {
        pdf.setDrawColor(141, 154, 171);
        pdf.line(x + 2, y - 2, x + c.width - 2, y - 2);
      }
      x += c.width;
    });
    pdf.setDrawColor(222, 228, 237);
    pdf.line(left, y, left + width, y);
    groupTotal += importoRiga(row);
  });
  groupFooter();
  y += 5;
  ensure(35);
  const sy = y;
  const payX = d.tipo === "richiesta" ? left + width / 2 + 2 : left;
  font(8.5);
  pdf.setTextColor(...accentInk);
  pdf.text("Pagamento", payX, y);
  y += 5;
  const payWidth = d.tipo === "richiesta" ? width / 2 - 4 : width - 76;
  const pay = [
    d.tipo === "richiesta" ? "Condizione concordata con voi:" : "",
    d.pagamento || "Da definire con il fornitore",
    d.tipo === "servizi" && d.inversioneContabile ? "Fatturazione" : null,
    d.tipo === "servizi" && d.inversioneContabile
      ? "Inversione contabile, art. 17 c. 6 DPR 633/72: fattura senza IVA."
      : null,
    d.banca,
    d.iban,
  ].filter(Boolean) as string[];
  pay.forEach((t) => {
    font(8.5);
    const ls = lines(t, payWidth);
    pdf.text(ls, payX, y);
    y += ls.length * 4 + 1;
  });
  if (d.tipo === "richiesta") {
    font(7, false, true);
    pdf.text(
      lines(
        "Se per questa fornitura ne proponete una diversa, indicatela qui:",
        payWidth,
      ),
      payX,
      y + 2,
    );
    pdf.setDrawColor(141, 154, 171);
    pdf.line(payX, y + 14, payX + payWidth, y + 14);
    y += 18;
  }
  if (d.tipo !== "richiesta" && !senzaPrezzi(d)) {
    const t = totaliDocumento(d);
    const x = left + width - 66;
    let ty = sy;
    (d.tipo === "economia"
      ? []
      : [
          ["Imponibile", euro(t.imponibile)],
          [
            d.inversioneContabile ? "IVA inv. contabile" : "IVA",
            d.inversioneContabile ? "-" : euro(t.iva),
          ],
        ]
    ).forEach(([k, v]) => {
      font(8, false, true);
      pdf.text(k, x + 2, ty + 4);
      font(8.5);
      pdf.text(v, left + width - 2, ty + 4, { align: "right" });
      ty += 6;
    });
    pdf.setFillColor(...navy);
    pdf.rect(x, ty, 66, 8, "F");
    font(9, true);
    pdf.setTextColor(...testoFascia);
    pdf.text(
      documentoIncompleto(d)
        ? "Totale parziale"
        : d.tipo === "economia"
          ? "Totale IVA esclusa"
          : d.tipo === "trasporti"
            ? "Totale"
            : "Totale ordine",
      x + 2,
      ty + 5,
    );
    pdf.text(euro(t.totale), left + width - 2, ty + 5, { align: "right" });
    y = Math.max(y, ty + 10);
    if (documentoIncompleto(d))
      paragraph("Da completare: totali delle sole voci valorizzate.", 8);
  } else if (emptyPrices) {
    const x = d.tipo === "richiesta" ? left : left + width - 86;
    font(8);
    pdf.setTextColor(...accentInk);
    pdf.text(
      d.tipo === "richiesta"
        ? "Da indicare nella vostra offerta"
        : "Da indicare nella vostra conferma",
      x,
      sy,
    );
    [
      "Tempi di consegna",
      "Validità dell'offerta",
      "Trasporto e scarico inclusi?",
    ].forEach((t, i) => {
      font(7.5);
      pdf.text(t, x, sy + 7 + i * 8);
      pdf.setDrawColor(141, 154, 171);
      pdf.line(x + 42, sy + 8 + i * 8, x + 86, sy + 8 + i * 8);
    });
    y = Math.max(y, sy + 29);
  }
  y += 5;
  if (d.tipo === "servizi") {
    ensure(24);
    section("Prima di entrare in cantiere ci servono");
    paragraph(
      "- DURC in corso di validità e visura camerale.\n- POS o documentazione di sicurezza richiesta per il lavoro.\n- Elenco delle persone e dei mezzi che verranno in cantiere.",
      8,
    );
  }
  if (d.note) {
    section("Note");
    paragraph(d.note, 8);
  }
  if (d.noteConsegna) {
    section("Istruzioni di consegna / accesso");
    paragraph(d.noteConsegna, 8);
  }
  // Le istruzioni e le firme formano un blocco: niente pagina finale con sole firme.
  font(8);
  const altezzaCondizioni =
    lines(condizioniDocumento(d), width).length * 4.3 + 31;
  ensure(Math.min(altezzaCondizioni, bottom - 52));
  section(standard.condizioni);
  paragraph(condizioniDocumento(d), 8);
  if (modello.conclusione) {
    font(8);
    ensure(
      Math.min(
        lines(modello.conclusione, width).length * 4.3 + 30,
        bottom - 52,
      ),
    );
    paragraph(modello.conclusione, 8);
  }
  if (modello.mostraFirma) {
    ensure(23);
    y += 12;
    pdf.setDrawColor(141, 154, 171);
    pdf.line(left, y, left + width / 2 - 5, y);
    pdf.line(left + width / 2 + 5, y, left + width, y);
    font(7, false, true);
    pdf.text(safe(a.business_name || a.name), left, y + 4, { maxWidth: 86 });
    pdf.text(
      modello.etichettaFirma ||
        (d.tipo === "richiesta"
          ? "Timbro e firma del fornitore, e data"
          : d.tipo === "economia" || d.tipo === "trasporti"
            ? `Per accettazione - ${safe(d.destinatario.nome)}`
            : "Per accettazione - timbro e firma del fornitore"),
      left + width / 2 + 5,
      y + 4,
      { maxWidth: 86 },
    );
  }
  const foot = a.righeSocietarie?.length ? a.righeSocietarie : footerAzienda(a);
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setDrawColor(210, 219, 231);
    pdf.line(left, 278, left + width, 278);
    foot.forEach((line, i) => {
      font(7, false, true);
      const content = safe(line),
        tw = pdf.getTextWidth(content);
      if (tw > width) pdf.setFontSize((7 * width) / tw);
      pdf.text(content, 105, 282 + i * 4, { align: "center" });
    });
    font(7, false, true);
    if (modello.notaPagina) {
      const note = safe(modello.notaPagina);
      const max = width / 2 - (modello.numerazione ? 18 : 0);
      pdf.setFontSize(
        Math.min(7, (7 * max) / Math.max(1, pdf.getTextWidth(note))),
      );
      pdf.text(note, left, 291);
      font(7, false, true);
    }
    if (modello.numerazione)
      pdf.text(
        `Pagina ${page} di ${pdf.getNumberOfPages()}`,
        105,
        291,
        {
          align: "center",
        },
      );
  }
  return pdf;
}

export async function generaPdfOperativo(
  d: DocumentoOperativo,
  a: AziendaDocumento,
  personalizzazione?: ModelloPdf,
): Promise<Blob> {
  const modello =
    personalizzazione ??
    (await (
      await import("@/lib/modelliPdf/repository")
    ).leggiModelloPdf(a.id, d.tipo));
  let logo: string | undefined;
  if (a.logo_url && modello.mostraLogo) {
    const response = await fetch(a.logo_url, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        "Impossibile caricare il logo aziendale. Verifica il logo nelle impostazioni.",
      );
    const blob = await response.blob();
    const image = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Anteprima logo non disponibile");
      ctx.drawImage(image, 0, 0);
      logo = canvas.toDataURL("image/png");
    } finally {
      image.close();
    }
  }
  // Il piè di pagina: i dati societari veri, uguali in tutti i documenti (09/11/2026).
  const [{ supabase }, societari] = await Promise.all([import("@/integrations/supabase/client"), import("../../../supabase/functions/_shared/datiSocietari")]);
  const righeSocietarie = societari.righeSocietarie(await societari.caricaDatiSocietari(supabase, a.id));
  return creaPdfOperativo(d, { ...a, righeSocietarie }, logo, modello).output("blob");
}
