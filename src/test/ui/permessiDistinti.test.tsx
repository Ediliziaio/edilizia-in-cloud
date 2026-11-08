import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PermissionsDialog } from "@/components/users/PermissionsDialog";
import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("salva rapportini modificabili con commesse e operai soltanto consultabili", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const save = vi.fn().mockResolvedValue(undefined);
  render(<PermissionsDialog open onOpenChange={vi.fn()} userName="Utente" onSave={save} currentPermissions={{ ...DEFAULT_PERMISSIONS, can_view_orders: true, can_edit_orders: true, can_view_operai: true, can_edit_operai: true, can_view_giornale_lavori: true, can_edit_giornale_lavori: true }} />);
  fireEvent.click(screen.getByRole("switch", { name: "Distingui visualizzazione e modifica" }));
  fireEvent.click(document.getElementById("can_edit_orders")!);
  fireEvent.click(document.getElementById("can_edit_operai")!);
  fireEvent.click(screen.getByRole("button", { name: /Salva/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0]).toMatchObject({ permessi_dettagliati: true, sola_lettura: false, can_view_orders: true, can_edit_orders: false, can_view_operai: true, can_edit_operai: false, can_edit_giornale_lavori: true });
}, 20_000);
