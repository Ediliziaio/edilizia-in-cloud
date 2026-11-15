import { describe, expect, it } from "vitest";
import { leggiRiepilogo, type FigliaGenerale, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { avanzamentoOperazione } from "@/lib/orders/generali/investitoriRendiconto";

/**
 * Simulazione del 15/11/2026 (Residenza Le Querce, Demo Azienda): lavori fatti sulla generale con le
 * fasi al 100% e quattro unità senza fasi proprie. Il Dossier e il rendiconto ai soci dicevano
 * «lavori al 0%» perché contavano solo la media delle unità.
 */
const figlia = (avanzamento: number, importo: number | null = 400_000): FigliaGenerale =>
  ({ id: `f${avanzamento}-${importo}`, codice: null, nome: "Unità", stato: null, statoNome: null, statoColore: null, indirizzo: null,
     inizio: null, fine: null, avanzamento, importo, eseguito: null, fatturato: null, incassato: null, costo: null, margine: null });
const r = (generale: number | null, figlie: FigliaGenerale[]) =>
  ({ generale: { id: "g", codice: null, nome: "Op", cliente: null, clienteId: null, modello: "sviluppo", creataIl: null, valore: null, avanzamento: generale },
     figlie }) as unknown as RiepilogoGenerale;

describe("avanzamento dell'operazione", () => {
  it("lavori sulla generale al 100%, unità senza fasi: 100%, non 0%", () => {
    expect(avanzamentoOperazione(r(100, [figlia(0), figlia(0), figlia(0), figlia(0)]))).toBe(100);
  });
  it("figlie avanzate a mano più della generale: vale la media delle figlie", () => {
    expect(avanzamentoOperazione(r(20, [figlia(60), figlia(60)]))).toBe(60);
  });
  it("senza il dato della generale (versione vecchia del database): la media delle figlie", () => {
    expect(avanzamentoOperazione(r(null, [figlia(50), figlia(100)]))).toBe(75);
  });
  it("senza figlie: quello della generale", () => {
    expect(avanzamentoOperazione(r(40, []))).toBe(40);
    expect(avanzamentoOperazione(r(null, []))).toBeNull();
  });
  it("il riepilogo legge l'avanzamento della generale", () => {
    const l = leggiRiepilogo({ generale: { id: "g", nome: "Op", modello: "sviluppo", avanzamento: 100 }, figlie: [], permessi: { importi: true, costi: true, margini: true } });
    expect(l?.generale.avanzamento).toBe(100);
  });
});
