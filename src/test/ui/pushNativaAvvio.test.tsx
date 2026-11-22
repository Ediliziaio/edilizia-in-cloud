import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { useMobileInit } from "@/hooks/useMobileInit";

const utente = "a1000000-0000-4000-8000-000000000001";
const cantiere = "a1000000-0000-4000-8000-000000000002";
const stato = vi.hoisted(() => ({
  inAttesa: true,
  campo: false,
  area: "/azienda/attivita",
  riceviTocco: undefined as ((data: Record<string, unknown>) => void) | undefined,
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: stato.inAttesa ? null : { id: utente }, isLoading: stato.inAttesa }),
}));
vi.mock("@/hooks/useIsCampo", () => ({ useIsCampo: () => ({ isCampo: stato.campo, isTecnico: !stato.campo }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => stato.queryClient }));
vi.mock("@/lib/mobile/platform", () => ({ isNative: true, isAndroid: false }));
vi.mock("@/lib/mobile/native-network", () => ({
  initNetworkMonitor: async () => {},
  isOnline: () => true,
  onNetworkChange: () => () => {},
}));
vi.mock("@/lib/mobile/native-push", () => ({
  aggiornaPushNativa: async () => {},
  ascoltaPushNative: (riceviTocco: typeof stato.riceviTocco) => {
    stato.riceviTocco = riceviTocco;
    return () => { stato.riceviTocco = undefined; };
  },
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: async () => ({ remove: async () => {} }) } }));
vi.mock("@capacitor/status-bar", () => ({
  Style: { Dark: "DARK" },
  StatusBar: { setStyle: async () => {}, setBackgroundColor: async () => {} },
}));
vi.mock("@capacitor/keyboard", () => ({ Keyboard: { setAccessoryBarVisible: async () => {}, setScroll: async () => {} } }));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: { hide: async () => {} } }));

function Bootstrap(): null {
  useMobileInit();
  return null;
}

function PercorsoCorrente() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="percorso">{pathname + search + hash}</output>;
}

function Avvio() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <Bootstrap />
      <Routes>
        <Route path="/login" element={stato.inAttesa ? <PercorsoCorrente /> : <Navigate to={stato.area} replace />} />
        <Route path="*" element={<PercorsoCorrente />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  stato.inAttesa = true;
  stato.campo = false;
});

it.each([
  { campo: true, area: "/campo", link: `/azienda/ordini/${cantiere}`, atteso: `/campo/lavoro/${cantiere}` },
  { campo: false, area: "/campo", link: `/azienda/ordini/${cantiere}`, atteso: `/campo/cantieri/${cantiere}` },
  { campo: false, area: "/azienda/attivita", link: "/azienda/scadenzario?tab=uscite#rate", atteso: "/azienda/scadenzario?tab=uscite#rate" },
])("apre $atteso se si tocca la push prima del ripristino della sessione", async ({ campo, area, link, atteso }) => {
  stato.campo = campo;
  stato.area = area;
  const { rerender } = render(<Avvio />);
  act(() => stato.riceviTocco?.({ user_id: utente, url: link }));
  expect(screen.getByTestId("percorso")).toHaveTextContent("/login");
  stato.inAttesa = false;
  rerender(<Avvio />);
  expect(await screen.findByText(atteso, { exact: true })).toBeVisible();
});
