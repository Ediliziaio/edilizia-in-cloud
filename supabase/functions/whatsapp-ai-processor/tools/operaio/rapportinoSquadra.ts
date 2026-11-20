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
