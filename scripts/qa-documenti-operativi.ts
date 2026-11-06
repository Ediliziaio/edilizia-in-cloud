/** Esempi dimostrativi per verificare i cinque modelli con lo stesso motore dell'app. */
import { writeFileSync, mkdirSync } from "node:fs";
import { creaPdfOperativo } from "../src/lib/documentiOperativi/pdf";
import {
  nomeFileDocumento,
  type AziendaDocumento,
  type DocumentoOperativo,
} from "../src/lib/documentiOperativi/modello";
const a: AziendaDocumento = {
  id: "qa",
  name: "Impresa Demo",
  business_name: "Impresa Demo S.r.l.",
  legal_address: "Via Roma 10",
  legal_postal_code: "20100",
  legal_city: "Milano",
  legal_province: "MI",
  operational_address: "Via del Cantiere 20",
  operational_city: "Milano",
  vat_number: "00000000000",
  fiscal_code: "00000000000",
  email: "ufficio@demo.invalid",
  phone: "02 0000000",
  website: "www.demo.invalid",
};
const base = {
  numero: "DEMO-2026-001",
  data: "2026-11-05",
  destinatario: {
    nome: "Fornitore dimostrativo S.r.l.",
    indirizzo: "Via dei Materiali 15, Milano",
    partitaIva: "00000000000",
  },
  commessa: "DEMO-010",
  luogo: "Cantiere di prova - Via Verdi 12, Milano",
  referente: "Ufficio acquisti",
  pagamento: "Bonifico a 30 giorni data fattura",
  note: "SIMULAZIONE - documento di prova, non inviare e non evadere.",
};
const materiali = [
  {
    descrizione: "Travetti a traliccio\nSolaio H=20+4, interasse 50 cm",
    unita: "mq",
    quantita: 60,
    prezzo: 28.5,
    sconto: 0,
    iva: 22,
  },
  {
    descrizione: "Lastre tralicciate\nCopertura autorimessa H=5+14+5",
    unita: "mq",
    quantita: 35,
    prezzo: 26,
    sconto: 0,
    iva: 22,
  },
];
const docs: DocumentoOperativo[] = [
  {
    ...base,
    tipo: "richiesta",
    numero: "RDO-DEMO-001",
    consegna: "2026-11-24",
    scadenzaOfferta: "2026-11-10",
    righe: materiali.map((r) => ({ ...r, prezzo: null })),
  },
  {
    ...base,
    tipo: "materiali",
    numero: "ODA-DEMO-001",
    consegna: "2026-11-24",
    righe: materiali,
  },
  {
    ...base,
    tipo: "servizi",
    numero: "SERVIZI-DEMO-001",
    riferimento: "Preventivo del 28/10/2026",
    inizioLavori: "2026-11-12",
    fineLavori: "2026-11-30",
    inversioneContabile: true,
    righe: [
      {
        descrizione:
          "Impianto riscaldamento e acqua calda sanitaria\nPredisposizione climatizzazione e ventilazione meccanica",
        unita: "ac",
        quantita: 1,
        prezzo: 13195,
        iva: 0,
      },
    ],
  },
  {
    ...base,
    tipo: "trasporti",
    numero: "TRASPORTI-DEMO-001",
    periodo: "Novembre 2026",
    righe: [
      {
        descrizione: "Trasporto materiale",
        unita: "viaggio",
        quantita: 1,
        prezzo: 450,
        iva: 22,
        data: "2026-11-02",
        carico: "Deposito Milano",
        scarico: "Cantiere Monza",
        mezzo: "Camion gru",
        oreUomo: 6,
        oreMezzo: 6,
        ddt: "DEMO-68",
      },
      {
        descrizione: "Trasporto container",
        unita: "viaggio",
        quantita: 1,
        prezzo: 850,
        iva: 22,
        data: "2026-11-04",
        carico: "Deposito Monza",
        scarico: "Cantiere Milano",
        mezzo: "Bilico",
        oreUomo: 8,
        oreMezzo: 8,
        ddt: "DEMO-70",
      },
    ],
  },
  {
    ...base,
    tipo: "economia",
    numero: "ECONOMIA-DEMO-001",
    periodo: "01/11/2026 - 05/11/2026",
    righe: [
      {
        gruppo: "02/11/2026 - Sistemazione vasca",
        descrizione: "Manodopera - Operaio demo",
        unita: "h",
        quantita: 8,
        prezzo: 32,
        iva: 22,
      },
      {
        gruppo: "02/11/2026 - Sistemazione vasca",
        descrizione: "Materiale - Malta da ricostruzione, sacco 25 kg",
        unita: "nr",
        quantita: 12,
        prezzo: 29,
        iva: 22,
      },
      {
        gruppo: "04/11/2026 - Raschiatura e stuccatura",
        descrizione: "Manodopera - Operaio demo",
        unita: "h",
        quantita: 8,
        prezzo: 32,
        iva: 22,
      },
      {
        gruppo: "04/11/2026 - Raschiatura e stuccatura",
        descrizione: "Nolo - Aspiratore compreso trasporto",
        unita: "ac",
        quantita: 1,
        prezzo: 180,
        iva: 22,
      },
    ],
  },
];
docs.push({
  ...base,
  tipo: "materiali",
  numero: "ODA-SENZA-PREZZI-DEMO",
  prezziDaConfermare: true,
  righe: [
    {
      descrizione: "Profilo angolare alluminio su misura 35x35",
      unita: "pz",
      quantita: 6,
      prezzo: null,
    },
  ],
});
mkdirSync("output/pdf", { recursive: true });
for (const d of docs) {
  const pdf = creaPdfOperativo(d, a);
  writeFileSync(
    `output/pdf/${nomeFileDocumento(d)}`,
    new Uint8Array(pdf.output("arraybuffer")),
  );
}
