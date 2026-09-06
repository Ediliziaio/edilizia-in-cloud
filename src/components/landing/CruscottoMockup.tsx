/**
 * CruscottoMockup — la schermata «Come stiamo andando» riprodotta nella
 * sezione «Come funziona» della home.
 *
 * Prima qui c'era un finto browser scuro «dashboard.ediliziaincloud.com» con
 * tre numeri arancioni e diciotto rettangoli grigi vuoti, accanto a
 * un'illustrazione generata: la stessa «app inventata» che il hero ha tolto
 * il 05/09. L'app vera è chiara, con la barra laterale, e la pagina che
 * risponde alle tre domande della sezione — margine, cassa, dove perdo — è
 * quella che il titolare apre la mattina: src/pages/azienda/ComeStiamoAndando.tsx.
 * È quella che si mostra.
 *
 * Ricostruzione fedele: barra laterale e header come in PlatformMockup
 * (CompanyLayout), poi i quattro «Numero» dell'app — incassato del mese
 * contro previsione, margine dei cantieri aperti, scaduto da incassare,
 * cantieri in ritardo — con il colore sull'icona e sul filo a sinistra, e
 * sotto l'elenco «Da guardare oggi» con la gravità nel bordo sinistro, in
 * ordine di quanto costa non farlo. Dati finti ma coerenti con la tabella
 * Commesse del hero: stessa Demo Azienda 2, CP-2026-027 sotto il margine
 * minimo, MZ-2026-009 oltre la data di fine.
 *
 * Markup puro, senza stato: identico fra prerender e client. L'unica
 * animazione è la barra dell'incassato (.eic-mock-fill in src/index.css);
 * con prefers-reduced-motion resta ferma.
 */
