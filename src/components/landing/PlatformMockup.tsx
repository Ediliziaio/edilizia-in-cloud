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
 * con badge di stato colorati come gli stati ordine di default. Sotto, due
 * grafici come nella dashboard: venduto e incassato per mese, cassa prevista
 * a 90 giorni. Clienti quasi tutti privati: è il lavoro tipico dell'impresa
 * da 3 a 15 persone a cui il sito parla. Dati finti ma verosimili.
 *
 * Grafici: SVG statico, una scala per grafico, griglia recessiva, due serie
 * con legenda e colori fissi (blu = venduto, verde = incassato: coppia
 * validata, ΔE 28 in deuteranopia). Sono parte di un'immagine decorativa,
 * non un grafico interattivo: niente tooltip.
 *
 * Animazione: solo CSS (src/index.css, .eic-mock-fill / -fill-y / -pulse):
 * barre del margine e delle vendite si riempiono all'ingresso, la commessa in
 * posa ha un puntino che pulsa. Niente slideshow. Con prefers-reduced-motion
 * è tutto fermo. Markup puro, senza stato: identico fra prerender e client.
 */
import {
  ClipboardCheck, Mail, TrendingUp, MessagesSquare, Sparkles, HardHat, Package,
  Users, Receipt, Landmark, Wallet, Megaphone, Bot, Search, Bell, ChevronRight,
  PanelLeft, AlertCircle, CalendarDays, Plus, SlidersHorizontal,
} from "lucide-react";
import logo from "@/assets/edilizia-in-cloud-logo-small.webp";

/* Palette del gestionale (src/index.css): primario blu, sfondi chiari. */
const BLU = "#1A73E8";
const VERDE = "#16A34A";
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
  { codice: "CP-2026-027", cliente: "Ferrari Giulia", descrizione: "Cappotto villetta — Curno", stato: "In lavorazione", colore: "#2563EB", imponibile: "38.600", incassato: "19.300", margine: 19 },
  { codice: "MZ-2026-009", cliente: "Famiglia Mazzoleni", descrizione: "Rifacimento tetto — Alzano", stato: "In lavorazione", colore: "#2563EB", imponibile: "41.700", incassato: "20.000", margine: 25 },
  { codice: "PR-2026-088", cliente: "Bianchi Laura", descrizione: "Bagno e impianti — Seriate", stato: "Confermato", colore: "#D97706", imponibile: "18.900", incassato: "5.600", margine: 31 },
  { codice: "BG-2026-052", cliente: "Famiglia Carrara", descrizione: "Bagno e cucina — Nembro", stato: "Completato", colore: "#16A34A", imponibile: "22.400", incassato: "22.400", margine: 28 },
  { codice: "SR-2026-041", cliente: "Colombo Andrea", descrizione: "Sostituzione 14 infissi", stato: "Preventivo", colore: "#64748B", imponibile: "24.300", incassato: "—", margine: 22 },
];

/* Venduto e incassato per mese, in migliaia di euro. Una scala sola: 0–100k. */
const MESI = [
  { m: "Apr", venduto: 58, incassato: 41 },
  { m: "Mag", venduto: 74, incassato: 60 },
  { m: "Giu", venduto: 66, incassato: 55 },
  { m: "Lug", venduto: 81, incassato: 63 },
  { m: "Ago", venduto: 52, incassato: 49 },
  { m: "Set", venduto: 90, incassato: 68 },
];

/* Cassa prevista: oggi, 30, 60, 90 giorni (migliaia di euro). */
const CASSA = [38.2, 52.9, 47.5, 61.2];

/* Geometria dei grafici: viewBox 300×112, area di disegno x 34..294, y 8..90. */
const X0 = 34, X1 = 294, Y0 = 8, Y1 = 90;
const yScala = (v: number, max: number) => Y1 - ((Y1 - Y0) * v) / max;

