import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * L'avviso «aziende senza backup» (23/11/2026).
 *
 * Quattordici aziende sono rimaste senza una copia per quindici giorni mentre
 * il rapporto del mattino lo diceva OGNI mattina, in una riga fra i segnali
 * vitali della piattaforma. Il problema non era accorgersene: era come lo
 * diceva. Qui si tiene fermo che l'oggetto dell'email si capisca senza
 * aprirla, e che la cadenza dei promemoria resti nel database.
 */
import {
  componiAvvisoBackup,
  componiRipristinoBackup,
  quandoManca,
  RIGHE_IN_EMAIL,
  type AziendaSenzaBackup,
} from "../../../supabase/functions/_shared/backupAllarmeTesti.ts";

const vecchia = (azienda: string, giorni: number, ultimo = "2026-11-08"): AziendaSenzaBackup =>
  ({ azienda, ultimo_backup: ultimo, giorni_senza: giorni, nota: "l'ultima copia è vecchia" });
const mai = (azienda: string): AziendaSenzaBackup =>
  ({ azienda, ultimo_backup: null, giorni_senza: null, nota: "mai salvata" });

const valore = (dettagli: Array<[string, string]>, etichetta: string) =>
  dettagli.find(([e]) => e === etichetta)?.[1];

describe("l'avviso delle aziende senza backup", () => {
  it("dall'oggetto si capisce quante sono e da quanto, senza aprire l'email", () => {
    const elenco = Array.from({ length: 14 }, (_, i) => vecchia(`Azienda ${i + 1}`, 15));
    const { oggetto } = componiAvvisoBackup(elenco, { giorniPeggiore: 15 });
    expect(oggetto).toBe("URGENTE — 14 aziende senza backup da 15 giorni");
  });

  it("una sola azienda si dice al singolare", () => {
    const { oggetto, sommario } = componiAvvisoBackup([vecchia("Impresa Vulcano S.r.l.", 15)], { giorniPeggiore: 15 });
    expect(oggetto).toBe("URGENTE — una azienda senza backup da 15 giorni");
    expect(sommario).toContain("Impresa Vulcano S.r.l.");
  });

  it("chi non è mai stata salvata non ha giorni da contare, e lo dice", () => {
    const { oggetto, dettagli } = componiAvvisoBackup([mai("CONSORZIO AMALFI")], { giorniPeggiore: null });
    expect(oggetto).toBe("URGENTE — una azienda senza backup, mai salvate");
    expect(valore(dettagli, "CONSORZIO AMALFI")).toBe("mai salvata");
    expect(valore(dettagli, "Mai salvate")).toBe("1 su 1");
  });

  it("ogni riga dice da quanto e qual era l'ultima copia", () => {
    expect(quandoManca(vecchia("X", 15, "2026-11-08"))).toBe("15 giorni (ultima copia il 2026-11-08)");
    expect(quandoManca(mai("X"))).toBe("mai salvata");
  });

  it("un elenco lungo si taglia: le prime e «e altre N»", () => {
    const elenco = Array.from({ length: 20 }, (_, i) => vecchia(`Azienda ${i + 1}`, 9));
    const { dettagli } = componiAvvisoBackup(elenco, { giorniPeggiore: 9 });
    expect(dettagli.filter(([e]) => e.startsWith("Azienda "))).toHaveLength(RIGHE_IN_EMAIL);
    expect(valore(dettagli, "e altre")).toBe(`${20 - RIGHE_IN_EMAIL} aziende`);
  });

  it("il promemoria si distingue dal primo avviso", () => {
    const uno = componiAvvisoBackup([vecchia("A", 3)], { giorniPeggiore: 3, avvisoNumero: 1 });
    expect(valore(uno.dettagli, "Promemoria")).toBeUndefined();
    const tre = componiAvvisoBackup([vecchia("A", 3)], { giorniPeggiore: 3, avvisoNumero: 3 });
    expect(valore(tre.dettagli, "Promemoria")).toContain("3°");
  });

  it("dice sempre cosa fare: un avviso senza la mossa successiva non serve", () => {
    const { dettagli } = componiAvvisoBackup([vecchia("A", 3)], { giorniPeggiore: 3 });
    expect(valore(dettagli, "Cosa fare")).toContain("Lifecycle");
  });

  it("quando torna a posto si dice: il silenzio non prova niente", () => {
    const { oggetto, dettagli } = componiRipristinoBackup({
      azione: "risolto", ore_aperto: 361, avvisi_mandati: 30,
      aziende_prima: [vecchia("Impresa Vulcano S.r.l.", 15), mai("CONSORZIO AMALFI")],
    });
    expect(oggetto).toBe("Risolto — tutte le aziende hanno un backup");
    expect(valore(dettagli, "Aziende rimesse a posto")).toBe("2");
    expect(valore(dettagli, "Allarme aperto per")).toBe("361 ore");
    expect(valore(dettagli, "Avvisi mandati")).toBe("30");
    expect(valore(dettagli, "Erano")).toContain("CONSORZIO AMALFI");
  });
});

describe("lo stato dell'allarme sta nel database", () => {
  const MIGRAZIONE = readFileSync(
    join(__dirname, "../../../supabase/migrations/20290510090000_backup_allarme.sql"),
    "utf8",
  );

  it("un allarme aperto per volta: due controlli insieme non raddoppiano le email", () => {
    expect(MIGRAZIONE).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ops_backup_allarme_uno_aperto/i);
    expect(MIGRAZIONE).toMatch(/WHERE chiuso_il IS NULL/i);
    // Il lock serializza i due controlli prima di prendere in carico l'avviso.
    expect(MIGRAZIONE).toMatch(/WHERE chiuso_il IS NULL FOR UPDATE/i);
  });

  it("la cadenza dei promemoria è nel database, non nel codice", () => {
    expect(MIGRAZIONE).toContain("p_ore_promemoria");
    expect(MIGRAZIONE).toMatch(/ultima_notifica > now\(\) - make_interval\(hours => v_ore\)/);
    expect(MIGRAZIONE).toMatch(/'azione', 'aspetta'/);
  });

  it("la funzione è chiusa: la esegue solo il servizio", () => {
    expect(MIGRAZIONE).toMatch(/REVOKE ALL ON FUNCTION public\.ops_backup_allarme_controlla[^;]*FROM PUBLIC, anon, authenticated/);
    expect(MIGRAZIONE).toMatch(/GRANT EXECUTE ON FUNCTION public\.ops_backup_allarme_controlla[^;]*TO service_role/);
    expect(MIGRAZIONE).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });
});
