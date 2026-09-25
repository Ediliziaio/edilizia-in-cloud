import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Ruoli aggiuntivi per tutti (21/09/2026).
 *
 * Florin: «un amministratore può essere venditore, call center o altro, idem
 * per gli altri». Prima la scheda offriva «Anche Venditore / Anche Call
 * Center» solo a Utente, Operaio e Subappaltatore; Operaio come ruolo in più
 * non esisteva; e cambiare il ruolo principale cancellava tutti gli altri.
 *
 * I ruoli sono un insieme: il principale è il più alto in una classifica, gli
 * altri sono «anche …». La classifica sta in due posti, l'app e il database, e
 * devono restare uguali: se divergono la scheda mostra un ruolo e il database
 * ne ragiona un altro.
 */

vi.mock("@/hooks/useOpportunitiesData", () => ({ usePipelines: () => ({ data: [] as { id: string; name: string }[] }) }));

// Radix Select in jsdom
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import {
  ORDINE_RUOLO_PRINCIPALE,
  aggiuntiviDisponibili,
  ruoliAggiuntivi,
  ruoloPrincipale,
} from "@/lib/permessi/ruoliUtente";
import { UserRolesPermissionsTab, type AdditionalRole, type CompanyRole } from "@/components/users/UserRolesPermissionsTab";
import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";

const radice = resolve(__dirname, "../../..");
const MIGRATION = readFileSync(
  resolve(radice, "supabase/migrations/20280921184500_ruoli_aggiuntivi_per_tutti.sql"),
  "utf8",
);

afterEach(cleanup);

describe("la classifica dei ruoli", () => {
  it("è la stessa nell'app e nel database", () => {
    const corpo = MIGRATION.slice(
      MIGRATION.indexOf("create or replace function public.ruolo_principale_utente"),
      MIGRATION.indexOf("comment on function public.ruolo_principale_utente"),
    );
    const nelDatabase = [...corpo.matchAll(/then '(\w+)'/g)].map((m) => m[1]);
    expect(nelDatabase).toEqual([...ORDINE_RUOLO_PRINCIPALE]);
  });

  it("il principale è il più alto; gli altri fra Venditore, Call Center e Operaio sono «anche»", () => {
    // Elena di Ener: amministratrice e anche call center.
    expect(ruoloPrincipale(["call_center", "company_admin"])).toBe("company_admin");
    expect(ruoliAggiuntivi(["call_center", "company_admin"], "company_admin")).toEqual(["call_center"]);
    // Ufficio + cantiere: Utente, anche Operaio (prima l'elenco diceva «Operaio»).
    expect(ruoloPrincipale(["company_staff", "employee"])).toBe("company_staff");
    expect(ruoliAggiuntivi(["company_staff", "employee"], "company_staff")).toEqual(["employee"]);
    // Il vecchio nome «worker» vale come Operaio.
    expect(ruoloPrincipale(["worker"])).toBe("employee");
    expect(ruoloPrincipale([])).toBeUndefined();
  });

  it("si offrono tutti i ruoli aggiuntivi tranne il principale; al Subappaltatore nessuno", () => {
    expect(aggiuntiviDisponibili("company_admin")).toEqual(["salesperson", "call_center", "employee"]);
    expect(aggiuntiviDisponibili("salesperson")).toEqual(["call_center", "employee"]);
    expect(aggiuntiviDisponibili("employee")).toEqual(["salesperson", "call_center"]);
    expect(aggiuntiviDisponibili("subcontractor")).toEqual([]);
  });
});

describe("il database", () => {
  it("accetta Operaio come ruolo aggiuntivo e tiene gli aggiuntivi al cambio del principale", () => {
    expect(MIGRATION).toMatch(/p_ruolo not in \('salesperson', 'call_center', 'employee'\)/);
    // Il cambio del principale cancella solo i ruoli che non restano.
    expect(MIGRATION).toMatch(/and not \(r\.role::text = any \(v_nuovi\)\)/);
  });
});

function persona(role: CompanyRole, additionalRoles: AdditionalRole[] = []) {
  return {
    id: "u1",
    first_name: "Elena",
    last_name: "Ener",
    role,
    additionalRoles,
    permissions: { ...DEFAULT_PERMISSIONS },
  };
}

async function scegli(ruolo: RegExp) {
  fireEvent.pointerDown(screen.getByRole("combobox"), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: ruolo }));
}

describe("Scheda utente — ruoli aggiuntivi", () => {
  it("anche l'amministratore può essere Venditore, Call Center e Operaio", () => {
    const onToggle = vi.fn();
    render(
      <UserRolesPermissionsTab
        user={persona("company_admin", ["call_center"])}
        onSave={vi.fn()}
        onChangeRole={vi.fn()}
        onToggleAdditionalRole={onToggle}
      />,
    );
    expect(screen.getByText("Ruoli aggiuntivi")).toBeTruthy();
    expect(screen.getByLabelText(/Anche Venditore/)).toBeTruthy();
    expect(screen.getByLabelText(/Anche Call Center/)).toBeTruthy();
    // Il call center c'è già: la casella è spuntata.
    expect(screen.getByLabelText(/Anche Call Center/).getAttribute("data-state")).toBe("checked");

    fireEvent.click(screen.getByLabelText(/Anche Operaio \/ Tecnico/));
    expect(onToggle).toHaveBeenCalledWith("employee", true);
  });

  it("il principale non compare fra gli aggiuntivi; il Subappaltatore non ne ha", () => {
    const { unmount } = render(
      <UserRolesPermissionsTab user={persona("salesperson")} onSave={vi.fn()} onToggleAdditionalRole={vi.fn()} />,
    );
    expect(screen.queryByLabelText(/Anche Venditore/)).toBeNull();
    expect(screen.getByLabelText(/Anche Call Center/)).toBeTruthy();
    unmount();

    render(<UserRolesPermissionsTab user={persona("subcontractor")} onSave={vi.fn()} onToggleAdditionalRole={vi.fn()} />);
    expect(screen.queryByText("Ruoli aggiuntivi")).toBeNull();
  });

  it("al cambio del ruolo principale dice quali ruoli aggiuntivi restano", async () => {
    render(
      <UserRolesPermissionsTab
        user={persona("call_center", ["employee"])}
        onSave={vi.fn()}
        onChangeRole={vi.fn()}
        onToggleAdditionalRole={vi.fn()}
      />,
    );
    await scegli(/Amministratore/);
    expect(screen.getByText(/Resta anche Operaio \/ Tecnico/)).toBeTruthy();
    // Mentre il cambio aspetta la conferma, le caselle non si toccano.
    expect(screen.queryByText("Ruoli aggiuntivi")).toBeNull();

    await scegli(/Subappaltatore/);
    expect(screen.getByText(/vengono tolti: un subappaltatore non ne ha/)).toBeTruthy();
  });
});