import {
  ClipboardCheck, Mail, TrendingUp, MessagesSquare, Sparkles, HardHat, Package, Users, CalendarDays,
  Receipt, Landmark, Wallet, Megaphone, Bot, Search, Bell, ChevronRight, PanelLeft,
  Banknote, TrendingDown, Clock, ArrowRight,
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
    { label: "Come stiamo andando", Icon: TrendingUp, attiva: true },
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

/* Toni del componente Numero dell'app: valore = *-700, chip = *-50 / *-600, filo = *-400. */
type Tono = "buono" | "attenzione" | "male";
const TONI: Record<Tono, { valore: string; chipFondo: string; chipIcona: string; filo: string }> = {
  buono: { valore: "#047857", chipFondo: "#ECFDF5", chipIcona: "#059669", filo: "#34D399" },
  attenzione: { valore: "#B45309", chipFondo: "#FFFBEB", chipIcona: "#D97706", filo: "#FBBF24" },
  male: { valore: "#B91C1C", chipFondo: "#FEF2F2", chipIcona: "#DC2626", filo: "#F87171" },
};

const NUMERI: Array<{ Icon: typeof Mail; etichetta: string; valore: string; tono: Tono; contesto: string; barra?: number }> = [
  { Icon: Banknote, etichetta: "Incassato questo mese", valore: "€ 68.000", tono: "buono", contesto: "72% di € 95.000 · mese al 68%", barra: 72 },
  { Icon: HardHat, etichetta: "Margine cantieri aperti", valore: "23,4%", tono: "buono", contesto: "€ 38.900 su 5 cantieri" },
  { Icon: TrendingDown, etichetta: "Scaduto da incassare", valore: "€ 12.600", tono: "male", contesto: "2 scadenze oltre il termine" },
  { Icon: Clock, etichetta: "Cantieri in ritardo", valore: "1", tono: "attenzione", contesto: "Oltre la data di fine pianificata" },
];

/* Gravità come nell'app: urgente = rosso 500, attenzione = ambra 500. */
const ATTENZIONI: Array<{ gravita: "urgente" | "attenzione"; titolo: string; dettaglio: string }> = [
  { gravita: "urgente", titolo: "2 pagamenti scaduti", dettaglio: "€ 12.600 che i clienti dovevano già averti pagato." },
  { gravita: "urgente", titolo: "1 cantiere ha superato la data di fine", dettaglio: "MZ-2026-009 · Rifacimento tetto — Alzano" },
  { gravita: "attenzione", titolo: "1 cantiere aperto è sotto il margine minimo (20%)", dettaglio: "CP-2026-027 al 19,0%" },
  { gravita: "attenzione", titolo: "Fornitori da pagare a breve", dettaglio: "€ 8.400 in scadenza su € 21.300 di debito totale." },
];

export default function CruscottoMockup() {
  return (
    <div
      role="img"
      aria-label="La schermata «Come stiamo andando» di Edilizia in Cloud: incassato del mese contro previsione, margine dei cantieri aperti, scaduto da incassare, cantieri in ritardo e l'elenco delle cose da guardare oggi"
      className="relative overflow-hidden rounded-2xl border border-white/20 shadow-2xl shadow-black/40"
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
          <div className="flex h-10 items-center gap-2 border-b bg-white px-3" style={{ borderColor: BORDO }}>
            <PanelLeft size={13} style={{ color: GRIGIO }} />
            <div className="flex items-center gap-1 text-[10px]" style={{ color: GRIGIO }}>
              <span>Cruscotto</span>
              <ChevronRight size={10} />
              <span className="font-medium" style={{ color: INCHIOSTRO }}>Come stiamo andando</span>
            </div>
            <div className="flex-1" />
            <Search size={13} style={{ color: GRIGIO }} />
            <span className="relative">
              <Bell size={13} style={{ color: GRIGIO }} />
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: BLU }}>MR</span>
          </div>

          <div className="space-y-3 p-3">
            <div>
              <p className="text-[15px] font-bold leading-tight">Come stiamo andando</p>
              <p className="text-[9.5px]" style={{ color: GRIGIO }}>Quello che serve sapere stamattina, in una schermata sola.</p>
            </div>

            {/* I quattro Numero: colore sull'icona e sul filo a sinistra, numero grande, contesto sotto */}
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {NUMERI.map((n) => {
                const t = TONI[n.tono];
                return (
                  <div key={n.etichetta} className="relative flex min-w-0 gap-2 overflow-hidden rounded-lg border bg-white px-2.5 py-2" style={{ borderColor: BORDO }}>
                    <span className="absolute inset-y-0 left-0 w-1" style={{ background: t.filo }} />
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: t.chipFondo, color: t.chipIcona }}>
                      <n.Icon size={12} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[8.5px] font-medium uppercase leading-3 tracking-wide" style={{ color: GRIGIO }}>{n.etichetta}</p>
                      <p className="mt-1 text-[17px] font-bold leading-none tabular-nums" style={{ color: t.valore }}>{n.valore}</p>
                      {n.barra !== undefined && (
                        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#E9EDF3" }}>
                          <span className="eic-mock-fill block h-full rounded-full" style={{ width: `${n.barra}%`, background: BLU, animationDelay: "0.3s" }} />
                        </span>
                      )}
                      <p className="mt-1 text-[8.5px] leading-3" style={{ color: GRIGIO }}>{n.contesto}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* L'unico elenco: cosa richiede attenzione oggi, gravità nel bordo sinistro */}
            <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: BORDO }}>
              <div className="flex flex-wrap items-baseline gap-x-2 border-b px-3 py-2" style={{ borderColor: "#F1F4F8" }}>
                <p className="text-[10.5px] font-semibold">Da guardare oggi</p>
                <p className="text-[8.5px]" style={{ color: GRIGIO }}>in ordine di quanto costa non farlo</p>
              </div>
              <ul>
                {ATTENZIONI.map((v, i) => (
                  <li
                    key={v.titolo}
                    className="flex items-center gap-2.5 border-l-[3px] px-3 py-[7px]"
                    style={{ borderLeftColor: v.gravita === "urgente" ? "rgb(239 68 68)" : "rgb(245 158 11)", borderTop: i === 0 ? undefined : "1px solid #F1F4F8" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-medium leading-snug">{v.titolo}</p>
                      <p className="truncate text-[8.5px] leading-3" style={{ color: GRIGIO }}>{v.dettaglio}</p>
                    </div>
                    <ArrowRight size={11} className="shrink-0" style={{ color: "#CBD2DC" }} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
