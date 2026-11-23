import { PAVIMENTI_STANZA } from "../../../shared/planimetrie/finiture";
import { puntoNelPoligono } from "../../../shared/planimetrie/geometria";
import { eAmbienteInterno, validaPlanimetria, type Elemento, type Locale, type Planimetria } from "../../../shared/planimetrie/modello";
import { modelloArredo } from "../../../shared/planimetrie/modelliArredo";

export const STILI_ARREDI = {
  lino: { nome: "Lino e rovere", tessile: "#dfd0ba", mobile: "#b88a5f" },
  salvia: { nome: "Salvia e noce", tessile: "#85917c", mobile: "#80624d" },
  terracotta: { nome: "Terracotta e sabbia", tessile: "#b77962", mobile: "#c2a88b" },
} as const;

const TESSILI = new Set(["divano", "divano_angolare", "poltrona", "letto", "letto_singolo", "letto_matrimoniale", "tappeto"]);
const MOBILI = new Set(["tavolo", "tavolo_rotondo", "armadio", "comodino", "scrivania", "libreria", "mobile_tv", "cucina", "cucina_angolare", "isola_cucina"]);
const LOCALI_UMIDI = new Set(["bagno", "lavanderia"]);

export type ModificaCasa3D =
  | { tipo: "pavimento"; campioneId: string; mantieniBagni: boolean }
  | { tipo: "arredo"; arredo: string; modello?: string | null; colore?: string | null }
  | { tipo: "stile"; stile: keyof typeof STILI_ARREDI };

export function ambientiPerModifiche3D(documento: Planimetria, ambito: string, livelloId?: string) {
  const propostaId = ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : undefined;
  return documento.livelli.filter(l => !livelloId || l.id === livelloId).map(livello => {
    const proposta = livello.proposte.find(p => p.id === propostaId);
    const stato = proposta ?? livello.fatto;
    const perId = new Map(stato.locali.map(l => [l.id, l]));
    const locali = stato.locali.filter(eAmbienteInterno);
    const arredi = stato.elementi.flatMap(elemento => {
      if (elemento.stato === "da_demolire") return [];
      const locale = (elemento.localeId && perId.get(elemento.localeId)) ||
        stato.locali.find(l => puntoNelPoligono(elemento.posizione, l.contorno));
      return locale && eAmbienteInterno(locale) ? [{ elemento, locale }] : [];
    });
    return { livello, proposta, stato, locali, arredi };
  });
}

function cambiaArredo(elemento: Elemento, modifica: Exclude<ModificaCasa3D, { tipo: "pavimento" }>): Elemento {
  let { colore, modello } = elemento;
  if (modifica.tipo === "stile") {
    const stile = STILI_ARREDI[modifica.stile];
    if (TESSILI.has(elemento.tipo)) colore = stile.tessile;
    if (MOBILI.has(elemento.tipo)) colore = stile.mobile;
  } else if (elemento.tipo === modifica.arredo) {
    if (modifica.modello === null) modello = undefined;
    else if (modifica.modello && modelloArredo(elemento.tipo, modifica.modello)) modello = modifica.modello;
    if (modifica.colore !== undefined) colore = modifica.colore ?? undefined;
  }
  return colore === elemento.colore && modello === elemento.modello ? elemento : { ...elemento, colore, modello };
}

interface AnteprimaCasa3D {
  documento: Planimetria;
  piani: { id: string; nome: string; locali: Locale[]; arredi: number }[];
  errore?: string;
}

/** Compone una sola modifica della bozza, limitata alla variante e agli ambienti interni selezionati. */
export function anteprimaModificheCasa3D(documento: Planimetria, ambito: string, modifica: ModificaCasa3D, livelloId?: string): AnteprimaCasa3D {
  const piani: AnteprimaCasa3D["piani"] = [];
  const propostaId = ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : undefined;
  const nomeProposta = propostaId && documento.livelli.flatMap(l => l.proposte).find(p => p.id === propostaId)?.nome;
  if (ambito !== "fatto" && !nomeProposta) return { documento, piani, errore: "Scegli una variante del progetto." };
  const campione = modifica.tipo === "pavimento" ? PAVIMENTI_STANZA.find(c => c.id === modifica.campioneId) : undefined;
  const aggiornati = new Map<string, Planimetria["livelli"][number]>();
  let estesa = false;
  for (const { livello, proposta, stato, locali, arredi } of ambientiPerModifiche3D(documento, ambito, livelloId)) {
    const cambiati = new Set<Locale>();
    const sostituzioni = new Map<string, Elemento>();
    const finiture = new Map<string, Locale>();
    if (modifica.tipo === "pavimento") {
      if (!campione) continue;
      for (const locale of locali) {
        const f = locale.finiture;
        if ((modifica.mantieniBagni && LOCALI_UMIDI.has(locale.destinazione)) ||
          (f?.pavimento === campione.descrizione && f.pavimentoSpecifico)) continue;
        finiture.set(locale.id, { ...locale, finiture: { ...f, pavimento: campione.descrizione, pavimentoSpecifico: true } });
        cambiati.add(locale);
      }
    } else {
      for (const { elemento, locale } of arredi) {
        const dopo = cambiaArredo(elemento, modifica);
        if (dopo === elemento) continue;
        sostituzioni.set(elemento.id, dopo);
        cambiati.add(locale);
      }
    }
    if (!cambiati.size) continue;
    const prossimo = {
      ...stato,
      locali: finiture.size ? stato.locali.map(l => finiture.get(l.id) ?? l) : stato.locali,
      elementi: sostituzioni.size ? stato.elementi.map(e => sostituzioni.get(e.id) ?? e) : stato.elementi,
    };
    if (propostaId && nomeProposta) {
      estesa ||= !proposta;
      aggiornati.set(livello.id, { ...livello, proposte: proposta
        ? livello.proposte.map(p => p === proposta ? { ...p, ...prossimo } : p)
        : [...livello.proposte, { ...prossimo, id: propostaId, nome: nomeProposta }] });
    } else {
      aggiornati.set(livello.id, { ...livello, fatto: prossimo });
    }
    piani.push({ id: livello.id, nome: livello.nome, locali: [...cambiati], arredi: sostituzioni.size });
  }
  if (!aggiornati.size) return { documento, piani };
  const dopo = { ...documento, livelli: documento.livelli.map(l => aggiornati.get(l.id) ?? l) };
  if (estesa) {
    const verifica = validaPlanimetria(dopo);
    if (verifica.ok === false) return { documento, piani: [], errore: verifica.errori[0] ?? "Impossibile estendere la variante ai piani selezionati." };
  }
  return { documento: dopo, piani };
}
