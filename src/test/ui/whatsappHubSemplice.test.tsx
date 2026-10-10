/**
 * Hub WhatsApp, scheda «Numeri»: una riga, i numeri, poche parole (09/10/2026).
 *
 * Prima, per arrivare al primo numero, c'erano cinque riquadri di conteggio, tre riquadri «linee» che ripetevano i gruppi
 * sotto e, in ogni scheda, descrizione + etichetta + autonomia + due esempi. Ora: una riga di riepilogo, i gruppi (con i
 * riquadri tratteggiati «Collega…» per i numeri che mancano, anche se non ce n'è nessuno) e una frase per scheda.
 * Parole di tutti i giorni: «Modelli» e «Invii di massa» al posto di «Template» e «Broadcast».
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  numeri: {} as Record<string, unknown[]>,
  metriche: null as unknown,
  mobile: false,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("@/hooks/whatsapp/useWAMetrics", () => ({ useWAMetrics: () => ({ data: stato.metriche, isLoading: false }) }));
vi.mock("@/hooks/whatsapp/useWhatsAppNumbers", async (originale) => ({
  ...(await originale<object>()),
  useWhatsAppNumbersByPurpose: () => ({
    byPurpose: { bot_operativo: [] as unknown[], assistenza: [] as unknown[], lead: [] as unknown[], marketing: [] as unknown[], notifiche: [] as unknown[], ...stato.numeri },
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
    isFetching: false,
  }),
}));
vi.mock("@/components/whatsapp-multi/ConnectNumberWizard", () => ({ ConnectNumberWizard: (): null => null }));
vi.mock("@/components/whatsapp-multi/WhatsAppProfiloDialog", () => ({ WhatsAppProfiloDialog: (): null => null }));
vi.mock("@/pages/azienda/whatsapp/TemplatesPage", () => ({ default: () => <div>pagina modelli</div> }));
vi.mock("@/pages/azienda/whatsapp/NotificheConfigPage", () => ({ default: () => <div>pagina notifiche</div> }));
vi.mock("@/pages/azienda/whatsapp/BroadcastListPage", () => ({ default: () => <div>pagina invii di massa</div> }));
vi.mock("@/pages/azienda/whatsapp/OperationalControlPage", () => ({ default: () => <div>pagina regia</div> }));
vi.mock("@/pages/azienda/whatsapp/AutomazioniBotPage", () => ({ default: () => <div>pagina automazioni</div> }));

import { WhatsAppMultiNumeroTab } from "@/components/whatsapp-multi/WhatsAppMultiNumeroTab";
import WhatsAppHubPage from "@/pages/azienda/whatsapp/WhatsAppHubPage";
import { PURPOSE_AUTONOMY, PURPOSE_EXAMPLES } from "@/hooks/whatsapp/useWhatsAppNumbers";

const numeroMarketing = {
  id: "n1",
  purpose: "marketing",
  display_name: "Fotovoltaico per la Tua Casa",
  numero: "+39 352 296 3510",
  phone_number_id: "123",
  waba_id: "456",
  stato: "active",
  webhook_verified: true,
  quality_rating: null as unknown,
  daily_budget_eur: 10,
  current_day_spend_eur: 0.0042,
};

const metriche = (extra: Record<string, number> = {}) => ({
  active_numbers: 2,
  messages_last_24h: 14,
  tool_calls_last_24h: 3,
  errors_last_24h: 0,
  total_spend_today: 0,
  ...extra,
});

/** `toLocaleString` mette uno spazio non divisibile tra la cifra e «€»: per confrontare i testi lo si porta a uno spazio normale. */
const nbsp = (testo: string | null) => (testo ?? "").replace(/\u00a0/g, " ");

function monta(elemento: React.ReactElement, percorso = "/azienda/whatsapp") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}>{elemento}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  stato.numeri = {};
  stato.metriche = metriche();
  stato.mobile = false;
});

afterEach(() => cleanup());

