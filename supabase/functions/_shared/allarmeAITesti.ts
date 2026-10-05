/**
 * allarmeAITesti — le parole degli avvisi sul credito AI: cosa è successo,
 * cosa si ferma, cosa fare. Logica pura (niente Deno, niente rete): la usano il
 * controllo del canarino, il rapporto del mattino e i test.
 *
 * Il titolare deve capire dall'oggetto dell'email, senza aprirla, se è urgente
 * e di cosa si tratta: «URGENTE — OpenRouter: credito esaurito, l'AI è ferma».
 * Il credito che cala ma non è ancora finito NON è «urgente»: è un avviso
 * normale, e così resta distinguibile.
 */
import type { MotivoAllarmeAnche, ProviderAI } from "./allarmeAIClassifica.ts";

export interface RigaAllarme {
  id: string;
  provider: ProviderAI | string;
  motivo: MotivoAllarmeAnche | string;
  aperto_il: string;
  ultima_vista: string;
  /** Chiamate fallite viste dall'allarme: «almeno», perché i conteggi sono per isolate. */
  conteggio: number;
  funzioni: Record<string, number> | null;
  modelli: Record<string, number> | null;
  /** Id delle aziende colpite (al massimo 200). */
  aziende: string[] | null;
  ultimo_dettaglio: string | null;
  /** Dopo la presa in carico: 1 = è la prima email, 2 = il primo promemoria… */
  notifiche_inviate: number;
  chiuso_il?: string | null;
}

export interface ContestoAvviso {
  adesso: Date;
  /** La richiesta di prova fatta dal controllo (solo OpenRouter). */
  sonda?: { ok: boolean; stato: number | null; dettaglio: string | null } | null;
  /** Il saldo del conto, se il controllo ha la chiave management. */
  saldo?: { disponibile_usd: number | null; usato_usd: number | null; fonte: "conto" | "chiave" | null } | null;
  /** Quanto si spende al giorno, dalle letture del saldo (può mancare). */
  consumoGiornalieroUsd?: number | null;
  /** La soglia sotto cui il credito si dice «in calo». */
  sogliaUsd?: number | null;
}

export interface Avviso {
  oggetto: string;
  sommario: string;
  dettagli: Array<[string, string]>;
  url: string;
  urlLabel: string;
  campanella: { titolo: string; testo: string; url: string };
}

interface InfoProvider {
  nome: string;
  ricarica: string;
  chiavi: string;
  segreto: string;
  cosaSiFerma: string;
}

const PROVIDER: Record<string, InfoProvider> = {
  openrouter: {
    nome: "OpenRouter",
    ricarica: "https://openrouter.ai/settings/credits",
    chiavi: "https://openrouter.ai/settings/keys",
    segreto: "OPENROUTER_API_KEY",
    cosaSiFerma:
      "Silvio, le email intelligenti, i riassunti, i preventivi con l'AI e la lettura dei PDF non rispondono (o ripiegano su un modello più debole) per tutte le aziende",
  },
  openai: {
    nome: "OpenAI",
    ricarica: "https://platform.openai.com/settings/organization/billing/overview",
    chiavi: "https://platform.openai.com/api-keys",
    segreto: "OPENAI_API_KEY",
    cosaSiFerma:
      "i render e le immagini dal provider diretto non partono più: passano al ripiego su OpenRouter, che costa di più",
  },
  anthropic: {
    nome: "Anthropic",
    ricarica: "https://console.anthropic.com/settings/billing",
    chiavi: "https://console.anthropic.com/settings/keys",
    segreto: "ANTHROPIC_API_KEY",
    cosaSiFerma: "le funzioni che chiamano Claude direttamente non rispondono",
  },
};

const info = (provider: string): InfoProvider =>
  PROVIDER[provider] ?? {
    nome: provider,
    ricarica: "",
    chiavi: "",
    segreto: "la chiave del provider",
    cosaSiFerma: "le funzioni che lo usano non rispondono",
  };

const MINUTO = 60_000;
const ORA = 60 * MINUTO;
const GIORNO = 24 * ORA;

