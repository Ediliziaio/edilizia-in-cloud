/**
 * Abachi della pianta (fase 2 del piano di completamento, 1/11/2026): l'elenco dei serramenti e
 * quello delle stanze, come gli abachi di AutoCAD Architecture, letti dagli oggetti del modello.
 *
 * - Serramenti: codice (P1, F1, PF1, V1 in ordine di parete e posizione), tipo, manovra, misure,
 *   stanze su cui si apre, stato dei lavori, misure stimate.
 * - Stanze: le stesse quantità del computo (`calcolaQuantita`), quindi gli stessi numeri.
 */
import type { Apertura, Locale, Planimetria, StatoPianta, TipoApertura } from "../../../shared/planimetrie/modello.ts";
import { distanzaDalContorno, facceDellApertura, TOLLERANZA_LOCALE_CM } from "../../../shared/planimetrie/geometria.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { statoPerAmbito } from "../../../shared/render-planimetria/vincoli.ts";
import { anteDi, misureOscurante, misureSerramento, NOMI_CASSONETTO, NOMI_OSCURANTE, NOMI_SISTEMA, sistemaDi } from "../../../shared/planimetrie/serramenti.ts";

export const PREFISSO_CODICE: Record<TipoApertura, string> = { porta: "P", finestra: "F", portafinestra: "PF", varco: "V" };
const NOME_TIPO: Record<TipoApertura, string> = { porta: "Porta", finestra: "Finestra", portafinestra: "Portafinestra", varco: "Varco" };
const NOME_MANOVRA = { battente: "Battente", scorrevole: "Scorrevole", nessuna: "—" } as const;
const NOME_STATO = { esistente: "Esistente", nuovo: "Nuovo", da_demolire: "Da demolire" } as const;

export interface RigaSerramento {
  id: string;
  codice: string;
  tipo: string;
  manovra: string;
  /** Sistema («A battente», «Scorrevole a scomparsa»…) e numero di ante (0 per i varchi). */
  sistema: string;
  ante: number;
  /** Controtelaio (cm) da ordinare e se è quello speciale per la porta a scomparsa. */
  controtelaio: { larghezza: number; altezza: number; speciale: boolean; monoblocco: boolean };
  /** Oscurante («Tapparella», «Persiana»…) e cassonetto con le misure; «—» se non ci sono. */
  oscurante: string;
  cassonetto: string;
  motore: boolean;
  /** Larghezza di un'anta, cm. */
  anta: number;
  /** cm */
  larghezza: number;
  altezza: number;
  davanzale: number;
  /** m² del vano */
  superficieMq: number;
  stanze: string;
  stato: string;
  stimata: boolean;
}

export interface RigaStanza {
  id: string;
  nome: string;
  destinazione: string;
  pavimentoMq: number;
  perimetroMl: number;
  paretiNetteMq: number;
  soffittoMq: number;
  altezzaCm: number;
  volumeMc: number;
  battiscopaMl: number;
  rivestimentoMq: number | null;
  finiture: string;
  stimata: boolean;
}

const NOMI_SISTEMA_FINALE = (a: Apertura) => NOMI_SISTEMA[sistemaDi(a)];

function controtelaioDi(a: Apertura, stato: StatoPianta): RigaSerramento["controtelaio"] {
  if (a.tipo === "varco") return { larghezza: 0, altezza: 0, speciale: false, monoblocco: false };
  const m = misureSerramento(a, stato.muri.find((x) => x.id === a.muroId));
  return { larghezza: m.controtelaio.larghezza, altezza: m.controtelaio.altezza, speciale: m.controtelaioSpeciale, monoblocco: m.controtelaioMonoblocco };
}

const cmIt = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 1 });

function descrizioneOscurante(a: Apertura): Pick<RigaSerramento, "oscurante" | "cassonetto" | "motore"> {
  const o = misureOscurante(a);
  if (!o) return { oscurante: "—", cassonetto: "—", motore: false };
  const misura = o.avvolgibile ? `${cmIt(o.telo.larghezza)} × ${cmIt(o.telo.altezza)} cm` : `${o.ante} ${o.ante === 1 ? "anta" : "ante"}`;
  const c = o.cassonetto;
  return {
    oscurante: `${NOMI_OSCURANTE[o.tipo]} ${misura}${o.motore ? " (motore)" : ""}`,
    cassonetto: c ? `${NOMI_CASSONETTO[c.tipo]} ${cmIt(c.larghezza)} × ${cmIt(c.altezza)} cm` : "—",
    motore: o.motore,
  };
}

