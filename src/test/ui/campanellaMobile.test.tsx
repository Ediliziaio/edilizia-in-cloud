import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NotificationsBellPopover } from "@/components/notifications/NotificationsBellPopover";
import { CampanellaCampo } from "@/components/campo/CampanellaCampo";
import type { Notification } from "@/hooks/useNotifications";

const stato = vi.hoisted(() => ({
  leggi: vi.fn(), leggiTutte: vi.fn(), chiudi: vi.fn(), aggiorna: vi.fn(),
  voci: [] as Notification[], online: true, errore: false,
}));
vi.mock("@/hooks/campo/useNetworkStatus", () => ({ useNetworkStatus: () => stato.online }));
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: (_enabled: boolean, { avvisiAzienda }: { avvisiAzienda: boolean }) => {
    const notifications = stato.voci.filter(n => avvisiAzienda || n.type !== "lifecycle");
    return { notifications, unreadCount: notifications.filter(n => !n.is_read).length,
      unreadMessagesCount: notifications.filter(n => !n.is_read && n.type !== "lifecycle").length,
      markAsRead: stato.leggi, markAllAsRead: stato.leggiTutte, dismiss: stato.chiudi,
      refresh: stato.aggiorna, isError: stato.errore, isLoading: false, isRefreshing: false, isMarkingAll: false };
  },
}));

const ordine = "13233333-3333-4333-8333-333333333333";
const voce = (n: Partial<Notification>): Notification => ({
  id: "primo", company_id: "azienda", user_id: "utente", type: "generic", title: "Compila le ore",
  body: null, entity_id: null, entity_type: null, action_url: null,
  is_read: false, is_dismissed: false, created_at: new Date().toISOString(), ...n,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("innerWidth", 375);
  stato.online = true;
  stato.errore = false;
  stato.voci = [
    voce({ id: "pagamento", title: "Pagamento in scadenza", type: "installment_due", action_url: "/azienda/scadenzario?tab=uscite" }),
    voce({ id: "archiviato", title: "Promemoria letto", is_read: true }),
    voce({ id: "avviso", title: "Controlla la liquidità", type: "lifecycle" }),
  ];
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function Pagina() {
  const location = useLocation();
  return <span data-testid="percorso">{location.pathname + location.search}</span>;
}

function apri(campanella = <NotificationsBellPopover />) {
  render(<MemoryRouter>{campanella}<Pagina /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: /^Notifiche,/ }));
  return within(screen.getByRole("dialog", { name: "Notifiche" }));
}

it("lascia gli avvisi da leggere all’apertura e apre la scadenza al solo tocco", () => {
  vi.useFakeTimers();
  const pannello = apri();
  act(() => { vi.advanceTimersByTime(2_000); });
  expect(stato.leggiTutte).not.toHaveBeenCalled();
  fireEvent.click(pannello.getByRole("button", { name: /^Da leggere/ }));
  expect(pannello.queryByText("Promemoria letto")).not.toBeInTheDocument();
  fireEvent.click(pannello.getByRole("button", { name: /^Pagamento in scadenza/ }));
  expect(stato.leggi).toHaveBeenCalledWith("pagamento");
  expect(screen.getByTestId("percorso")).toHaveTextContent("/azienda/scadenzario?tab=uscite");
  expect(screen.queryByRole("dialog", { name: "Notifiche" })).not.toBeInTheDocument();
});

it.each([false, true])("apre la scheda giusta in Lavori con ruolo tecnico %s", tecnico => {
  stato.voci.unshift(voce({ id: "cantiere", title: "Aggiornamento cantiere", action_url: `/azienda/ordini/${ordine}` }));
  const pannello = apri(<CampanellaCampo tecnico={tecnico} />);
  expect(pannello.queryByText("Controlla la liquidità")).not.toBeInTheDocument();
  expect(pannello.getByRole("link", { name: "Preferenze notifiche" })).toHaveAttribute("href", "/campo/impostazioni/notifiche");
  fireEvent.click(pannello.getByRole("button", { name: /^Aggiornamento cantiere/ }));
  expect(screen.getByTestId("percorso")).toHaveTextContent(`/campo/${tecnico ? "cantieri" : "lavoro"}/${ordine}`);
});

it("mantiene l’avviso aziendale e rende indisponibili le modifiche quando manca la rete", () => {
  stato.online = false;
  const pannello = apri();
  expect(pannello.getByRole("status")).toHaveTextContent("Sei offline");
  expect(pannello.getByRole("button", { name: "Tutte lette" })).toBeDisabled();
  expect(pannello.getByRole("button", { name: "Chiudi avviso · Controlla la liquidità" })).toBeDisabled();
});
