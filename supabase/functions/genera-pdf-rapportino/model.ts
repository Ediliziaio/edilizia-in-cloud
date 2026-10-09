/** Operational PDF only: never copy payroll, GPS or costing snapshots into it. */
export type RecordData = Record<string, unknown>;
export const record = (value: unknown): RecordData => value && typeof value === "object" && !Array.isArray(value) ? value as RecordData : {};
export const rows = (value: unknown): RecordData[] => Array.isArray(value) ? value.map(record) : [];
export const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
export function number(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function hours(value: unknown): string {
  const n = number(value);
  if (n === null) return "Non indicate";
  const minutes = Math.round(n * 60);
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, "0")} min` : ""}`;
}
export function percentage(value: unknown): string {
  const n = number(value);
  return n !== null && n <= 100 ? `${n.toLocaleString("it-IT")}%` : "Non rilevato";
}
export function timestamp(value: unknown): string {
  const date = new Date(text(value));
  return Number.isNaN(date.getTime()) ? "Non disponibile" : date.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });
}
export function dayLabel(value: unknown): string {
  const date = new Date(`${text(value)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Non disponibile" : date.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric" });
}
/** Calendar boundaries in Rome, including DST. No dependence on server timezone. */
export function dayBounds(day: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const midnight = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return null;
  const atRomeMidnight = (utc: number) => {
    let guess = utc;
    for (let i = 0; i < 3; i++) {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
      const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
      const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      guess += utc - local;
    }
    return new Date(guess).toISOString();
  };
  return { start: atRomeMidnight(midnight), end: atRomeMidnight(midnight + 86400000) };
}
export interface PdfContext {
  report: RecordData;
  company: RecordData;
  branding: { primaryColor?: string; logoUrl?: string; platformName?: string; hidePoweredBy?: boolean };
  phases: RecordData[];
  punches: RecordData[];
  warnings: string[];
  revision: string;
  generatedAt: string;
}
export function reportSummary(report: RecordData) {
  const crew = rows(report.presenze);
  const own = number(report.ore_lavorate);
  const extra = number(report.ore_straordinario);
  const crewHours = crew.map(p => number(p.ore));
  // The existing DB contract REPLACES author hours with presenze. Never add both.
  const total = crew.length
    ? crewHours.every(h => h !== null) ? crewHours.reduce<number>((sum, h) => sum + (h ?? 0), 0) : null
    : own === null ? null : own + (extra ?? 0);
  const status = text(report.stato) || (report.approvato === true ? "approvato" : "inviato");
  return {
    crew, total, own, extra,
    status,
    statusLabel: ({ bozza: "BOZZA", inviato: "DA APPROVARE", approvato: "APPROVATO", rifiutato: "RIFIUTATO" } as Record<string, string>)[status] || "STATO NON DISPONIBILE",
    author: [text(record(report.autore).first_name), text(record(report.autore).last_name)].filter(Boolean).join(" ") || "Compilatore non disponibile",
    authorRole: report.role_type === "subcontractor" ? "Subappaltatore" : report.role_type === "employee" ? "Personale interno" : "Ruolo non disponibile",
  };
}
/** Recognize only this tenant's storage assets, not arbitrary network URLs. */
export function reportAsset(value: string, companyId: string, supabaseUrl: string): { bucket: string; path: string } | null {
  try {
    let ref = value;
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      if (url.origin !== new URL(supabaseUrl).origin) return null;
      const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/(.+)$/);
      if (!match) return null;
      ref = decodeURIComponent(match[1]);
    }
    const [bucket, ...parts] = ref.split("/");
    if (!["campo-rapportini", "campo-firme", "foto-cantiere"].includes(bucket) || parts[0] !== companyId || parts.length < 2 || parts.some(p => !p || p === "." || p === ".." || p.includes("\\"))) return null;
    return { bucket, path: parts.join("/") };
  } catch { return null; }
}

// ── Blocchi del documento ──────────────────────────────────────────────────────────────────────

export interface MaterialeBlocco { nome: string; quantita: string; unita: string; origine: string }
export interface FaseBlocco {
  id: string;
  nome: string;
  /** Avanzamento dichiarato 0-100, null se il rapportino non lo riporta. */
  percentuale: number | null;
  ore: number | null;
  materiali: MaterialeBlocco[];
  foto: string[];
}

const originiMateriale = (m: RecordData) => m.da_furgone === true ? "Dal furgone" : m.order_item_id ? "Articolo commessa" : "Dichiarato";
function materiale(m: RecordData): MaterialeBlocco {
  return {
    nome: text(m.nome) || "Non specificato",
    quantita: number(m.quantita)?.toLocaleString("it-IT") ?? "-",
    unita: text(m.unita) || "-",
    origine: originiMateriale(m),
  };
}

/**
 * Il rapportino letto a blocchi: una scheda per ogni fase su cui si è lavorato, con i suoi
 * materiali e le sue foto, e in coda quello che non è legato a nessuna fase.
 *
 * I collegamenti stanno dentro i dati già salvati: `fasi_lavorate[].foto` (indirizzi, sottoinsieme di
 * `foto_urls`) e `materiali_usati[].fase_id`. Un rapportino senza collegamenti (vocale, WhatsApp,
 * storico) ha le fasi senza materiali né foto, e tutto il resto nelle liste generali: com'era.
 */
export function bloccoFasi(report: RecordData, nomiFasi: ReadonlyMap<string, string>) {
  const voci = rows(report.fasi_lavorate);
  const idsFasi = new Set(voci.map(v => text(v.phase_id)).filter(Boolean));
  const tutteLeFoto = Array.isArray(report.foto_urls) ? report.foto_urls.filter((u): u is string => typeof u === "string" && !!u) : [];
  const usate = new Set<string>();
  const materialiTutti = rows(report.materiali_usati);
  const assegnati = new Set<number>();

  const fasi: FaseBlocco[] = voci.map((v, indice) => {
    const id = text(v.phase_id) || `senza-id-${indice}`;
    const percentuale = number(v.percentuale);
    const foto = (Array.isArray(v.foto) ? v.foto : []).filter((u): u is string => typeof u === "string" && !!u && tutteLeFoto.includes(u) && !usate.has(u));
    foto.forEach(u => usate.add(u));
    const materiali: MaterialeBlocco[] = [];
    materialiTutti.forEach((m, i) => {
      if (text(m.fase_id) && text(m.fase_id) === text(v.phase_id) && !assegnati.has(i)) { assegnati.add(i); materiali.push(materiale(m)); }
    });
    return {
      id,
      nome: text(v.nome) || text(v.name) || nomiFasi.get(text(v.phase_id)) || "Lavorazione non identificata",
      percentuale: percentuale !== null && percentuale <= 100 ? percentuale : null,
      ore: number(v.ore),
      materiali,
      foto,
    };
  });
  // Un materiale legato a una fase che il rapportino non elenca (fase cancellata o non dichiarata) resta tra gli altri.
  const altriMateriali = materialiTutti.filter((m, i) => !assegnati.has(i) && !(text(m.fase_id) && idsFasi.has(text(m.fase_id)))).map(materiale);
  return {
    fasi,
    altriMateriali,
    altreFoto: tutteLeFoto.filter(u => !usate.has(u)),
    totaleMateriali: materialiTutti.length,
    totaleFoto: tutteLeFoto.length,
  };
}

/** Bianco o inchiostro, quello che si legge meglio sul colore dato (contrasto WCAG). */
export function inchiostroSu(hex: number): "white" | "ink" {
  const canale = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const luminanza = 0.2126 * canale((hex >> 16) & 255) + 0.7152 * canale((hex >> 8) & 255) + 0.0722 * canale(hex & 255);
  // Contrasto col bianco: 1.05 / (L + 0.05); con l'inchiostro scuro (L ≈ 0.02): (L + 0.05) / 0.07.
  return 1.05 / (luminanza + 0.05) >= (luminanza + 0.05) / 0.07 ? "white" : "ink";
}

/** Ora italiana «07:30» di un istante. */
export function oraBreve(value: unknown): string {
  const date = new Date(text(value));
  return Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
}

/** Ore come si dicono in cantiere: «8 h», «7 h 30». */
export function oreBrevi(value: unknown): string {
  const n = number(value);
  if (n === null) return "-";
  const minuti = Math.round(n * 60);
  return `${Math.floor(minuti / 60)} h${minuti % 60 ? ` ${String(minuti % 60).padStart(2, "0")}` : ""}`;
}
