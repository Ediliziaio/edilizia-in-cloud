import { jsPDF } from "jspdf";
import {
  normalizzaModelloPdf,
  type ModelloPdf,
} from "../../../supabase/functions/_shared/modelliPdfOperativi";
import { STANDARD_DOCUMENTI } from "./standard";
import {
  type AziendaDocumento,
  type DocumentoOperativo,
  type RigaDocumentoOperativo,
  TITOLI,
  testoInversioneContabile,
  senzaPrezzi,
  footerAzienda,
  condizioniDocumento,
  totaliDocumento,
  importoRiga,
  euro,
  importoIt,
  numeroIt,
  oreIt,
  dataIt,
  documentoIncompleto,
  haImportiDocumento,
  NOTA_TOTALE_ECONOMIA,
} from "./modello";

import { disegnaPiedeJsPdf, fontPiedeBase64, limiteContenutoJsPdf, personalizzazioneDocumento, puntiInMm } from "../../../supabase/functions/_shared/personalizzazioneDocumenti";
import {
  accentoDocumento,
  colore,
  pagina,
  rgb255,
  riquadro as stileRiquadro,
  sezione as stileSezione,
  tabella as stileTabella,
  testata as stileTestata,
} from "../../../supabase/functions/_shared/stileDocumenti";

type Rgb = [number, number, number];
/** Le misure dello stile sono in punti; il documento è in millimetri. */
const mm = puntiInMm;

