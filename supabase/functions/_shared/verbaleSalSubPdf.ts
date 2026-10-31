import pdfMake from "pdfmake";
import vfs from "pdfmake-fonts";
import { benestareFatturazione, type VerbaleSalSub, verificaVerbaleSalSub } from "./verbaleSalSub.ts";
pdfMake.addVirtualFileSystem(vfs);
const euro = (n: unknown) =>
  Number(n).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const data = (s: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(s)
    ? s.slice(0, 10).split("-").reverse().join("/")
    : s;
/** logoImpresa: data URL PNG/JPEG del logo; resta fuori dal modello salvato del verbale. */
export function layoutVerbaleSalSub(d: VerbaleSalSub, logoImpresa: string | null = null) {
  const r = verificaVerbaleSalSub(d);
  const titolo = (t: string) => ({
    text: t,
    style: "sezione",
    headlineLevel: 1,
    margin: [0, 16, 0, 6],
  });
  const nota = (t: string) => ({
    text: t,
    color: "#64748b",
    fontSize: 8,
    margin: [0, 5, 0, 5],
  });
  const riga = (
    a: string,
    b: string,
  ) => [{ text: a, color: "#475569" }, {
    text: b,
    bold: true,
    alignment: "right",
  }];
  const intestazioneTesto = [
    { text: d.impresa.ragione_sociale, style: "impresa" },
    {
      text: [
        d.impresa.partita_iva ? `P.IVA ${d.impresa.partita_iva}` : "",
        d.impresa.indirizzo,
      ].filter(Boolean).join(" · "),
      fontSize: 8,
      color: "#475569",
    },
  ];
  const logo = typeof logoImpresa === "string" && /^data:image\/(png|jpeg);base64,/.test(logoImpresa) ? logoImpresa : null;
  const benestare = benestareFatturazione(d, r);
  const contenuto: any[] = [
    logo
      ? {
        columns: [
          { stack: intestazioneTesto, width: "*" },
          { image: logo, fit: [150, 48], alignment: "right", width: 160 },
        ],
        columnGap: 12,
      }
      : { stack: intestazioneTesto },
    {
      canvas: [{ type: "line", x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 2, lineColor: "#17324f" }],
      margin: [0, 6, 0, 0],
    },
    {
      text: "VERBALE RIEPILOGATIVO SAL SUBAPPALTO",
      style: "titolo",
      margin: [0, 20, 0, 5],
    },
    {
      text: `SAL n. ${d.sal.numero_sal} · ${data(d.sal.data_emissione)} · ${
        r.bozza ? "BOZZA / DA VERIFICARE" : "RIEPILOGO DEL SAL REGISTRATO"
      }`,
      bold: true,
      color: r.bozza ? "#b45309" : "#1e3a5f",
    },
    nota(
      `Generato il ${
        new Date(d.generato_il).toLocaleString("it-IT", {
          timeZone: "Europe/Rome",
        })
      }. Stato acquisito dal sistema: ${d.sal.stato}. Questo documento non registra nuove approvazioni, firme, fatture o pagamenti.`,
    ),
    titolo("1 · Parti, contratto e cantiere"),
    {
      table: {
        widths: ["*", "*"],
        body: [
          [{ text: "IMPRESA AFFIDATARIA", style: "etichetta" }, {
            text: "SUBAPPALTATORE",
            style: "etichetta",
          }],
          [d.impresa.ragione_sociale, d.sub.ragione_sociale],
          [
            `P.IVA ${d.impresa.partita_iva || "non registrata"}`,
            `P.IVA ${d.sub.piva || "non registrata"}`,
          ],
          [d.impresa.indirizzo, d.sub.indirizzo || "Indirizzo non registrato"],
          [
            `Referente: ${
              d.contratto.responsabile_impresa || "Non registrato"
            }`,
            `Referente: ${
              d.contratto.referente_subappaltatore || d.sub.responsabile ||
              "Non registrato"
            }`,
          ],
        ],
      },
      layout: "lightHorizontalLines",
    },
    {
      text: `Contratto: ${d.contratto.numero_contratto || d.contratto.id}`,
      margin: [0, 10, 0, 3],
    },
    {
      text: `Commessa: ${d.commessa.order_code || d.commessa.id} · ${
        d.commessa.description || ""
      }`,
    },
    {
      text: `Cantiere: ${
        d.commessa.work_address || "Indirizzo non registrato"
      }`,
    },
    {
      text: `Periodo indicato per il verbale: ${data(d.periodo_dal)} — ${
        data(d.periodo_al)
      }`,
      margin: [0, 6, 0, 0],
    },
    titolo("2 · Lavori e informazioni disponibili"),
    { text: d.contratto.descrizione_lavori },
    ...(d.lavori?.length
      ? [
        nota(
          "Rilevazioni interne riconosciute e collegate a questo SAL. Le quantità sono del periodo e valorizzate ai prezzi acquisiti nella base lavori. Per i lavori a corpo 1 quota equivale al 100% del lavoro. La verifica registrata non sostituisce una sottoscrizione del verbale.",
        ),
        {
          table: {
            headerRows: 1,
            keepWithHeaderRows: 1,
            widths: ["*", 45, 62, 32, 60, 60],
            body: [
              [
                "Lavorazione / rilievo",
                "Dichiarata",
                "Riconosciuta",
                "Unità",
                "Prezzo unitario",
                "Importo",
              ].map((text) => ({ text, bold: true })),
              ...d.lavori.map(
                (l) => [
                  `${l.descrizione}\n${
                    data(l.data_rilievo)
                  } · Base rev. ${l.revisione_quadro}`,
                  String(l.quantita_dichiarata),
                  String(l.quantita_riconosciuta),
                  l.unita,
                  euro(l.prezzo_unitario),
                  euro(l.importo),
                ],
              ),
            ],
          },
          layout: "lightHorizontalLines",
          fontSize: 8,
        },
        ...d.lavori.map((l) =>
          nota(
            `Rif. misura ${l.misura_id} · ${l.riferimento} · Verifica: ${l.nota_verifica} · Registrata il ${
              new Date(l.verificato_il).toLocaleString("it-IT", {
                timeZone: "Europe/Rome",
              })
            } · Attore ${l.verificato_da}`,
          )
        ),
      ]
      : [
        nota(
          "Descrizione tratta dal contratto. Questo SAL storico contiene importi aggregati: non sono registrate righe di misurazione, quantità o percentuali certificate. Il periodo e le osservazioni del verbale sono integrazioni dell'operatore, non misure validate automaticamente.",
        ),
      ]),
    { text: d.sal.note || "Nessuna nota associata al SAL." },
    ...(d.sal.note_contestazione
      ? [{
        text: `Contestazione registrata: ${d.sal.note_contestazione}`,
        color: "#b91c1c",
        margin: [0, 6, 0, 0],
      }]
      : []),
    titolo("3 · Riepilogo economico"),
    {
      table: {
        widths: ["*", 125],
        body: [
          riga(
            "Importo contrattuale (oneri esclusi)",
            euro(d.contratto.importo_contrattuale),
          ),
          riga(
            "Oneri di sicurezza contrattuali separati",
            euro(d.contratto.oneri_sicurezza),
          ),
          riga("Importo lordo del SAL del periodo", euro(r.lordo)),
          riga(
            `Ritenuta registrata (${d.sal.ritenuta_pct}%)`,
            euro(r.ritenuta),
          ),
          [{ text: "NETTO DEL SAL", bold: true, color: "#1e3a5f" }, {
            text: euro(r.netto),
            bold: true,
            alignment: "right",
            color: "#1e3a5f",
          }],
        ],
      },
      layout: "lightHorizontalLines",
    },
    nota(
      "Importi del SAL come registrati, al netto dell'IVA. Il netto non coincide automaticamente con una somma esigibile o con il residuo da pagare: verificare condizioni, fatture, acconti, compensazioni e pagamenti. Recuperi di acconti e allocazioni di pagamenti parziali non risultano in questo modello storico.",
    ),
    {
      table: {
        widths: ["*", 125],
        body: [
          riga(
            "SAL precedenti riconosciuti (verificati/pagati)",
            euro(r.precedenteRiconosciuto),
          ),
          riga(
            "Cumulativo riconosciuto incluso questo SAL, se verificato/pagato",
            euro(r.cumulativoRiconosciuto),
          ),
        ],
      },
      layout: "lightHorizontalLines",
    },
    nota(
      `I SAL sono trattati come importi del periodo secondo il registro esistente. I SAL ricevuti o contestati non entrano nel cumulativo riconosciuto. ${
        d.lavori?.length
          ? "Il SAL corrente coincide con il totale delle misure collegate; i SAL precedenti mantengono la loro base storica."
          : "Non è stata eseguita una riconciliazione con il computo o le quantità."
      }`,
    ),
    {
      unbreakable: true,
      margin: [0, 12, 0, 0],
      table: {
        widths: ["*"],
        body: [[{
          fillColor: benestare.autorizzato ? "#ecfdf5" : "#fffbeb",
          margin: [10, 8, 10, 8],
          stack: [
            { text: benestare.titolo.toUpperCase(), bold: true, fontSize: 10, color: benestare.autorizzato ? "#047857" : "#b45309" },
            { text: benestare.testo, margin: [0, 4, 0, 4] },
            ...(benestare.righe.length
              ? [{
                table: {
                  widths: ["*", 110],
                  body: benestare.righe.map(([a, b], i) => [
                    { text: a, bold: i === benestare.righe.length - 1, color: "#334155" },
                    { text: b, bold: i === benestare.righe.length - 1, alignment: "right" },
                  ]),
                },
                layout: "noBorders",
                margin: [0, 2, 0, 4],
              }]
              : []),
            ...benestare.istruzioni.map((t) => ({ text: `• ${t}`, fontSize: 8, color: "#475569", margin: [0, 1, 0, 1] })),
          ],
        }]],
      },
      layout: { hLineColor: () => (benestare.autorizzato ? "#6ee7b7" : "#fcd34d"), vLineColor: () => (benestare.autorizzato ? "#6ee7b7" : "#fcd34d") },
    },
    {
      unbreakable: true,
      pageBreak: "before",
      stack: [
        titolo("4 · Garanzie e ritenute"),
        {
          text:
            `Aliquota del SAL: ${d.sal.ritenuta_pct}% · Ritenuta del periodo: ${
              euro(r.ritenuta)
            }. Aliquota nel contratto corrente: ${
              d.contratto.ritenuta_garanzia_pct == null
                ? "non registrata"
                : `${d.contratto.ritenuta_garanzia_pct}%`
            }.`,
        },
        nota(
          "La percentuale è quella registrata nel SAL: non viene sostituita automaticamente da un'aliquota standard o da successive modifiche del contratto.",
        ),
      ],
    },
    ...(d.contratto.ritenuta_garanzia_pct != null &&
        Number(d.contratto.ritenuta_garanzia_pct) !== Number(d.sal.ritenuta_pct)
      ? [
        nota(
          "Attenzione: aliquota del SAL diversa dal contratto corrente. Verificare l'accordo applicabile al periodo.",
        ),
      ]
      : []),
    ...(d.garanzie
      ? [
        {
          table: {
            widths: ["*", 125],
            body: [
              riga(
                "Ritenute dei SAL riconosciuti fino a questo numero",
                euro(r.garanzie.maturate),
              ),
              riga(
                "Registro: ancora trattenute sui SAL riconosciuti",
                euro(r.garanzie.trattenute),
              ),
              riga(
                "Registro: svincolate sui SAL riconosciuti",
                euro(r.garanzie.svincolate),
              ),
              riga(
                "Registro: indicate come perse sui SAL riconosciuti",
                euro(r.garanzie.perse),
              ),
              riga(
                "Registro: garanzie con fideiussione sui SAL riconosciuti",
                euro(r.garanzie.fideiussioni),
              ),
            ],
          },
          layout: "lightHorizontalLines",
        },
        nota(
          "Quadro acquisito alla generazione e limitato ai SAL fino a questo numero. Le righe ricevute o contestate non concorrono alle somme riconosciute. Svincolata non significa pagata: lo svincolo non aumenta automaticamente il netto del SAL né registra un bonifico. La fideiussione resta distinta dalle somme trattenute in denaro.",
        ),
      ]
      : []),
    {
      text: d.contratto.garanzie ||
        "Condizioni specifiche di garanzia e svincolo non registrate nel contratto.",
    },
    nota(
      `Durata contrattuale registrata: ${
        d.contratto.durata_garanzia_mesi == null
          ? "non disponibile"
          : `${d.contratto.durata_garanzia_mesi} mesi`
      }. Fine lavori effettiva: ${
        d.contratto.data_fine_effettiva
          ? data(d.contratto.data_fine_effettiva)
          : "non registrata"
      }. Fine lavori prevista: ${
        d.contratto.data_fine_prevista
          ? data(d.contratto.data_fine_prevista)
          : "non registrata"
      }. Le date previste del registro sono promemoria: non autorizzano uno svincolo automatico.`,
    ),
    ...r.garanzie.avvisi.map((t) => ({ ...nota(t), color: "#b45309" })),
    ...(d.garanzie_non_attribuite
      ? [
        nota(
          `${d.garanzie_non_attribuite} garanzie del contratto senza SAL collegato sono escluse da questo riepilogo: verificarne l'attribuzione nel registro.`,
        ),
      ]
      : []),
    ...(d.garanzie?.length
      ? [{
        table: {
          headerRows: 1,
          keepWithHeaderRows: 1,
          widths: [32, "*", 65, 100],
          body: [
            [
              "SAL",
              "Registro / natura",
              "Importo",
              "Svincolo previsto / effettivo",
            ].map((text) => ({ text, bold: true })),
            ...d.garanzie.map((g) => [
              String(
                g.sal_id === d.sal.id
                  ? d.sal.numero_sal
                  : d.precedenti.find((s) => s.id === g.sal_id)?.numero_sal,
              ),
              `${g.stato}${
                g.fideiussione ? " · fideiussione" : " · denaro"
              }\nRif. ${g.id}${g.note ? `\n${g.note}` : ""}`,
              euro(g.importo),
              `${
                g.data_svincolo_prevista
                  ? data(g.data_svincolo_prevista)
                  : "Non prevista"
              } / ${
                g.data_svincolo_effettiva
                  ? data(g.data_svincolo_effettiva)
                  : "Non registrato"
              }`,
            ]),
          ],
        },
        layout: "lightHorizontalLines",
        fontSize: 8,
      }]
      : [
        nota(
          "Nessuna registrazione di garanzia collegata a questi SAL acquisita dal registro.",
        ),
      ]),
    titolo("5 · Condizioni e registrazioni"),
    {
      text: d.contratto.modalita_pagamento ||
        "Modalità di pagamento non registrate nel contratto.",
    },
    ...(d.sal.stato === "pagato"
      ? [
        {
          text: `Registrazione storica di pagamento: ${
            d.sal.data_pagamento ? data(d.sal.data_pagamento) : "data assente"
          } · ${d.sal.payment_method || "metodo assente"} · ${
            d.sal.payment_reference || "riferimento assente"
          }`,
        },
        nota(
          "La registrazione sul SAL non costituisce prova di riconciliazione bancaria.",
        ),
      ]
      : []),
    {
      // Keep short notes with their heading; long notes may flow across pages.
      unbreakable: (d.nota_verbale || "").length < 1200,
      stack: [
        titolo("6 · Osservazioni e riserve riportate nel verbale"),
        {
          text: d.nota_verbale ||
            "Nessuna integrazione inserita per questo verbale.",
        },
      ],
    },
    ...(d.allegati.length
      ? [
        {
          table: {
            headerRows: 2,
            keepWithHeaderRows: 1,
            widths: ["*", 65, 45],
            body: [
              [{ ...titolo("7 · Documenti allegati"), colSpan: 3 }, {}, {}],
              [{ text: "Documento / revisione", bold: true }, {
                text: "Stato fonte",
                bold: true,
              }, { text: "Pagine", bold: true }],
              ...d.allegati.map(
                (a) => [
                  `${a.titolo}${
                    a.revisione ? ` · Rev. ${a.revisione}` : ""
                  }\n${a.file_name}`,
                  a.stato,
                  String(a.pagine),
                ],
              ),
            ],
          },
          layout: "lightHorizontalLines",
        },
        ...d.allegati.map((a) => nota(`${a.file_name} · SHA-256 ${a.sha256}`)),
        nota(
          "Le copie sono accodate al verbale. Gli originali sono conservati nel pacchetto ZIP: le firme digitali degli allegati vanno controllate sui file originali, non sulle pagine ricopiate nel PDF composto. Il loro inserimento non attesta validità, completezza o verifica tecnica.",
        ),
      ]
      : [
        {
          unbreakable: true,
          stack: [
            titolo("7 · Documenti allegati"),
            nota(
              "Nessun documento selezionato. Il verbale non dichiara allegati assenti come acquisiti o verificati.",
            ),
          ],
        },
      ]),
    {
      unbreakable: true,
      stack: [
        titolo("8 · Sottoscrizioni da acquisire"),
        {
          text:
            `Impresa affidataria${benestare.autorizzato ? " (per il benestare alla fatturazione)" : ""}: _______________________    Data: ______________\n\nSubappaltatore: __________________________    Data: ______________`,
          margin: [0, 8, 0, 8],
        },
        nota(
          "Spazi per eventuali sottoscrizioni. Nessuna firma o accettazione viene aggiunta automaticamente dal sistema.",
        ),
      ],
    },
  ];
  return {
    pageSize: "A4",
    pageMargins: [40, 35, 40, 45],
    defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.15 },
    info: {
      title: `Verbale SAL subappalto ${d.sal.numero_sal}`,
      author: d.impresa.ragione_sociale,
      creator: d.versione,
    },
    watermark: r.bozza
      ? { text: "BOZZA", color: "gray", opacity: 0.1 }
      : undefined,
    pageBreakBefore: (node: any, container: any) =>
      node.headlineLevel === 1 &&
      container.getFollowingNodesOnPage().length === 0,
    content: contenuto,
    styles: {
      titolo: { fontSize: 17, bold: true, color: "#17324f" },
      impresa: { fontSize: 14, bold: true, color: "#17324f" },
      sezione: { fontSize: 11, bold: true, color: "#17324f" },
      etichetta: { fontSize: 8, bold: true, color: "#64748b" },
    },
    footer: (p: number, n: number) => ({
      text: `${
        d.commessa.order_code || "Commessa"
      } · SAL ${d.sal.numero_sal} · ${d.versione} · ${p}/${n}`,
      fontSize: 7,
      color: "#64748b",
      alignment: "center",
      margin: [30, 12, 30, 0],
    }),
  };
}
export async function pdfVerbaleSalSub(d: VerbaleSalSub, logoImpresa: string | null = null): Promise<Uint8Array> {
  return new Uint8Array(
    await pdfMake.createPdf(layoutVerbaleSalSub(d, logoImpresa)).getBuffer(),
  );
}
