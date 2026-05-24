import { describe, expect, it } from "vitest";
import { resolveFvModuloIndexGate } from "../../lib/fotovoltaico/moduloAccess";

describe("fotovoltaico modulo index gate", () => {
  it("does not leave the index in an infinite loader when the company query is idle", () => {
    expect(
      resolveFvModuloIndexGate({
        data: undefined,
        isLoading: true,
        isError: false,
        fetchStatus: "idle",
      }),
    ).toEqual({
      showLoading: false,
      showInactive: false,
      showSetup: false,
    });
  });

  it("soft-opens while the module state is unresolved because the route is already feature-gated", () => {
    expect(
      resolveFvModuloIndexGate({
        data: undefined,
        isLoading: true,
        isError: false,
        fetchStatus: "fetching",
      }).showLoading,
    ).toBe(false);

    expect(
      resolveFvModuloIndexGate({
        data: undefined,
        isLoading: true,
        isError: false,
        fetchStatus: "paused",
      }).showLoading,
    ).toBe(false);
  });

  it("still shows inactive and setup states when the database returns them", () => {
    expect(
      resolveFvModuloIndexGate({
        data: { attivo: false, setup_completato: false },
        isLoading: false,
        isError: false,
        fetchStatus: "idle",
      }).showInactive,
    ).toBe(true);

    expect(
      resolveFvModuloIndexGate({
        data: { attivo: true, setup_completato: false },
        isLoading: false,
        isError: false,
        fetchStatus: "idle",
      }).showSetup,
    ).toBe(true);
  });
});
