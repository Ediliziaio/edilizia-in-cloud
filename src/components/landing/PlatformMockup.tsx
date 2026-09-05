/**
 * PlatformMockup — la piattaforma vera, riprodotta nel hero della home.
 *
 * Prima qui c'era un «centro di comando» disegnato a mano: tema scuro,
 * «Silvio ha trovato 3 priorità», numeri inventati. L'app è un'altra cosa —
 * chiara, con la barra laterale — e la pagina che vende è quella delle
 * Commesse: ogni cantiere con il suo stato, quanto è stato venduto e
 * incassato, e il margine. È quella che si mostra qui.
 *
 * Ricostruzione fedele di /azienda/commesse con struttura e colori del
 * gestionale (CompanyLayout + OrdersList + OrdersTable): barra laterale con
 * le macro-aree reali di sidebarConfig e la voce attiva, header con
 * breadcrumb, titolo con fascia Venduto/Incassato/Da incassare, ricerca e
 * filtri (compreso «Margine basso», che nell'app esiste davvero), tabella
 * con badge di stato colorati come gli stati ordine di default. Dati finti
 * ma verosimili, tenant «Demo Azienda 2».
 *
 * Animazione: solo CSS (src/index.css, .eic-mock-fill / .eic-mock-pulse):
 * le barre del margine si riempiono all'ingresso e la commessa in corso ha
 * un puntino che pulsa. Niente slideshow fra schermate — distrae e rende
 * instabile l'LCP. Con prefers-reduced-motion l'animazione è spenta.
 *
 * Markup puro, senza stato né dipendenze dall'app: identico fra prerender e
 * client. Decorativo: aria-hidden, con un'etichetta sul contenitore.
 */
import {
  ClipboardCheck, Mail, TrendingUp, MessagesSquare, Sparkles, HardHat, Package,
  Users, Receipt, Landmark, Wallet, Megaphone, Bot, Search, Bell, ChevronRight,
  PanelLeft, Camera, ClipboardList, AlertCircle, CalendarDays, Plus, SlidersHorizontal,
} from "lucide-react";
import logo from "@/assets/edilizia-in-cloud-logo-small.webp";

/* Palette del gestionale (src/index.css): primario blu, sfondi chiari. */
const BLU = "#1A73E8";
const BLU_CHIARO = "#EEF3FB";
const INCHIOSTRO = "#1F2A3D";
const GRIGIO = "#5B6778";
const BORDO = "#E4E8EF";
const FONDO = "#F5F7FA";

const MENU: Array<{ area: string; voci: Array<{ label: string; Icon: typeof Mail; attiva?: boolean }> }> = [
  { area: "Cruscotto", voci: [
    { label: "Attività", Icon: ClipboardCheck },
    { label: "Email", Icon: Mail },
    { label: "Come stiamo andando", Icon: TrendingUp },
    { label: "Chat Team", Icon: MessagesSquare },
    { label: "Silvio AI", Icon: Sparkles },
  ] },
  { area: "Cantieri & Lavori", voci: [
    { label: "Commesse", Icon: HardHat, attiva: true },
    { label: "Magazzino", Icon: Package },
    { label: "Clienti", Icon: Users },
    { label: "Calendario", Icon: CalendarDays },
  ] },
  { area: "Finanza", voci: [
    { label: "Fatture", Icon: Receipt },
    { label: "Scadenzario", Icon: Landmark },
    { label: "Tesoreria", Icon: Wallet },
  ] },
  { area: "Marketing & Vendita", voci: [
    { label: "Contatti CRM", Icon: Megaphone },
    { label: "Agenti AI", Icon: Bot },
  ] },
];

