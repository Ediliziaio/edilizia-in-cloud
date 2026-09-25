/**
 * Il brief del mattino di Silvio dà a ciascuno solo ciò che Silvio gli darebbe
 * in chat (24/09/2026). Prima girava per tutti come amministratore: cassa,
 * crediti scaduti e sintesi di direzione finivano nel brief di venditori,
 * operatori del call center e impiegati senza alcun permesso sulla finanza
 * (66 brief in 11 giorni, 10 persone).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  briefDaFare,
  pianoDelBrief,
  raccogliDatiDelBrief,
  risultatoVuoto,
  STRUMENTI_DEL_BRIEF,
  type EseguiStrumento,
} from "../../../supabase/functions/_shared/briefDelMattino";
import { PRIORITA_RUOLI_SILVIO, ruoloPrincipaleSilvio } from "../../../supabase/functions/_shared/ruoloSilvio";
import { DOMAIN_STAFF_PERMISSION, SILVIO_TOOLS } from "../../../supabase/functions/_shared/silvioTools";

const ROOT = join(__dirname, "../../..");

/** Cifre spia: se una compare nel testo per il modello, la finanza è passata. */
const CASSA = "987654.32";
const CREDITI = "246810.12";
const FATTURATO = "135791.11";

/** Come rispondono gli strumenti in produzione, con le cifre spia dentro. */
const RISPOSTE: Record<string, unknown> = {
  get_executive_snapshot: { revenue: { mese_eur: Number(FATTURATO) }, cashflow: { saldo_eur: Number(CASSA) } },
  get_overdue_payments: { count: 2, total_overdue_eur: Number(CREDITI), priorita_recupero: [{ cliente: "Rossi" }] },
  get_cashflow_status: { saldo_totale_eur: Number(CASSA), banche: [{ nome: "Banca", saldo_eur: Number(CASSA) }] },
  lista_lavori_pose_periodo: { count: 1, pose_count: 1, eventi: [{ titolo: "Posa serramenti via Roma" }] },
};

/**
 * Un esecutore che la finanza la darebbe a chiunque: così si prova che è il
 * brief a non chiederla, non il motore a rimediare dopo.
 */
function esecutoreCheDaTutto() {
  const chiamati: string[] = [];
  const esegui: EseguiStrumento = async (nome) => {
    chiamati.push(nome);
    return { success: true, data: RISPOSTE[nome] };
  };
  return { esegui, chiamati };
}

/** Cosa arriverebbe al modello per questo utente, come lo compone la funzione. */
async function briefPer(ruoli: string[], permessi: Record<string, unknown> | null) {
  const piano = pianoDelBrief(ruoli, permessi);
  const { esegui, chiamati } = esecutoreCheDaTutto();
  const dati = briefDaFare(piano) ? await raccogliDatiDelBrief(piano, esegui) : undefined;
  return { piano, chiamati, dati, testo: dati ? dati.parti.join("\n\n") : "" };
}

function nessunaCifraDi(testo: string, cifre: string[]) {
  for (const c of cifre) expect(testo).not.toContain(c);
}

/** I permessi veri delle 10 persone colpite: la finanza spenta in tutte e tre le voci. */
const FINANZA_SPENTA = { can_view_billing: false, can_view_financial_reports: false, can_view_tesoreria: false };

/** Ogni permesso d'area che Silvio conosce, acceso. */
const TUTTO_ACCESO: Record<string, unknown> = Object.fromEntries(
  Object.values(DOMAIN_STAFF_PERMISSION).filter(Boolean).map((k) => [k, true]),
);

