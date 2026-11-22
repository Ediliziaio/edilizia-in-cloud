import { PAVIMENTI_STANZA } from "./finiture.ts";
import { DESTINAZIONI, type Destinazione, type Origine } from "./modello.ts";
import { validaAlternative, type AlternativaFrazionamento } from "./assistenzaStudio.ts";

export type ModificaAmbiente = { ambienteId?: string } & (
  | { tipo: "rinomina"; valore: string }
  | { tipo: "destinazione"; valore: Destinazione }
  | { tipo: "pavimento"; valore: string }
  | { tipo: "unita"; valore: string }
  | { tipo: "tramezzo"; valore: string });

export interface RispostaChatProgetto {
  testo: string;
  nomeVariante?: string;
  modifiche: ModificaAmbiente[];
}

export interface ContestoAmbienteChat {
  piano: string;
  ambiente: {
    nome: string;
    destinazione: Destinazione;
    superficieMq: number;
    superficieTavolaMq?: number;
    origineSuperficie: Origine;
    altezzaCm: number;
    origineAltezza: Origine;
    unita?: string;
    pavimento?: string;
  };
  alternative: AlternativaFrazionamento[];
}

export interface ContestoChatProgetto extends ContestoAmbienteChat {
  stato: string;
  altriAmbienti?: Array<ContestoAmbienteChat & {id:string}>;
}

export interface MessaggioChatProgetto {
  ruolo: "utente" | "silvio";
  testo: string;
}

export const LIMITE_CHAT_PROGETTO = 800;
export const MASSIMO_AMBIENTI_CHAT = 6;
export const AMBIENTE_PRINCIPALE_CHAT = "principale";
const testo = (valore: unknown, lunghezza: number): valore is string =>
  typeof valore === "string" && !!valore.trim() && valore.length <= lunghezza;
const oggetto = (valore: unknown): valore is Record<string, unknown> =>
  !!valore && typeof valore === "object" && !Array.isArray(valore);
const misura = (valore: unknown): valore is number =>
  typeof valore === "number" && Number.isFinite(valore) && valore > 0 && valore <= 100_000;
const origine = (valore: unknown): valore is Origine =>
  valore === "stimata" || valore === "da_documento" || valore === "rilevata";

function leggiAmbiente(valore: unknown): ContestoAmbienteChat | null {
  if (!oggetto(valore) || !testo(valore.piano, 120) || !oggetto(valore.ambiente)) return null;
  const a = valore.ambiente;
  if (!testo(a.nome, 160) || !DESTINAZIONI.includes(a.destinazione as Destinazione)
    || !misura(a.superficieMq) || !origine(a.origineSuperficie) || !misura(a.altezzaCm) || !origine(a.origineAltezza)) return null;
  if (!Array.isArray(valore.alternative) || (valore.alternative.length > 0 && !validaAlternative(valore.alternative))) return null;
  return {
    piano: valore.piano,
    ambiente: {
      nome: a.nome,
      destinazione: a.destinazione as Destinazione,
      superficieMq: a.superficieMq,
      origineSuperficie: a.origineSuperficie,
      altezzaCm: a.altezzaCm,
      origineAltezza: a.origineAltezza,
      ...(misura(a.superficieTavolaMq) ? {superficieTavolaMq: a.superficieTavolaMq} : {}),
      ...(testo(a.unita, 40) ? {unita: a.unita} : {}),
      ...(testo(a.pavimento, 220) ? {pavimento: a.pavimento} : {}),
    },
    alternative: (valore.alternative as AlternativaFrazionamento[]).map(a => ({
      id: a.id, asse: a.asse, percentuali: a.percentuali, superfici: a.superfici, muriMq: a.muriMq,
    })),
  };
}

export function leggiContestoChatProgetto(valore: unknown): ContestoChatProgetto | null {
  if (!oggetto(valore) || !testo(valore.stato,120)) return null;
  const principale=leggiAmbiente(valore);
  if (!principale) return null;
  if (valore.altriAmbienti===undefined) return {...principale,stato:valore.stato};
  if (!Array.isArray(valore.altriAmbienti) || valore.altriAmbienti.length>=MASSIMO_AMBIENTI_CHAT) return null;
  const altriAmbienti: NonNullable<ContestoChatProgetto["altriAmbienti"]>=[];
  const idUsati=new Set([AMBIENTE_PRINCIPALE_CHAT]);
  for (const a of valore.altriAmbienti) {
    if (!oggetto(a) || !testo(a.id,240) || idUsati.has(a.id)) return null;
    const ambiente=leggiAmbiente(a);
    if (!ambiente) return null;
    idUsati.add(a.id);
    altriAmbienti.push({...ambiente,id:a.id});
  }
  return {...principale,stato:valore.stato,altriAmbienti};
}

export function leggiCronologiaChatProgetto(valore: unknown): MessaggioChatProgetto[] {
  if (!Array.isArray(valore)) return [];
  return valore.slice(-8).flatMap(m => oggetto(m) && (m.ruolo === "utente" || m.ruolo === "silvio")
    && testo(m.testo, 1400) ? [{ruolo: m.ruolo, testo: m.testo.trim()}] : []);
}

export function leggiRispostaChatProgetto(valore: unknown, contesto: ContestoChatProgetto): RispostaChatProgetto | null {
  const altri=contesto.altriAmbienti ?? [];
  if (!oggetto(valore) || !testo(valore.testo, 1400) || !Array.isArray(valore.modifiche) || valore.modifiche.length > 5*(altri.length+1)) return null;
  const ambienti=new Map([[AMBIENTE_PRINCIPALE_CHAT,contesto as ContestoAmbienteChat], ...altri.map(a=>[a.id,a] as const)]);
  const modifiche: ModificaAmbiente[] = [];
  for (const m of valore.modifiche) {
    if (!oggetto(m) || !testo(m.valore,80) || (m.ambienteId!==undefined && !testo(m.ambienteId,240))) return null;
    const id=m.ambienteId as string | undefined;
    if (!id && altri.length) return null;
    const ambiente=ambienti.get(id ?? AMBIENTE_PRINCIPALE_CHAT);
    if (!ambiente || modifiche.some(x=>x.tipo===m.tipo && (x.ambienteId ?? AMBIENTE_PRINCIPALE_CHAT)===(id ?? AMBIENTE_PRINCIPALE_CHAT))) return null;
    const bersaglio=id ? {ambienteId:id} : {};
    const s = m.valore.trim();
    switch (m.tipo) {
      case "rinomina":
        modifiche.push({ ...bersaglio, tipo: m.tipo, valore: s });
        break;
      case "destinazione":
        if (!DESTINAZIONI.includes(s as Destinazione)) return null;
        modifiche.push({ ...bersaglio, tipo: m.tipo, valore: s as Destinazione });
        break;
      case "pavimento":
        if (!PAVIMENTI_STANZA.some(p => p.id === s)) return null;
        modifiche.push({ ...bersaglio, tipo: m.tipo, valore: s });
        break;
      case "unita":
        if (s.length > 40) return null;
        modifiche.push({ ...bersaglio, tipo: m.tipo, valore: s });
        break;
      case "tramezzo":
        if (!ambiente.alternative.some(a => a.id === s)) return null;
        modifiche.push({ ...bersaglio, tipo: m.tipo, valore: s });
        break;
      default:
        return null;
    }
  }
  return {
    testo: valore.testo.trim(), modifiche,
    ...(testo(valore.nomeVariante, 100) ? {nomeVariante: valore.nomeVariante.trim()} : {}),
  };
}
