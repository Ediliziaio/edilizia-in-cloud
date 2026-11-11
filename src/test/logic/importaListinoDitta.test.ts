/**
 * Lotto 7 (10/11/2026): il listino di una ditta da Excel/CSV. Intestazione trovata anche sotto un titolo,
 * numeri all'italiana, abbinamento per codice e per nome, unità diverse e prezzi fuori scala lasciati
 * fuori (R17), voci delle altre ditte mai proposte, due prezzi sulla stessa voce rifiutati.
 */
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  daSalvareImport, numeroListino, prezzoFuoriScala, proponiImport, righeDaTabella, tabellaDaFile, type VoceListinoConCosto,
} from "@/lib/subappaltatori/importaListinoDitta";

const listino: VoceListinoConCosto[] = [
  { id: "t1", nome: "Intonaco civile", codice: "INT01", unita: "mq", costo: 15 },
  { id: "t2", nome: "Rasatura a gesso", codice: null, unita: "mq", costo: 8 },
  { id: "t3", nome: "Massetto", codice: "MAS", unita: "mq", costo: 12 },
  { id: "t4", nome: "Punto luce", codice: "PL", unita: "pz", costo: null, subappaltatore_id: "bianchi" },
  { id: "t5", nome: "Assistenza muraria", codice: "AM", unita: "h", costo: 30 },
];

