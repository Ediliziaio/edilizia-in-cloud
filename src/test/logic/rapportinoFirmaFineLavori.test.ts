/**
 * Test contratto — Firma cliente su rapporto di fine lavori (Fase B spec
 * docs/superpowers/specs/2026-07-03-rapportino-flow-design.md).
 * Verifica il wiring statico: FirmaPad riusabile, step firme in CampoRapportino,
 * notifica al responsabile e badge "Fine lavori" nel tab Campo di OrderDetail.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const r = (p: string) => resolve(process.cwd(), p);

const FIRMA_PAD = r("src/components/campo/FirmaPad.tsx");
const CAMPO_RAPPORTINO = r("src/pages/campo/CampoRapportino.tsx");
const ORDINE_RAPPORTINI = r("src/components/orders/OrdineRapportiniCampo.tsx");

describe("Fine lavori — FirmaPad riusabile", () => {
  it("FirmaPad.tsx esiste con canvas touch/mouse, onChange e Cancella", () => {
    expect(existsSync(FIRMA_PAD)).toBe(true);
    const src = readFileSync(FIRMA_PAD, "utf8");
    expect(src).toContain("onChange: (dataUrl: string | null) => void");
    expect(src).toContain("toDataURL");
    expect(src).toContain("onTouchStart");
    expect(src).toContain("touch-none");
    expect(src).toContain("Cancella");
  });
});

describe("Fine lavori — step firme in CampoRapportino", () => {
  it("monta FirmaPad e salva firma cliente (nome + url + at) e firma operaio", () => {
    const src = readFileSync(CAMPO_RAPPORTINO, "utf8");
    expect(src).toContain("FirmaPad");
    expect(src).toContain("Firma del cliente");
    expect(src).toContain("firma_cliente_nome");
    expect(src).toContain("firma_cliente_url");
    expect(src).toContain("firma_cliente_at");
    expect(src).toContain("firma_operaio_url");
  });

  it("il flusso è 2 step (+ firma cliente solo con lavoro_completato) e carica le firme sul bucket", () => {
    const src = readFileSync(CAMPO_RAPPORTINO, "utf8");
    // Redesign 2026-08-09: giornaliero in 2 step; il fine lavori aggiunge lo
    // step Firma cliente. La firma dell'autore vale su OGNI rapportino.
    expect(src).toContain("const TOTAL_STEPS = 2;");
    expect(src).toContain("lavoro_completato ? 3 : TOTAL_STEPS");
    expect(src).toContain("if (firmaOperaio) {");
    expect(src).toContain("/firme/");
    expect(src).toContain('from("campo-rapportini")');
  });

  it("notifica il responsabile via create_notification (assigned_to → created_by)", () => {
    const src = readFileSync(CAMPO_RAPPORTINO, "utf8");
    expect(src).toContain('rpc("create_notification"');
    expect(src).toContain("assigned_to");
    expect(src).toContain('p_type: "rapportino_inviato"');
    expect(src).toContain('p_entity_type: "campo_rapportino"');
    expect(src).toContain("Rapporto di fine lavori firmato dal cliente");
    expect(src).toContain("Nuovo rapportino da approvare");
  });
});

describe("Fine lavori — badge in OrdineRapportiniCampo", () => {
  it("mostra i badge Fine lavori e Firmato dal cliente e le immagini firma", () => {
    const src = readFileSync(ORDINE_RAPPORTINI, "utf8");
    expect(src).toContain("Fine lavori");
    expect(src).toContain("Firmato dal cliente");
    expect(src).toContain("lavoro_completato");
    expect(src).toContain("firma_cliente_url");
    expect(src).toContain("firma_operaio_url");
  });
});