describe("brief del mattino: niente finanza a chi non la vede", () => {
  it("impiegato + venditore (Best Infissi, Renova): è un venditore, nessuno strumento, nessun brief", async () => {
    const b = await briefPer(["company_staff", "salesperson"], { ...FINANZA_SPENTA, can_view_orders: true });
    expect(b.piano.ruolo).toBe("salesperson");
    expect(b.piano.strumenti).toEqual([]);
    expect(b.piano.azioniPronte).toBe(false);
    expect(briefDaFare(b.piano)).toBe(false);
    expect(b.chiamati).toEqual([]);
  });

  it("impiegato + call center (Suntech): nessun brief", async () => {
    const b = await briefPer(["call_center", "company_staff"], { ...FINANZA_SPENTA, can_view_orders: false });
    expect(b.piano.ruolo).toBe("call_center");
    expect(briefDaFare(b.piano)).toBe(false);
    expect(b.chiamati).toEqual([]);
  });

  it("impiegato senza permessi di finanza (Green Energy, Ke Bei): solo i lavori, nessuna cifra di cassa, crediti o fatturato", async () => {
    const b = await briefPer(["company_staff"], { ...FINANZA_SPENTA, can_view_orders: true });
    expect(b.chiamati).toEqual(["lista_lavori_pose_periodo"]);
    expect(b.testo).toContain("Posa serramenti via Roma");
    nessunaCifraDi(b.testo, [CASSA, CREDITI, FATTURATO]);
    expect(b.dati?.usati).toEqual(["lista_lavori_pose_periodo"]);
    expect(b.piano.azioniPronte).toBe(false);
  });

  it("impiegato che non vede nemmeno le commesse: nessun brief", async () => {
    const b = await briefPer(["company_staff"], { ...FINANZA_SPENTA, can_view_orders: false });
    expect(briefDaFare(b.piano)).toBe(false);
    expect(b.chiamati).toEqual([]);
  });

  it("impiegato senza riga permessi: nessun brief (in chat passerebbe, il brief nel dubbio tace)", async () => {
    const b = await briefPer(["company_staff"], null);
    expect(briefDaFare(b.piano)).toBe(false);
    expect(b.chiamati).toEqual([]);
  });

  it("venditore con tutti i permessi accesi: comunque niente, in chat il venditore non ha questi strumenti", async () => {
    const b = await briefPer(["salesperson", "company_staff"], TUTTO_ACCESO);
    expect(b.piano.strumenti).toEqual([]);
    expect(b.chiamati).toEqual([]);
  });

  it("impiegato col permesso Fatture: i crediti sì (li vede anche nell'app), cassa e sintesi di direzione mai, come in chat", async () => {
    const b = await briefPer(["company_staff"], TUTTO_ACCESO);
    expect(b.chiamati.sort()).toEqual(["get_overdue_payments", "lista_lavori_pose_periodo"]);
    expect(b.testo).toContain(CREDITI);
    nessunaCifraDi(b.testo, [CASSA, FATTURATO]);
    expect(b.piano.azioniPronte).toBe(false);
  });

  it("nessun ruolo diverso da amministratore, con qualsiasi permesso, riceve cassa, sintesi o azioni pronte", () => {
    const nonAmministratori = PRIORITA_RUOLI_SILVIO.filter((r) => r !== "super_admin" && r !== "company_admin");
    for (const ruolo of nonAmministratori) {
      const piano = pianoDelBrief([ruolo], TUTTO_ACCESO);
      const nomi = piano.strumenti.map((s) => s.nome);
      expect(nomi, ruolo).not.toContain("get_cashflow_status");
      expect(nomi, ruolo).not.toContain("get_executive_snapshot");
      expect(piano.azioniPronte, ruolo).toBe(false);
    }
  });

  it("l'amministratore riceve tutto come prima, anche se è pure venditore", async () => {
    const b = await briefPer(["company_admin", "salesperson"], null);
    expect(b.piano.ruolo).toBe("company_admin");
    expect(b.chiamati.sort()).toEqual(STRUMENTI_DEL_BRIEF.map((s) => s.nome).sort());
    expect(b.piano.azioniPronte).toBe(true);
    expect(b.testo).toContain(CASSA);
    expect(b.testo).toContain(CREDITI);
  });

  it("senza ruoli nessun brief, anche se è rimasta una riga permessi", async () => {
    const b = await briefPer([], TUTTO_ACCESO);
    expect(b.piano.ruolo).toBeNull();
    expect(briefDaFare(b.piano)).toBe(false);
    expect(b.chiamati).toEqual([]);
  });
});

