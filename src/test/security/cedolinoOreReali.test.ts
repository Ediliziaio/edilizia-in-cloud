import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ondata 5.1 — il cedolino nasce dalle ore vere.
 *
 * Le prove col database sono state fatte su produzione con dati costruiti a
 * mano e poi cancellati (marzo 2091, Marco Operaio, 1.800 € su 168 ore):
 *   ore ordinarie 144,00 · straordinario 2 / 4 / 2 nelle tre bande
 *   lordo 1.676,79 · contributi 160,80 / 575,98 · IRPEF 140,21 · netto 1.375,78
 *   una giornata con la sola entrata finita fra le anomalie, non contata a zero
 * Qui resta la parte che si può verificare senza database: che le regole siano
 * scritte dove devono stare, e che non siano rimaste dove non devono.
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const leggiMigrazione = (frammento: string) => {
  const nome = readdirSync(dir).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione ${frammento} non trovata`);
  return readFileSync(resolve(dir, nome), "utf8");
};

const ore = leggiMigrazione("cedolino_dalle_ore_reali_1");
const motore = leggiMigrazione("cedolino_dalle_ore_reali_2");
const scrittura = leggiMigrazione("cedolino_dalle_ore_reali_3");
const stampante = readFileSync(
  resolve(__dirname, "../../../supabase/functions/generate-cedolino-pdf/index.ts"),
  "utf8",
);
const lapide = readFileSync(
  resolve(__dirname, "../../../supabase/functions/hr-genera-cedolini-mese/index.ts"),
  "utf8",
);

/** Toglie i commenti: questi file *spiegano* i difetti citandoli, e una prova
 *  che non distingue il codice dalla prosa fallisce sulla spiegazione. */
const soloCodice = (testo: string, stile: "sql" | "ts") =>
  testo
    .split("\n")
    .filter((r) => !r.trimStart().startsWith(stile === "sql" ? "--" : "//"))
    .join("\n");

describe("le ore arrivano dalle timbrature, non dalle sole assenze", () => {
  it("legge hr_timbrature passando dal profilo HR", () => {
    expect(ore).toMatch(/FROM public\.hr_timbrature/);
    expect(ore).toMatch(/FROM public\.hr_profili/);
    expect(ore).toMatch(/p\.employee_id = p_employee_id/);
  });

  it("una giornata spaiata diventa un'anomalia, non zero ore", () => {
    expect(ore).toMatch(/entrata senza uscita/);
    expect(ore).toMatch(/uscita senza entrata/);
    // dopo aver registrato l'anomalia salta il giorno: non lo conta
    const blocco = ore.slice(ore.indexOf("IF r.entrata IS NULL"), ore.indexOf("v_lorde :="));
    expect(blocco).toMatch(/CONTINUE;/);
  });

  it("separa le tre bande di straordinario", () => {
    expect(ore).toMatch(/festivo_italiano\(r\.giorno\)/);
    expect(ore).toMatch(/extract\(dow FROM r\.giorno\) = 6/);
    for (const banda of ["ore_straordinario_25", "ore_straordinario_50", "ore_straordinario_100"]) {
      expect(ore).toContain(banda);
    }
  });

  it("senza profilo HR lo dichiara invece di rispondere zero", () => {
    expect(ore).toMatch(/'calcolabile', false/);
    expect(ore).toMatch(/non ha un profilo HR/);
  });

  it("Pasquetta è calcolata, non elencata a mano", () => {
    expect(ore).toMatch(/pasqua_italiana\(extract\(year from p_data\)::int\) \+ 1/);
  });
});

describe("il motore CCNL sta sul server", () => {
  it("usa gli scaglioni IRPEF in vigore, non i quattro pre-2024", () => {
    expect(motore).toMatch(/v_imp_annuo <= 28000 THEN v_irpef_lorda := v_imp_annuo \* 0\.23/);
    expect(motore).toMatch(/6440 \+ \(v_imp_annuo - 28000\) \* 0\.35/);
    expect(motore).toMatch(/14140 \+ \(v_imp_annuo - 50000\) \* 0\.43/);
    // lo scaglione al 25% fra 15k e 28k non esiste più dal 2024
    expect(motore).not.toMatch(/3450 \+ \(/);
  });

  it("la detrazione art. 13 ha il termine che alla copia nel PDF mancava", () => {
    expect(motore).toMatch(/1910 \+ 1190 \* \(\(28000 - v_imp_annuo\) \/ 13000\)/);
  });

  it("l'aliquota si determina sul reddito annuo da contratto", () => {
    expect(motore).toMatch(/v_imp_annuo := \(v_emp\.gross_salary \* 12\)/);
  });

  it("senza retribuzione o ore contrattuali dice quale dato manca", () => {
    expect(motore).toMatch(/'dato_mancante', 'employees\.gross_salary'/);
    expect(motore).toMatch(/'dato_mancante', 'employees\.monthly_hours'/);
  });

  it("le ipotesi viaggiano con il risultato", () => {
    expect(motore).toMatch(/'ipotesi', jsonb_build_array\(/);
    expect(motore).toMatch(/'da_rivedere_da_un_consulente', true/);
    expect(motore).toMatch(/nessuna tredicesima, TFR/);
  });
});

describe("un cedolino è un dato personale", () => {
  it("il controllo è sulla persona, non sull'azienda", () => {
    expect(ore).toMatch(/CREATE OR REPLACE FUNCTION public\.cedolino_visibile_a_chi_chiede/);
    for (const [nome, testo] of [["ore", ore], ["motore", motore], ["scrittura", scrittura]] as const) {
      const chiamate = testo.match(/cedolino_visibile_a_chi_chiede\(/g) ?? [];
      expect(chiamate.length, `${nome}: nessun controllo sulla persona`).toBeGreaterThan(0);
    }
  });

  it("nessuna delle tre funzioni si accontenta di user_can_access_company", () => {
    for (const testo of [motore, scrittura]) {
      expect(testo).not.toMatch(/IF public\.user_can_access_company\([^)]*\) IS NOT TRUE THEN/);
    }
  });
});

describe("scrittura e stampa", () => {
  it("scrive stato 'bozza': 'draft' violava il vincolo della tabella", () => {
    expect(scrittura).toMatch(/'bozza', 'auto_ai'/);
    expect(soloCodice(scrittura, "sql")).not.toMatch(/'draft'/);
  });

  it("un cedolino emesso o pagato non si riscrive", () => {
    expect(scrittura).toMatch(/v_esistente\.stato <> 'bozza'/);
    expect(scrittura).toMatch(/non si riscrive/);
  });

  it("chiede il permesso prima di generare", () => {
    expect(scrittura).toMatch(/assert_permesso\('can_edit_settings_people'/);
  });

  it("gli ingressi storici delegano al conto vero", () => {
    expect(scrittura).toMatch(
      /silvio_tool_calcola_ore_mese_dipendente[\s\S]{0,400}RETURN public\.cedolino_ore_periodo/);
    expect(scrittura).toMatch(
      /silvio_tool_genera_cedolino_dipendente[\s\S]{0,500}RETURN public\.cedolino_genera/);
  });

  it("una riga senza lordo non si stampa a zero", () => {
    expect(scrittura).toMatch(/solo un segnaposto/);
    expect(scrittura).toMatch(/'stampabile', false/);
  });
});

describe("la stampante non calcola più", () => {
  it("il motore CCNL duplicato è sparito dall'edge function", () => {
    expect(stampante).not.toMatch(/calcolaContributiCCNLEdilizia/);
    expect(stampante).not.toMatch(/INPS_DIP/);
    expect(stampante).not.toMatch(/irpefAnnua/);
    expect(stampante).not.toMatch(/detrazioneAnnua/);
  });

  it("i numeri arrivano dalla RPC", () => {
    expect(stampante).toMatch(/\.rpc\("cedolino_per_stampa"/);
    expect(stampante).toMatch(/qui non si calcola nulla/);
  });

  it("non stampabile risponde 422 con il motivo, non un PDF di zeri", () => {
    expect(stampante).toMatch(/cedolino\.stampabile !== true/);
    expect(stampante).toMatch(/: 422,/);
  });

  it("la RPC gira col JWT dell'utente, non col service role", () => {
    const blocco = stampante.slice(stampante.indexOf("const supabaseUtente"));
    expect(blocco).toMatch(/SUPABASE_ANON_KEY/);
    expect(blocco.slice(0, 400)).not.toMatch(/SERVICE_ROLE/);
  });
});

describe("hr-genera-cedolini-mese non finge più di aver lavorato", () => {
  it("non interroga più la tabella inesistente", () => {
    expect(soloCodice(lapide, "ts")).not.toMatch(/\.from\("hr_dipendenti"\)/);
  });

  it("risponde 410 e dice cosa usare al suo posto", () => {
    expect(lapide).toMatch(/status: 410/);
    expect(lapide).toMatch(/cedolino_genera/);
  });

  it("non risponde più 200 con zero cedolini", () => {
    expect(soloCodice(lapide, "ts")).not.toMatch(/cedolini_creati/);
  });
});
