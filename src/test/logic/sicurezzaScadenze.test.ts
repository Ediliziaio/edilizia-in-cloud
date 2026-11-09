/**
 * Le scadenze della sicurezza arrivano a qualcuno (09/11/2026).
 *
 * Fin qui il DURC di una ditta scadeva in silenzio: nessuna campanella,
 * nessuna email, lo vedeva solo chi apriva la pagina.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cosaScade,
  ordinaScadenze,
  quandoScade,
  riepilogoScadenze,
  type ScadenzaSicurezza,
} from "@/lib/sicurezza/scadenzeCommessa";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");

const riga = (over: Partial<ScadenzaSicurezza> = {}): ScadenzaSicurezza => ({
  origine: "documento",
  riferimento_id: "r1",
  tipo: "durc",
  titolo: null,
  subappaltatore: null,
  data_scadenza: "2026-11-20",
  giorni_mancanti: 11,
  stato: "in_scadenza",
  ...over,
});

describe("Come si legge una scadenza", () => {
  it("dice il nome del cantiere, non la sigla della tabella", () => {
    expect(cosaScade(riga({ tipo: "pimus" }))).toBe("PiMUS");
    expect(cosaScade(riga({ tipo: "notifica_preliminare" }))).toBe(
      "Notifica preliminare",
    );
    // Un tipo che non conosciamo non diventa una parola in codice.
    expect(cosaScade(riga({ tipo: "roba_nuova" }))).toBe("Documento");
  });

  it("mette accanto la ditta, quando la scadenza è sua", () => {
    expect(cosaScade(riga({ subappaltatore: "Edil Rossi" }))).toBe(
      "DURC · Edil Rossi",
    );
  });

  it("il titolo scritto a mano vince sul tipo", () => {
    expect(cosaScade(riga({ titolo: "DURC richiesto a ottobre" }))).toBe(
      "DURC richiesto a ottobre",
    );
  });

  it("il ritardo si dice in giorni, non con una data e basta", () => {
    expect(quandoScade(riga({ stato: "scaduto", giorni_mancanti: -4 })))
      .toBe("era da fare 4 giorni fa, il 20/11/2026");
    expect(quandoScade(riga({ stato: "scaduto", giorni_mancanti: -1 })))
      .toBe("era da fare ieri, il 20/11/2026");
    expect(quandoScade(riga({ giorni_mancanti: 0 }))).toBe(
      "scade oggi, 20/11/2026",
    );
    expect(quandoScade(riga({ giorni_mancanti: 1 }))).toBe(
      "scade domani, il 20/11/2026",
    );
    expect(quandoScade(riga({ giorni_mancanti: 12 }))).toBe(
      "scade fra 12 giorni, il 20/11/2026",
    );
  });
});

describe("L'ordine della lista", () => {
  it("prima il ritardo più vecchio, poi quello che sta per scadere", () => {
    const righe = [
      riga({ riferimento_id: "c", data_scadenza: "2026-11-30", giorni_mancanti: 21 }),
      riga({ riferimento_id: "a", data_scadenza: "2026-09-01", giorni_mancanti: -69, stato: "scaduto" }),
      riga({ riferimento_id: "b", data_scadenza: "2026-11-01", giorni_mancanti: -8, stato: "scaduto" }),
    ];
    expect(ordinaScadenze(righe).map((r) => r.riferimento_id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("a parità di data l'ordine non balla fra un caricamento e l'altro", () => {
    const righe = [
      riga({ riferimento_id: "2", titolo: "Zeta" }),
      riga({ riferimento_id: "1", titolo: "Alfa" }),
    ];
    expect(ordinaScadenze(righe).map((r) => r.titolo)).toEqual(["Alfa", "Zeta"]);
    // Ordinare non cambia la lista di partenza.
    expect(righe[0].titolo).toBe("Zeta");
  });
});

describe("La riga che si legge senza aprire nulla", () => {
  it("conta i ritardi separati da quelle che stanno per scadere", () => {
    const righe = [
      riga({ stato: "scaduto" }),
      riga({ stato: "scaduto" }),
      riga(),
    ];
    expect(riepilogoScadenze(righe)).toMatchObject({
      inRitardo: 2,
      inScadenza: 1,
      testo: "2 in ritardo, 1 in scadenza",
    });
  });

  it("se non c'è ritardo non lo nomina", () => {
    expect(riepilogoScadenze([riga()]).testo).toBe("1 in scadenza");
  });
});

describe("La vista nel database", () => {
  const sql = leggi(
    "supabase/migrations/20290113100000_sicurezza_scadenze_vista.sql",
  );

  it("mette insieme le quattro fonti che oggi tacciono", () => {
    expect(sql).toContain("from public.sicurezza_documenti");
    expect(sql).toContain("from public.sicurezza_fascicolo");
    expect(sql).toContain("from public.adempimenti_sicurezza");
    expect(sql).toContain("from public.subappaltatori_sicurezza");
  });

  it("salta le voci chiuse, non applicabili e gli adempimenti già fatti", () => {
    expect(sql).toContain("not in ('non_applicabile', 'superato')");
    expect(sql).toContain("coalesce(a.stato, 'da_fare') = 'da_fare'");
  });

  it("non avvisa due volte sullo stesso DURC", () => {
    // La data scritta nella scheda della ditta vale solo senza un documento.
    expect(sql).toMatch(/durc_ditta[\s\S]*not exists[\s\S]*sicurezza_documenti/);
    expect(sql).toMatch(/durc_ditta[\s\S]*not exists[\s\S]*sicurezza_fascicolo/);
  });

  it("una commessa cancellata non chiama più nessuno", () => {
    expect(sql).toContain("o.deleted_at is null");
    expect(sql).toContain("r.order_id is null or o.id is not null");
  });

  it("guarda 30 giorni avanti, come già fa la pagina", () => {
    expect(sql).toContain("r.data_scadenza <= current_date + 30");
  });

  it("rispetta i permessi di chi legge, e non è aperta a nessun altro", () => {
    expect(sql).toContain("security_invoker = on");
    expect(sql).toContain("grant select on public.sicurezza_scadenze to authenticated, service_role;");
    expect(sql).not.toMatch(/to\s+anon/);
  });
});

describe("Chi riceve l'avviso", () => {
  const fn = leggi("supabase/functions/hr-check-scadenze/index.ts");

  it("legge la vista, non le tabelle una per una", () => {
    expect(fn).toContain('.from("sicurezza_scadenze")');
  });

  it("avvisa chi ha il permesso della sicurezza, oltre agli admin", () => {
    expect(fn).toContain('.eq("can_view_sicurezza_cantiere", true)');
  });

  it("non ripete lo stesso avviso entro la settimana", () => {
    expect(fn).toMatch(/eq\("type", "sicurezza_scadenza"\)[\s\S]{0,200}gte\("created_at", since\)/);
  });

  it("gli arretrati di mesi fa non fanno suonare niente", () => {
    expect(fn).toMatch(/sicurezza[\s\S]{0,600}giorni_mancanti \?\? 0\) >= -30/);
  });

  it("porta dritto alla Sicurezza di quel cantiere", () => {
    expect(fn).toContain("?tab=cantiere&vista_cantiere=sicurezza");
  });

  it("un guasto qui non ferma gli avvisi del personale e dei mezzi", () => {
    expect(fn).toMatch(/controllaSicurezza\(admin, provider\)\.catch/);
  });
});

describe("La campanella sa disegnare il tipo nuovo", () => {
  it("l'avviso della sicurezza ha la sua icona", () => {
    const bell = leggi(
      "src/components/notifications/NotificationsBellPopover.tsx",
    );
    expect(bell).toMatch(/sicurezza_scadenza: \{ icon: HardHat/);
  });
});

describe("Il DURC dice da sé quando scade", () => {
  it("la lettura dal PDF è agganciata al caricamento, e resta correggibile", () => {
    const dialog = leggi("src/components/sicurezza/DocumentiSicurezza.tsx");
    expect(dialog).toContain("extractDurcExpiryFromPdf");
    expect(dialog).toContain('tipo === "durc" && accettati.length === 1');
    // Non sovrascrive una data già messa a mano.
    expect(dialog).toContain("setScadenza((attuale) => attuale || iso)");
    expect(dialog).toContain("Letta dal DURC. Correggila se non corrisponde.");
  });
});
