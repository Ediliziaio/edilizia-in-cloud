/**
 * I preventivi di un cliente, di ogni tipo, e le loro righe (09/11/2026).
 *
 * Florin: «un cliente con un preventivo di un anno fa non ne vuole un altro, ma un nuovo contratto». Dal preventivo si
 * copiano le righe e basta. I preventivi classici non hanno il legame col cliente, i moduli a volte sì: si riconoscono
 * da scheda, email, codice fiscale o nome.
 */
import type { OrderItem } from "@/components/orders/OrderItemsList";
import { righePreventivoPerCommessa } from "@/lib/preventivi/prefillPreventivo";

export const MODULI_EDILI_PREVENTIVO = {
  rst: "Ristrutturazione", bgn: "Bagni", tet: "Tetti", clm: "Climatizzazione", ele: "Elettrico", idr: "Termoidraulico", pav: "Pavimenti", pis: "Piscine",
} as const;
export const NOMI_MODULI = { ...MODULI_EDILI_PREVENTIVO, sr: "Serramenti", fv: "Fotovoltaico" } as const;
export type ModuloPreventivo = keyof typeof NOMI_MODULI;
const eModulo = (v: string): v is ModuloPreventivo => v in NOMI_MODULI;

export interface PreventivoDelCliente { valore: string; etichetta: string; data: string }
export interface ClientePerRicerca { id: string; email?: string | null; fiscal_code?: string | null; business_name?: string | null; first_name?: string | null; last_name?: string | null }

type Riga = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const testo = (v: unknown): string => String(v ?? "").trim();
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const tra = (v: string): string => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const giorno = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("it-IT"); };

/** Il filtro «è questo cliente»: una lettura sola per tabella, non una per ogni dato. */
export function filtroCliente(c: ClientePerRicerca): string {
  const nome = testo(c.first_name);
  const cognome = testo(c.last_name);
  return [
    `cliente_id.eq.${c.id}`,
    testo(c.email) && `cliente_email.eq.${tra(testo(c.email))}`,
    testo(c.fiscal_code) && `cliente_codice_fiscale.eq.${tra(testo(c.fiscal_code))}`,
    testo(c.business_name) && `cliente_ragione_sociale.eq.${tra(testo(c.business_name))}`,
    nome && cognome && `and(cliente_nome.eq.${tra(nome)},cliente_cognome.eq.${tra(cognome)})`,
  ].filter(Boolean).join(",");
}

const COLONNE_MODULO: Record<ModuloPreventivo, string> = Object.fromEntries((Object.keys(NOMI_MODULI) as ModuloPreventivo[]).map((m) => [m,
  m === "fv" ? "id, numero, titolo, created_at" : m === "sr" ? "id, code, intervento_titolo, tipo_intervento, created_at" : "id, code, tipo_intervento, created_at"])) as Record<ModuloPreventivo, string>;

function etichetta(tipo: string, codice: unknown, titolo: unknown, data: string): string {
  return [tipo, testo(codice), testo(titolo), giorno(data)].filter(Boolean).join(" · ");
}

export async function cercaPreventiviDelCliente(db: Db, companyId: string, cliente: ClientePerRicerca, nomeVisto: string): Promise<PreventivoDelCliente[]> {
  const classici = () => db.from("quotes").select("id, quote_number, title, created_at").eq("company_id", companyId).is("deleted_at", null).order("created_at", { ascending: false }).limit(20);
  const nomi = [...new Set([cliente.business_name, [cliente.first_name, cliente.last_name].filter(Boolean).join(" "), nomeVisto].map(testo).filter(Boolean))];
  const filtro = filtroCliente(cliente);
  const moduli = Object.keys(NOMI_MODULI) as ModuloPreventivo[];
  const [letture, deiModuli] = await Promise.all([
    Promise.all([
      ...(testo(cliente.email) ? [classici().eq("client_email", testo(cliente.email))] : []),
      ...(testo(cliente.fiscal_code) ? [classici().eq("client_fiscal_code", testo(cliente.fiscal_code))] : []),
      ...nomi.map((n) => classici().eq("client_name", n)),
    ]),
    // Un modulo che non si può leggere (permessi, piano) si salta: gli altri restano.
    Promise.all(moduli.map(async (m) => {
      try {
        const { data, error } = await db.from(`${m}_progetti`).select(COLONNE_MODULO[m]).eq("company_id", companyId).is("deleted_at", null).or(filtro).order("created_at", { ascending: false }).limit(20);
        return error ? [] : ((data ?? []) as Riga[]).map((p): PreventivoDelCliente => ({
          valore: `modulo:${m}:${testo(p.id)}`, data: testo(p.created_at),
          etichetta: etichetta(NOMI_MODULI[m], p.code ?? p.numero, p.titolo ?? p.intervento_titolo ?? p.tipo_intervento, testo(p.created_at)),
        }));
      } catch { return []; }
    })),
  ]);
  const uno = new Map<string, PreventivoDelCliente>();
  for (const l of letture as Array<{ data?: Riga[] | null }>) for (const q of l.data ?? []) {
    uno.set(testo(q.id), { valore: `preventivo:${testo(q.id)}`, data: testo(q.created_at), etichetta: etichetta("Preventivo", q.quote_number, q.title, testo(q.created_at)) });
  }
  return [...uno.values(), ...deiModuli.flat()].sort((a, b) => b.data.localeCompare(a.data));
}

