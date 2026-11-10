import { describe, expect, it } from "vitest";
import { anomalieCollegamenti, filtroContesto } from "@/lib/planimetrie/coerenzaCollegamenti";
import { idComputoNativo, percorsoComputoCommessa, percorsoComputoNativo } from "@/lib/computo/percorsiComputo";
import { percorsoProgettoAssociato, ritornoProgettoValido } from "@/lib/planimetrie/render/percorsi";
import { riepilogaVersioni } from "@/lib/planimetrie/utilizziPianta";

const uuid = "149caa43-e50b-49de-8ff8-1674c4e157aa";
describe("Flusso del progetto sulle schede esistenti", () => {
  it("apre il computo della commessa per identificativo e conserva la vista articoli", () => {
    expect(percorsoComputoCommessa(uuid, "k1")).toBe(`/azienda/ordini/${uuid}?tab=articoli&computo=k1`);
  });
  it("riconosce solo i computi nativi con riferimento valido e richiede una bozza esistente", () => {
    expect(idComputoNativo(`modulo:computo:${uuid}`)).toBe(uuid);
    expect(idComputoNativo("modulo:bagni:qualcosa")).toBeNull();
    expect(idComputoNativo("modulo:computo:nuovo")).toBeNull();
    expect(percorsoComputoNativo(uuid)).toContain("esistente=1");
  });
  it("limita i computi alla commessa scelta e le commesse al cliente", () => {
    expect(filtroContesto("computo", { commessa: { id: "o1", nome: "Commessa" } })).toMatchObject({ colonna: "order_id", id: "o1" });
    expect(filtroContesto("commessa", { cliente: { id: "c1", nome: "Cliente" } })).toMatchObject({ colonna: "customer_id", id: "c1" });
  });
  it("non ricava un contatto dai nomi simili e non nasconde preventivi senza un riferimento certo", () => {
    expect(filtroContesto("preventivo", { cliente: { id: "c1", nome: "Mario Rossi" } })).toBeUndefined();
    expect(anomalieCollegamenti({ cliente: { id: "c1", nome: "Mario Rossi" }, preventivo: { id: "q1", nome: "Mario Rossi" } })).toEqual([]);
  });
  it("segnala i riferimenti discordanti senza modificarli", () => {
    const scelte = { cliente: { id: "c1", nome: "Cliente" }, commessa: { id: "o1", nome: "Commessa", riferimenti: { clienteId: "c2" } }, computo: { id: "k1", nome: "Computo", riferimenti: { commessaId: "o2" } } };
    expect(anomalieCollegamenti(scelte)).toHaveLength(2);
    expect(scelte.commessa.riferimenti.clienteId).toBe("c2");
  });
  it("porta al fascicolo corrente con un ritorno alla scheda originale", () => {
    const torna = `/azienda/ordini/${uuid}?tab=articoli&computo=1`;
    const url = new URL(percorsoProgettoAssociato("p1", torna, true), "https://app.invalid");
    expect(url.searchParams.get("esporta")).toBe("fascicolo");
    expect(ritornoProgettoValido(url.searchParams.get("torna"))).toBe(torna);
  });
  it("torna al contatto CRM da cui si è aperta la planimetria", () => {
    const torna = `/azienda/marketing/contatti/${uuid}`;
    const url = new URL(percorsoProgettoAssociato("p1", torna), "https://app.invalid");
    expect(url.searchParams.get("torna")).toBe(torna);
  });
  it.each(["https://evil.example/", "//evil.example/azienda/ordini/x", "/azienda/ordini/../../login", "javascript:alert(1)"])("rifiuta il percorso di ritorno estraneo %s", (torna) => {
    expect(ritornoProgettoValido(torna)).toBeNull();
  });
  it("separa le versioni sconosciute dalle precedenti e segnala i riepiloghi parziali", () => {
    expect(riepilogaVersioni([3, "2", 2, null, ""], 9)).toEqual({ totale: 9, parziale: true, versioni: [{ versione: 3, numero: 1 }, { versione: 2, numero: 2 }, { versione: null, numero: 2 }] });
  });
});