/* Colori degli stati ordine di default dell'app (Posa #DB2777, Completato #16A34A…). */
const COMMESSE = [
  { codice: "VR-2026-014", cliente: "Rossi Marco", descrizione: "Ristrutturazione villa — Bergamo", stato: "Posa", colore: "#DB2777", imponibile: "86.500", incassato: "52.000", margine: 24, inCorso: true },
  { codice: "CM-2026-031", cliente: "Manzoni Costruzioni", descrizione: "Capannone via Manzoni", stato: "In lavorazione", colore: "#2563EB", imponibile: "148.000", incassato: "74.000", margine: 19 },
  { codice: "CV-2026-022", cliente: "Condominio Verdi", descrizione: "Cappotto termico 6 piani", stato: "Completato", colore: "#16A34A", imponibile: "63.200", incassato: "63.200", margine: 27 },
  { codice: "PR-2026-088", cliente: "Bianchi Laura", descrizione: "Bagno e impianti — Seriate", stato: "Confermato", colore: "#D97706", imponibile: "18.900", incassato: "5.600", margine: 31 },
  { codice: "SR-2026-041", cliente: "Serramenti Nord", descrizione: "Sostituzione 14 infissi", stato: "Preventivo", colore: "#64748B", imponibile: "24.300", incassato: "—", margine: 22 },
  { codice: "MZ-2026-009", cliente: "Mazzoleni S.r.l.", descrizione: "Rifacimento tetto — Alzano", stato: "In lavorazione", colore: "#2563EB", imponibile: "41.700", incassato: "20.000", margine: 25 },
  { codice: "TR-2026-017", cliente: "Trevi Immobiliare", descrizione: "Facciata condominio — 5 piani", stato: "Posa", colore: "#DB2777", imponibile: "97.300", incassato: "48.600", margine: 21 },
  { codice: "BG-2026-052", cliente: "Famiglia Carrara", descrizione: "Bagno e cucina — Nembro", stato: "Confermato", colore: "#D97706", imponibile: "22.400", incassato: "6.700", margine: 28 },
];

