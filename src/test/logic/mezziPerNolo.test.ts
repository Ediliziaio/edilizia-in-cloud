import { describe, expect, it } from "vitest";
import { mezziPerNolo, type MezzoAzienda } from "@/lib/distinta/mezziPerNolo";

const MEZZI: MezzoAzienda[] = [
  { id: "p1", nome: "Piattaforma aerea autocarrata 20 m", tipo: "attrezzatura", stato: "in_servizio", gestione: "singola", possesso: "proprieta" },
  { id: "p2", nome: "Piattaforma a pantografo", tipo: "attrezzatura", stato: "in_servizio", gestione: "singola", assegnato_order_id: "altra" },
  { id: "p3", nome: "Piattaforma semovente", stato: "in_officina", gestione: "singola" },
  { id: "a1", nome: "Autocarro Iveco Daily", tipo: "autocarro", stato: "in_servizio", gestione: "singola" },
  { id: "t1", nome: "Transenne metalliche", stato: "in_servizio", gestione: "quantita", unita_misura: "pz", disponibile: 12 },
  { id: "g1", nome: "Ponteggio a telai", stato: "in_servizio", gestione: "quantita", unita_misura: "mq", disponibile: 0 },
];

describe("prima di noleggiare: l'azienda ce l'ha già?", () => {
  it("piattaforma: prima quella libera, poi quella su un'altra commessa, poi quella in officina; l'autocarro no", () => {
    const r = mezziPerNolo("Nolo di piattaforma aerea autocarrata altezza 20 m, a freddo", MEZZI, "questa");
    expect(r.map((x) => [x.mezzo.id, x.libero])).toEqual([["p1", true], ["p2", false], ["p3", false]]);
    expect(r[0].motivo).toBe("Piattaforma aerea autocarrata 20 m: libero");
    expect(r[1].motivo).toMatch(/assegnato a un'altra commessa/);
    expect(r[2].motivo).toMatch(/in officina/);
  });
  it("attrezzatura a quantità: dice quanto resta libero, o che è tutto impegnato", () => {
    expect(mezziPerNolo("Noleggio di transenne per ogni mese", MEZZI)[0]).toMatchObject({ libero: true, motivo: "Transenne metalliche: 12 pz liberi" });
    expect(mezziPerNolo("Nolo di ponteggio a telai prefabbricati", MEZZI)[0]).toMatchObject({ libero: false, motivo: "Ponteggio a telai: tutto impegnato in altri cantieri" });
  });
  it("già assegnato a questa commessa: lo dice, non lo propone come impegnato", () => {
    expect(mezziPerNolo("Nolo piattaforma a pantografo", MEZZI, "altra")[0]).toMatchObject({ libero: true });
  });
  it("niente che corrisponda: nessuna proposta (si noleggia)", () => {
    expect(mezziPerNolo("Nolo di autogru da 30 t", MEZZI)).toEqual([]);
    expect(mezziPerNolo("Nolo", MEZZI)).toEqual([]);
  });
});
