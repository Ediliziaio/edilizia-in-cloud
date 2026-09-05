/**
 * PlatformMockup — la piattaforma vera, riprodotta nel hero della home.
 *
 * Prima qui c'era un «centro di comando» disegnato a mano: tema scuro,
 * «Silvio ha trovato 3 priorità», numeri inventati. L'app è un'altra cosa —
 * chiara, con la barra laterale, e all'ingresso mostra la pagina Attività.
 * Chi si iscriveva trovava un prodotto diverso da quello promesso.
 *
 * Questa è una ricostruzione fedele di /azienda/attivita fatta con la stessa
 * struttura e gli stessi colori del gestionale (CompanyLayout + AttivitaStaff):
 * barra laterale con le macro-aree reali di sidebarConfig, header con
 * breadcrumb, saluto, tab Dashboard/Regia, lista attività con priorità e
 * stato, timbratura sede, commesse con margine. Dati finti ma verosimili.
 *
 * È markup puro, senza stato né dipendenze dall'app: non porta nel sito la
 * logica (auth, query) e non cambia fra prerender e client, quindi
 * l'hydration lo trova identico. È decorativo: aria-hidden, con un'etichetta
 * sul contenitore per chi usa lo screen reader.
 */
import {
  ClipboardCheck, Mail, TrendingUp, MessagesSquare, Sparkles, HardHat, Package,
  Users, Receipt, Landmark, Wallet, Megaphone, Bot, Search, Bell, ChevronRight,
  Clock, PanelLeft, Camera, ClipboardList, AlertCircle, CalendarDays, MapPin,
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
    { label: "Attività", Icon: ClipboardCheck, attiva: true },
    { label: "Email", Icon: Mail },
    { label: "Come stiamo andando", Icon: TrendingUp },
    { label: "Chat Team", Icon: MessagesSquare },
    { label: "Silvio AI", Icon: Sparkles },
  ] },
  { area: "Cantieri & Lavori", voci: [
    { label: "Commesse", Icon: HardHat },
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

const ATTIVITA = [
  { titolo: "Inviare SAL 2 — Villa Rossi", commessa: "VR-2026-014", priorita: "Urgente", stato: "Da fare", quando: "oggi" },
  { titolo: "DURC subappaltatore Elettra in scadenza", commessa: "CM-2026-031", priorita: "Alta", stato: "Da fare", quando: "12 set" },
  { titolo: "Approvare rapportino di ieri — squadra Nord", commessa: "VR-2026-014", priorita: "Normale", stato: "In corso", quando: "oggi" },
  { titolo: "Preventivo ristrutturazione bagno — Bianchi", commessa: "PR-2026-088", priorita: "Alta", stato: "In corso", quando: "8 set" },
  { titolo: "Ordine blocchi per il cantiere di via Manzoni", commessa: "CM-2026-031", priorita: "Normale", stato: "Da fare", quando: "9 set" },
];

const COMMESSE = [
  { nome: "Villa Rossi — ristrutturazione", avanzamento: 68, margine: 24 },
  { nome: "Capannone via Manzoni", avanzamento: 35, margine: 19 },
  { nome: "Condominio Verdi — cappotto", avanzamento: 92, margine: 27 },
];

const PRIORITA: Record<string, string> = {
  Urgente: "bg-red-50 text-red-700 border-red-200",
  Alta: "bg-orange-50 text-orange-700 border-orange-200",
  Normale: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function PlatformMockup() {
  return (
    <div className="gsap-dashboard relative mx-auto mb-8 mt-10 max-w-5xl">
      {/* Alone dietro alla finestra, come prima */}
      <div className="pointer-events-none absolute -inset-8 rounded-full bg-[#F97415]/15 blur-[80px] animate-pulse-glow" />

      <div
        role="img"
        aria-label="La dashboard di Edilizia in Cloud: pagina Attività con le priorità del giorno, la timbratura in sede e le commesse in corso con il margine"
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
                <span>Cruscotto</span>
                <ChevronRight size={10} />
                <span className="font-medium" style={{ color: INCHIOSTRO }}>Attività</span>
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
              {/* Saluto + tab (AttivitaStaff) */}
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[9.5px] capitalize" style={{ color: GRIGIO }}>venerdì 5 settembre</p>
                  <p className="text-[15px] font-bold leading-tight">Buongiorno, Marco</p>
                </div>
                <div className="grid grid-cols-2 rounded-md p-[3px] text-[10px]" style={{ background: "#E9EDF3" }}>
                  <span className="flex items-center gap-1 rounded-sm bg-white px-3 py-1 font-medium shadow-sm"><ClipboardCheck size={11} /> Dashboard</span>
                  <span className="flex items-center gap-1 px-3 py-1" style={{ color: GRIGIO }}><Users size={11} /> Regia</span>
                </div>
              </div>

              {/* KPI */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { l: "Commesse attive", v: "12" },
                  { l: "Scadenze 7 giorni", v: "5" },
                  { l: "Da fare oggi", v: "8" },
                  { l: "Margine medio", v: "23%" },
                ].map((k) => (
                  <div key={k.l} className="rounded-lg border bg-white px-2.5 py-2" style={{ borderColor: BORDO }}>
                    <p className="text-[9px]" style={{ color: GRIGIO }}>{k.l}</p>
                    <p className="text-[15px] font-bold tabular-nums">{k.v}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[1.6fr_1fr]">
                {/* Card Attività */}
                <div className="rounded-lg border bg-white" style={{ borderColor: BORDO }}>
                  <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: BORDO }}>
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold"><ClipboardCheck size={12} /> Attività</p>
                    <span className="rounded-full px-2 py-[2px] text-[9px] font-medium" style={{ background: BLU_CHIARO, color: BLU }}>5 aperte</span>
                  </div>
                  <ul>
                    {ATTIVITA.map((a) => (
                      <li key={a.titolo} className="flex items-center gap-2 border-b px-3 py-[6px] last:border-b-0" style={{ borderColor: BORDO }}>
                        <span className="h-3 w-3 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: a.stato === "In corso" ? BLU : "#B8C1CE" }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[10.5px] font-medium">{a.titolo}</p>
                          <p className="text-[9px]" style={{ color: GRIGIO }}>{a.commessa} · {a.stato} · {a.quando}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-1.5 py-[1px] text-[8.5px] font-semibold ${PRIORITA[a.priorita]}`}>{a.priorita}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Colonna destra: Timbratura + Commesse */}
                <div className="space-y-2.5">
                  <div className="rounded-lg border bg-white p-3" style={{ borderColor: BORDO }}>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold"><Clock size={12} /> Timbratura Sede</p>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>Entrata <b>07:58</b></span>
                      <span className="flex items-center gap-0.5" style={{ color: GRIGIO }}><MapPin size={9} /> Sede Bergamo</span>
                    </div>
                    <span className="mt-2 inline-block rounded-md px-2.5 py-1 text-[9.5px] font-semibold text-white" style={{ background: BLU }}>Timbra uscita</span>
                  </div>

                  <div className="rounded-lg border bg-white p-3" style={{ borderColor: BORDO }}>
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold"><HardHat size={12} /> Commesse in corso</p>
                    <div className="space-y-2">
                      {COMMESSE.map((c) => (
                        <div key={c.nome}>
                          <div className="flex items-center justify-between gap-2 text-[9.5px]">
                            <span className="truncate font-medium">{c.nome}</span>
                            <span className="shrink-0 tabular-nums" style={{ color: c.margine >= 22 ? "#0F7A4D" : "#B7791F" }}>margine {c.margine}%</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full rounded-full" style={{ background: "#E9EDF3" }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${c.avanzamento}%`, background: BLU }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Telefono: la home dell'area cantiere (CampoHome), stessa app ── */}
      <div
        aria-hidden="true"
        className="absolute -bottom-10 -right-14 hidden w-[156px] rotate-[5deg] overflow-hidden rounded-[22px] border-[5px] border-[#1F2A3D] bg-white shadow-2xl shadow-black/50 lg:block"
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
