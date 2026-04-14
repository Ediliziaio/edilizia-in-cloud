import { lazy } from "react";
import { Route } from "react-router-dom";

const PortaleDashboard = lazy(() => import("@/pages/portale/PortaleDashboard"));
const NuovaRichiesta = lazy(() => import("@/pages/portale/NuovaRichiesta"));
const RichiesteCliente = lazy(() => import("@/pages/portale/RichiesteCliente"));
const PortaleAccessoScaduto = lazy(() => import("@/pages/portale/PortaleAccessoScaduto"));

export function portaleClienteRoutes() {
  return (
    <>
      <Route path="/portale/accesso-scaduto" element={<PortaleAccessoScaduto />} />
      <Route path="/portale/:token" element={<PortaleDashboard />} />
      <Route path="/portale/:token/richieste" element={<RichiesteCliente />} />
      <Route path="/portale/:token/nuova-richiesta" element={<NuovaRichiesta />} />
    </>
  );
}
