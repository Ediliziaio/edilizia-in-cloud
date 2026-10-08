import { describe, expect, it, vi } from "vitest";
import { calcolaFineLavori, fasiDaBozza, salvaFasiDiPartenza } from "@/lib/orders/pianificazioneAvvio";

const giorno = (s: string) => new Date(`${s}T00:00:00`);
const fase = { nome: "Demolizioni", sottofasi: [{ nome: "Protezione", peso: 1 }] };

describe("calendario di avvio della commessa", () => {
  it("conta il primo giorno e non modifica la data iniziale", () => {
    const inizio = giorno("2026-10-09");
    expect(calcolaFineLavori(inizio, 1)).toEqual(inizio);
    expect(calcolaFineLavori(inizio, 2)).toEqual(giorno("2026-10-12"));
    expect(inizio).toEqual(giorno("2026-10-09"));
  });
  it("può includere il sabato ma mai la domenica", () => {
    expect(calcolaFineLavori(giorno("2026-10-09"), 2, 6)).toEqual(giorno("2026-10-10"));
    expect(calcolaFineLavori(giorno("2026-10-11"), 1, 6)).toEqual(giorno("2026-10-12"));
  });
  it("gestisce un inizio non lavorativo, fine mese, anno e cambio dell'ora", () => {
    expect(calcolaFineLavori(giorno("2026-10-10"), 1)).toEqual(giorno("2026-10-12"));
    expect(calcolaFineLavori(giorno("2026-10-23"), 2)).toEqual(giorno("2026-10-26"));
    expect(calcolaFineLavori(giorno("2026-12-31"), 2)).toEqual(giorno("2027-01-01"));
  });
  it.each([0, -1, 1.5, NaN, Infinity, 3661])("non calcola con durata non valida: %s", (durata) => {
    expect(calcolaFineLavori(giorno("2026-10-08"), durata)).toBeUndefined();
  });
  it("non calcola senza un inizio valido", () => {
    expect(calcolaFineLavori(undefined, 5)).toBeUndefined();
    expect(calcolaFineLavori(new Date("non-data"), 5)).toBeUndefined();
  });
});

describe("fasi dalla bozza e salvataggio dopo la creazione", () => {
  it("recupera una copia delle fasi incluse le sottofasi", () => {
    const risultato = fasiDaBozza([fase]);
    expect(risultato).toEqual([fase]);
    expect(risultato![0].sottofasi[0]).not.toBe(fase.sottofasi[0]);
    expect(fasiDaBozza([])).toEqual([]);
  });
  it.each([undefined, {}, [{ nome: "X" }], [{ nome: "X", sottofasi: [null] }], Array(61).fill(fase)])("rifiuta dati corrotti: %j", (dato) => {
    expect(fasiDaBozza(dato)).toBeNull();
  });
  it("manda al server le fasi effettive e verifica il conteggio confermato", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    expect(await salvaFasiDiPartenza("ordine", [fase], rpc)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("aggiungi_fasi_commessa", { p_order_id: "ordine", p_fasi: [fase] });
    rpc.mockResolvedValue({ data: 0, error: null });
    expect(await salvaFasiDiPartenza("ordine", [fase], rpc)).toContain("non ha confermato");
  });
  it("non riprova alla cieca dopo errori database o rete", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Permesso negato" } });
    expect(await salvaFasiDiPartenza("ordine", [fase], rpc)).toBe("Permesso negato");
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockRejectedValue(new Error("Rete assente"));
    expect(await salvaFasiDiPartenza("ordine", [fase], rpc)).toBe("Rete assente");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("nessuna fase è una scelta valida e non invoca il server", async () => {
    const rpc = vi.fn();
    expect(await salvaFasiDiPartenza("ordine", [], rpc)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
