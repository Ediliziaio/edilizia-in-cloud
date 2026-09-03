/**
 * Vincoli di dominio che la traccia interfaccia ha chiesto di portare sul server
 * (cancello C3): checksum fiscale e tetto allo sconto.
 *
 * Entrambi verificati in produzione — gli esiti sono nei messaggi di commit.
 * Qui le asserzioni statiche che impediscono la regressione della *forma* della
 * regola, che è la parte che si perde più facilmente.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { validateCodiceFiscale, validatePartitaIva } from "@/lib/italianFiscalValidation";

const DIR = resolve(__dirname, "../../../supabase/migrations");
const migrazione = (frammento: string): string => {
  const nome = readdirSync(DIR).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione non trovata: ${frammento}`);
  return readFileSync(resolve(DIR, nome), "utf8");
};

const fiscale = migrazione("dati_fiscali_validi_sul_server");
const validatori = migrazione("validatori_piva_codice_fiscale");
const sconto = migrazione("tetto_sconto_sul_server");

describe("checksum fiscale · la regola vale anche fuori dall'interfaccia", () => {
  it("il controllo è un trigger, non solo un `if` nel browser", () => {
    for (const t of ["companies", "suppliers", "profiles", "marketing_contacts",
                     "anagrafiche_native", "anagrafica_azienda"]) {
      expect(fiscale, `manca il trigger su ${t}`).toMatch(
        new RegExp(`CREATE TRIGGER trg_valida_dati_fiscali\\s+BEFORE INSERT OR UPDATE OF [^\\n]+ ON public\\.${t}`),
      );
    }
  });

  it("verifica solo i valori nuovi o modificati", () => {
    // Un CHECK secco (o NOT VALID) farebbe fallire ogni UPDATE su una riga
    // storica sporca, anche su campi che non c'entrano: 29 fornitori su 90
    // hanno una P.IVA che non supera il checksum.
    expect(fiscale).toMatch(/IS DISTINCT FROM v_val/);
    expect(fiscale).not.toMatch(/ADD CONSTRAINT[^\n]*CHECK[^\n]*piva_valida/);
  });

  it("assente non è sbagliato: null e stringa vuota restano ammessi", () => {
    expect(validatori).toMatch(/IF p_valore IS NULL THEN RETURN true/);
    expect(validatori).toMatch(/IF v = '' THEN RETURN true/);
  });

  it("una società usa la partita IVA come codice fiscale", () => {
    expect(validatori).toMatch(/IF v ~ '\^\[0-9\]\{11\}\$' THEN RETURN public\.piva_valida\(v\)/);
  });

  it("le posizioni pari del codice fiscale non usano il resto modulo 26", () => {
    // (pos-1) % 26 darebbe A=10 invece di A=0: è il bug che avevo scritto,
    // trovato provando il validatore prima di usarlo.
    expect(validatori).toMatch(/CASE WHEN pos <= 10 THEN pos - 1 ELSE pos - 11 END/);
    expect(validatori).not.toMatch(/\(pos - 1\) % 26/);
  });

  it("c'è una vista per far emergere le righe già sporche", () => {
    expect(fiscale).toMatch(/CREATE OR REPLACE VIEW public\.v_dati_fiscali_da_sanare/);
  });
});

describe("checksum fiscale · il server calcola come il client", () => {
  // Se i due divergono, l'interfaccia accetta ciò che il database rifiuta (o
  // viceversa) e l'utente non capisce perché. Qui si confronta il validatore
  // del repo con i casi usati per verificare quello SQL.
  const casiValidi = ["00743110157", "12345670017", "00488410010"];
  const casiInvalidi = ["01234567890", "12345678901", "00743110158"];

  it.each(casiValidi)("%s è una partita IVA valida per il client", (v) => {
    expect(validatePartitaIva(v).ok).toBe(true);
  });

  it.each(casiInvalidi)("%s non lo è", (v) => {
    expect(validatePartitaIva(v).ok).toBe(false);
  });

  it("il codice fiscale societario passa dal validatore di partita IVA", () => {
    expect(validateCodiceFiscale("00743110157").ok).toBe(true);
    expect(validateCodiceFiscale("01234567890").ok).toBe(false);
  });
});

describe("tetto allo sconto · vincolo dove esiste una soglia, non altrove", () => {
  it("uno sconto fuori da 0–100 è sempre rifiutato", () => {
    expect(sconto).toMatch(/IF v_val < 0 OR v_val > 100 THEN/);
    expect(sconto).toMatch(/Deve stare fra 0 e 100/);
  });

  it("senza soglia configurata non si inventa una politica", () => {
    // discount_rules è vuota su tutta la piattaforma: imporre il 10% di
    // ripiego dell'interfaccia bloccherebbe uno sconto del 15% legittimo.
    expect(sconto).toMatch(/IF v_max IS NULL THEN RETURN NEW;/);
    expect(sconto).toMatch(/NULL quando non è configurato/);
  });

  it("la soglia viene dalle regole dell'azienda, non da una costante", () => {
    expect(sconto).toMatch(/FROM public\.discount_rules dr/);
    expect(sconto).toMatch(/dr\.is_active = true/);
    expect(sconto).not.toMatch(/v_max\s*:?=\s*10\b/);
  });

  it("chi può approvare sconti supera la soglia", () => {
    expect(sconto).toMatch(/has_permission\(auth\.uid\(\), 'can_approve_discounts'\)/);
  });

  it("il service role non viene scambiato per un commerciale che forza lo sconto", () => {
    // auth.uid() è nullo nei flussi server-side: senza questo, import ed edge
    // function verrebbero respinti.
    expect(sconto).toMatch(/NOT public\.ai_is_service_role\(\)/);
  });

  it("copre tutti i verticali, non due su dieci", () => {
    for (const t of ["bgn_progetti", "rst_progetti", "tet_progetti", "clm_progetti",
                     "ele_progetti", "idr_progetti", "pav_progetti", "pis_progetti",
                     "sr_progetti"]) {
      expect(sconto, `manca ${t}`).toContain(`'${t}'`);
    }
    // il fotovoltaico tiene lo sconto in due campi (tipo + valore)
    expect(sconto).toMatch(/CREATE TRIGGER trg_valida_sconto\s+BEFORE INSERT OR UPDATE OF sconto_valore, sconto_tipo ON public\.fv_progetti/);
  });

  it("uno sconto in euro non viene confrontato con una percentuale", () => {
    expect(sconto).toMatch(/NOT IN \('percentuale', 'percentage', 'pct', '%'\)/);
  });

  it("i messaggi non usano '%' letterali, che in RAISE è il segnaposto", () => {
    const corpo = sconto.split("CREATE OR REPLACE FUNCTION public.valida_sconto_progetto()")[1];
    expect(corpo).not.toMatch(/%%%/);
    expect(corpo).toMatch(/per cento/);
  });
});