/**
 * I cinque documenti operativi (ordine fornitore, RDO, ordine servizi, rapporto trasporti, lavori in economia) nello
 * stile unico dei documenti (`_shared/stileDocumenti.ts`, 10/11/2026): logo a sinistra su bianco, titolo a destra,
 * filetto d'accento; titoli di sezione, tabelle, riquadri e piè uguali a quelli degli altri documenti. Restano le
 * scelte dei Modelli PDF: titolo, testi, carattere, colore (diventa l'accento), margini, dimensione del testo, scala
 * del logo, colore dei riquadri, numerazione, nota di pagina, firma.
 */
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
  const veste = personalizzazioneDocumento(a.id);
  const logoDellaVeste = Boolean(logo && veste.logoAltezza && veste.logoLarghezzaMax);
  // Logo grande e carattere proprio pesano: si comprime solo chi li ha.
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: logoDellaVeste });
  pdf.setProperties({
    title: `${modello.titolo || TITOLI[d.tipo]} ${d.numero}`,
    author: a.business_name || a.name,
    subject: modello.titolo || TITOLI[d.tipo],
  });
  const left = modello.margine || mm(pagina.margineLaterale),
    width = 210 - left * 2,
    // Col piè proprio (Vulcano, quattro righe) il contenuto si ferma più in alto.
    bottom = limiteContenutoJsPdf(veste, width, 268);
  const INCHIOSTRO = rgb255(colore.inchiostro),
    TENUE = rgb255(colore.testoTenue),
    LINEA = rgb255(colore.linea),
    FONDO_INTESTAZIONE = rgb255(colore.fondoIntestazione),
    // Il colore dei riquadri scelto nei Modelli PDF resta; altrimenti il fondo tenue dello stile.
    FONDO = rgb255(modello.coloreRiquadri || colore.fondoTenue),
    ACCENTO = rgb255(accentoDocumento({
      coloreVeste: veste.piedeColore,
      coloreAzienda: modello.colore || a.brand_primary_color,
    }));
  const corpo = modello.dimensioneTesto || pagina.corpo;
  const standard = STANDARD_DOCUMENTI[d.tipo];
  const safe = (v: string) =>
    v
      .replace(/\u00a0/g, " ")
      .replace(/[–—]/g, "-")
      .replace(/→/g, "> ")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"');
  const font = (size: number, bold = false, tinta: Rgb = INCHIOSTRO) => {
    pdf.setFont(modello.carattere, bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...tinta);
  };
  const lines = (value: string, w: number) =>
    pdf.splitTextToSize(safe(value), w) as string[];
  /** Altezza di una riga di testo, in mm. */
  const passo = (size: number, interlinea: number = pagina.interlinea) => mm(size * interlinea);
  const filetto = (tinta: Rgb, spessore: number, x1: number, y1: number, x2: number, y2: number) => {
    pdf.setDrawColor(...tinta);
    pdf.setLineWidth(mm(spessore));
    pdf.line(x1, y1, x2, y2);
  };
  const pad = mm(stileRiquadro.padding);
  const disegnaRiquadro = (x: number, yy: number, w: number, h: number) => {
    pdf.setFillColor(...FONDO);
    pdf.setDrawColor(...LINEA);
    pdf.setLineWidth(mm(stileRiquadro.bordo));
    pdf.roundedRect(x, yy, w, h, mm(stileRiquadro.raggio), mm(stileRiquadro.raggio), "FD");
  };
  const etichetta = (t: string, x: number, base: number, align: "left" | "right" = "left") => {
    font(stileRiquadro.etichettaCorpo, false, TENUE);
    pdf.text(safe(t).toUpperCase(), x, base, { align, charSpace: mm(0.5) });
  };
  const titolo = safe(modello.titolo || standard.titoloPdf);
  const sottotitolo = [`N. ${safe(d.numero)}`, d.data ? dataIt(d.data) : ""].filter(Boolean).join(" · ");
  let y = mm(pagina.margineAlto);

  /** Testata: logo a sinistra su bianco, titolo e numero · data a destra, filetto d'accento sotto. */
  const head = () => {
    const top = mm(pagina.margineAlto);
    let hSx = 0,
      wSx = 0;
    let immagine: { tipo: string; w: number; h: number } | null = null;
    let ragione: string[] = [];
    const passoRagione = passo(stileTestata.ragioneSocialeCorpo, 1.2);
    if (logo) {
      const info = pdf.getImageProperties(logo);
      const scala = logoDellaVeste ? 1 : modello.scalaLogo / 100;
      const maxH = mm(logoDellaVeste ? veste.logoAltezza! : stileTestata.logoAltezza) * scala;
      const maxW = mm(logoDellaVeste ? veste.logoLarghezzaMax! : stileTestata.logoLarghezzaMax) * scala;
      const rapporto = info.width / info.height;
      wSx = Math.min(maxW, maxH * rapporto);
      hSx = wSx / rapporto;
      immagine = { tipo: info.fileType, w: wSx, h: hSx };
    } else if (modello.mostraLogo) {
      // Senza logo: la ragione sociale, in grassetto.
      font(stileTestata.ragioneSocialeCorpo, true);
      ragione = lines(a.business_name || a.name, width * 0.5).slice(0, 2);
      wSx = Math.max(...ragione.map((r) => pdf.getTextWidth(r)));
      hSx = ragione.length * passoRagione;
    }
    const wDx = Math.max(50, width - wSx - 8);
    let corpoTitolo: number = stileTestata.titoloCorpo;
    font(corpoTitolo, true);
    let righeTitolo = lines(titolo, wDx);
    if (righeTitolo.length > 2) {
      corpoTitolo = 11;
      font(corpoTitolo, true);
      righeTitolo = lines(titolo, wDx).slice(0, 3);
    }
    const passoTitolo = passo(corpoTitolo, 1.2);
    const hDx = righeTitolo.length * passoTitolo + passo(stileTestata.sottotitoloCorpo, 1.3);
    const fondo = top + Math.max(hSx, hDx);
    if (immagine) pdf.addImage(logo!, immagine.tipo, left, fondo - immagine.h, immagine.w, immagine.h);
    else if (ragione.length) {
      font(stileTestata.ragioneSocialeCorpo, true);
      ragione.forEach((r, i) => pdf.text(r, left, fondo - hSx + passoRagione * (i + 0.78)));
    }
    font(corpoTitolo, true);
    const inizioDx = fondo - hDx;
    righeTitolo.forEach((r, i) =>
      pdf.text(r, left + width, inizioDx + passoTitolo * (i + 0.78), { align: "right" }),
    );
    font(stileTestata.sottotitoloCorpo, false, TENUE);
    pdf.text(sottotitolo, left + width, fondo - 0.8, { align: "right" });
    const yFiletto = fondo + mm(stileTestata.filettoDistanza);
    filetto(ACCENTO, stileTestata.filettoSpessore, left, yFiletto, left + width, yFiletto);
    y = yFiletto + mm(stileTestata.spazioDopo);
  };
  const nuovaPagina = () => {
    pdf.addPage();
    head();
  };
  const ensure = (h: number) => {
    if (y + h > bottom) nuovaPagina();
  };
  /** Testo di corpo (9,5 pt, o la dimensione scelta nei Modelli PDF); `nota`: 8 pt tenue. */
  const paragraph = (text: string, nota = false) => {
    const size = nota ? pagina.nota : corpo;
    const tinta = nota ? TENUE : INCHIOSTRO;
    const l = passo(size);
    font(size, false, tinta);
    for (const line of lines(text, width)) {
      ensure(l);
      font(size, false, tinta);
      pdf.text(line, left, y + l * 0.72);
      y += l;
    }
    y += 1.5;
  };
  /** Titolo di sezione a una quota data, in una colonna: restituisce dove comincia il contenuto. */
  const titoloSezioneA = (title: string, x: number, w: number, yy: number) => {
    yy += mm(stileSezione.spazioPrima);
    font(stileSezione.corpo, true, ACCENTO);
    const base = yy + mm(stileSezione.corpo) * 0.75;
    pdf.text(safe(title).toUpperCase(), x, base, { charSpace: mm(stileSezione.spaziatura) });
    const yLinea = base + 1.3;
    filetto(LINEA, stileSezione.filetto, x, yLinea, x + w, yLinea);
    return yLinea + mm(stileSezione.spazioDopo);
  };
  const section = (title: string) => {
    ensure(mm(stileSezione.spazioPrima) + 14);
    y = titoloSezioneA(title, left, width, y);
  };
  head();
  if (modello.introduzione) paragraph(modello.introduzione);

  // Anagrafiche: due riquadri affiancati.
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
            // Le ore solo se ci sono: «0 ore uomo» non dice niente (10/11/2026).
            (() => {
              const oreUomo = d.righe.reduce((s, r) => s + (r.oreUomo || 0), 0);
              const oreMezzo = d.righe.reduce((s, r) => s + (r.oreMezzo || 0), 0);
              return [
                `${d.righe.length} ${d.righe.length === 1 ? "viaggio" : "viaggi"}`,
                oreUomo > 0 ? `${numeroIt(oreUomo)} ore uomo` : null,
                oreMezzo > 0 ? `${numeroIt(oreMezzo)} ore mezzo` : null,
              ].filter(Boolean).join(" - ");
            })(),
            d.commessa,
          ]
        : [
            d.luogo || "Da indicare",
            d.tipo === "richiesta" && d.commessa
              ? `Commessa ${d.commessa}`
              : null,
          ];
  const passoValore = passo(stileRiquadro.valoreCorpo, 1.3);
  const altoEtichetta = mm(stileRiquadro.etichettaCorpo) + 1.8;
  const cardLines = (values: (string | null | undefined | false)[]) =>
    values
      .filter((v): v is string => !!v)
      .flatMap((v) => lines(v, cardWidth - 2 * pad));
  font(stileRiquadro.valoreCorpo, true);
  const l = cardLines(recipient),
    r = cardLines(destination);
  const cardH = 2 * pad + altoEtichetta + Math.max(1, l.length, r.length) * passoValore;
  [0, 1].forEach((i) => {
    const x = left + i * (cardWidth + 4);
    disegnaRiquadro(x, y, cardWidth, cardH);
    etichetta(i === 0 ? standard.destinatario : rightTitle, x + pad, y + pad + mm(stileRiquadro.etichettaCorpo) * 0.75);
    (i === 0 ? l : r).forEach((v, n) => {
      font(stileRiquadro.valoreCorpo, n === 0);
      pdf.text(v, x + pad, y + pad + altoEtichetta + passoValore * (n + 0.75));
    });
  });
  y += cardH + 4;

  // Dati dell'ordine: un riquadro a tre colonne.
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
    const colW = width / 3;
    font(stileRiquadro.valoreCorpo);
    const valori = meta.map(([, v]) => lines(v, colW - 2 * pad));
    const altoRiga = (n: number) => altoEtichetta + n * passoValore;
    const primaRiga = altoRiga(Math.max(...valori.map((v) => v.length)));
    const secondaRiga = d.tipo === "servizi" ? 2.5 + altoRiga(1) : 0;
    const mh = 2 * pad + primaRiga + secondaRiga;
    disegnaRiquadro(left, y, width, mh);
    const colonna = (k: string, v: string[], i: number, yy: number) => {
      const x = left + i * colW + pad;
      etichetta(k, x, yy + mm(stileRiquadro.etichettaCorpo) * 0.75);
      font(stileRiquadro.valoreCorpo);
      v.forEach((riga, n) => pdf.text(riga, x, yy + altoEtichetta + passoValore * (n + 0.75)));
    };
    meta.forEach(([k], i) => colonna(k, valori[i], i, y + pad));
    if (d.tipo === "servizi") {
      [
        ["Inizio lavori", dataIt(d.inizioLavori) || "Da indicare"],
        ["Fine lavori", dataIt(d.fineLavori) || "Da indicare"],
      ].forEach(([k, v], i) => colonna(k, [v], i, y + pad + primaRiga + 2.5));
    }
    y += mh + 4;
  }
  if (d.riferimento && d.tipo !== "servizi")
    paragraph(`Riferimento: ${d.riferimento}`, true);
  if (d.codiceCliente)
    paragraph(`Nostro codice cliente: ${d.codiceCliente}`, true);
  if (d.referenteEmail || d.referenteTelefono)
    paragraph(
      `Referente fornitore: ${[d.referente, d.referenteEmail, d.referenteTelefono].filter(Boolean).join(" - ")}`,
      true,
    );
  if (d.tipo === "richiesta")
    paragraph(
      `Vi chiediamo la vostra migliore offerta per la fornitura qui sotto. Compilate le colonne vuote e rimandateci questo foglio, oppure inviateci la vostra offerta con il riferimento ${d.numero}.`,
    );
  if (d.tipo === "economia") {
    // I numeri chiave del periodo: quattro riquadri; il totale ha il valore nell'accento.
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
    const w = (width - 9) / 4;
    const hNumero = passo(stileRiquadro.numeroCorpo, 1.2);
    const hStat = 2 * pad + altoEtichetta + hNumero + passo(pagina.nota, 1.3);
    ensure(hStat + 4);
    stats.forEach((c, i) => {
      const x = left + i * (w + 3);
      disegnaRiquadro(x, y, w, hStat);
      etichetta(c.titolo, x + pad, y + pad + mm(stileRiquadro.etichettaCorpo) * 0.75);
      font(stileRiquadro.numeroCorpo, i === 3, i === 3 ? ACCENTO : INCHIOSTRO);
      const entries =
        i < 3
          ? d.righe.filter((r) => categorie[i].match.test(r.descrizione))
          : d.righe;
      const valorizzate = entries.filter((r) => r.prezzo != null || r.importo != null);
      const parziale = valorizzate.length > 0 && valorizzate.length < entries.length;
      pdf.text(!entries.length ? "—" : !valorizzate.length ? "Da definire" : euro(c.totale), x + pad, y + pad + altoEtichetta + hNumero * 0.75);
      const interventi = new Set(d.righe.map((r) => r.gruppo || "Intervento")).size;
      const detail =
        i === 3
          ? `${interventi} ${interventi === 1 ? "intervento" : "interventi"}`
          : i === 0
            ? `${numeroIt(entries.reduce((sum, r) => sum + (r.unita.toLowerCase() === "h" ? r.quantita : 0), 0))} ore`
            : `${entries.length} voci`;
      font(pagina.nota, false, TENUE);
      pdf.text(`${detail}${parziale ? " · parziale" : ""}`, x + pad, y + hStat - pad);
    });
    y += hStat + 5;
  }
  type Col = {
    title: string;
    width: number;
    align?: "right";
    value: (r: RigaDocumentoOperativo, i: number) => string;
    blank?: boolean;
  };
  const emptyPrices = d.tipo === "richiesta" || senzaPrezzi(d);
  const money = importoIt;
  let cols: Col[];
  if (d.tipo === "trasporti")
    cols = [
      // DATA a 23: a 9 pt la data intera sta in una riga.
      { title: "DATA", width: 23, value: (r) => dataIt(r.data) },
      { title: "CARICO", width: 31, value: (r) => r.carico || r.descrizione },
      { title: "SCARICO", width: 31, value: (r) => r.scarico || "-" },
      { title: "MEZZO", width: 22, value: (r) => r.mezzo || "-" },
      {
        title: "ORE UOMO",
        width: 16,
        align: "right",
        value: (r) => safe(oreIt(r.oreUomo)),
      },
      {
        title: "ORE MEZZO",
        width: 16,
        align: "right",
        value: (r) => safe(oreIt(r.oreMezzo)),
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
      // U.M. a 18: a 9 pt «sacchi» o «mq/mese» stanno in una riga.
      18 -
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
      { title: "U.M.", width: 18, value: (r) => r.unita },
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
  // Tabella: intestazione su fondo grigio, righe separate da un filetto, niente bordi verticali.
  const padX = mm(stileTabella.paddingOrizzontale);
  const rigaMin = mm(stileTabella.altezzaRigaMin);
  const passoRiga = passo(stileTabella.corpo, 1.3);
  const padY = 1.2;
  const passoIntestazione = passo(stileTabella.intestazioneCorpo, 1.2);
  font(stileTabella.intestazioneCorpo, true);
  const titoliColonne = cols.map((c) => lines(c.title, Math.max(4, c.width - 2 * padX)));
  const altoIntestazione = Math.max(
    rigaMin,
    Math.max(...titoliColonne.map((t) => t.length)) * passoIntestazione + 2 * padY + 1,
  );
  const tableHeader = () => {
    ensure(altoIntestazione + rigaMin);
    pdf.setFillColor(...FONDO_INTESTAZIONE);
    pdf.rect(left, y, width, altoIntestazione, "F");
    font(stileTabella.intestazioneCorpo, true, TENUE);
    let x = left;
    cols.forEach((c, i) => {
      const t = titoliColonne[i];
      const inizio = y + (altoIntestazione - t.length * passoIntestazione) / 2;
      t.forEach((riga, n) =>
        pdf.text(riga, c.align ? x + c.width - padX : x + padX, inizio + passoIntestazione * (n + 0.75), {
          align: c.align || "left",
        }),
      );
      x += c.width;
    });
    y += altoIntestazione;
  };
  /** Raggruppamento dentro la tabella (lavori in economia): riga su fondo tenue, grassetto. */
  const rigaGruppo = (t: string) => {
    font(stileTabella.corpo, true);
    const testo = lines(t, width - 2 * padX);
    const h = Math.max(rigaMin, testo.length * passoRiga + 2 * padY);
    pdf.setFillColor(...rgb255(colore.fondoTenue));
    pdf.rect(left, y, width, h, "F");
    testo.forEach((riga, n) => pdf.text(riga, left + padX, y + padY + passoRiga * (n + 0.72)));
    y += h;
    filetto(LINEA, stileTabella.filetto, left, y, left + width, y);
  };
  let groupTotal = 0, groupKnown = false, groupUnknown = false,
    currentGroup = "";
  /** Riga del totale: grassetto, filetto inchiostro sopra. */
  const groupFooter = () => {
    if (currentGroup) {
      ensure(rigaMin);
      filetto(INCHIOSTRO, stileTabella.filettoTotale, left, y, left + width, y);
      font(stileTabella.corpo, true);
      const base = y + rigaMin / 2 + mm(stileTabella.corpo) * 0.3;
      pdf.text(groupKnown && groupUnknown ? "Totale intervento parziale" : "Totale intervento", left + padX, base);
      pdf.text(groupKnown ? euro(groupTotal) : "Da definire", left + width - padX, base, { align: "right" });
      y += rigaMin + 3;
    }
  };
  tableHeader();
  d.righe.forEach((row, index) => {
    if (d.tipo === "economia" && (index === 0 || row.gruppo !== currentGroup)) {
      groupFooter();
      currentGroup = row.gruppo || "Lavori in economia";
      groupTotal = 0;
      groupKnown = false;
      groupUnknown = false;
      if (y + 2 * rigaMin > bottom) {
        nuovaPagina();
        tableHeader();
      }
      rigaGruppo(currentGroup);
    }
    font(stileTabella.corpo);
    const cells = cols.map((c) => lines(c.value(row, index), c.width - 2 * padX));
    const count = Math.max(1, ...cells.map((c) => c.length));
    const h = Math.max(rigaMin, count * passoRiga + 2 * padY);
    const reserveSubtotal =
      d.tipo === "economia" &&
      (index === d.righe.length - 1 ||
        d.righe[index + 1]?.gruppo !== row.gruppo)
        ? rigaMin
        : 0;
    if (y + h + reserveSubtotal > bottom) {
      nuovaPagina();
      tableHeader();
      if (currentGroup) rigaGruppo(`${currentGroup} (segue)`);
    }
    // Ogni riga resta intera quando possibile; descrizioni molto lunghe proseguono con testata ripetuta.
    let segmentStart = y;
    let riga = y + padY;
    for (let n = 0; n < count; n++) {
      if (riga + passoRiga + padY > bottom) {
        nuovaPagina();
        tableHeader();
        segmentStart = y;
        riga = y + padY;
      }
      let x = left;
      cols.forEach((c, i) => {
        if (cells[i][n]) {
          font(stileTabella.corpo);
          pdf.text(
            cells[i][n],
            c.align ? x + c.width - padX : x + padX,
            riga + passoRiga * 0.72,
            { align: c.align || "left" },
          );
        }
        x += c.width;
      });
      riga += passoRiga;
    }
    y = Math.max(riga + padY, segmentStart + rigaMin);
    let x = left;
    cols.forEach((c) => {
      if (c.blank) filetto(TENUE, 0.5, x + padX, y - 1.6, x + c.width - padX, y - 1.6);
      x += c.width;
    });
    filetto(LINEA, stileTabella.filetto, left, y, left + width, y);
    groupTotal += importoRiga(row);
    if (row.prezzo != null || row.importo != null) groupKnown = true;
    else groupUnknown = true;
  });
  groupFooter();

  // Pagamento a sinistra, riepilogo (o le voci da indicare) a destra.
  ensure(40);
  const sy = y;
  let fine = y;
  const payX = d.tipo === "richiesta" ? left + width / 2 + 2 : left;
  const payWidth =
    d.tipo === "richiesta" ? width / 2 - 2 : emptyPrices ? width - 92 : width - 80;
  let py = titoloSezioneA("Pagamento", payX, payWidth, sy);
  const pay = [
    d.tipo === "richiesta" ? "Condizione concordata con voi:" : "",
    d.pagamento || (d.tipo === "economia" ? "Da concordare con il committente" : "Da definire con il fornitore"),
    d.inversioneContabile ? "Fatturazione" : null,
    d.inversioneContabile ? testoInversioneContabile(d) : null,
    d.banca,
    d.iban,
  ].filter(Boolean) as string[];
  const passoCorpo = passo(corpo);
  pay.forEach((t) => {
    font(corpo);
    const ls = lines(t, payWidth);
    ls.forEach((riga, n) => pdf.text(riga, payX, py + passoCorpo * (n + 0.72)));
    py += ls.length * passoCorpo + 1;
  });
  if (d.tipo === "richiesta") {
    font(pagina.nota, false, TENUE);
    const ls = lines("Se per questa fornitura ne proponete una diversa, indicatela qui:", payWidth);
    ls.forEach((riga, n) => pdf.text(riga, payX, py + 1 + passo(pagina.nota) * (n + 0.72)));
    py += 1 + ls.length * passo(pagina.nota) + 9;
    filetto(TENUE, 0.5, payX, py, payX + payWidth, py);
    py += 3;
  }
  fine = Math.max(fine, py);
  if (d.tipo !== "richiesta" && !senzaPrezzi(d)) {
    // Il riepilogo: imponibile e IVA, poi la riga del totale col valore nell'accento.
    const t = totaliDocumento(d);
    const tw = 72;
    const tx = left + width - tw;
    const ty = sy + mm(stileSezione.spazioPrima);
    const voci: [string, string][] =
      d.tipo === "economia"
        ? []
        : [
            ["Imponibile", euro(t.imponibile)],
            [
              d.inversioneContabile ? "IVA inv. contabile" : "IVA",
              d.inversioneContabile ? "-" : euro(t.iva),
            ],
          ];
    const passoTotale = passo(stileRiquadro.numeroCorpo, 1.2);
    const hTot = 2 * pad + voci.length * passoValore + (voci.length ? 3 : 0) + passoTotale;
    disegnaRiquadro(tx, ty, tw, hTot);
    let by = ty + pad;
    voci.forEach(([k, v]) => {
      etichetta(k, tx + pad, by + passoValore * 0.72);
      font(stileRiquadro.valoreCorpo);
      pdf.text(v, tx + tw - pad, by + passoValore * 0.72, { align: "right" });
      by += passoValore;
    });
    if (voci.length) {
      by += 1;
      filetto(INCHIOSTRO, stileTabella.filettoTotale, tx + pad, by, tx + tw - pad, by);
      by += 2;
    }
    const base = by + passoTotale * 0.75;
    font(corpo, true);
    pdf.text(
      documentoIncompleto(d)
        ? "Totale parziale"
        : d.tipo === "economia"
          ? "Totale IVA esclusa"
          : d.tipo === "trasporti"
            ? "Totale"
            : "Totale ordine",
      tx + pad,
      base,
    );
    font(stileRiquadro.numeroCorpo, true, ACCENTO);
    pdf.text(haImportiDocumento(d) ? euro(t.totale) : "Da definire", tx + tw - pad, base, { align: "right" });
    fine = Math.max(fine, ty + hTot + 2);
    y = fine;
    if (documentoIncompleto(d))
      paragraph("Da completare: totali delle sole voci valorizzate.", true);
    // Cosa conta il totale (11/11/2026): il rendiconto d'appalto conta altro.
    if (d.tipo === "economia") paragraph(NOTA_TOTALE_ECONOMIA, true);
    fine = y;
  } else if (emptyPrices) {
    const x = d.tipo === "richiesta" ? left : left + width - 86;
    const w = d.tipo === "richiesta" ? width / 2 - 6 : 86;
    let oy = titoloSezioneA(
      d.tipo === "richiesta"
        ? "Da indicare nella vostra offerta"
        : "Da indicare nella vostra conferma",
      x,
      w,
      sy,
    );
    [
      "Tempi di consegna",
      "Validità dell'offerta",
      "Trasporto e scarico inclusi?",
    ].forEach((t) => {
      font(corpo);
      pdf.text(t, x, oy + 4);
      filetto(TENUE, 0.5, x + 46, oy + 4.6, x + w, oy + 4.6);
      oy += 7.5;
    });
    fine = Math.max(fine, oy);
  }
  y = fine + 2;
  if (d.tipo === "servizi") {
    section("Prima di entrare in cantiere ci servono");
    paragraph(
      "- DURC in corso di validità e visura camerale.\n- POS o documentazione di sicurezza richiesta per il lavoro.\n- Elenco delle persone e dei mezzi che verranno in cantiere.",
    );
  }
  if (d.note) {
    section("Note");
    paragraph(d.note);
  }
  if (d.noteConsegna) {
    section("Istruzioni di consegna / accesso");
    paragraph(d.noteConsegna);
  }
  // Le istruzioni e le firme formano un blocco: niente pagina finale con sole firme.
  font(corpo);
  const altezzaCondizioni =
    lines(condizioniDocumento(d), width).length * passoCorpo + 36;
  ensure(Math.min(altezzaCondizioni, bottom - 52));
  section(standard.condizioni);
  paragraph(condizioniDocumento(d));
  if (modello.conclusione) {
    font(corpo);
    ensure(
      Math.min(
        lines(modello.conclusione, width).length * passoCorpo + 30,
        bottom - 52,
      ),
    );
    paragraph(modello.conclusione);
  }
  if (modello.mostraFirma) {
    // Firme: una riga inchiostro, sotto la didascalia tenue.
    ensure(24);
    y += 14;
    filetto(INCHIOSTRO, 0.5, left, y, left + width / 2 - 5, y);
    filetto(INCHIOSTRO, 0.5, left + width / 2 + 5, y, left + width, y);
    font(pagina.nota, false, TENUE);
    pdf.text(safe(a.business_name || a.name), left, y + 4, { maxWidth: width / 2 - 5 });
    pdf.text(
      modello.etichettaFirma ||
        (d.tipo === "richiesta"
          ? "Timbro e firma del fornitore, e data"
          : d.tipo === "economia" || d.tipo === "trasporti"
            ? `Per accettazione - ${safe(d.destinatario.nome)}`
            : "Per accettazione - timbro e firma del fornitore"),
      left + width / 2 + 5,
      y + 4,
      { maxWidth: width / 2 - 5 },
    );
  }
  const foot = a.righeSocietarie?.length ? a.righeSocietarie : footerAzienda(a);
  if (a.fontPiede) {
    pdf.addFileToVFS("EBGaramond-Regular.ttf", a.fontPiede);
    pdf.addFont("EBGaramond-Regular.ttf", "EBGaramond", "normal");
  }
  const pagine = pdf.getNumberOfPages();
  for (let page = 1; page <= pagine; page++) {
    pdf.setPage(page);
    const numeroPagina = modello.numerazione ? `Pag. ${page} / ${pagine}` : "";
    if (veste.piedeRighe) {
      // Il piè dell'esempio del titolare (10/11/2026): niente filetto, righe proprie, sotto la pagina.
      disegnaPiedeJsPdf(pdf, veste, {
        font: a.fontPiede ? "EBGaramond" : modello.carattere,
        pulisci: a.fontPiede ? undefined : safe,
        larghezzaUtile: width,
        pagina: numeroPagina,
      });
      if (modello.notaPagina) {
        font(6.5, false, TENUE);
        pdf.text(safe(modello.notaPagina), left, 291, { maxWidth: width / 2 - 20 });
      }
      continue;
    }
    // Piè: le righe societarie centrate, 7 pt tenue; sotto il numero di pagina.
    const basePagina = 290;
    const passoPiede = passo(7, 1.35);
    const ultimaRiga = modello.numerazione ? basePagina - passoPiede - 0.6 : basePagina;
    foot.forEach((line, i) => {
      font(7, false, TENUE);
      if (a.fontPiede && veste.piedeColore) {
        pdf.setFont("EBGaramond", "normal");
        pdf.setTextColor(veste.piedeColore);
      }
      const content = safe(line),
        tw = pdf.getTextWidth(content);
      if (tw > width) pdf.setFontSize((7 * width) / tw);
      pdf.text(content, 105, ultimaRiga - (foot.length - 1 - i) * passoPiede, { align: "center" });
    });
    if (modello.notaPagina) {
      font(6.5, false, TENUE);
      const note = safe(modello.notaPagina);
      const max = width / 2 - (modello.numerazione ? 18 : 0);
      pdf.setFontSize(
        Math.min(6.5, (6.5 * max) / Math.max(1, pdf.getTextWidth(note))),
      );
      pdf.text(note, left, basePagina);
    }
    if (numeroPagina) {
      font(7, false, TENUE);
      pdf.text(numeroPagina, 105, basePagina, { align: "center" });
    }
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
  const fontPiede = personalizzazioneDocumento(a.id).piedeFont ? await fontPiedeBase64() : null;
  return creaPdfOperativo(d, { ...a, righeSocietarie, fontPiede }, logo, modello).output("blob");
}