/** «meno di un minuto», «12 minuti», «3 ore e 12 minuti», «2 giorni e 4 ore». */
export function durataLeggibile(ms: number): string {
  if (!Number.isFinite(ms) || ms < MINUTO) return "meno di un minuto";
  const giorni = Math.floor(ms / GIORNO);
  const ore = Math.floor((ms % GIORNO) / ORA);
  const minuti = Math.floor((ms % ORA) / MINUTO);
  const pezzo = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`;
  if (giorni > 0) return ore > 0 ? `${pezzo(giorni, "giorno", "giorni")} e ${pezzo(ore, "ora", "ore")}` : pezzo(giorni, "giorno", "giorni");
  if (ore > 0) return minuti > 0 ? `${pezzo(ore, "ora", "ore")} e ${pezzo(minuti, "minuto", "minuti")}` : pezzo(ore, "ora", "ore");
  return pezzo(minuti, "minuto", "minuti");
}

/** «3 ott, 03:12», sempre all'ora di Roma: il titolare legge l'ora di Roma, non quella del server. */
export function oraDiRoma(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const SONO_FINTE = new Set(["sonda", "saldo"]);

/** «persona_silvio (212), email_compose (40)» — i più colpiti, senza le righe finte della sonda. */
export function piuColpiti(conteggi: Record<string, number> | null | undefined, quanti = 5): string {
  return Object.entries(conteggi ?? {})
    .filter(([nome]) => !SONO_FINTE.has(nome))
    .sort((a, b) => b[1] - a[1])
    .slice(0, quanti)
    .map(([nome, n]) => `${nome} (${n})`)
    .join(", ");
}

const tronca = (testo: string, max: number) => (testo.length > max ? `${testo.slice(0, max - 1)}…` : testo);
const usd = (n: number) => `${n.toFixed(2).replace(".", ",")} $`;

function etichettaMotivo(riga: RigaAllarme): string {
  const nome = info(String(riga.provider)).nome;
  switch (riga.motivo) {
    case "credito_esaurito": return `credito ${nome} esaurito`;
    case "credito_basso": return `credito ${nome} in calo`;
    case "chiave_non_valida": return `${nome} rifiuta la chiave`;
    case "limite_chiave": return `chiave ${nome} al tetto di spesa`;
    default: return `${nome}: ${riga.motivo}`;
  }
}

/** Una riga per il rapporto del mattino: ciò che è ancora aperto, da quando e quanto ha fatto. */
export function righeAllarmeAperto(riga: RigaAllarme, adesso: Date): Record<string, unknown> {
  const p = info(String(riga.provider));
  return {
    problema: `${etichettaMotivo(riga)}: ${riga.motivo === "credito_esaurito" ? "l'AI è ferma finché non si ricarica" : "da sistemare"}`,
    da: `${oraDiRoma(riga.aperto_il)} (${durataLeggibile(adesso.getTime() - Date.parse(riga.aperto_il))} fa)`,
    // Per «credito in calo» il conteggio sono le letture del saldo ogni 5 minuti, non chiamate fallite.
    ...(riga.motivo === "credito_basso" ? {} : { chiamate_fallite: `almeno ${riga.conteggio}` }),
    ...(piuColpiti(riga.funzioni, 3) ? { funzioni: piuColpiti(riga.funzioni, 3) } : {}),
    ...(riga.motivo === "chiave_non_valida" || riga.motivo === "limite_chiave"
      ? { chiavi: p.chiavi }
      : p.ricarica ? { ricarica: p.ricarica } : {}),
  };
}

function dettagliComuni(riga: RigaAllarme, adesso: Date): Array<[string, string]> {
  const righe: Array<[string, string]> = [];
  righe.push(["Da quando", `${oraDiRoma(riga.aperto_il)} (${durataLeggibile(adesso.getTime() - Date.parse(riga.aperto_il))} fa)`]);
  righe.push(["Chiamate fallite", `almeno ${riga.conteggio}`]);
  const aziende = riga.aziende?.length ?? 0;
  if (aziende > 0) righe.push(["Aziende colpite", String(aziende)]);
  const funzioni = piuColpiti(riga.funzioni);
  if (funzioni) righe.push(["Funzioni colpite", funzioni]);
  const modelli = piuColpiti(riga.modelli, 3);
  if (modelli) righe.push(["Modelli", modelli]);
  return righe;
}

/** L'avviso per un allarme aperto (la prima email, o un promemoria). */
export function componiAvviso(riga: RigaAllarme, ctx: ContestoAvviso): Avviso {
  const p = info(String(riga.provider));
  const promemoria = riga.notifiche_inviate > 1;
  const durata = durataLeggibile(ctx.adesso.getTime() - Date.parse(riga.aperto_il));
  const dettagli: Array<[string, string]> = [];
  let oggetto: string;
  let sommario: string;
  let url = p.ricarica;
  let urlLabel = `Ricarica ${p.nome}`;

  if (riga.motivo === "credito_esaurito") {
    oggetto = promemoria
      ? `PROMEMORIA — ${p.nome}: credito ancora esaurito da ${durata}`
      : `URGENTE — ${p.nome}: credito esaurito, l'AI è ferma`;
    sommario = `Il conto ${p.nome} non ha più credito: ${p.cosaSiFerma}. Non si sistema da solo: va ricaricato.`;
    dettagli.push(["Motivo", "Credito esaurito"]);
    dettagli.push(...dettagliComuni(riga, ctx.adesso));
  } else if (riga.motivo === "credito_basso") {
    const saldo = ctx.saldo?.disponibile_usd;
    const giorni = saldo != null && ctx.consumoGiornalieroUsd && ctx.consumoGiornalieroUsd > 0
      ? Math.max(0, Math.floor(saldo / ctx.consumoGiornalieroUsd))
      : null;
    oggetto = saldo != null
      ? `Credito ${p.nome} in calo: restano ${usd(saldo)}${giorni != null ? ` (circa ${giorni} ${giorni === 1 ? "giorno" : "giorni"})` : ""}`
      : `Credito ${p.nome} in calo`;
    sommario = `Il credito di ${p.nome} è sotto ${ctx.sogliaUsd != null ? usd(ctx.sogliaUsd) : "la soglia"}. Finché non finisce l'AI funziona; quando finisce si ferma per tutte le aziende. Meglio ricaricare adesso.`;
    dettagli.push(["Motivo", "Credito in calo"]);
    if (saldo != null) dettagli.push(["Saldo", usd(saldo)]);
    if (ctx.sogliaUsd != null) dettagli.push(["Soglia di avviso", usd(ctx.sogliaUsd)]);
    if (ctx.consumoGiornalieroUsd && ctx.consumoGiornalieroUsd > 0) {
      dettagli.push(["Consumo medio", `${usd(ctx.consumoGiornalieroUsd)} al giorno`]);
    }
    if (giorni != null) dettagli.push(["Basta ancora per", `circa ${giorni} ${giorni === 1 ? "giorno" : "giorni"}`]);
  } else if (riga.motivo === "chiave_non_valida") {
    oggetto = promemoria
      ? `PROMEMORIA — ${p.nome} rifiuta ancora la chiave della piattaforma (da ${durata})`
      : `URGENTE — ${p.nome} rifiuta la chiave della piattaforma`;
    sommario = `${p.nome} rifiuta la chiave ${p.segreto}: è stata revocata, disattivata o non è più quella giusta. ${p.cosaSiFerma.charAt(0).toUpperCase()}${p.cosaSiFerma.slice(1)}.`;
    url = p.chiavi;
    urlLabel = `Controlla le chiavi ${p.nome}`;
    dettagli.push(["Motivo", "Chiave non valida"]);
    dettagli.push(...dettagliComuni(riga, ctx.adesso));
    dettagli.push(["Cosa fare", `Crea o riattiva la chiave e aggiorna ${p.segreto} nei secrets di Supabase (Edge Functions → Secrets).`]);
  } else {
    oggetto = promemoria
      ? `PROMEMORIA — La chiave ${p.nome} è ancora al tetto di spesa (da ${durata})`
      : `URGENTE — La chiave ${p.nome} ha raggiunto il suo tetto di spesa`;
    sommario = `Il conto ${p.nome} ha credito, ma la chiave usata dalla piattaforma ha toccato il limite che le hai dato. Finché non lo alzi, ${p.cosaSiFerma}.`;
    url = p.chiavi;
    urlLabel = `Alza il limite della chiave ${p.nome}`;
    dettagli.push(["Motivo", "Tetto di spesa della chiave raggiunto"]);
    dettagli.push(...dettagliComuni(riga, ctx.adesso));
  }

  if (riga.motivo !== "credito_basso") {
    if (riga.ultimo_dettaglio) dettagli.push(["Ultimo errore", tronca(riga.ultimo_dettaglio, 260)]);
    if (ctx.sonda) {
      dettagli.push([
        "Prova di adesso",
        ctx.sonda.ok
          ? "riuscita: il provider risponde"
          : `rifiutata${ctx.sonda.stato ? ` (${ctx.sonda.stato})` : ""}${ctx.sonda.dettaglio ? ` — ${tronca(ctx.sonda.dettaglio, 160)}` : ""}`,
      ]);
    }
  }
  if (String(riga.provider) === "openrouter") {
    const s = ctx.saldo;
    if (s?.disponibile_usd != null && riga.motivo !== "credito_basso") {
      dettagli.push(["Saldo", `${usd(s.disponibile_usd)}${s.fonte === "chiave" ? " (tetto della chiave)" : ""}`]);
    } else if (s == null || (s.disponibile_usd == null && riga.motivo !== "credito_basso")) {
      dettagli.push([
        "Saldo",
        "non leggibile: per saperlo (e per essere avvisato PRIMA che finisca) serve una chiave management su openrouter.ai/settings/keys, salvata come OPENROUTER_MANAGEMENT_KEY",
      ]);
    }
  }
  if (promemoria) dettagli.push(["Avviso numero", String(riga.notifiche_inviate)]);

  return {
    oggetto,
    sommario,
    dettagli,
    url,
    urlLabel,
    campanella: {
      titolo: oggetto.replace(/^(URGENTE|PROMEMORIA) — /, ""),
      testo: tronca(sommario, 220),
      url: "/admin/ai?section=monitor",
    },
  };
}

