import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const memory = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  calls: [] as Array<{ table: string; steps: any[][] }>,
  patches: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const steps: any[][] = [];
      const q: any = new Proxy({}, {
        get(_, key) {
          if (key === "then") {
            return (ok: any) => {
              memory.calls.push({ table, steps });
              let rows = memory.rows.filter((r) =>
                steps.filter((s) => s[0] === "eq").every((s) =>
                  r[s[1]] === s[2]
                )
              );
              const range = steps.find((s) => s[0] === "range");
              if (range) rows = rows.slice(range[1], range[2] + 1);
              return Promise.resolve({ data: rows, error: null }).then(ok);
            };
          }
          if (
            !["select", "eq", "is", "order", "range", "abortSignal"].includes(
              String(key),
            )
          ) throw Error("WRITES FORBIDDEN");
          return (...args: any[]) => {
            steps.push([key, ...args]);
            return q;
          };
        },
      });
      return q;
    },
    functions: {
      invoke() {
        throw Error("NETWORK FORBIDDEN");
      },
    },
  },
}));
import { UpdateFieldConfigPanel } from "@/components/flow-builder/config-panels/UpdateFieldConfigPanel";
import { ConditionConfigPanel } from "@/components/flow-builder/config-panels/ConditionConfigPanel";
import { ConditionValueInput } from "@/components/marketing/automations/ConditionValueInput";
const id = "44444444-4444-4444-8444-444444444444";
const provider = (children: React.ReactNode) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);
function Update(
  { initial, companyId = "A" }: {
    initial: Record<string, unknown>;
    companyId?: string;
  },
) {
  const [config, setConfig] = useState(initial);
  return (
    <>
      <UpdateFieldConfigPanel
        companyId={companyId}
        config={config}
        onPatch={(patch) => {
          memory.patches.push(patch);
          setConfig((p) => ({ ...p, ...patch }));
        }}
      />
      <pre data-testid="draft">{JSON.stringify(config)}</pre>
    </>
  );
}
beforeEach(() => {
  memory.rows = [{
    id,
    company_id: "A",
    object_type: "contact",
    name: "Budget",
    field_type: "number",
    options: [],
    is_required: false,
  }];
  memory.calls = [];
  memory.patches = [];
});
afterEach(cleanup);
describe("custom fields in workflow editor, no writes", () => {
  it("offers stable custom destinations and preserves zero", async () => {
    render(
      provider(
        <Update
          initial={{ tabella: "contacts", campo: `cf:${id}`, valore: 0 }}
        />,
      ),
    );
    expect(await screen.findByRole("option", { name: "Budget" })).toHaveValue(
      `cf:${id}`,
    );
    const number = await screen.findByLabelText("Budget");
    expect(number).toHaveValue(0);
    fireEvent.change(number, { target: { value: "12" } });
    expect(JSON.parse(screen.getByTestId("draft").textContent!).valore).toBe(
      12,
    );
  });
  it("changes entity in one patch, clearing legacy overrides and stale destination", () => {
    render(
      provider(
        <Update
          initial={{
            tabella: "contacts",
            campo: "notes",
            field_name: "email",
            field_value: "old",
            valore: "new",
          }}
        />,
      ),
    );
    fireEvent.change(screen.getByLabelText("Entità da aggiornare"), {
      target: { value: "orders" },
    });
    expect(memory.patches).toHaveLength(1);
    expect(JSON.parse(screen.getByTestId("draft").textContent!)).toMatchObject({
      tabella: "orders",
      campo: "",
      field_name: "",
      valore: "",
    });
    expect(JSON.parse(screen.getByTestId("draft").textContent!).field_value)
      .toBeUndefined();
  });
  it("does not offer protected database columns", () => {
    render(
      provider(
        <Update
          initial={{ tabella: "invoices", campo: "status", valore: "paid" }}
        />,
      ),
    );
    expect(screen.getByRole("option", { name: /Campo non disponibile/ }))
      .toBeDisabled();
    expect(screen.queryByRole("option", { name: "status" }))
      .toBeNull();
  });
  it("keeps false in checkbox configuration", async () => {
    memory.rows[0].field_type = "checkbox";
    render(
      provider(
        <Update
          initial={{ tabella: "contacts", campo: `cf:${id}`, valore: false }}
        />,
      ),
    );
    const checkbox = await screen.findByRole("checkbox", { name: "Budget" });
    expect(checkbox).not.toBeChecked();
    expect(JSON.parse(screen.getByTestId("draft").textContent!).valore).toBe(
      false,
    );
  });
  it("renders a numeric custom condition, including zero", async () => {
    memory.rows[0].field_type = "percent";
    render(
      provider(
        <ConditionConfigPanel
          companyId="A"
          triggerCategory="contact"
          config={{
            condizioni: [{
              campo: `custom_field.${id}`,
              operatore: "maggiore",
              valore: 0,
            }],
          }}
          onChange={() => {}}
        />,
      ),
    );
    expect(await screen.findByRole("spinbutton")).toHaveValue(0);
  });
  it("uses the custom multiselect's options, not CRM tags", () => {
    const changed = vi.fn();
    render(
      provider(
        <ConditionValueInput
          companyId="A"
          field={{
            key: `custom_field.${id}`,
            label: "Finiture",
            type: "tags",
            group: "Custom",
            options: [{ value: "A", label: "A" }, { value: "B", label: "B" }],
          }}
          operator="contains"
          value={["A"]}
          onChange={changed}
        />,
      ),
    );
    expect(screen.getByLabelText("A")).toBeChecked();
    fireEvent.click(screen.getByLabelText("B"));
    expect(changed).toHaveBeenCalledWith(["A", "B"]);
    expect(memory.calls).toHaveLength(0);
  });
  it("queries only active definitions of the selected company/object", async () => {
    memory.rows.push({
      ...memory.rows[0],
      id: "other",
      company_id: "B",
      name: "Non visibile",
    });
    render(provider(<Update initial={{ tabella: "contacts" }} />));
    await screen.findByRole("option", { name: "Budget" });
    expect(screen.queryByRole("option", { name: "Non visibile" })).toBeNull();
    const query = memory.calls[0];
    expect(query.steps).toContainEqual(["eq", "company_id", "A"]);
    expect(query.steps).toContainEqual(["is", "deleted_at", null]);
    expect(query.steps).toContainEqual(["range", 0, 199]);
  });
  it("paginates beyond a single batch without silently truncating", async () => {
    memory.rows = Array.from(
      { length: 201 },
      (_, i) => ({ ...memory.rows[0], id: String(i), name: `Campo ${i}` }),
    );
    render(provider(<Update initial={{ tabella: "contacts" }} />));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Campo 200" }))
        .toBeInTheDocument()
    );
    expect(
      memory.calls.some((c) =>
        c.steps.some((s) => s[0] === "range" && s[1] === 200)
      ),
    ).toBe(true);
  });
});