export default function PlatformMockup() {
  return (
    <div className="gsap-dashboard relative mx-auto mb-8 mt-10 max-w-5xl">
      {/* Alone dietro alla finestra, come prima */}
      <div className="pointer-events-none absolute -inset-8 rounded-full bg-[#F97415]/15 blur-[80px] animate-pulse-glow" />

      <div
        role="img"
        aria-label="La pagina Commesse di Edilizia in Cloud: ogni cantiere con stato, venduto, incassato e margine"
        className="relative overflow-hidden rounded-2xl border border-white/20 shadow-2xl shadow-black/40"
        style={{ transform: "perspective(1200px) rotateX(4deg)" }}
      >
        <div aria-hidden="true" className="flex text-left" style={{ background: FONDO, color: INCHIOSTRO, fontSize: 11, lineHeight: 1.3 }}>

          {/* ── Barra laterale (CompanyLayout: bianca, border-r, aree + voci) ── */}
          <aside className="hidden w-[190px] shrink-0 flex-col border-r bg-white md:flex" style={{ borderColor: BORDO }}>
            <div className="flex items-center gap-2 border-b px-3 py-3" style={{ borderColor: BORDO, background: "rgba(238,243,251,.45)" }}>
              <img src={logo} alt="" width={28} height={28} className="h-7 w-7 rounded-md object-contain" loading="lazy" decoding="async" />
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold">Demo Azienda 2 S.r.l.</p>
                <p className="truncate text-[9px]" style={{ color: GRIGIO }}>Gestionale · Piano Impresa</p>
              </div>
            </div>
            <div className="flex-1 space-y-2 px-2 py-2">
              {MENU.map((g) => (
                <div key={g.area}>
                  <p className="px-2 pb-1 pt-1 text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: GRIGIO }}>{g.area}</p>
                  {g.voci.map((v) => (
                    <div
                      key={v.label}
                      className="flex items-center gap-2 rounded-md px-2 py-[5px] text-[10.5px]"
                      style={v.attiva ? { background: BLU_CHIARO, color: BLU, fontWeight: 600 } : { color: INCHIOSTRO }}
                    >
                      <v.Icon size={12} strokeWidth={2} />
                      <span className="truncate">{v.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          {/* ── Colonna principale ── */}
          <div className="min-w-0 flex-1">
            {/* Header (h-14, border-b): trigger, breadcrumb, cerca, notifiche, avatar */}
            <div className="flex h-10 items-center gap-2 border-b bg-white px-3" style={{ borderColor: BORDO }}>
              <PanelLeft size={13} style={{ color: GRIGIO }} />
              <div className="flex items-center gap-1 text-[10px]" style={{ color: GRIGIO }}>
                <span>Cantieri &amp; Lavori</span>
                <ChevronRight size={10} />
                <span className="font-medium" style={{ color: INCHIOSTRO }}>Commesse</span>
              </div>
              <div className="flex-1" />
              <Search size={13} style={{ color: GRIGIO }} />
              <span className="relative">
                <Bell size={13} style={{ color: GRIGIO }} />
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: BLU }}>MR</span>
            </div>

            <div className="space-y-2.5 p-3">
              {/* Titolo + fascia riepilogo (OrdersList: commesse · Venduto · Incassato · Da incassare) */}
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[15px] font-bold leading-tight">Commesse</p>
                  <p className="flex flex-wrap items-center gap-x-3 text-[9.5px]" style={{ color: GRIGIO }}>
                    <span><b style={{ color: INCHIOSTRO }}>12</b> commesse</span>
                    <span>Venduto <b className="tabular-nums" style={{ color: INCHIOSTRO }}>€ 412.800</b></span>
                    <span>Incassato <b className="tabular-nums text-emerald-700">€ 268.400</b></span>
                    <span>Da incassare <b className="tabular-nums text-amber-700">€ 144.400</b></span>
                  </p>
                </div>
                <span className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold text-white" style={{ background: BLU }}>
                  <Plus size={11} /> Nuova commessa
                </span>
              </div>

              {/* Ricerca + filtri */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex min-w-[150px] flex-1 items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-[9.5px]" style={{ borderColor: BORDO, color: GRIGIO }}>
                  <Search size={10} /> Cerca commessa, cliente…
                </span>
                {["Tutte", "In corso", "Margine basso"].map((f, i) => (
                  <span
                    key={f}
                    className="rounded-full border px-2 py-[3px] text-[9px] font-medium"
                    style={i === 0 ? { background: BLU, borderColor: BLU, color: "#fff" } : { borderColor: BORDO, background: "#fff", color: INCHIOSTRO }}
                  >
                    {f}
                  </span>
                ))}
                <span className="flex items-center gap-1 rounded-md border bg-white px-2 py-[3px] text-[9px]" style={{ borderColor: BORDO, color: GRIGIO }}>
                  <SlidersHorizontal size={10} /> Colonne
                </span>
              </div>

              {/* Tabella (OrdersTable): Codice · Cliente · Descrizione · Stato · Imponibile · Incassato · Margine */}
              <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: BORDO }}>
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="text-left text-[8.5px] uppercase tracking-wide" style={{ color: GRIGIO, background: "#FAFBFC" }}>
                      <th className="px-2.5 py-1.5 font-semibold">Codice</th>
                      <th className="px-2 py-1.5 font-semibold">Cliente</th>
                      <th className="hidden px-2 py-1.5 font-semibold md:table-cell">Descrizione</th>
                      <th className="px-2 py-1.5 font-semibold">Stato</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Imponibile</th>
                      <th className="hidden px-2 py-1.5 text-right font-semibold md:table-cell">Incassato</th>
                      <th className="px-2.5 py-1.5 font-semibold">Margine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMMESSE.map((c, i) => {
                      const basso = c.margine < 20;
                      return (
                        <tr key={c.codice} className="border-t" style={{ borderColor: BORDO, background: basso ? "#FFFBEB" : undefined }}>
                          <td className="px-2.5 py-[7px] font-mono text-[9.5px] font-semibold" style={{ color: BLU }}>{c.codice}</td>
                          <td className="px-2 py-[7px] font-medium">{c.cliente}</td>
                          <td className="hidden max-w-[150px] truncate px-2 py-[7px] md:table-cell" style={{ color: GRIGIO }}>{c.descrizione}</td>
                          <td className="px-2 py-[7px]">
                            <span
                              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[8.5px] font-semibold"
                              style={{ borderColor: c.colore, color: c.colore }}
                            >
                              {c.inCorso && <span className="eic-mock-pulse h-1.5 w-1.5 rounded-full" style={{ background: c.colore }} />}
                              {c.stato}
                            </span>
                          </td>
                          <td className="px-2 py-[7px] text-right tabular-nums">€ {c.imponibile}</td>
                          <td className="hidden px-2 py-[7px] text-right tabular-nums md:table-cell" style={{ color: c.incassato === "—" ? GRIGIO : undefined }}>{c.incassato === "—" ? "—" : `€ ${c.incassato}`}</td>
                          <td className="px-2.5 py-[7px]">
                            <div className="flex items-center gap-1.5">
                              <span className="w-7 text-right font-semibold tabular-nums" style={{ color: basso ? "#B45309" : "#0F7A4D" }}>{c.margine}%</span>
                              <span className="h-1.5 w-12 overflow-hidden rounded-full" style={{ background: "#E9EDF3" }}>
                                <span
                                  className="eic-mock-fill block h-full rounded-full"
                                  style={{ width: `${Math.min(100, c.margine * 3)}%`, background: basso ? "#F59E0B" : "#16A34A", animationDelay: `${0.35 + i * 0.12}s` }}
                                />
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t px-2.5 py-1.5 text-[9px]" style={{ borderColor: BORDO, color: GRIGIO }}>
                  <span>1–8 di 12 commesse</span>
                  <span className="flex items-center gap-1"><AlertCircle size={10} className="text-amber-600" /> 1 commessa sotto il margine minimo (20%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Telefono: la home dell'area cantiere (CampoHome), stessa app ── */}
      <div
        aria-hidden="true"
        className="absolute -bottom-14 -right-16 hidden w-[156px] rotate-[6deg] overflow-hidden rounded-[22px] border-[5px] border-[#1F2A3D] bg-white shadow-2xl shadow-black/50 lg:block"
        style={{ fontSize: 9.5, color: INCHIOSTRO }}
      >
        <div className="px-3 pb-3 pt-4" style={{ background: FONDO }}>
          <p className="text-[8.5px]" style={{ color: GRIGIO }}>Villa Rossi · oggi</p>
          <p className="text-[12px] font-bold leading-tight">Ciao, Luca</p>
          <div className="mt-2 rounded-lg border bg-white p-2" style={{ borderColor: BORDO }}>
            <p className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: BLU }}>Task consigliata</p>
            <p className="mt-0.5 text-[9.5px] font-medium leading-snug">Rapportino di oggi con le foto del massetto</p>
            <span className="mt-1.5 inline-block rounded-md px-2 py-[3px] text-[8.5px] font-semibold text-white" style={{ background: BLU }}>Compila · 2 min</span>
          </div>
          <p className="mb-1 mt-2 text-[8px] font-semibold uppercase tracking-wide" style={{ color: GRIGIO }}>Azioni rapide</p>
          <div className="grid grid-cols-3 gap-1">
            {[
              { l: "Foto", Icon: Camera },
              { l: "Rapportino", Icon: ClipboardList },
              { l: "Ticket", Icon: AlertCircle },
            ].map((q) => (
              <div key={q.l} className="flex flex-col items-center gap-1 rounded-lg border bg-white py-1.5 text-[8px] font-medium" style={{ borderColor: BORDO }}>
                <q.Icon size={12} style={{ color: BLU }} />
                {q.l}
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {["#C9D6E8", "#B7C7DD", "#D6DFEC"].map((c) => (
              <div key={c} className="aspect-square rounded-md" style={{ background: `linear-gradient(135deg, ${c}, #EEF3FB)` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
