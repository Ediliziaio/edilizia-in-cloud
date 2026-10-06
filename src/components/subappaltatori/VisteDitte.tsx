import { createElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AirVent, AppWindow, BrickWall, ChevronDown, Construction, Droplets, Grid3x3, HardHat, Home, Layers, Mail, MapPin,
  MessageCircle, PaintRoller, PanelsTopLeft, Phone, Shovel, Sparkles, Sun, Trees, Truck, Umbrella, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import {
  ZONA_NON_INDICATA, categoriaLavori, durcDaGuardare, raggruppa, statoDurc, zonaDa, type Mancanza,
} from "@/lib/subappaltatori/gruppi";
import { STATI_IN_CORSO, type ContrattoDitta } from "@/hooks/useContrattiDitte";
import type { StatoContratto, SubappaltatoreConDashboard } from "@/types/subappaltatori";

/**
 * Le viste raggruppate della pagina Subappaltatori (06/10/2026): per lavoro,
 * per zona e per cantiere, come gli operai nelle loro squadre. Ogni gruppo è
 * una sezione che si apre e si chiude; ogni ditta una schedina con DURC,
 * referente, cantieri in corso e documenti.
 */

export type Ditta = SubappaltatoreConDashboard;

const ICONA_CATEGORIA: Record<string, LucideIcon> = {
  elettrico: Zap, idraulica: Droplets, impermeabilizzazioni: Umbrella, isolamento: Layers, coperture: Home,
  strutture: Wrench, murature: BrickWall, cartongesso: PanelsTopLeft, pavimenti: Grid3x3, tinteggiature: PaintRoller,
  demolizioni: Shovel, ponteggi: Construction, noleggi: Truck, giardini: Trees, pulizie: Sparkles,
  fotovoltaico: Sun, clima: AirVent, serramenti: AppWindow,
};

export const iconaCategoria = (chiave: string): LucideIcon => ICONA_CATEGORIA[chiave] ?? HardHat;

const PASTIGLIA_DURC = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  in_scadenza: "bg-amber-50 text-amber-800 ring-amber-200",
  scaduto: "bg-red-50 text-red-700 ring-red-200",
  mancante: "bg-slate-50 text-slate-600 ring-slate-200",
  errata: "bg-red-50 text-red-700 ring-red-200",
} as const;

/** Il DURC in una pastiglia: «DURC ok», «DURC 8 gg», «DURC scaduto», «DURC mancante». */
export function DurcPastiglia({ scadenza, oggi, className }: { scadenza: string | null; oggi: string; className?: string }) {
  const { stato, giorni } = statoDurc(scadenza, oggi);
  const testo = stato === "ok" ? "DURC ok" : stato === "in_scadenza" ? `DURC ${giorni} gg` : stato === "scaduto" ? "DURC scaduto"
    : stato === "errata" ? "DURC da correggere" : "DURC mancante";
  return (
    <span
      title={stato === "errata" ? `La scadenza registrata (${scadenza}) non è una data possibile: correggila nella scheda`
        : scadenza ? `Scadenza DURC: ${formatDateIt(scadenza)}` : "Nessuna scadenza DURC registrata"}
      className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", PASTIGLIA_DURC[stato], className)}
    >
      {testo}
    </span>
  );
}

/** Due lettere dal nome della ditta, senza la forma societaria. */
function iniziali(nome: string): string {
  const parole = nome
    .replace(/\b(s\.?\s?r\.?\s?l\.?|s\.?\s?p\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?a\.?\s?s\.?|srls?|spa|snc|sas|di|e|&)\b\.?/gi, " ")
    .split(/\s+/)
    .filter((p) => /[a-z]/i.test(p));
  return ((parole[0]?.[0] ?? "") + (parole[1]?.[0] ?? parole[0]?.[1] ?? "")).toUpperCase() || "?";
}

export interface InfoDitta {
  /** Commesse diverse con un contratto in corso (attivo o sospeso). */
  cantieriInCorso: number;
  /** Ha un contratto attivo: è al lavoro. */
  alLavoro: boolean;
  /** Documenti nel fascicolo. */
  documenti: number;
  /** Cosa manca per il subappalto (documenti di idoneità e P.IVA). */
  mancanze: Mancanza[];
  /** Il messaggio già scritto per chiedere quello che manca, se c'è un recapito. */
  richiesta: { href: string; canale: "email" | "whatsapp" } | null;
}

