/**
 * Dashboard Gestione = regia operativa (22/10/2026): cosa succede in cantiere e
 * in magazzino nei prossimi giorni e cosa è fermo, niente soldi (quelli stanno
 * nel Cruscotto). Prima: 2.916 px, 48 bottoni, gli stessi numeri in più riquadri.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { giorniDaOggi } from "@/lib/regia/agendaOperativa";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("regia operativa", () => {
  const pagina = leggi("src/pages/azienda/CompanyDashboard.tsx");
  const hook = leggi("src/hooks/useRegiaOperativa.ts");

  it("non mostra importi: niente venduto, incassi, costi o saldi", () => {
    for (const parola of ["formatCurrency", "Venduto", "Incassato", "Saldo dopo costi", "Controllo costi"]) {
      expect(pagina).not.toContain(parola);
    }
    expect(pagina).toContain('to="/azienda/cruscotto/aziendale"');
  });

  it("una sola lettura dell'agenda, senza il vecchio hook finanziario né il filtro periodo", () => {
    expect(existsSync(resolve(process.cwd(), "src/hooks/useCompanyDashboardData.ts"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/components/dashboard/CompanyDashboardFilters.tsx"))).toBe(false);
    expect(hook).toContain("leggiAgendaOperativa(companyId!, oggi, fine, signal)");
  });

  it("i ticket aperti sono quelli non risolti, qui e nel Cruscotto", () => {
    const regola = '.not("status", "in", "(risolto,chiuso,annullato)")';
    expect(hook).toContain(regola);
    expect(leggi("src/hooks/useCruscottoData.ts")).toContain(regola);
  });

  it("i cantieri in ritardo con la regola del Cruscotto, la merce in ritardo e in arrivo solo per ordini ancora da ricevere", () => {
    expect(hook).toContain("isLateWork(o, oggiData)");
    // anche «parziale»: arrivata una parte, il resto va sollecitato
    expect(hook).toContain('.in("status", ["inviato", "confermato", "parziale"])');
    // ricevuti e annullati non sono «in arrivo»
    expect(leggi("src/lib/regia/agendaOperativa.ts")).toContain('.in("status", ["inviato", "confermato", "parziale"])');
  });

  it("giorni da oggi: 0 oggi, 1 domani", () => {
    const oggi = new Date(2026, 9, 22, 15);
    expect(giorniDaOggi("2026-10-22", oggi)).toBe(0);
    expect(giorniDaOggi("2026-10-23", oggi)).toBe(1);
  });
});
