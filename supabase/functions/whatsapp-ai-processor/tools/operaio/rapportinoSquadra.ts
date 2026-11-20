import type { ToolCtx } from "../shared/types.ts";
import { oggiARoma } from "../shared/cantieriAperti.ts";

export interface OrePersona { nome: string; ore: number }
interface Membro {
  employee_id?: string | null;
  nome: string;
  sono_io?: boolean;
  rapportino_inviato?: boolean;
  gia_registrato_da_altri?: boolean;
}
interface Contesto {
  persone: Membro[];
  solo_ore: boolean;
  solo_timbratura: boolean;
  giorni_indietro: number;
}
export interface Presenza { employee_id: string; nome: string; ore: number }

const normalizza = (testo: string) => testo.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

export function normalizzaPresenze(richieste: OrePersona[], persone: Membro[]): Presenza[] {
  const presenze: Presenza[] = [];
  for (const richiesta of richieste) {
    if (!richiesta || typeof richiesta.nome !== "string" || typeof richiesta.ore !== "number" ||
      !Number.isFinite(richiesta.ore) || richiesta.ore < 0 || richiesta.ore > 24) {
      throw new Error("Indica le ore di ogni persona, con un valore da 0 a 24.");
    }
    const nome = normalizza(richiesta.nome);
    const corrispondenze = persone.filter(p => p.employee_id && (["io", "me", "me stesso"].includes(nome)
      ? p.sono_io : nome && nome.split(" ").every(token => normalizza(p.nome).split(" ").includes(token))));
    if (corrispondenze.length !== 1) throw new Error(corrispondenze.length
      ? `Quale ${richiesta.nome}? Scrivi nome e cognome.` : `Non trovo ${richiesta.nome} fra le persone che puoi registrare per questa commessa.`);
    const persona = corrispondenze[0];
    if (persona.rapportino_inviato || persona.gia_registrato_da_altri) {
      throw new Error(`${persona.nome} risulta già registrato per questo giorno. Verifica con l’ufficio prima di inserire altre ore.`);
    }
    if (presenze.some(p => p.employee_id === persona.employee_id)) throw new Error(`Indica un solo totale per ${persona.nome}.`);
    presenze.push({ employee_id: persona.employee_id!, nome: persona.nome, ore: richiesta.ore });
  }
  return presenze;
}