/** La schedina di una ditta: nome e DURC, referente e telefono, poi zona o lavoro, cantieri e documenti. */
export function SchedaDitta({
  d,
  info,
  oggi,
  mostra,
}: {
  d: Ditta;
  info: InfoDitta;
  oggi: string;
  /** Cosa scrivere nella terza riga: la zona (nella vista per lavoro) o il lavoro (nella vista per zona). */
  mostra: "zona" | "lavoro";
}) {
  const zona = zonaDa(d.indirizzo);
  const categoria = categoriaLavori(d.tipo_lavori);
  const terza = mostra === "zona"
    ? (zona ? `${zona.nomeProvincia} (${zona.provincia})` : null)
    : (d.tipo_lavori?.trim() || null);
  return (
    <li className="flex min-w-0 gap-3 bg-white px-4 py-3 max-sm:px-3 max-sm:py-2.5">
      <span
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          d.campo_is_active ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-600",
        )}
      >
        {mostra === "lavoro" && categoria.chiave !== "_senza"
          ? createElement(iconaCategoria(categoria.chiave), { className: "h-4 w-4" })
          : iniziali(d.ragione_sociale)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/azienda/subappaltatori/${d.id}`} className="tap-compact min-w-0 truncate text-sm font-medium text-slate-900 hover:text-orange-700">
            {d.ragione_sociale}
          </Link>
          <DurcPastiglia scadenza={d.durc_scadenza} oggi={oggi} />
        </div>
        {(d.responsabile || d.telefono) && (
          <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
            {d.responsabile && <span className="truncate">{d.responsabile}</span>}
            {d.responsabile && d.telefono && <span aria-hidden="true">·</span>}
            {d.telefono && (
              <a href={`tel:${d.telefono}`} className="tap-compact inline-flex shrink-0 items-center gap-0.5 tabular-nums hover:text-orange-700">
                <Phone className="h-3 w-3" aria-hidden="true" />{d.telefono}
              </a>
            )}
          </p>
        )}
        <p className="mt-0.5 truncate text-xs">
          {terza && <span className="text-slate-600">{terza} · </span>}
          {info.cantieriInCorso > 0
            ? <span className="text-emerald-700">{info.cantieriInCorso === 1 ? "1 cantiere in corso" : `${info.cantieriInCorso} cantieri in corso`}</span>
            : <span className="text-muted-foreground">nessun cantiere in corso</span>}
        </p>
        {/* Cosa manca per il subappalto, in parole, e il messaggio per chiederlo */}
        <p className="mt-0.5 flex min-w-0 items-start gap-2 text-xs">
          {info.mancanze.length === 0 ? (
            <span className="truncate text-emerald-700">
              Documenti in regola{info.documenti > 0 && <span className="text-muted-foreground"> · {info.documenti === 1 ? "1 documento" : `${info.documenti} documenti`}</span>}
            </span>
          ) : (
            <span className="min-w-0 text-amber-700 line-clamp-2 max-sm:truncate" title={`Mancano: ${info.mancanze.map((m) => m.etichetta).join(", ")}`}>
              <span className="max-sm:hidden">Mancano: {info.mancanze.map((m) => m.etichetta).join(", ")}</span>
              <span className="sm:hidden">{info.mancanze.length === 1 ? `manca ${info.mancanze[0].etichetta}` : `mancano ${info.mancanze.length} cose`}</span>
            </span>
          )}
          {info.mancanze.some((m) => m.chiave !== "piva") && info.richiesta && (
            <a
              href={info.richiesta.href}
              target={info.richiesta.canale === "whatsapp" ? "_blank" : undefined}
              rel="noreferrer"
              title={info.richiesta.canale === "email" ? "Scrivi un'email con l'elenco di quello che manca" : "Manda un WhatsApp con l'elenco di quello che manca"}
              className="tap-compact ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 font-medium text-orange-800 hover:bg-orange-100"
            >
              {info.richiesta.canale === "email" ? <Mail className="h-3 w-3" aria-hidden="true" /> : <MessageCircle className="h-3 w-3" aria-hidden="true" />}
              Chiedi
            </a>
          )}
        </p>
      </div>
    </li>
  );
}

/** Una sezione che si apre e si chiude: titolo, quante ditte, cosa va guardato, e un dettaglio a destra. */
export function SezioneDitte({
  titolo,
  icona: Icona,
  colore,
  conteggio,
  alLavoro,
  avviso,
  dettaglio,
  aperta,
  className,
  children,
}: {
  titolo: string;
  className?: string;
  icona?: LucideIcon;
  colore?: string;
  conteggio: number;
  /** Quante ditte del gruppo hanno un contratto attivo. */
  alLavoro?: number;
  avviso?: string | null;
  dettaglio?: ReactNode;
  aperta: boolean;
  children: ReactNode;
}) {
  return (
    <details open={aperta} className={cn("group overflow-hidden rounded-2xl border bg-white shadow-sm", className)} style={colore ? { borderTop: `3px solid ${colore}` } : undefined}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 bg-slate-50/70 px-4 py-2.5 group-open:border-b max-sm:px-3 [&::-webkit-details-marker]:hidden">
        {/* Il titolo ha la riga tutta per sé (nei gruppi stretti e da telefono si
            tagliava): quante ditte e l'avviso sotto */}
        <div className="min-w-0 flex-1">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
            {Icona && <Icona className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />}
            <span className="truncate">{titolo}</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {conteggio === 1 ? "1 ditta" : `${conteggio} ditte`}
            {!!alLavoro && <span className="text-emerald-700"> · {alLavoro} al lavoro</span>}
            {avviso && <span className="font-medium text-red-700"> · {avviso}</span>}
          </p>
        </div>
        {dettaglio && <span className="min-w-0 truncate text-xs text-slate-500 max-sm:hidden">{dettaglio}</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      {children}
    </details>
  );
}

const GRIGLIA = "grid sm:grid-cols-2 xl:grid-cols-3 [&>li]:border-b [&>li]:border-slate-100 sm:[&>li]:border-r";
/** Un gruppo piccolo sta in una colonna, con le ditte una sotto l'altra. */
const COLONNA = "divide-y divide-slate-100";

/**
 * I gruppi piccoli (una o due ditte) uno accanto all'altro, tre per riga; i
 * grandi a tutta larghezza. Prima ogni gruppo prendeva la riga intera, e con
 * una ditta sola lasciava vuote due colonne su tre.
 */
const TABELLONE = "grid items-start gap-3 lg:grid-cols-2 xl:grid-cols-3";
const piccolo = (n: number) => n <= 2;
const largoSe = (n: number) => (piccolo(n) ? undefined : "lg:col-span-2 xl:col-span-3");

/** Tutte aperte se le ditte sono poche; con tante, aperta solo la prima sezione. */
const apriSezione = (indice: number, totaleDitte: number) => totaleDitte <= 24 || indice === 0;

const avvisoDurc = (righe: ReadonlyArray<Ditta>, oggi: string) => {
  const n = righe.filter((d) => durcDaGuardare(d.durc_scadenza, oggi)).length;
  return n === 0 ? null : n === 1 ? "1 DURC da controllare" : `${n} DURC da controllare`;
};

const perNome = (a: Ditta, b: Ditta) => a.ragione_sociale.localeCompare(b.ragione_sociale, "it");

/** Per lavoro: elettricisti, idraulici, cartongessisti… con le varianti del testo libero messe insieme. */
export function VistaPerLavoro({ ditte, info, oggi }: { ditte: ReadonlyArray<Ditta>; info: (d: Ditta) => InfoDitta; oggi: string }) {
  const gruppi = raggruppa(ditte, (d) => categoriaLavori(d.tipo_lavori), perNome);
  return (
    <div className={TABELLONE}>
      {gruppi.map((g, i) => (
        <SezioneDitte
          key={g.chiave}
          className={largoSe(g.righe.length)}
          titolo={g.etichetta}
          icona={iconaCategoria(g.chiave)}
          conteggio={g.righe.length}
          alLavoro={g.righe.filter((d) => info(d).alLavoro).length}
          avviso={avvisoDurc(g.righe, oggi)}
          dettaglio={g.chiave === "_senza" ? "Scrivi il tipo di lavoro nella scheda della ditta per metterla nel suo gruppo" : undefined}
          aperta={apriSezione(i, ditte.length)}
        >
          <ul className={piccolo(g.righe.length) ? COLONNA : GRIGLIA}>
            {g.righe.map((d) => <SchedaDitta key={d.id} d={d} info={info(d)} oggi={oggi} mostra="zona" />)}
          </ul>
        </SezioneDitte>
      ))}
    </div>
  );
}

/** Per zona: la regione, e dentro le province, dalla sigla tra parentesi nell'indirizzo. */
export function VistaPerZona({ ditte, info, oggi }: { ditte: ReadonlyArray<Ditta>; info: (d: Ditta) => InfoDitta; oggi: string }) {
  const regioni = raggruppa(ditte, (d) => {
    const z = zonaDa(d.indirizzo);
    return z ? { chiave: z.regione, etichetta: z.regione } : { chiave: "_senza", etichetta: ZONA_NON_INDICATA };
  }, perNome);
  return (
    <div className={TABELLONE}>
      {regioni.map((r, i) => {
        const province = raggruppa(r.righe, (d) => {
          const z = zonaDa(d.indirizzo);
          return z ? { chiave: z.provincia, etichetta: z.nomeProvincia } : { chiave: "_senza", etichetta: ZONA_NON_INDICATA };
        }, perNome);
        const riassunto = province.length > 1
          ? province.slice(0, 4).map((p) => `${p.etichetta} ${p.righe.length}`).join(" · ") + (province.length > 4 ? ` · altre ${province.length - 4}` : "")
          : undefined;
        return (
          <SezioneDitte
            key={r.chiave}
            className={largoSe(r.righe.length)}
            titolo={r.etichetta}
            icona={MapPin}
            conteggio={r.righe.length}
            alLavoro={r.righe.filter((d) => info(d).alLavoro).length}
            avviso={avvisoDurc(r.righe, oggi)}
            dettaglio={r.chiave === "_senza" ? "Metti la sigla della provincia tra parentesi nell'indirizzo, es. «(PD)»" : riassunto}
            aperta={apriSezione(i, ditte.length)}
          >
            {province.length > 1 ? (
              province.map((p) => (
                <div key={p.chiave}>
                  <p className="border-b border-slate-100 bg-white px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 max-sm:px-3">
                    {p.etichetta} <span className="font-normal normal-case tracking-normal text-muted-foreground">· {p.righe.length}</span>
                  </p>
                  <ul className={GRIGLIA}>
                    {p.righe.map((d) => <SchedaDitta key={d.id} d={d} info={info(d)} oggi={oggi} mostra="lavoro" />)}
                  </ul>
                </div>
              ))
            ) : (
              <ul className={piccolo(r.righe.length) ? COLONNA : GRIGLIA}>
                {r.righe.map((d) => <SchedaDitta key={d.id} d={d} info={info(d)} oggi={oggi} mostra="lavoro" />)}
              </ul>
            )}
          </SezioneDitte>
        );
      })}
    </div>
  );
}

const STATO_CONTRATTO: Record<StatoContratto, { testo: string; classe: string }> = {
  attivo: { testo: "In corso", classe: "bg-blue-50 text-blue-700 ring-blue-200" },
  sospeso: { testo: "Sospeso", classe: "bg-amber-50 text-amber-800 ring-amber-200" },
  bozza: { testo: "Da firmare", classe: "bg-slate-50 text-slate-600 ring-slate-200" },
  completato: { testo: "Completato", classe: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  risolto: { testo: "Risolto", classe: "bg-purple-50 text-purple-700 ring-purple-200" },
};

const ORDINE_STATO: Record<string, number> = { attivo: 0, sospeso: 1, bozza: 2 };

/**
 * Per cantiere: per ogni commessa, le ditte con un contratto in corso (attivo,
 * sospeso o da firmare), con le date e, con il permesso sui costi, importo e
 * SAL. In fondo le ditte che non sono su nessun cantiere.
 */
export function VistaCantieri({
  ditte,
  contratti,
  oggi,
  vedeImporti,
}: {
  ditte: ReadonlyArray<Ditta>;
  contratti: ReadonlyArray<ContrattoDitta>;
  oggi: string;
  vedeImporti: boolean;
}) {
  const perId = new Map(ditte.map((d) => [d.id, d]));
  const inCorso = contratti.filter((c) => STATI_IN_CORSO.has(c.stato) && perId.has(c.schedaId));
  const cantieri = raggruppa(
    inCorso,
    (c) => c.orderId
      ? { chiave: c.orderId, etichetta: [c.codiceCommessa, c.commessa].filter(Boolean).join(" · ") || "Commessa" }
      : { chiave: "_senza", etichetta: "Contratti senza commessa" },
    (a, b) => (ORDINE_STATO[a.stato] ?? 9) - (ORDINE_STATO[b.stato] ?? 9)
      || (perId.get(a.schedaId)?.ragione_sociale ?? "").localeCompare(perId.get(b.schedaId)?.ragione_sociale ?? "", "it"),
  );
  const alLavoro = new Set(inCorso.map((c) => c.schedaId));
  const ferme = ditte.filter((d) => !alLavoro.has(d.id)).sort(perNome);

  return (
    <div className="grid items-start gap-3 xl:grid-cols-2">
      {cantieri.length === 0 && (
        <p className="rounded-xl border border-dashed bg-white px-4 py-8 text-center text-sm text-muted-foreground xl:col-span-2">
          Nessuna ditta ha un contratto in corso. I contratti si aprono dalla scheda della ditta.
        </p>
      )}
      {cantieri.map((g, i) => {
        const primo = g.righe[0];
        const ditteQui = new Set(g.righe.map((c) => c.schedaId));
        const importo = g.righe.reduce((s, c) => s + c.importo, 0);
        const sal = g.righe.reduce((s, c) => s + c.salLordo, 0);
        return (
          <SezioneDitte
            key={g.chiave}
            className={g.righe.length > 2 ? "xl:col-span-2" : undefined}
            titolo={g.etichetta}
            icona={HardHat}
            conteggio={ditteQui.size}
            avviso={avvisoDurc([...ditteQui].map((id) => perId.get(id)!).filter(Boolean), oggi)}
            dettaglio={[
              primo?.cliente,
              vedeImporti && importo > 0 ? `contratti ${formatCurrency(importo)}${sal > 0 ? ` · SAL ${Math.round((sal / importo) * 100)}%` : ""}` : null,
            ].filter(Boolean).join(" · ") || undefined}
            aperta={apriSezione(i, inCorso.length)}
          >
            <ul className="divide-y divide-slate-100">
              {g.righe.map((c) => {
                const d = perId.get(c.schedaId)!;
                const stato = STATO_CONTRATTO[c.stato];
                const pct = c.importo > 0 ? Math.min(100, Math.round((c.salLordo / c.importo) * 100)) : 0;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 max-sm:px-3">
                    <div className="min-w-0 flex-1">
                      <Link to={`/azienda/subappaltatori/${d.id}`} className="tap-compact block truncate text-sm font-medium text-slate-900 hover:text-orange-700">
                        {d.ragione_sociale}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {[d.tipo_lavori, c.dataInizio && c.dataFinePrevista ? `${formatDateIt(c.dataInizio)} → ${formatDateIt(c.dataFinePrevista)}` : null].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <DurcPastiglia scadenza={d.durc_scadenza} oggi={oggi} />
                    <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", stato.classe)}>{stato.testo}</span>
                    {vedeImporti && (
                      <span className="w-40 shrink-0 text-right text-xs tabular-nums text-slate-700 max-sm:w-full max-sm:text-left">
                        {formatCurrency(c.importo)}
                        <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-slate-100" title={`SAL ${pct}%`} aria-label={`SAL al ${pct}%`}>
                          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </SezioneDitte>
        );
      })}

      {ferme.length > 0 && (
        <section className="rounded-2xl border border-dashed bg-white px-4 py-3 xl:col-span-2" aria-label="Ditte senza cantieri in corso">
          <p className="text-sm font-semibold text-slate-900">
            Senza cantieri in corso <span className="font-normal text-muted-foreground">· {ferme.length}</span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {ferme.map((d) => (
              <li key={d.id} className="flex items-center gap-1.5">
                <Link to={`/azienda/subappaltatori/${d.id}`} className="tap-compact text-sm text-slate-700 hover:text-orange-700">{d.ragione_sociale}</Link>
                {durcDaGuardare(d.durc_scadenza, oggi) && <DurcPastiglia scadenza={d.durc_scadenza} oggi={oggi} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
