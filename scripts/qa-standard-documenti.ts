/** Simulazioni ripetibili dei cinque standard: nessun accesso o invio a fornitori. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { creaPdfOperativo } from "../src/lib/documentiOperativi/pdf";
import {
  corpoDocumento,
  erroriDocumento,
  totaliDocumento,
  type AziendaDocumento,
  type DocumentoOperativo,
} from "../src/lib/documentiOperativi/modello";
import { STANDARD_DOCUMENTI } from "../src/lib/documentiOperativi/standard";
const out = "output/pdf/simulazioni-standard";
mkdirSync(out, { recursive: true });
const azienda: AziendaDocumento = {
  id: "qa-a",
  name: "Impresa Dimostrativa S.r.l.",
  business_name: "Impresa Dimostrativa S.r.l.",
  legal_address: "Via dei Cantieri 10",
  legal_city: "Milano",
  legal_postal_code: "20100",
  legal_province: "MI",
  vat_number: "00000000000",
  email: "ufficio@impresa-demo.invalid",
  phone: "02 0000000",
  website: "www.impresa-demo.invalid",
};
const altraAzienda: AziendaDocumento = {
  id: "qa-b",
  name: "Seconda Impresa Demo S.r.l.",
  legal_address: "Via Roma 20",
  legal_city: "Torino",
  legal_province: "TO",
  vat_number: "11111111111",
  email: "acquisti@seconda-demo.invalid",
};
const base = {
  numero: "SIMULAZIONE",
  data: "2026-11-05",
  destinatario: {
    nome: "Fornitore Materiali Demo S.r.l.",
    indirizzo: "Via delle Forniture 12, 20100 Milano (MI)",
    partitaIva: "22222222222",
    email: "ordini@fornitore-demo.invalid",
  },
  commessa: "C-2026-001",
  luogo: "Cantiere dimostrativo - Via Verdi 24, Milano (MI)",
  referenteConsegna: "Responsabile cantiere DEMO - 02 0000000",
  pagamento: "Bonifico a 30 giorni data fattura",
  consegna: "2026-11-20",
  note: "SIMULAZIONE - non inviare e non evadere. Scarico su appuntamento; mantenere il riferimento su DDT e fattura.",
};
const materiali = [
  {
    descrizione: "Travetti a traliccio\nSolaio H=20+4, interasse 50 cm",
    unita: "mq",
    quantita: 60,
    prezzo: 28.5,
    iva: 22,
    sconto: 0,
  },
  {
    descrizione: "Lastre tralicciate\nCopertura autorimessa H=5+14+5",
    unita: "mq",
    quantita: 35,
    prezzo: 26,
    iva: 22,
    sconto: 0,
  },
];
const ore = [
  {
    gruppo: "03/11/2026 - Ripristino vasca",
    descrizione: "Manodopera - Operaio DEMO A",
    unita: "h",
    quantita: 8,
    prezzo: 32,
    iva: null,
  },
  {
    gruppo: "03/11/2026 - Ripristino vasca",
    descrizione: "Materiale - Malta ricostruzione, sacco 25 kg",
    unita: "nr",
    quantita: 12,
    prezzo: 29,
    iva: null,
  },
  {
    gruppo: "04/11/2026 - Raschiatura e stuccatura",
    descrizione: "Manodopera - Operaio DEMO B",
    unita: "h",
    quantita: 8,
    prezzo: 32,
    iva: null,
  },
  {
    gruppo: "04/11/2026 - Raschiatura e stuccatura",
    descrizione: "Nolo - Aspiratore compreso trasporto",
    unita: "ac",
    quantita: 1,
    prezzo: 180,
    iva: null,
  },
  {
    gruppo: "04/11/2026 - Raschiatura e stuccatura",
    descrizione: "Materiale - Recupero piastrelle esistenti, incluso",
    unita: "ac",
    quantita: 1,
    prezzo: 0,
    iva: null,
  },
];
const viaggi = [
  {
    descrizione: "Trasporto materiale",
    unita: "viaggio",
    quantita: 1,
    prezzo: 450,
    iva: 22,
    data: "2026-11-03",
    carico: "Deposito Cernusco sul Naviglio",
    scarico: "Cantiere Lonate Pozzolo",
    mezzo: "Bilico",
    oreUomo: 6,
    oreMezzo: 6,
    ddt: "68",
  },
  {
    descrizione: "Trasporto container",
    unita: "viaggio",
    quantita: 1,
    prezzo: 850,
    iva: 22,
    data: "2026-11-04",
    carico: "Deposito logistico di Crespellano",
    scarico: "Segrate e Cornaredo - accesso cancello 4",
    mezzo: "Camion gru",
    oreUomo: 12,
    oreMezzo: 12,
    ddt: "75 - 76",
  },
];
type Caso = {
  nome: string;
  documento: DocumentoOperativo;
  azienda?: AziendaDocumento;
  logo?: string;
};
const casi: Caso[] = [
  {
    nome: "01-OdA-prezzi-concordati",
    documento: {
      ...base,
      tipo: "materiali",
      numero: "ODA-SIM-001",
      righe: materiali,
    },
  },
  {
    nome: "02-OdA-articolo-nuovo-senza-prezzo",
    documento: {
      ...base,
      tipo: "materiali",
      numero: "ODA-SIM-002",
      prezziDaConfermare: true,
      righe: [
        {
          descrizione: "Nuovo profilo angolare alluminio su misura 35x35",
          unita: "pz",
          quantita: 6,
          prezzo: null,
          iva: null,
        },
      ],
    },
  },
  {
    nome: "03-OdA-misto-prezzi-e-sconti",
    documento: {
      ...base,
      tipo: "materiali",
      numero: "ODA-SIM-003",
      prezziDaConfermare: true,
      righe: [
        { ...materiali[0], sconto: 10 },
        {
          descrizione: "Accessorio speciale da quotare dal fornitore",
          unita: "pz",
          quantita: 12,
          prezzo: null,
        },
      ],
    },
  },
  {
    nome: "04-OdA-multipagina",
    documento: {
      ...base,
      tipo: "materiali",
      numero: "ODA-SIM-004-RIFERIMENTO-LUNGO-2026",
      righe: Array.from({ length: 70 }, (_, i) => ({
        ...materiali[i % 2],
        descrizione:
          `Voce ${i + 1} - ` +
          materiali[i % 2].descrizione +
          "\nDescrizione tecnica con finitura, dimensioni e istruzioni di posa concordate.",
        sconto: 5,
      })),
    },
  },
  {
    nome: "05-RDO-magazzino",
    documento: {
      ...base,
      tipo: "richiesta",
      numero: "RDO-SIM-001",
      destinazioneTipo: "magazzino",
      luogo:
        "Magazzino principale - Via del Deposito 18, Sesto San Giovanni (MI)",
      scadenzaOfferta: "2026-11-12",
      righe: materiali.map((r) => ({ ...r, prezzo: null })),
    },
  },
  {
    nome: "06-RDO-altro-fornitore-e-ritiro",
    documento: {
      ...base,
      tipo: "richiesta",
      numero: "RDO-SIM-002",
      destinatario: {
        nome: "Secondo Fornitore Demo S.r.l.",
        email: "commerciale@secondo-fornitore.invalid",
        indirizzo: "Via delle Officine 20, Monza (MB)",
        partitaIva: "33333333333",
      },
      pagamento: "RI.BA. 60 giorni fine mese",
      referente: "Ufficio ordini secondo fornitore",
      referenteEmail: "ordini@secondo-fornitore.invalid",
      destinazioneTipo: "ritiro",
      luogo:
        "Deposito del secondo fornitore - Via delle Officine 20, Monza (MB)",
      scadenzaOfferta: "2026-11-15",
      righe: materiali.map((r) => ({ ...r, prezzo: null })),
    },
  },
  {
    nome: "07-RDO-multipagina",
    documento: {
      ...base,
      tipo: "richiesta",
      numero: "RDO-SIM-003",
      righe: Array.from({ length: 65 }, (_, i) => ({
        ...materiali[i % 2],
        descrizione: `Materiale ${i + 1} - ` + materiali[i % 2].descrizione,
        prezzo: null,
      })),
      scadenzaOfferta: "2026-11-15",
    },
  },
  {
    nome: "08-Servizi-inversione-contabile",
    documento: {
      ...base,
      tipo: "servizi",
      numero: "SERVIZI-SIM-001",
      riferimento: "Vs. preventivo del 28/10/2026",
      inizioLavori: "2026-11-12",
      fineLavori: "2026-11-30",
      inversioneContabile: true,
      pagamento: "Da concordare con il fornitore",
      righe: [
        {
          descrizione:
            "Impianti come da vostro preventivo\nRiscaldamento e ACS\nPredisposizione climatizzazione\nVentilazione meccanica",
          unita: "ac",
          quantita: 1,
          prezzo: 13195,
          iva: 0,
        },
      ],
    },
  },
  {
    nome: "09-Servizi-senza-prezzo",
    documento: {
      ...base,
      tipo: "servizi",
      numero: "SERVIZI-SIM-002",
      prezziDaConfermare: true,
      righe: [
        {
          descrizione:
            "Lavorazione aggiuntiva da quotare\nFornitura e posa su misura",
          unita: "ac",
          quantita: 1,
          prezzo: null,
        },
      ],
    },
  },
  {
    nome: "10-Trasporti-mensile",
    documento: {
      ...base,
      tipo: "trasporti",
      numero: "TRASP-SIM-001",
      periodo: "Novembre 2026",
      pagamento: "Bonifico 60 giorni fine mese + 15",
      banca: "Banca dimostrativa",
      iban: "IBAN dimostrativo - non utilizzare",
      righe: viaggi,
    },
  },
  {
    nome: "11-Trasporti-multipagina",
    documento: {
      ...base,
      tipo: "trasporti",
      numero: "TRASP-SIM-002",
      periodo: "Novembre 2026",
      righe: Array.from({ length: 50 }, (_, i) => ({
        ...viaggi[i % 2],
        ddt: `DDT-${i + 1}`,
      })),
    },
  },
  {
    nome: "12-Economia-quantita-e-totale-netto",
    documento: {
      ...base,
      tipo: "economia",
      numero: "ECON-SIM-001",
      periodo: "01/11/2026 - 05/11/2026",
      righe: ore,
    },
  },
  {
    nome: "13-Economia-multipagina",
    documento: {
      ...base,
      tipo: "economia",
      numero: "ECON-SIM-002",
      periodo: "Novembre 2026",
      righe: Array.from({ length: 15 }, (_, i) =>
        ore.map((r) => ({
          ...r,
          gruppo: `Intervento ${i + 1} - Ripristino e finiture`,
        })),
      ).flat(),
    },
  },
  {
    nome: "14-Altra-azienda-stesso-standard",
    azienda: altraAzienda,
    documento: {
      ...base,
      tipo: "materiali",
      numero: "ODA-ALTRA-AZIENDA-001",
      righe: materiali.map((r) => ({ ...r, iva: 10, sconto: 7 })),
    },
  },
];
const logoArg = process.argv.indexOf("--logo-vulcano");
if (logoArg >= 0) {
  const c = casi[13];
  c.logo =
    "data:image/png;base64," +
    readFileSync(process.argv[logoArg + 1]).toString("base64");
  c.azienda = {
    id: "qa-vulcano",
    name: "Impresa Vulcano S.r.l.",
    legal_address: "Via Marconi 35, Lonate Pozzolo (VA)",
    operational_address: "Via dei Mille 3, Vanzaghello (MI)",
    vat_number: "06923340969",
    email: "info@impresavulcano.it",
  };
}
const manifest = [];
for (const caso of casi) {
  const d = caso.documento,
    a = caso.azienda || azienda,
    errors = erroriDocumento(d);
  if (errors.length) throw new Error(`${caso.nome}: ${errors.join(" ")}`);
  const pdf = creaPdfOperativo(d, a, caso.logo);
  writeFileSync(
    `${out}/${caso.nome}.pdf`,
    new Uint8Array(pdf.output("arraybuffer")),
  );
  writeFileSync(
    `${out}/${caso.nome}-email.html`,
    `<!doctype html><html lang="it"><meta charset="utf-8"><title>SIMULAZIONE EMAIL</title><body style="font-family:Arial;max-width:900px;margin:30px auto"><p><strong>SIMULAZIONE NON INVIATA</strong> - A: ${d.destinatario.email}</p>${corpoDocumento(d, a)}<hr><h3>Alternativa: messaggio con PDF allegato</h3>${corpoDocumento(d, a, true)}</body></html>`,
  );
  manifest.push({
    nome: caso.nome,
    azienda: a.name,
    tipo: d.tipo,
    titolo: STANDARD_DOCUMENTI[d.tipo].titoloPdf,
    numero: d.numero,
    pagine: pdf.getNumberOfPages(),
    righe: d.righe.length,
    totali: totaliDocumento(d),
    prezziDaConfermare: !!d.prezziDaConfermare,
  });
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(
  JSON.stringify(
    manifest.map(({ nome, pagine, righe }) => ({ nome, pagine, righe })),
    null,
    2,
  ),
);