describe("scheda «Numeri»", () => {
  it("senza nessun numero: i gruppi hanno i riquadri «Collega…» e non ci sono riquadri «linee» che li ripetono", () => {
    monta(<WhatsAppMultiNumeroTab />);
    // Un titolo per gruppo (prima i tre riquadri in alto li ripetevano: due volte ciascuno).
    for (const gruppo of ["WhatsApp Commerciale / Marketing", "WhatsApp Operativo / Cantieri", "WhatsApp Amministrazione / Assistenza"]) {
      expect(screen.getAllByText(gruppo)).toHaveLength(1);
    }
    for (const scopo of ["Marketing e invii di massa", "Contatti da annunci e sito", "Operativo / Cantieri", "Assistenza / Amministrazione"]) {
      expect(screen.getByRole("button", { name: `Collega numero ${scopo}` })).toBeTruthy();
    }
    expect(screen.queryByText(/^Collega /, { selector: "span.truncate" })).toBeNull();
    expect(screen.queryByText("0/2")).toBeNull();
  });

  it("l'etichetta della sezione e il pulsante dicono cosa sono, anche col limite raggiunto", () => {
    monta(<WhatsAppMultiNumeroTab />);
    expect(screen.getByRole("heading", { level: 2, name: "I tuoi numeri" })).toBeTruthy();
    expect(screen.queryByText("Canali aziendali")).toBeNull();
    cleanup();
    stato.numeri = Object.fromEntries(
      ["bot_operativo", "assistenza", "lead", "marketing", "notifiche"].map((p) => [p, [{ ...numeroMarketing, id: p, purpose: p }]]),
    );
    monta(<WhatsAppMultiNumeroTab />);
    expect((screen.getByRole("button", { name: "Collega nuovo numero WhatsApp" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Tutti i tipi di numero sono collegati")).toBeTruthy();
    expect(screen.queryByText(/Limite 5\/5/)).toBeNull();
  });

  it("la scheda di un numero: nome, stato, numero, spesa in euro e UNA frase (niente esempi né riquadri doppi)", () => {
    stato.numeri = { marketing: [numeroMarketing] };
    monta(<WhatsAppMultiNumeroTab />);
    const scheda = screen.getByText("Fotovoltaico per la Tua Casa").closest("div.rounded-lg") as HTMLElement;
    expect(within(scheda).getByText("Attivo")).toBeTruthy();
    expect(within(scheda).getByText("+39 352 296 3510")).toBeTruthy();
    expect(nbsp(scheda.textContent)).toContain("Spesa massima AI al giorno: 10,00 € · speso oggi: 0,0042 €");
    expect(within(scheda).getByText(PURPOSE_AUTONOMY.marketing)).toBeTruthy();
    for (const esempio of PURPOSE_EXAMPLES.marketing) expect(within(scheda).queryByText(esempio)).toBeNull();
    // Il vecchio «€10.00 … €0.0000» all'inglese non c'è più.
    expect(scheda.textContent).not.toMatch(/€\d|\.0000|Budget giornaliero/);
  });

  it("togliere il numero non parla di «soft delete»", async () => {
    stato.numeri = { marketing: [numeroMarketing] };
    monta(<WhatsAppMultiNumeroTab />);
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi numero" }));
    expect(await screen.findByText(/viene disattivato\. Lo storico dei messaggi resta consultabile e lo puoi ricollegare in futuro/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/soft delete/i);
  });
});

describe("riepilogo in una riga", () => {
  it("numeri, messaggi, azioni dell'AI e spesa; gli errori solo se ce ne sono", () => {
    monta(<WhatsAppMultiNumeroTab />);
    const riga = screen.getByRole("region", { name: "Riepilogo WhatsApp" });
    expect(nbsp(riga.textContent)).toBe("2 numeri attivi · 14 messaggi nelle ultime 24 ore · 3 azioni dell'AI · spesa di oggi 0,00 €");
    expect(screen.queryByText(/errori? nelle ultime 24 ore/)).toBeNull();
    cleanup();
    stato.metriche = metriche({ active_numbers: 1, messages_last_24h: 1, tool_calls_last_24h: 1, errors_last_24h: 2, total_spend_today: 0.004 });
    monta(<WhatsAppMultiNumeroTab />);
    const conErrori = screen.getByRole("region", { name: "Riepilogo WhatsApp" });
    expect(nbsp(conErrori.textContent)).toContain("1 numero attivo · 1 messaggio nelle ultime 24 ore · 1 azione dell'AI · spesa di oggi < 0,01 €");
    expect(within(conErrori).getByText("2 errori nelle ultime 24 ore").className).toMatch(/text-red/);
  });
});

describe("le schede dell'hub", () => {
  it("«Modelli» e «Invii di massa» al posto di «Template» e «Broadcast»", () => {
    monta(<WhatsAppHubPage />);
    const schede = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(schede).toEqual(["Numeri", "Regia", "Automazioni", "Modelli", "Invii di massa", "Notifiche"]);
    expect(screen.queryByRole("tab", { name: /Template|Broadcast/ })).toBeNull();
    // Niente «Tab …» davanti al nome della scheda per il lettore di schermo.
    expect(screen.getByRole("tab", { name: "Modelli" })).toBeTruthy();
  });

  it("gli indirizzi di prima funzionano ancora: ?tab=template apre «Modelli», ?tab=broadcast «Invii di massa»", () => {
    monta(<WhatsAppHubPage />, "/azienda/whatsapp?tab=template");
    expect(screen.getByRole("tab", { name: "Modelli" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("pagina modelli")).toBeTruthy();
    cleanup();
    monta(<WhatsAppHubPage />, "/azienda/whatsapp?tab=broadcast");
    expect(screen.getByRole("tab", { name: "Invii di massa" }).getAttribute("aria-selected")).toBe("true");
  });
});
