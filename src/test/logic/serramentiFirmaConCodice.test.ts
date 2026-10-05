/**
 * Serramenti firma come gli altri preventivi: anteprima, poi codice via email
 * (flusso FEA). Il disegno a mano senza codice è chiuso.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { moduleSourceTag, preventivoDelModulo } from "@/lib/moduli/quoteBridge";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const PROGETTO = "0afd020b-0f5e-3fff-84f0-4f51a853acd4";

describe("Serramenti nel flusso di firma con codice", () => {
  it("la copia di firma riporta al wizard di Serramenti", () => {
    expect(preventivoDelModulo(moduleSourceTag("sr", PROGETTO))?.href).toBe(`/azienda/serramenti/${PROGETTO}/modifica`);
  });

  it("lo step PDF monta la scheda di invio del modulo «sr»", () => {
    expect(leggi("src/components/serramenti/StepPdf.tsx")).toContain('moduleKey="sr"');
  });

  it("a firma completata il progetto risulta accettato e firmato", () => {
    const f = leggi("supabase/functions/fea-completa-firma/index.ts");
    expect(f).toContain('sr: "sr_progetti"');
    expect(f).toContain('firmato_il: ora');
  });

  it("la pagina /stima non ha più la firma a disegno e porta al codice", () => {
    const p = leggi("src/pages/public/SerramentiStimaPubblica.tsx");
    expect(p).not.toContain("canvas");
    expect(p).not.toContain("sr-firma-cliente");
    expect(p).toContain("/firma-fea/");
  });

  it("l'endpoint della firma a disegno è chiuso (410)", () => {
    expect(leggi("supabase/functions/sr-firma-cliente/index.ts")).toContain("410");
  });

  it("la pagina di firma mostra il documento in anteprima e salta al codice dall'anteprima", () => {
    const f = leggi("src/pages/public/FirmaDocumento.tsx");
    expect(f).toContain("<AnteprimaDocumento");
    expect(f).toContain("avvia");
  });
});
