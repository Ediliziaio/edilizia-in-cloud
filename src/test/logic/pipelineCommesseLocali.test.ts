import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { pipelineStore } from "../../../dev/pipeline-commesse/store.mts";

const connections: DatabaseSync[] = [];
const dirs: string[] = [];
function apri(file: string) {
  const connessione = new DatabaseSync(file);
  connections.push(connessione);
  return pipelineStore(connessione);
}
afterEach(() => {
  connections.splice(0).forEach(db => db.close());
  dirs.splice(0).forEach(path => rmSync(path, {recursive:true,force:true}));
});
it("due connessioni condividono pipeline e spostamenti solo per la stessa azienda", () => {
  const dir = mkdtempSync(join(tmpdir(),"pipeline-commesse-")); dirs.push(dir);
  const file = join(dir,"prova.sqlite");
  const admin = apri(file), collega = apri(file);
  const azienda = randomUUID(), altra = randomUUID(), ordine = randomUUID();
  const rilievo = { id: randomUUID(), name:"Rilievo", color:"#112233" };
  const posa = { ...rilievo, id:randomUUID(), name:"Posa" };
  const pipeline = { id:randomUUID(), nome:"Serramenti", fasi:[rilievo,posa] };
  admin.salva(azienda,pipeline);
  expect(collega.elenco(azienda)).toEqual([{...pipeline, versione:1}]);
  expect(collega.elenco(altra)).toEqual([]);
  expect(()=>collega.assegna(altra,ordine,posa.id,null)).toThrow();
  admin.assegna(azienda,ordine,rilievo.id,null);
  collega.assegna(azienda,ordine,posa.id,rilievo.id);
  expect(admin.assegnazioni(azienda)[ordine]).toBe(posa.id);
  expect(()=>admin.assegna(azienda,ordine,null,rilievo.id)).toThrow(/collega/);
  expect(()=>admin.salva(azienda,{...pipeline,versione:1,fasi:[rilievo]})).toThrow(/Sposta/);
  collega.salva(azienda,{...pipeline,versione:1,nome:"Infissi"});
  expect(()=>admin.salva(azienda,{...pipeline,versione:1})).toThrow(/modificata/);
  expect(apri(file).assegnazioni(azienda)[ordine]).toBe(posa.id);
  admin.assegna(azienda,ordine,null,posa.id);
  expect(collega.assegnazioni(azienda)).toEqual({});
});
