import {describe,it,expect} from "vitest";
import ExcelJS from "exceljs";
import {leggiFileNoleggio,righeDaGriglia,mappaSuggerita} from "@/lib/finanziamenti/noleggio/importazione";
async function fileExcel(formula=false){const book=new ExcelJS.Workbook();book.addWorksheet("Note").addRow(["Istruzioni"]);const foglio=book.addWorksheet("Condizioni");foglio.addRow(["importo_da","importo_a","durata_mesi","periodo_mesi","coefficiente","unita"]);foglio.addRow([1000,500000,60,3,formula?{formula:"2+3",result:5}:5.4,"percentuale_periodo"]);const buffer=await book.xlsx.writeBuffer();return {name:"condizioni-test.xlsx",size:buffer.byteLength,arrayBuffer:async()=>buffer} as File;}
describe("Lettura Excel noleggio",()=>{
 it("legge il foglio selezionato e conserva i valori numerici senza interpretare formule",async()=>{const r=await leggiFileNoleggio(await fileExcel(),1);expect(r.fogli).toEqual(["Note","Condizioni"]);const dati=righeDaGriglia(r.griglia,mappaSuggerita(r.griglia.colonne),"",3);expect(dati.errori).toEqual([]);expect(dati.righe[0]).toMatchObject({coefficiente:5.4,importoDa:1000,periodoMesi:3});});
 it("rifiuta formule anche con risultato memorizzato",async()=>{await expect(leggiFileNoleggio(await fileExcel(true),1)).rejects.toThrow(/formule/);});
});
