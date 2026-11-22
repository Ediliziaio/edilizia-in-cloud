import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import { BrowserRouter, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "../../src/index.css";
import { dati } from "./browser-fixture.mjs";

const query = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
Object.assign(window, {
  mappaFixture: dati,
  spostaDemo: () => {
    dati.appointments = dati.appointments.map(a => a.id === "1" ? { ...a, appointment_time: "13:00" } : a);
    void query.invalidateQueries({ queryKey: ["marketing-appointments"] });
  },
});
const Vendite = lazy(() => import("../../src/pages/azienda/marketing/MarketingCalendar"));
const Lavori = lazy(() => import("../../src/pages/azienda/Calendar"));
const Campo = lazy(() => import("../../src/pages/campo/CampoCalendario"));
const Vista = location.pathname.includes("marketing") ? Vendite : location.pathname.startsWith("/campo") ? Campo : Lavori;
createRoot(document.getElementById("root")!).render(
  <BrowserRouter><QueryClientProvider client={query}>
    <main className="mx-auto max-w-[1500px] p-3">
      <Link to="/azienda/marketing/calendario" className="sr-only">Calendario appuntamenti</Link>
      <Suspense fallback={<p>Caricamento calendario…</p>}><Vista /></Suspense>
    </main>
    <Toaster />
  </QueryClientProvider></BrowserRouter>,
);