/** Oscuranti e cassonetti da ordinare, raggruppati per descrizione (esclusi i serramenti da demolire e quelli esistenti). */
export function riepilogoOscuranti(righe: RigaSerramento[]): Array<{ descrizione: string; numero: number }> {
  const gruppi = new Map<string, number>();
  for (const r of righe) {
    if (r.stato === "Da demolire" || r.stato === "Esistente") continue;
    for (const d of [r.oscurante, r.cassonetto]) if (d !== "—") gruppi.set(d, (gruppi.get(d) ?? 0) + 1);
  }
  return [...gruppi].map(([descrizione, numero]) => ({ descrizione, numero })).sort((x, y) => x.descrizione.localeCompare(y.descrizione, "it"));
}

/** I controtelai da ordinare, raggruppati per misura (esclusi i serramenti da demolire e i varchi). */
export function riepilogoControtelai(righe: RigaSerramento[]): Array<{ descrizione: string; numero: number }> {
  const gruppi = new Map<string, number>();
  for (const r of righe) {
    if (r.controtelaio.larghezza <= 0 || r.stato === "Da demolire" || r.stato === "Esistente") continue;
    const k = `${r.controtelaio.speciale ? "Controtelaio per scorrevole a scomparsa" : r.controtelaio.monoblocco ? "Controtelaio monoblocco con cassonetto" : "Controtelaio"} ${r.controtelaio.larghezza.toLocaleString("it-IT")} × ${r.controtelaio.altezza.toLocaleString("it-IT")} cm`;
    gruppi.set(k, (gruppi.get(k) ?? 0) + 1);
  }
  return [...gruppi].map(([descrizione, numero]) => ({ descrizione, numero })).sort((x, y) => x.descrizione.localeCompare(y.descrizione, "it"));
}

/** Le stanze su cui si affaccia un'apertura (anche se da demolire, a differenza di `apertureDelLocale`). */
function stanzeDellApertura(a: Apertura, stato: StatoPianta): Locale[] {
  const muro = stato.muri.find((m) => m.id === a.muroId);
  if (!muro) return [];
  const facce = facceDellApertura(a, muro);
  return stato.locali.filter((l) => facce.some((f) => distanzaDalContorno(f, l.contorno) <= TOLLERANZA_LOCALE_CM));
}

const stimata = (o: { origine?: string; origineMisure?: Record<string, string | undefined> }) =>
  o.origine === "stimata" || Object.values(o.origineMisure ?? {}).includes("stimata");

export function abacoSerramenti(p: Planimetria, livelloId: string, ambito: string): RigaSerramento[] {
  const stato = statoPerAmbito(p, livelloId, ambito);
  if (!stato) return [];
  const ordineMuro = new Map(stato.muri.map((m, i) => [m.id, i]));
  const ordinate = [...stato.aperture].sort((a, b) =>
    (ordineMuro.get(a.muroId) ?? 0) - (ordineMuro.get(b.muroId) ?? 0) || a.offset - b.offset);
  const contatori: Record<string, number> = {};
  return ordinate.map((a) => {
    const prefisso = PREFISSO_CODICE[a.tipo] ?? "A";
    contatori[prefisso] = (contatori[prefisso] ?? 0) + 1;
    const stanze = stanzeDellApertura(a, stato).map((l) => l.nome || "Stanza");
    return {
      id: a.id,
      codice: `${prefisso}${contatori[prefisso]}`,
      tipo: NOME_TIPO[a.tipo] ?? a.tipo,
      manovra: NOME_MANOVRA[a.manovra] ?? a.manovra,
      sistema: a.tipo === "varco" ? "—" : NOMI_SISTEMA_FINALE(a),
      ante: anteDi(a),
      controtelaio: controtelaioDi(a, stato),
      ...descrizioneOscurante(a),
      anta: a.tipo === "varco" ? 0 : misureSerramento(a).anta,
      larghezza: Math.round(a.larghezza),
      altezza: Math.round(a.altezza),
      davanzale: Math.round(a.davanzale),
      superficieMq: Math.round((a.larghezza * a.altezza) / 100) / 100,
      stanze: stanze.length ? stanze.join(" / ") : "—",
      stato: NOME_STATO[a.stato] ?? a.stato,
      stimata: stimata(a),
    };
  });
}

