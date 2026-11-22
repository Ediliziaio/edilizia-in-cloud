import { createRoot } from "react-dom/client";
import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Link, Route as RouterRoute, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "../../src/index.css";
import { ARRIVI_VUOTI } from "../../src/lib/campo/arrivoRapportino";
import { dati, flotta, schedaCantiereDemo } from "./browser-fixture.mjs";

const TrasportoRapportino = lazy(() => import("../../src/components/orders/ArrivoRapportino").then(m => ({ default: m.ArrivoRapportino })));
function RapportinoDemo() {
  const [trasporti, setTrasporti] = useState(ARRIVI_VUOTI);
  const mezzi = flotta.filter(m => m.contatore_unita === "km")
    .map((m, i) => ({ ...m, id: `16000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` }));
  return <section className="max-w-3xl space-y-2">
    <h1 className="text-xl font-semibold">Rapportino giornaliero demo</h1>
    <TrasportoRapportino valore={trasporti} onChange={setTrasporti} mezzi={mezzi} suggeriti={mezzi.map(m => m.id)} />
  </section>;
}

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
const ParcoMezzi = lazy(() => import("../../src/pages/azienda/MezziList"));
const SchedaMezzo = lazy(() => import("../../src/pages/azienda/MezzoDetail"));
const EconomiaMezzi = lazy(() => import("../../src/components/mezzi/CostiMezziRiepilogo").then(m => ({ default: m.CostiMezziRiepilogo })));
const RitiriMezzi = lazy(() => import("../../src/components/mezzi/GiroMaterialiCommessa").then(m => ({ default: m.GiroMaterialiCommessa })));
const RegistroCommessa = lazy(() => import("../../src/components/mezzi/ViaggiMezzoWorkspace").then(m => ({ default: m.ViaggiCommessa })));
function CalendariDemo() {
  const { pathname, search } = useLocation();
  if (search.includes("scenario=rapportino-trasporti")) return <RapportinoDemo />;
  if (pathname === "/azienda/mezzi" || pathname === "/azienda/manodopera") return <ParcoMezzi />;
  if (/^\/azienda\/mezzi\/flotta-/.test(pathname)) return <SchedaMezzo />;
  const id = pathname.match(/^\/azienda\/ordini\/(cm-[a-z])$/)?.[1];
  if (id) {
    const cantiere = schedaCantiereDemo(id);
    if (["cm-a", "cm-b"].includes(id) && cantiere && !search.includes("mappa=storico") && dati.carburanteDemo) {
      return <div className="space-y-3">
        <h1 className="text-xl font-bold">{cantiere.description}</h1>
        <EconomiaMezzi orderId={id} />
        <RitiriMezzi company={cantiere.company_id} ordine={id} mezzi={flotta} modifica />
        <RegistroCommessa orderId={id} mezzi={flotta} readOnly={false} vedeCosti integrato />
        <Link className="text-sm text-primary underline" to={id === "cm-a" ? "/azienda/ordini/cm-b" : "/azienda/ordini/cm-a"}>Apri altro cantiere demo</Link>
      </div>;
    }
    return <section className="space-y-3 rounded-lg border bg-background p-5">
      <Link className="text-sm text-primary underline" to="/azienda/calendario?mappa=storico">Torna ai cantieri conclusi</Link>
      {cantiere ? <>
        <p className="text-sm text-muted-foreground">Commessa demo · {cantiere.order_code}</p>
        <h1 className="text-xl font-semibold">{cantiere.description}</h1>
        <p className="text-sm">{cantiere.indirizzo_lavori}</p>
      </> : <p>Commessa demo non disponibile.</p>}
    </section>;
  }
  const Vista = pathname.includes("marketing") ? Vendite : pathname.startsWith("/campo") ? Campo : Lavori;
  return <Vista />;
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter><QueryClientProvider client={query}>
    <main className="mx-auto max-w-[1500px] p-3">
      {import.meta.env.VITE_MAPPA_DEMO_REALE && <p className="mb-3 text-xs text-muted-foreground">Demo Milano · agenda di prova, mappa e percorsi stradali reali</p>}
      <Link to="/azienda/marketing/calendario" className={dati.carburanteDemo ? "mb-3 mr-3 inline-block text-sm text-primary underline" : "sr-only"}>Calendario appuntamenti</Link>
      {dati.carburanteDemo && <Link className="mb-3 inline-block text-sm text-primary underline" to="/azienda/ordini/cm-b">Apri commessa demo</Link>}
      <Suspense fallback={<p>Caricamento…</p>}><Routes><RouterRoute path="/azienda/mezzi/:id" element={<CalendariDemo />} /><RouterRoute path="*" element={<CalendariDemo />} /></Routes></Suspense>
    </main>
    <Toaster />
  </QueryClientProvider></BrowserRouter>,
);