export function giornoRapportinoWhatsapp(data: string | undefined, istante: Date, ieri = false): string {
  if (data && data !== "oggi" && data !== "ieri") {
    const d = new Date(`${data}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data) {
      throw new Error("Indica una data di lavoro valida.");
    }
    return data;
  }
  const dataRelativa = new Date(`${oggiARoma(istante)}T12:00:00Z`);
  if (data === "ieri" || (!data && ieri)) dataRelativa.setUTCDate(dataRelativa.getUTCDate() - 1);
  return dataRelativa.toISOString().slice(0, 10);
}

const NUMERI_ORE = ["zero", "una", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci",
  "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove", "venti",
  "ventuno", "ventidue", "ventitre", "ventiquattro"];

function orePerPersonaEsplicite(trascrizione: string, persone: OrePersona[]): boolean {
  const nomi = persone.map(p => normalizza(p.nome));
  if (nomi.some(nome => !nome) || new Set(nomi).size !== nomi.length) return false;

  const nomiAmmessi = [...nomi].sort((a, b) => b.length - a.length).join("|");
  const gruppo = `(?:${nomiAmmessi})`;
  const soggetto = new RegExp(`\\b(${gruppo}(?: e ${gruppo})*)(?: (?:ho|ha|abbiamo|hanno) (?:fatto|lavorato))?$`);
  const quantitaOre = new RegExp(`\\b(\\d{1,2}|un|${NUMERI_ORE.join("|")}) or[ae]\\b`, "g");
  // Un decimale deve restare nella stessa frase e passare dalla revisione.
  const frasi = trascrizione.replace(/(\d)[.,](?=\d)/g, "$1 virgola ").split(/[.,;!?\n]+/);
  const orePerNome = new Map<string, number>();

  for (const parte of frasi) {
    const frase = normalizza(parte);
    const quantita = [...frase.matchAll(quantitaOre)];
    if (!quantita.length) continue;
    if (quantita.length !== 1 || /\b(?:non|virgola|correggo|rettifico|anziche)\b/.test(frase)) return false;

    const [ora] = quantita;
    const nominativi = frase.slice(0, ora.index).trimEnd().match(soggetto)?.[1]?.split(" e ");
    if (!nominativi?.length) return false;
    const dopoOre = frase.slice(ora.index + ora[0].length);
    if (nominativi.length > 1 && !/\b(?:ciascun[oa]|a testa|ognuno)\b/.test(dopoOre)) return false;

    const ore = /^\d+$/.test(ora[1]) ? Number(ora[1]) : ora[1] === "un" ? 1 : NUMERI_ORE.indexOf(ora[1]);
    for (const nome of nominativi) {
      if (orePerNome.has(nome)) return false;
      orePerNome.set(nome, ore);
    }
  }

  return persone.every((persona, i) => orePerNome.get(nomi[i]) === persona.ore);
}

export function vocalePermetteBozza(ctx: ToolCtx, input: Record<string, unknown>, proposto: Record<string, unknown>,
  cantieri: { id: string; titolo: string; dettaglio: string }[]) {
  if (!ctx.user_id || !ctx.sentAt || !ctx.transcript || typeof input.cantiere_hint !== "string" || !proposto.order_id ||
    !Array.isArray(input.persone) || input.persone.length < 2 || !Array.isArray(input.attivita) || !input.attivita.length) return false;
  const testo = ` ${normalizza(ctx.transcript)} `;
  const hint = normalizza(input.cantiere_hint);
  const giorni = new Set([...testo.matchAll(/\b(oggi|ieri)\b/g)].map(m => m[1]));
  const [giorno] = giorni;
  const posti = cantieri.filter(c => ` ${normalizza(`${c.titolo} ${c.dettaglio}`)} `.includes(` ${hint} `));
  if (giorni.size !== 1 || !/\bore\b/.test(testo) || /\b(?:complessive|complessivi|in totale|in tre|in due|non ricordo|forse|poi al cantiere|ripartire)\b/.test(testo) ||
    hint.length < 3 || !testo.includes(` ${hint} `) || posti.length !== 1 || posti[0].id !== proposto.order_id ||
    giornoRapportinoWhatsapp(giorno, new Date(ctx.sentAt)) !== proposto.data_lavoro) return false;
  return orePerPersonaEsplicite(ctx.transcript, input.persone as OrePersona[]);
}

export async function verificaContestoRapportino(ctx: ToolCtx, orderId: string, giorno: string, persone?: OrePersona[]) {
  if (!ctx.user_id) {
    if (persone?.length) throw new Error("Per registrare la squadra serve un account abilitato e collegato a questo numero.");
    return { presenze: undefined, giorniIndietro: 7, soloOre: false };
  }
  const { data, error } = await ctx.supabase.rpc("whatsapp_contesto_rapportino", {
    p_company: ctx.company_id, p_user: ctx.user_id, p_order: orderId, p_day: giorno,
  });
  if (error || !data) throw new Error("Non riesco a verificare i permessi per il rapportino su questa commessa.");
  const contesto = data as Contesto;
  if (contesto.solo_timbratura) throw new Error("Per questa commessa puoi timbrare. Il rapportino è a cura del capocantiere.");
  if (persone?.length && !contesto.persone.length) throw new Error("Puoi registrare le tue ore. Il rapportino di squadra è riservato ai responsabili abilitati.");
  return {
    presenze: persone?.length ? normalizzaPresenze(persone, contesto.persone) : undefined,
    giorniIndietro: contesto.giorni_indietro,
    soloOre: contesto.solo_ore,
  };
}