describe("niente da dire, niente modello", () => {
  it("un rifiuto o un errore del motore non entra nel testo per il modello", async () => {
    const piano = pianoDelBrief(["company_admin"], null);
    const dati = await raccogliDatiDelBrief(piano, async (nome) =>
      nome === "lista_lavori_pose_periodo"
        ? { success: true, data: RISPOSTE[nome] }
        : { success: false, data: { code: "forbidden_role", cassa: Number(CASSA) } },
    );
    expect(dati.usati).toEqual(["lista_lavori_pose_periodo"]);
    nessunaCifraDi(dati.parti.join("\n"), [CASSA]);
  });

  it("solo lavori e nessuna posa in 48 ore: niente da raccontare", async () => {
    const piano = pianoDelBrief(["company_staff"], { can_view_orders: true });
    const dati = await raccogliDatiDelBrief(piano, async () => ({ success: true, data: { count: 0, eventi: [] } }));
    expect(dati.conContenuto).toBe(false);
  });

  it("vuoto vuol dire vuoto", () => {
    expect(risultatoVuoto(undefined)).toBe(true);
    expect(risultatoVuoto([])).toBe(true);
    expect(risultatoVuoto({})).toBe(true);
    expect(risultatoVuoto({ count: 0, eventi: [] })).toBe(true);
    expect(risultatoVuoto({ count: 1 })).toBe(false);
    expect(risultatoVuoto({ saldo_totale_eur: 0 })).toBe(false);
  });
});

describe("stessa scala di ruoli della chat", () => {
  it("il ruolo più alto vince", () => {
    expect(ruoloPrincipaleSilvio(["company_staff", "salesperson"])).toBe("salesperson");
    expect(ruoloPrincipaleSilvio(["call_center", "company_staff"])).toBe("call_center");
    expect(ruoloPrincipaleSilvio(["salesperson", "company_admin"])).toBe("company_admin");
    expect(ruoloPrincipaleSilvio(["company_staff"])).toBe("company_staff");
  });

  it("la chat usa la stessa funzione, non una copia", () => {
    const chat = readFileSync(join(ROOT, "supabase/functions/silvio-chat/index.ts"), "utf8");
    expect(chat).toMatch(/import \{[^}]*\bruoloPrincipaleSilvio\b[^}]*\} from "\.\.\/_shared\/ruoloSilvio\.ts";/);
    expect(chat).toContain("const primaryRole = ruoloPrincipaleSilvio(roleList);");
    expect(chat).not.toContain("const rolePriority =");
    // Anche chi usa i permessi della riga lo decide ruoloSilvio (25/09/2026:
    // prima la chat li caricava solo per company_staff, e il venditore no).
    expect(chat).toContain("const staffPermsPromise = usaPermessiStaff(primaryRole)");
    expect(chat).not.toContain('primaryRole === "company_staff"');
  });

  it("gli strumenti del brief esistono e la loro area ha un permesso", () => {
    for (const s of STRUMENTI_DEL_BRIEF) {
      const tool = SILVIO_TOOLS[s.nome];
      expect(tool, s.nome).toBeDefined();
      expect(tool.domain && DOMAIN_STAFF_PERMISSION[tool.domain], s.nome).toBeTruthy();
    }
  });
});

describe("la funzione segue il piano", () => {
  const funzione = readFileSync(join(ROOT, "supabase/functions/silvio-morning-brief/index.ts"), "utf8");

  it("nessun ruolo forzato: il contesto degli strumenti ha il ruolo vero", () => {
    expect(funzione).not.toMatch(/primaryRole:\s*"company_admin"/);
    expect(funzione).toContain("primaryRole: d.piano.ruolo");
  });

  it("chi non ha niente da vedere si salta prima di strumenti e modello", () => {
    expect(funzione).toContain("conPiano.filter((d) => briefDaFare(d.piano))");
    expect(funzione).toContain("raccogliDatiDelBrief(d.piano,");
    expect(funzione).not.toMatch(/executeToolWithRouting\("get_/);
  });

  it("azioni pronte solo se il piano le prevede", () => {
    expect(funzione).toContain("d.piano.azioniPronte ? await prepareActionableProposals(supabase, d) : []");
  });

  it("a mano solo il super_admin, e l'utente deve essere dell'azienda", () => {
    expect(funzione).toContain('requireRole(auth.supabaseAdmin, auth.userId, ["super_admin"], cors)');
    expect(funzione).toContain("requireCompanyAccess(supabase, body.user_id, body.company_id, cors)");
  });
});