const rigaBase = (position: number, r: Partial<OrderItem> & { name: string }): OrderItem => ({ quantity: 1, status: "da_ordinare", position, ...r });

/** Le voci del computo di un preventivo edile. Le voci facoltative non erano nel prezzo: non si riprendono. */
export function righeDaComputo(voci: ReadonlyArray<Riga>): OrderItem[] {
  return voci.filter((v) => v.opzionale !== true && testo(v.descrizione)).map((v, i) => rigaBase(i, {
    name: testo(v.descrizione), description: testo(v.descrizione_estesa) || undefined, quantity: num(v.quantita) || 1, unit_price: num(v.prezzo_unitario),
    discount_percent: num(v.sconto_pct), unita_misura: testo(v.unita_misura) || null, categoria: testo(v.capitolo_nome) || null,
  }));
}

export function righeDaSerramenti(voci: ReadonlyArray<Riga>): OrderItem[] {
  return voci.map((v, i) => {
    const quantity = num(v.quantita) || 1;
    const misure = num(v.larghezza_mm) && num(v.altezza_mm) ? `${num(v.larghezza_mm)} x ${num(v.altezza_mm)} mm` : "";
    return rigaBase(i, {
      name: testo(v.tipologia_label) || testo(v.tipologia) || "Serramento", description: [testo(v.ambiente), testo(v.materiale), testo(v.serie), misure].filter(Boolean).join(" · ") || undefined,
      quantity, unit_price: num(v.prezzo_unitario) || num(v.prezzo_totale) / quantity, unita_misura: "cad", categoria: "Serramenti",
    });
  });
}

export function righeDaFotovoltaico(voci: ReadonlyArray<Riga>): OrderItem[] {
  return voci.map((v, i) => rigaBase(i, {
    name: testo(v.descrizione) || [testo(v.marca), testo(v.modello)].filter(Boolean).join(" ") || "Componente", quantity: num(v.quantita) || 1,
    unit_price: num(v.prezzo_unitario_vendita), unita_misura: testo(v.unita_misura) || null, categoria: testo(v.categoria) || "Fotovoltaico",
  }));
}

/** Le righe di un preventivo scelto. `fonte` è il valore della tendina: «preventivo:id» o «modulo:rst:id». */
export async function righeDelPreventivo(db: Db, companyId: string, fonte: string): Promise<OrderItem[]> {
  const [tipo, a, b] = fonte.split(":");
  if (tipo === "preventivo") {
    const { data: q, error: e } = await db.from("quotes").select("id").eq("id", a).eq("company_id", companyId).maybeSingle();
    if (e || !q) throw new Error("Preventivo non trovato");
    const { data, error } = await db.from("quote_items").select("*").eq("quote_id", a).order("sort_order", { ascending: true });
    if (error) throw error;
    return righePreventivoPerCommessa((data ?? []) as Riga[]);
  }
  if (tipo !== "modulo" || !eModulo(a)) throw new Error("Preventivo non riconosciuto");
  // Il preventivo dev'essere di questa azienda: lo si controlla prima di leggere le voci.
  const { data: p, error: e } = await db.from(`${a}_progetti`).select("id").eq("id", b).eq("company_id", companyId).maybeSingle();
  if (e || !p) throw new Error("Preventivo non trovato");
  const lettura = a === "fv" ? db.from("fv_componenti_progetto").select("*").eq("progetto_id", b).order("ordinamento", { ascending: true })
    : a === "sr" ? db.from("sr_serramenti_progetto").select("*").eq("progetto_id", b).order("position", { ascending: true })
      : db.from(`${a}_computo_voci`).select("*").eq("progetto_id", b).order("ordine", { ascending: true });
  const { data, error } = await lettura;
  if (error) throw error;
  const voci = (data ?? []) as Riga[];
  return a === "fv" ? righeDaFotovoltaico(voci) : a === "sr" ? righeDaSerramenti(voci) : righeDaComputo(voci);
}