export function abacoStanze(p: Planimetria, livelloId: string, ambito: string): RigaStanza[] {
  const stato = statoPerAmbito(p, livelloId, ambito);
  if (!stato) return [];
  const q = calcolaQuantita(p);
  const val = (localeId: string, misura: string) => q[`${ambito}:locale:${localeId}.${misura}`]?.valore;
  const r2 = (v: number | undefined) => Math.round((v ?? 0) * 100) / 100;
  return stato.locali.map((l) => {
    const riv = val(l.id, "rivestimento_mq");
    const finiture = [
      l.finiture?.pavimento && `Pavimento: ${l.finiture.pavimento}`,
      l.finiture?.pareti && `Pareti: ${l.finiture.pareti}`,
      l.finiture?.soffitto && `Soffitto: ${l.finiture.soffitto}`,
      l.finiture?.rivestimento && `Rivestimento${l.finiture.rivestimento.materiale ? ` ${l.finiture.rivestimento.materiale}` : ""} h ${l.finiture.rivestimento.altezza} cm`,
    ].filter(Boolean).join(" · ");
    return {
      id: l.id,
      nome: l.nome || "Stanza",
      destinazione: l.destinazione,
      pavimentoMq: r2(val(l.id, "pavimento_mq")),
      perimetroMl: r2(val(l.id, "perimetro_ml")),
      paretiNetteMq: r2(val(l.id, "pareti_nette_mq")),
      soffittoMq: r2(val(l.id, "soffitto_mq")),
      altezzaCm: Math.round(l.altezza),
      volumeMc: r2(val(l.id, "volume_mc")),
      battiscopaMl: r2(val(l.id, "battiscopa_ml")),
      rivestimentoMq: riv == null ? null : r2(riv),
      finiture: finiture || "—",
      stimata: stimata(l),
    };
  });
}

/** CSV per Excel italiano: punto e virgola, virgola decimale, BOM per gli accenti. */
export function inCsv(intestazioni: string[], righe: Array<Array<string | number | null>>): string {
  const cella = (v: string | number | null) => {
    if (v == null) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [intestazioni, ...righe].map((r) => r.map(cella).join(";")).join("\r\n");
}

export function csvSerramenti(righe: RigaSerramento[]): string {
  return inCsv(
    ["Codice", "Tipo", "Sistema", "Ante", "Larghezza cm", "Altezza cm", "Davanzale cm", "Controtelaio L cm", "Controtelaio H cm", "Larghezza anta cm", "Superficie m²", "Oscurante", "Cassonetto", "Stanze", "Stato", "Misure"],
    righe.map((r) => [r.codice, r.tipo, r.sistema === "—" ? r.manovra : r.sistema, r.ante || null, r.larghezza, r.altezza, r.davanzale, r.controtelaio.larghezza || null, r.controtelaio.altezza || null, r.anta || null, r.superficieMq, r.oscurante === "—" ? null : r.oscurante, r.cassonetto === "—" ? null : r.cassonetto, r.stanze, r.stato, r.stimata ? "stimate" : "rilevate"]),
  );
}

export function csvStanze(righe: RigaStanza[]): string {
  return inCsv(
    ["Stanza", "Destinazione", "Pavimento m²", "Perimetro m", "Pareti nette m²", "Soffitto m²", "Altezza cm", "Volume m³", "Battiscopa m", "Rivestimento m²", "Finiture", "Misure"],
    righe.map((r) => [r.nome, r.destinazione, r.pavimentoMq, r.perimetroMl, r.paretiNetteMq, r.soffittoMq, r.altezzaCm, r.volumeMc, r.battiscopaMl, r.rivestimentoMq, r.finiture, r.stimata ? "stimate" : "rilevate"]),
  );
}
