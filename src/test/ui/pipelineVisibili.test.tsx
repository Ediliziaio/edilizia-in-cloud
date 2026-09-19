import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Pipeline visibili per utente (19/09/2026): nella scheda utente si spuntano
 * le pipeline che vede; nessuna spuntata = tutte. La regola vera sta nel
 * database (policy RESTRICTIVE), la scheda deve solo salvarla bene.
 */

vi.mock("@/hooks/useOpportunitiesData", () => ({
  usePipelines: () => ({
    data: [
      { id: "p1", name: "1° Fase - Contatto" },
      { id: "p2", name: "2° Fase - Showroom" },
      { id: "p3", name: "Nutrimento" },
    ],
  }),
}));

import { UserRolesPermissionsTab } from "@/components/users/UserRolesPermissionsTab";
import { DEFAULT_PERMISSIONS, buildStaffPermissionsUpdate } from "@/components/users/permissionsDefaults";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";

afterEach(cleanup);

const TIMEOUT_MATRICE_PERMESSI = 30_000;

function utente(permessi: Partial<StaffPermissions> = {}) {
  return {
    id: "u1",
    first_name: "Camilla",
    last_name: "Nespola",
    role: "salesperson" as const,
    additionalRoles: [] as ("salesperson" | "call_center")[],
    permissions: { ...DEFAULT_PERMISSIONS, can_view_marketing_opportunities: true, ...permessi },
  };
}

function sezione() {
  const titolo = screen.getByText("Pipeline visibili");
  return titolo.closest("div.rounded-lg") as HTMLElement;
}

describe("Scheda utente — Pipeline visibili", () => {
  it("nessuna spuntata = tutte; spuntarne una e salvare la restringe", () => {
    const onSave = vi.fn();
    render(<UserRolesPermissionsTab user={utente()} onSave={onSave} />);

    const box = sezione();
    expect(within(box).getByText("Vede tutte le pipeline. Spunta quelle a cui limitarlo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salva permessi/i })).toBeDisabled();

    const [fase1, fase2] = within(box).getAllByRole("checkbox");
    fireEvent.click(fase1);
    fireEvent.click(fase2);
    expect(within(box).getByText(/Vede solo le pipeline spuntate/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /salva permessi/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].pipeline_visibili).toEqual(["p1", "p2"]);
  }, TIMEOUT_MATRICE_PERMESSI);

  it("spuntare e rispuntare non è una modifica da salvare", () => {
    render(<UserRolesPermissionsTab user={utente({ pipeline_visibili: ["p2"] })} onSave={vi.fn()} />);
    const box = sezione();
    const fase1 = within(box).getAllByRole("checkbox")[0];
    fireEvent.click(fase1);
    expect(screen.getByRole("button", { name: /salva permessi/i })).toBeEnabled();
    fireEvent.click(fase1);
    expect(screen.getByRole("button", { name: /salva permessi/i })).toBeDisabled();
  }, TIMEOUT_MATRICE_PERMESSI);

  it("una pipeline cancellata non resta spuntata di nascosto", () => {
    const onSave = vi.fn();
    render(<UserRolesPermissionsTab user={utente({ pipeline_visibili: ["cancellata", "p2"] })} onSave={onSave} />);
    const box = sezione();
    fireEvent.click(within(box).getAllByRole("checkbox")[2]); // Nutrimento
    fireEvent.click(screen.getByRole("button", { name: /salva permessi/i }));
    expect(onSave.mock.calls[0][0].pipeline_visibili).toEqual(["p2", "p3"]);
  }, TIMEOUT_MATRICE_PERMESSI);

  it("«Tutti» e «Nessuno» sui moduli non cancellano la scelta delle pipeline", () => {
    const onSave = vi.fn();
    render(<UserRolesPermissionsTab user={utente({ pipeline_visibili: ["p1"] })} onSave={onSave} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^tutti$/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /salva permessi/i }));
    expect(onSave.mock.calls[0][0].pipeline_visibili).toEqual(["p1"]);
  }, TIMEOUT_MATRICE_PERMESSI);

  it("senza accesso alle opportunità la sezione non c'è", () => {
    render(<UserRolesPermissionsTab user={utente({ can_view_marketing_opportunities: false })} onSave={vi.fn()} />);
    expect(screen.queryByText("Pipeline visibili")).toBeNull();
  }, TIMEOUT_MATRICE_PERMESSI);

  it("il salvataggio porta il campo fino al database", () => {
    const payload = buildStaffPermissionsUpdate({ ...DEFAULT_PERMISSIONS, pipeline_visibili: ["p1"] });
    expect(payload.pipeline_visibili).toEqual(["p1"]);
    const senza = buildStaffPermissionsUpdate({ ...DEFAULT_PERMISSIONS, pipeline_visibili: undefined });
    expect(senza.pipeline_visibili).toEqual([]);
  });
});

describe("La regola nel database", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20280919123000_pipeline_visibili_per_utente.sql"), "utf8");

  it("vale su opportunità, pipeline e fasi, sopra a tutte le altre regole", () => {
    for (const tabella of ["marketing_opportunities", "marketing_pipelines", "marketing_pipeline_stages"]) {
      expect(sql).toMatch(new RegExp(`create policy "pipeline_visibili_utente" on public\\.${tabella}\\s+as restrictive\\s+for all`));
    }
  });

  it("l'elenco delle nascoste si calcola una volta per query, col cast all'array", () => {
    expect(sql).not.toMatch(/any \(\(select public\.pipeline_nascoste\(\)\)\)/);
    expect(sql).toContain("any ((select public.pipeline_nascoste())::uuid[])");
  });

  it("amministratori e super admin vedono sempre tutto", () => {
    expect(sql).toContain("not public.has_role((select auth.uid()), 'super_admin')");
    expect(sql).toContain("public.has_role((select auth.uid()), 'company_admin')");
  });

  it("i contatti seguiti non passano da una pipeline nascosta", () => {
    const corpo = sql.slice(sql.indexOf("function public.contatti_seguiti_da_me"));
    expect(corpo.match(/not coalesce\(o\.pipeline_id = any \(n\.ids\), false\)/g)?.length).toBe(4);
  });
});
