import { Capacitor } from "@capacitor/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RichiestaPushNativa } from "@/components/notifications/RichiestaPushNativa";

const stato = vi.hoisted(() => ({ userId: "u1", carica: false, iscritta: false, servizio: true, errore: null as string | null, attiva: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: stato.userId ? { id: stato.userId } : null, isLoading: stato.carica }) }));
vi.mock("@/hooks/usePushNotifications", () => ({ usePushNotifications: () => ({ permission: "default", isSubscribed: stato.iscritta,
  isLoading: false, nativa: true, servizioNativo: stato.servizio, errore: stato.errore, subscribe: stato.attiva }) }));
vi.mock("@/lib/campo/lingua/LinguaCampo", () => ({ useT: () => (s: string) => s }));
beforeEach(() => { vi.clearAllMocks(); stato.userId = "u1"; stato.carica = false; stato.iscritta = false; stato.servizio = true; stato.errore = null; vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true); });
afterEach(() => vi.restoreAllMocks());

it("dopo l'accesso mostra come attivare gli avvisi senza richiedere automaticamente il permesso", () => {
  render(<RichiestaPushNativa />);
  expect(stato.attiva).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Attiva notifiche" }));
  expect(stato.attiva).toHaveBeenCalledOnce();
});

it("nasconde il richiamo se già attivo o fuori dall'app installata", () => {
  stato.iscritta = true;
  const { rerender } = render(<RichiestaPushNativa />);
  expect(screen.queryByRole("button", { name: "Attiva notifiche" })).toBeNull();
  stato.iscritta = false; vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  rerender(<RichiestaPushNativa />);
  expect(screen.queryByRole("button", { name: "Attiva notifiche" })).toBeNull();
});

it("non promette l'attivazione se il servizio non è disponibile e mostra gli errori", () => {
  stato.servizio = false;
  const { rerender } = render(<RichiestaPushNativa />);
  expect(screen.queryByRole("button", { name: "Attiva notifiche" })).toBeNull();
  stato.servizio = true; stato.errore = "Registrazione non riuscita. Riprova.";
  rerender(<RichiestaPushNativa />);
  expect(screen.getByRole("alert")).toHaveTextContent("Riprova");
});

it("Non ora vale per l'accesso corrente; un altro account riceve il proprio richiamo", () => {
  const { rerender } = render(<RichiestaPushNativa />);
  fireEvent.click(screen.getByRole("button", { name: "Non ora" }));
  expect(screen.queryByRole("button", { name: "Attiva notifiche" })).toBeNull();
  stato.userId = "u2"; rerender(<RichiestaPushNativa />);
  expect(screen.getByRole("button", { name: "Attiva notifiche" })).toBeVisible();
});