export default function PlatformMockup() {
  const larghezzaGruppo = (X1 - X0) / MESI.length;
  const larghezzaBarra = 11;
  const passoCassa = (X1 - X0) / (CASSA.length - 1);
  const puntiCassa = CASSA.map((v, i) => `${X0 + i * passoCassa},${yScala(v, 80)}`);

  return (
    <div className="gsap-dashboard relative mx-auto mb-8 mt-10 max-w-5xl">
      {/* Alone dietro alla finestra, come prima */}
      <div className="pointer-events-none absolute -inset-8 rounded-full bg-[#F97415]/15 blur-[80px] animate-pulse-glow" />

      <div
        role="img"
        aria-label="La pagina Commesse di Edilizia in Cloud: ogni cantiere con stato, venduto, incassato e margine, e sotto i grafici di venduto, incassato e cassa prevista"
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
                          <td className="px-2.5 py-[6px] font-mono text-[9.5px] font-semibold" style={{ color: BLU }}>{c.codice}</td>
                          <td className="px-2 py-[6px] font-medium">{c.cliente}</td>
                          <td className="hidden max-w-[150px] truncate px-2 py-[6px] md:table-cell" style={{ color: GRIGIO }}>{c.descrizione}</td>
                          <td className="px-2 py-[6px]">
                            <span
                              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[8.5px] font-semibold"
                              style={{ borderColor: c.colore, color: c.colore }}
                            >
                              {c.inCorso && <span className="eic-mock-pulse h-1.5 w-1.5 rounded-full" style={{ background: c.colore }} />}
                              {c.stato}
                            </span>
                          </td>
                          <td className="px-2 py-[6px] text-right tabular-nums">€ {c.imponibile}</td>
                          <td className="hidden px-2 py-[6px] text-right tabular-nums md:table-cell" style={{ color: c.incassato === "—" ? GRIGIO : undefined }}>{c.incassato === "—" ? "—" : `€ ${c.incassato}`}</td>
                          <td className="px-2.5 py-[6px]">
                            <div className="flex items-center gap-1.5">
                              <span className="w-7 text-right font-semibold tabular-nums" style={{ color: basso ? "#B45309" : "#0F7A4D" }}>{c.margine}%</span>
                              <span className="h-1.5 w-12 overflow-hidden rounded-full" style={{ background: "#E9EDF3" }}>
                                <span
                                  className="eic-mock-fill block h-full rounded-full"
                                  style={{ width: `${Math.min(100, c.margine * 3)}%`, background: basso ? "#F59E0B" : VERDE, animationDelay: `${0.35 + i * 0.1}s` }}
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
                  <span>1–6 di 12 commesse</span>
                  <span className="flex items-center gap-1"><AlertCircle size={10} className="text-amber-600" /> 1 commessa sotto il margine minimo (20%)</span>
                </div>
              </div>

              {/* ── Grafici (come in «Come stiamo andando») ── */}
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {/* Venduto e incassato per mese: due serie, una scala, legenda */}
                <div className="rounded-lg border bg-white p-2.5" style={{ borderColor: BORDO }}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[10px] font-semibold">Venduto e incassato — ultimi 6 mesi</p>
                    <span className="flex items-center gap-2 text-[8.5px]" style={{ color: GRIGIO }}>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: BLU }} />Venduto</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: VERDE }} />Incassato</span>
                    </span>
                  </div>
                  <svg viewBox="0 0 300 112" className="block h-auto w-full" style={{ fontFamily: "inherit" }}>
                    {[0, 25, 50, 75, 100].map((v) => (
                      <g key={v}>
                        <line x1={X0} x2={X1} y1={yScala(v, 100)} y2={yScala(v, 100)} stroke={BORDO} strokeWidth="1" />
                        <text x={X0 - 4} y={yScala(v, 100) + 3} textAnchor="end" fontSize="8" fill={GRIGIO}>{v === 0 ? "0" : `${v}k`}</text>
                      </g>
                    ))}
                    {MESI.map((d, i) => {
                      const cx = X0 + i * larghezzaGruppo + larghezzaGruppo / 2;
                      const yV = yScala(d.venduto, 100);
                      const yI = yScala(d.incassato, 100);
                      return (
                        <g key={d.m}>
                          <rect className="eic-mock-fill-y" x={cx - larghezzaBarra - 1} y={yV} width={larghezzaBarra} height={Y1 - yV} rx="1.5" fill={BLU} style={{ animationDelay: `${0.5 + i * 0.08}s` }} />
                          <rect className="eic-mock-fill-y" x={cx + 1} y={yI} width={larghezzaBarra} height={Y1 - yI} rx="1.5" fill={VERDE} style={{ animationDelay: `${0.56 + i * 0.08}s` }} />
                          <text x={cx} y={Y1 + 12} textAnchor="middle" fontSize="8.5" fill={GRIGIO}>{d.m}</text>
                        </g>
                      );
                    })}
                    <text x={X0 + 5 * larghezzaGruppo + larghezzaGruppo / 2} y={yScala(90, 100) - 4} textAnchor="middle" fontSize="8.5" fontWeight="600" fill={INCHIOSTRO}>€ 90k</text>
                  </svg>
                </div>

                {/* Cassa prevista a 90 giorni: una serie, linea + area, valore finale in chiaro */}
                <div className="rounded-lg border bg-white p-2.5" style={{ borderColor: BORDO }}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[10px] font-semibold">Cassa prevista a 90 giorni</p>
                    <span className="text-[9px] font-semibold tabular-nums" style={{ color: "#0F7A4D" }}>+ € 23.000</span>
                  </div>
                  <svg viewBox="0 0 300 112" className="block h-auto w-full" style={{ fontFamily: "inherit" }}>
                    {[0, 20, 40, 60, 80].map((v) => (
                      <g key={v}>
                        <line x1={X0} x2={X1} y1={yScala(v, 80)} y2={yScala(v, 80)} stroke={BORDO} strokeWidth="1" />
                        <text x={X0 - 4} y={yScala(v, 80) + 3} textAnchor="end" fontSize="8" fill={GRIGIO}>{v === 0 ? "0" : `${v}k`}</text>
                      </g>
                    ))}
                    <polygon points={`${X0},${Y1} ${puntiCassa.join(" ")} ${X1},${Y1}`} fill={BLU} fillOpacity="0.12" />
                    <polyline points={puntiCassa.join(" ")} fill="none" stroke={BLU} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    {CASSA.map((v, i) => (
                      <g key={i}>
                        <circle cx={X0 + i * passoCassa} cy={yScala(v, 80)} r="4" fill="#fff" stroke={BLU} strokeWidth="2" />
                        <text x={X0 + i * passoCassa} y={Y1 + 12} textAnchor={i === 0 ? "start" : i === CASSA.length - 1 ? "end" : "middle"} fontSize="8.5" fill={GRIGIO}>
                          {i === 0 ? "oggi" : `${i * 30} gg`}
                        </text>
                      </g>
                    ))}
                    <text x={X1 - 2} y={yScala(CASSA[3], 80) - 8} textAnchor="end" fontSize="8.5" fontWeight="600" fill={INCHIOSTRO}>€ 61.200</text>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Telefono: l'azienda in tasca. Non la home dell'operaio ma i numeri
          del titolare (dashboard mobile): cassa di oggi, da incassare, commesse
          attive, margine medio, le commesse in corso e l'avviso sul margine —
          gli stessi dati della tabella accanto. In basso a sinistra, sopra la
          parte vuota della barra laterale, per non coprire tabella e grafici. ── */}
      <div
        aria-hidden="true"
        className="absolute -bottom-12 -left-14 hidden w-[156px] -rotate-[6deg] overflow-hidden rounded-[22px] border-[5px] border-[#1F2A3D] bg-white shadow-2xl shadow-black/50 lg:block"
        style={{ fontSize: 9.5, color: INCHIOSTRO }}
      >
        <div className="px-2.5 pb-3 pt-3.5" style={{ background: FONDO }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[8px]" style={{ color: GRIGIO }}>Demo Azienda 2 · oggi</p>
              <p className="text-[11.5px] font-bold leading-tight">Buongiorno, Marco</p>
            </div>
            <span className="relative"><Bell size={11} style={{ color: GRIGIO }} /><span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-red-500" /></span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1">
            {[
              { l: "Cassa oggi", v: "€ 38.200", c: INCHIOSTRO },
              { l: "Da incassare", v: "€ 144.400", c: "#B45309" },
              { l: "Commesse attive", v: "12", c: INCHIOSTRO },
              { l: "Margine medio", v: "24%", c: "#0F7A4D" },
            ].map((k) => (
              <div key={k.l} className="rounded-lg border bg-white px-1.5 py-1" style={{ borderColor: BORDO }}>
                <p className="text-[7px] leading-tight" style={{ color: GRIGIO }}>{k.l}</p>
                <p className="text-[10px] font-bold leading-tight tabular-nums" style={{ color: k.c }}>{k.v}</p>
              </div>
            ))}
          </div>

          <p className="mb-1 mt-2 text-[7.5px] font-semibold uppercase tracking-wide" style={{ color: GRIGIO }}>Commesse in corso</p>
          <div className="space-y-1">
            {[
              { n: "Villa Rossi", s: "Posa", c: "#DB2777", m: 24 },
              { n: "Cappotto Ferrari", s: "In lavorazione", c: "#2563EB", m: 19 },
              { n: "Tetto Mazzoleni", s: "In lavorazione", c: "#2563EB", m: 25 },
            ].map((r) => (
              <div key={r.n} className="flex items-center gap-1.5 rounded-lg border bg-white px-1.5 py-1" style={{ borderColor: BORDO }}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.c }} />
                <span className="min-w-0 flex-1 truncate text-[8.5px] font-medium">{r.n}</span>
                <span className="text-[8.5px] font-semibold tabular-nums" style={{ color: r.m < 20 ? "#B45309" : "#0F7A4D" }}>{r.m}%</span>
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[7.5px] font-medium" style={{ borderColor: "#FDE68A", background: "#FFFBEB", color: "#92400E" }}>
            <AlertCircle size={9} className="shrink-0" /> Cappotto Ferrari sotto il margine minimo
          </div>
        </div>
      </div>
    </div>
  );
}
