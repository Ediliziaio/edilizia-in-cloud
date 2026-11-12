import { beforeEach, expect, it, vi } from "vitest";
import { salvaLavoroConRate, recuperaScritturaLavoro, conservaScritturaLavoro, completaScritturaLavoro, type ScritturaLavoro } from "@/lib/appalto/creaLavoro";
const scrittura: ScritturaLavoro = {
  ordine: { id: "richiesta-1", company_id: "demo", created_by: "utente", order_type: "appaltatore_lavoro" },
  rate: [{ id: "rata", order_id: "richiesta-1", amount: 1220 }],
};
beforeEach(() => localStorage.clear());
it("usa una sola transazione e il riferimento originale, anche al secondo tentativo", async () => {
  const rpc = vi.fn().mockResolvedValueOnce({error: {message: "Risposta persa"}})
    .mockResolvedValue({data: {success: true, id: "ordine-server", gia_creata: true}});
  await expect(salvaLavoroConRate({rpc}, scrittura)).rejects.toMatchObject({message: "Risposta persa"});
  expect(await salvaLavoroConRate({rpc}, scrittura)).toBe("ordine-server");
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  expect(rpc).toHaveBeenLastCalledWith("crea_lavoro_appaltatore_atomic", {
    p_order_data: {...scrittura.ordine, creation_request_id: "richiesta-1"}, p_installments: scrittura.rate,
  });
});
it.each([null, {success: true}, {id: "ordine-server", success: false}])("non annuncia successo senza conferma completa: %j", async data => {
  await expect(salvaLavoroConRate({rpc: async () => ({data})}, scrittura)).rejects.toThrow("non confermata");
});
it("a misura passa zero rate, senza trasformare una stima in credito", async () => {
  const rpc = vi.fn().mockResolvedValue({data:{success:true,id:"misura"}});
  await salvaLavoroConRate({rpc}, {...scrittura, ordine:{...scrittura.ordine,valorizzazione:"a_misura"}, rate:[]});
  expect(rpc.mock.calls[0][1].p_installments).toEqual([]);
});
it("ricaricamento: recupera dati e chiave della richiesta originale", () => {
  conservaScritturaLavoro(scrittura, "utente");
  expect(recuperaScritturaLavoro("demo", "utente")).toEqual(scrittura);
  completaScritturaLavoro(scrittura, "utente");
  expect(recuperaScritturaLavoro("demo", "utente")).toBeNull();
});
it("isola azienda e utente; ignora dati corrotti o di un altro account", () => {
  conservaScritturaLavoro(scrittura, "utente");
  localStorage.setItem("eic:creazione-appaltatore:altra:utente:x", JSON.stringify(scrittura));
  localStorage.setItem("eic:creazione-appaltatore:demo:altro:x", "{corrotto");
  expect(recuperaScritturaLavoro("altra", "utente")).toBeNull();
  expect(recuperaScritturaLavoro("demo", "altro")).toBeNull();
  expect(recuperaScritturaLavoro(null, "utente")).toBeNull();
});
it("due schede non si sovrascrivono i tentativi; completarne uno conserva l'altro", () => {
  const seconda = {...scrittura, ordine:{...scrittura.ordine,id:"richiesta-2"}};
  conservaScritturaLavoro(scrittura, "utente"); conservaScritturaLavoro(seconda, "utente");
  completaScritturaLavoro(scrittura, "utente");
  expect(recuperaScritturaLavoro("demo", "utente")).toEqual(seconda);
});
it("se lo storage non funziona il chiamante può fermarsi prima di inviare", () => {
  const spy=vi.spyOn(localStorage,"setItem").mockImplementationOnce(()=>{throw new Error("QuotaExceededError");});
  expect(()=>conservaScritturaLavoro(scrittura,"utente")).toThrow("QuotaExceededError"); spy.mockRestore();
});