describe("listino della ditta da un file", () => {
  it("trova l'intestazione sotto il titolo e legge i numeri all'italiana", () => {
    const { righe, errore } = righeDaTabella([
      ["LISTINO PREZZI 2027 — ROSSI SRL"],
      [],
      ["Cod.", "Descrizione lavorazione", "U.M.", "Prezzo unitario €"],
      ["INT01", "Intonaco civile", "mq", "14,00"],
      ["", "Rasatura a gesso", "m2", "€ 8,50"],
      ["", "", "", ""],
      ["X9", "Ponteggio (a corpo)", "a corpo", "1.250,00"],
      ["", "Voce senza prezzo", "mq", ""],
    ]);
    expect(errore).toBeNull();
    expect(righe.map((r) => [r.riga, r.codice, r.descrizione, r.unita, r.prezzo])).toEqual([
      [4, "INT01", "Intonaco civile", "mq", 14],
      [5, null, "Rasatura a gesso", "m2", 8.5],
      [7, "X9", "Ponteggio (a corpo)", "a corpo", 1250],
      [8, null, "Voce senza prezzo", "mq", null],
    ]);
    expect(numeroListino(14.5)).toBe(14.5);
    expect(numeroListino("abc")).toBeNull();
  });

  it("senza colonne di descrizione e prezzo lo dice", () => {
    expect(righeDaTabella([["Nome", "Telefono"], ["Rossi", "333"]]).errore).toMatch(/Descrizione.*Prezzo/);
  });

  it("abbina per codice e per nome; unità diverse, fuori scala e senza prezzo restano fuori; il resto diventa voce sua", () => {
    const righe = righeDaTabella([
      ["Codice", "Descrizione", "UM", "Prezzo"],
      ["INT01", "Intonaco (testo diverso)", "mq", "14"],
      ["", "RASATURA A GESSO", "m²", "8,5"],
      ["MAS", "Massetto", "ml", "10"],
      ["AM", "Assistenza", "h", "300"],
      ["", "Punto luce", "pz", "38"],
      ["", "Voce senza prezzo", "mq", ""],
    ]).righe;
    const p = proponiImport(righe, listino, "rossi");
    expect(p.map((x) => [x.scelta.tipo, x.scelta.tipo === "voce" ? x.scelta.tariffaId : null, x.motivo])).toEqual([
      ["voce", "t1", "codice"],
      ["voce", "t2", "nome"],
      ["salta", null, "codice"],
      ["salta", null, "codice"],
      // Il punto luce di Bianchi non si propone a Rossi: per lui è una voce nuova.
      ["nuova", null, null],
      ["salta", null, null],
    ]);
    expect(p[2].avviso).toMatch(/Unità diversa/);
    expect(p[3].fuoriScala).toBe(true);
    expect(p[5].avviso).toBe("Senza prezzo");
  });

  it("le voci sue della stessa ditta si ritrovano (ricaricare il listino aggiorna i prezzi)", () => {
    const [p] = proponiImport([{ riga: 2, codice: "PL", descrizione: "Punto luce", unita: "pz", prezzo: 40 }], listino, "bianchi");
    expect(p.scelta).toEqual({ tipo: "voce", tariffaId: "t4" });
  });

  it("due righe sulla stessa voce: la seconda resta fuori, e scelta a mano diventa un errore", () => {
    const righe = [
      { riga: 2, codice: "INT01", descrizione: "Intonaco", unita: "mq", prezzo: 14 },
      { riga: 3, codice: "INT01", descrizione: "Intonaco bis", unita: "mq", prezzo: 13 },
    ];
    const p = proponiImport(righe, listino, "rossi");
    expect(p[1].scelta.tipo).toBe("salta");
    const forzata = [p[0], { ...p[1], scelta: { tipo: "voce" as const, tariffaId: "t1" } }];
    const { prezzi, errori } = daSalvareImport(forzata, () => true);
    expect(prezzi).toEqual([{ tariffa_id: "t1", costo: 14 }]);
    expect(errori[0]).toMatch(/Righe 2 e 3/);
  });

  it("cosa si salva: prezzi delle voci trovate e voci nuove con unità riconosciuta", () => {
    const righe = [
      { riga: 2, codice: "INT01", descrizione: "Intonaco", unita: "mq", prezzo: 14.12345 },
      { riga: 3, codice: null, descrizione: "Lavoro strano", unita: "boh", prezzo: 5 },
      { riga: 4, codice: null, descrizione: "Punto presa", unita: "pz", prezzo: 22 },
    ];
    const { prezzi, nuove, errori } = daSalvareImport(proponiImport(righe, listino, "rossi"), (u) => u !== "boh");
    expect(prezzi).toEqual([{ tariffa_id: "t1", costo: 14.1235 }]);
    expect(nuove.map((r) => r.descrizione)).toEqual(["Punto presa"]);
    expect(errori[0]).toMatch(/Riga 3.*boh/);
  });

  it("fuori scala: meno di un quinto o più di cinque volte il costo nostro", () => {
    expect(prezzoFuoriScala(2.9, 15)).toBe(true);
    expect(prezzoFuoriScala(3, 15)).toBe(false);
    expect(prezzoFuoriScala(76, 15)).toBe(true);
    expect(prezzoFuoriScala(76, null)).toBe(false);
  });

  it("legge un file Excel vero e un CSV col punto e virgola", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Note").addRow(["Solo note"]);
    const ws = wb.addWorksheet("Listino");
    for (const r of [["Codice", "Descrizione", "U.M.", "Prezzo"], ["INT01", "Intonaco civile", "mq", 14], ["", "Rasatura", "mq", "8,50"]]) ws.addRow(r);
    const buf = await wb.xlsx.writeBuffer();
    const xlsx = new File([buf], "listino.xlsx");
    expect(righeDaTabella(await tabellaDaFile(xlsx)).righe.map((r) => r.prezzo)).toEqual([14, 8.5]);
    const csv = new File(["﻿Codice;Descrizione;UM;Prezzo\nINT01;\"Intonaco; civile\";mq;14\n"], "l.csv", { type: "text/csv" });
    expect(righeDaTabella(await tabellaDaFile(csv)).righe[0]).toMatchObject({ descrizione: "Intonaco; civile", prezzo: 14 });
  });

  // Simulazione dell'11/11/2026 con listini scritti come quelli veri.
  it("il prezzo si legge anche col contorno; un intervallo resta vuoto", () => {
    for (const t of ["30,00 €/mq", "30,00/mq", "€/mq 30,00", "30 euro", "30,00 + IVA", "30,00 cad", "EUR 30,00"]) expect(numeroListino(t), t).toBe(30);
    expect(numeroListino("1.250,00 €/cad")).toBe(1250);
    for (const t of ["15-40", "da 15 a 40", "a corpo", "-"]) expect(numeroListino(t), t).toBeNull();
  });

  it("le colonne giuste con le intestazioni che si trovano davvero", () => {
    const prova = (h: string[]) => righeDaTabella([h, h.map((_, i) => String((i + 1) * 100))]).righe[0];
    expect(prova(["Articolo", "Descrizione", "UM", "Prezzo"])).toMatchObject({ codice: "100", descrizione: "200", unita: "300", prezzo: 400 });
    expect(prova(["Art.", "Descrizione dei lavori", "Unità", "P.U."])).toMatchObject({ codice: "100", descrizione: "200", prezzo: 400 });
    expect(prova(["TARIFFA", "DESIGNAZIONE DEI LAVORI", "UNITA' DI MISURA", "PREZZO UNITARIO"])).toMatchObject({ codice: "100", descrizione: "200", unita: "300", prezzo: 400 });
    expect(prova(["Lavori", "U.M.", "Euro"])).toMatchObject({ descrizione: "100", unita: "200", prezzo: 300 });
    // Il costo dei materiali non è il prezzo della ditta, e l'importo neanche.
    expect(prova(["Descrizione", "UM", "Costo materiali", "Prezzo posa"])).toMatchObject({ prezzo: 400 });
    expect(prova(["Descrizione", "Quantità", "UM", "Prezzo", "Importo"])).toMatchObject({ prezzo: 400 });
    expect(prova(["Voce", "UM", "Prezzo al mq"])).toMatchObject({ descrizione: "100", prezzo: 300 });
  });

  it("totali, note e titoli di sezione non diventano voci", () => {
    const { righe: r } = righeDaTabella([["Descrizione", "UM", "Prezzo"], ["OPERE MURARIE", "", ""], ["Intonaco civile", "mq", "18"], ["Totale", "", "18"], ["Note: prezzi IVA esclusa", "", ""]]);
    expect(r.map((x) => x.descrizione)).toEqual(["Intonaco civile"]);
  });

  it("nome simile: si propone dicendolo; una voce diversa non si aggancia", () => {
    const voci: VoceListinoConCosto[] = [
      { id: "f", nome: "Posa finestra singola", codice: null, unita: "pz", costo: 55 },
      { id: "t", nome: "Tiro al piano", codice: null, unita: "piano", costo: 8 },
    ];
    const riga = (descrizione: string, unita: string, riga = 2) => ({ riga, codice: null as string | null, descrizione, unita, prezzo: 90 });
    const [simile] = proponiImport([riga("Posa di finestre singole", "pz")], voci, "rossi");
    expect(simile).toMatchObject({ scelta: { tipo: "voce", tariffaId: "f" }, motivo: "simile" });
    expect(simile.avviso).toMatch(/Nome simile/);
    for (const d of ["Posa finestra", "Posa finestra singola scorrevole", "Fornitura finestra singola"]) {
      expect(proponiImport([riga(d, "pz")], voci, "rossi")[0].scelta.tipo, d).toBe("nuova");
    }
  });
});