/** L'avviso «è tornato tutto a posto», con quanto è durato e quanto ha fatto. */
export function componiRipristino(riga: RigaAllarme, ctx: ContestoAvviso): Avviso {
  const p = info(String(riga.provider));
  const fine = riga.chiuso_il ? Date.parse(riga.chiuso_il) : ctx.adesso.getTime();
  const durata = durataLeggibile(fine - Date.parse(riga.aperto_il));
  const dettagli: Array<[string, string]> = [
    ["Cosa era", etichettaMotivo(riga).replace(/^./, (c) => c.toUpperCase())],
    ["Dalle", oraDiRoma(riga.aperto_il)],
    ["Fino alle", oraDiRoma(new Date(fine))],
    ["Durata", durata],
    ["Chiamate fallite", `almeno ${riga.conteggio}`],
  ];
  const aziende = riga.aziende?.length ?? 0;
  if (aziende > 0) dettagli.push(["Aziende colpite", String(aziende)]);
  const funzioni = piuColpiti(riga.funzioni);
  if (funzioni) dettagli.push(["Funzioni colpite", funzioni]);
  if (ctx.sonda?.ok) dettagli.push(["Prova di adesso", "riuscita: il provider risponde"]);

  const oggetto = `Risolto — ${p.nome} risponde di nuovo`;
  const sommario = `${p.nome} è tornato a rispondere. Il blocco è durato ${durata}. Le chiamate fallite in quel periodo non sono state rifatte: gli utenti che hanno visto un errore devono riprovare.`;
  return {
    oggetto,
    sommario,
    dettagli,
    url: "/admin/ai?section=monitor",
    urlLabel: "Apri il monitor AI",
    campanella: { titolo: oggetto.replace(/^Risolto — /, "Risolto: "), testo: tronca(sommario, 220), url: "/admin/ai?section=monitor" },
  };
}
