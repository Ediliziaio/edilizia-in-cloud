/** Dati verificabili della fornitura. Nessun documento decide azioni o prezzi. */
export const CAMPI_TESTO_BOLLETTA = [
  "intestatario",
  "codice_fiscale",
  "partita_iva",
  "pod",
  "fornitore",
  "indirizzo_fornitura",
  "uso",
  "periodo_dal",
  "periodo_al",
  "tipo_lettura",
] as const;
export const CAMPI_NUMERO_BOLLETTA = [
  "potenza_impegnata_kw",
  "potenza_disponibile_kw",
  "potenza_massima_kw",
  "consumo_periodo_kwh",
  "consumo_annuo_kwh",
  "f1_kwh",
  "f2_kwh",
  "f3_kwh",
  "totale_da_pagare",
  "spesa_fornitura",
  "quote_fisse",
  "quote_consumi",
  "quote_potenza",
  "imposte",
  "iva",
  "spesa_annua",
  "canone_tv",
  "depositi",
  "arretrati",
  "conguagli",
  "bonus",
  "crediti",
] as const;
export type CampoBollettaFv =
  | typeof CAMPI_TESTO_BOLLETTA[number]
  | typeof CAMPI_NUMERO_BOLLETTA[number];
export type DatiBollettaFv =
  & Record<typeof CAMPI_TESTO_BOLLETTA[number], string | null>
  & Record<typeof CAMPI_NUMERO_BOLLETTA[number], number | null>
  & {
    storico_mensile: Array<{ mese: string; kwh: number }>;
    pagine: Partial<Record<CampoBollettaFv, number>>;
    avvisi: string[];
    rettifica: boolean;
  };
export type DocumentoBollettaFv = {
  id: string;
  hash: string;
  nome: string;
  path: string;
  mime: string;
  dati: DatiBollettaFv;
  estratti: DatiBollettaFv;
  confermato: boolean;
  pagine_totali: number;
  pagine_non_lette: number[];
  metodo: "testo" | "ai";
};
export type ProfiloOrarioFv = {
  tipo: "residenziale" | "azienda";
  giorni: number[];
  oraInizio: number;
  oraFine: number;
  quotaFuoriOrario: number;
  pesiMensili: number[];
  aumentoConsumiPct: number;
};
export type AnalisiConsumiFv = {
  versione: 1;
  documenti: DocumentoBollettaFv[];
  lettureAcquisite?: Record<string, string>;
  podSelezionato: string;
  proiezioneConfermata: boolean;
  correzioni: {
    consumoAnnuo?: number;
    spesaAnnua?: number;
    costiFissiAnnui?: number;
    costiEvitabiliAnnui?: number;
  };
  profilo: ProfiloOrarioFv;
  obiettivo: "spesa" | "autoconsumo" | "copertura";
  coperturaObiettivo: number;
  correzioniPerPod?: Record<string, AnalisiConsumiFv["correzioni"]>;
  consumiAggiuntivi?: Array<{ id: string; nome: string; kwhAnnui: number }>;
  prezzoImmissione: number;
  scenario?: "contenuta" | "consigliata" | "accumulo" | "massima";
};
export const profiloInizialeFv = (azienda = false): ProfiloOrarioFv => ({
  tipo: azienda ? "azienda" : "residenziale",
  giorni: azienda ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
  oraInizio: azienda ? 8 : 7,
  oraFine: azienda ? 18 : 23,
  quotaFuoriOrario: azienda ? .12 : .3,
  pesiMensili: Array(12).fill(1),
  aumentoConsumiPct: 0,
});
export const analisiConsumiIniziale = (azienda = false): AnalisiConsumiFv => ({
  versione: 1,
  documenti: [],
  podSelezionato: "",
  proiezioneConfermata: false,
  correzioni: {},
  profilo: profiloInizialeFv(azienda),
  obiettivo: "spesa",
  coperturaObiettivo: .8,
  prezzoImmissione: 0,
});
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const numero = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export function datiBollettaVuoti(): DatiBollettaFv {
  return {
    intestatario: null,
    codice_fiscale: null,
    partita_iva: null,
    pod: null,
    fornitore: null,
    indirizzo_fornitura: null,
    uso: null,
    periodo_dal: null,
    periodo_al: null,
    tipo_lettura: null,
    potenza_impegnata_kw: null,
    potenza_disponibile_kw: null,
    potenza_massima_kw: null,
    consumo_periodo_kwh: null,
    consumo_annuo_kwh: null,
    f1_kwh: null,
    f2_kwh: null,
    f3_kwh: null,
    totale_da_pagare: null,
    spesa_fornitura: null,
    quote_fisse: null,
    quote_consumi: null,
    quote_potenza: null,
    imposte: null,
    iva: null,
    spesa_annua: null,
    canone_tv: null,
    depositi: null,
    arretrati: null,
    conguagli: null,
    bonus: null,
    crediti: null,
    storico_mensile: [],
    pagine: {},
    avvisi: [],
    rettifica: false,
  };
}
const dataISO = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export function validaLetturaBolletta(
  raw: unknown,
  pagineTotali = 100,
): DatiBollettaFv {
  if (!record(raw)) throw Error("La lettura della bolletta non è valida.");
  const out = datiBollettaVuoti();
  for (const k of CAMPI_TESTO_BOLLETTA) {
    if (typeof raw[k] === "string") {
      out[k] = raw[k].trim().slice(0, 400) || null;
    }
  }
  if (out.pod) {
    out.pod = out.pod.replace(/\s/g, "").toUpperCase();
    if (!/^IT\d{3}E\d{8,9}$/.test(out.pod)) {
      out.avvisi.push("POD non riconosciuto: verifica il documento.");
      out.pod = null;
    }
  }
  for (const k of ["periodo_dal", "periodo_al"] as const) {
    if (out[k] && !dataISO(out[k]!)) {
      out[k] = null;
      out.avvisi.push("Periodo da verificare.");
    }
  }
  if (out.periodo_dal && out.periodo_al && out.periodo_dal > out.periodo_al) {
    out.periodo_al = null;
    out.avvisi.push("Le date del periodo non sono coerenti.");
  }
  for (const k of CAMPI_NUMERO_BOLLETTA) {
    if (numero(raw[k]) && Math.abs(raw[k]) <= 1e9) {
      if (
        raw[k] < 0 &&
        !["bonus", "crediti", "conguagli", "totale_da_pagare"].includes(k)
      ) out.avvisi.push(`${k}: valore negativo da verificare.`);
      else out[k] = raw[k];
    }
  }
  if (Array.isArray(raw.storico_mensile)) {
    for (const r of raw.storico_mensile.slice(0, 36)) {
      if (
        record(r) && typeof r.mese === "string" &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(r.mese) && numero(r.kwh) && r.kwh >= 0 &&
        r.kwh <= 1e9
      ) {
        out.storico_mensile.push({ mese: r.mese, kwh: r.kwh });
      }
    }
  }
  if (record(raw.pagine)) {
    for (const k of [...CAMPI_TESTO_BOLLETTA, ...CAMPI_NUMERO_BOLLETTA]) {
      const p = raw.pagine[k];
      if (numero(p) && Number.isInteger(p) && p >= 1 && p <= pagineTotali) {
        out.pagine[k] = p;
      }
    }
  }
  if (Array.isArray(raw.avvisi)) {
    out.avvisi.push(
      ...raw.avvisi.filter((x): x is string => typeof x === "string").slice(
        0,
        30,
      ).map((x) => x.slice(0, 400)),
    );
  }
  out.rettifica = raw.rettifica === true;
  return out;
}
/** Solo etichette esplicite e univoche: non somma numeri trovati vicino a una tabella. */
export function leggiBollettaDeterministica(
  pagine: Array<{ page: number; text: string }>,
): DatiBollettaFv {
  const out = datiBollettaVuoti(),
    parse = (s: string) =>
      /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(s)
        ? Number(s.replace(/\./g, "").replace(",", "."))
        : NaN;
  const etichette = {
    consumo_annuo_kwh:
      /consumo\s+annuo(?:\s+(?:totale|fatturato))?\s*[:\t ]+([\d.,]+)\s*kwh/gi,
    consumo_periodo_kwh:
      /consumo\s+(?:del\s+periodo|fatturato)\s*[:\t ]+([\d.,]+)\s*kwh/gi,
    potenza_impegnata_kw: /potenza\s+impegnata\s*[:\t ]+([\d.,]+)\s*kw/gi,
    potenza_disponibile_kw: /potenza\s+disponibile\s*[:\t ]+([\d.,]+)\s*kw/gi,
  };
  for (const [k, re] of Object.entries(etichette)) {
    const trovati = pagine.flatMap((p) =>
      Array.from(
        p.text.matchAll(re),
        (m) => ({ valore: parse(m[1]), pagina: p.page }),
      )
    ).filter((v) => Number.isFinite(v.valore));
    if (trovati.length && new Set(trovati.map((x) => x.valore)).size === 1) {
      const key = k as keyof typeof etichette;
      out[key] = trovati[0].valore;
      out.pagine[key] = trovati[0].pagina;
    }
  }
  for (
    const [k, etichetta] of [
      ["spesa_annua", "spesa annua"],
      ["totale_da_pagare", "totale da pagare"],
      ["quote_fisse", "quote fisse"],
      ["quote_consumi", "quote consumi"],
    ] as const
  ) {
    const re = new RegExp(
        etichetta + "\\s*[:\\t ]+(?:€\\s*)?([\\d.,]+)\\s*(?:€|euro)",
        "gi",
      ),
      v = pagine.flatMap((p) =>
        Array.from(
          p.text.matchAll(re),
          (m) => ({ n: parse(m[1]), page: p.page }),
        )
      ).filter((v) => Number.isFinite(v.n));
    if (v.length && new Set(v.map((x) => x.n)).size === 1) {
      out[k] = v[0].n;
      out.pagine[k] = v[0].page;
    }
  }
  for (
    const [k, etichetta] of [
      ["intestatario", "intestatario"],
      ["indirizzo_fornitura", "indirizzo di fornitura"],
      ["periodo_dal", "periodo dal"],
      ["periodo_al", "periodo al"],
    ] as const
  ) {
    const re = new RegExp(
        "(?:^|\\n)\\s*" + etichetta + "\\s*[:\\t]+\\s*([^\\n\\r]+)",
        "gi",
      ),
      v = pagine.flatMap((p) =>
        Array.from(
          p.text.matchAll(re),
          (m) => ({ v: m[1].trim(), page: p.page }),
        )
      );
    if (v.length && new Set(v.map((x) => x.v)).size === 1) {
      out[k] = v[0].v;
      out.pagine[k] = v[0].page;
    }
  }
  const pods = pagine.flatMap((p) =>
    Array.from(
      p.text.matchAll(/\bIT\d{3}E\d{8,9}\b/gi),
      (m) => ({ pod: m[0].toUpperCase(), pagina: p.page }),
    )
  );
  if (new Set(pods.map((x) => x.pod)).size === 1) {
    out.pod = pods[0].pod;
    out.pagine.pod = pods[0].pagina;
  }
  return validaLetturaBolletta(out);
}
export function letturaNativaCompletaFv(d: DatiBollettaFv) {
  return !!d.pod && !!d.intestatario && !!d.indirizzo_fornitura &&
    !!d.periodo_dal && !!d.periodo_al &&
    (Date.parse(d.periodo_al) - Date.parse(d.periodo_dal)) / 86400000 >= 364 &&
    (Date.parse(d.periodo_al) - Date.parse(d.periodo_dal)) / 86400000 <= 366 &&
    d.consumo_annuo_kwh != null && d.consumo_periodo_kwh != null &&
    Math.abs(d.consumo_annuo_kwh - d.consumo_periodo_kwh) < .01 &&
    d.spesa_annua != null && d.quote_fisse != null && d.quote_consumi != null &&
    // La spesa si ricompone con tutte e tre le quote: fissa, potenza (€/kW) ed
    // energia. Senza la quota potenza una bolletta che ce l'ha non quadrava mai.
    Math.abs(
        d.spesa_annua - d.quote_fisse - (d.quote_potenza ?? 0) -
          d.quote_consumi,
      ) < .01 &&
    d.avvisi.length === 0;
}
export function leggiAnalisiConsumi(raw: unknown): AnalisiConsumiFv | null {
  if (
    !record(raw) || raw.versione !== 1 || !Array.isArray(raw.documenti) ||
    raw.documenti.length > 60
  ) return null;
  const out = analisiConsumiIniziale();
  if (record(raw.lettureAcquisite)) {
    out.lettureAcquisite = Object.fromEntries(Object.entries(raw.lettureAcquisite).filter(([id, data]) =>
      /^[0-9a-f-]{36}$/.test(id) && typeof data === "string" && data.length <= 64 && Number.isFinite(Date.parse(data))
    ).slice(0, 60)) as Record<string, string>;
  }
  try {
    out.documenti = raw.documenti.map((d) => {
      if (
        !record(d) || ![d.id, d.hash, d.nome, d.path, d.mime].every((x) =>
          typeof x === "string"
        ) || !/^[a-f0-9]{64}$/.test(String(d.hash)) ||
        String(d.path).length > 400
      ) {
        throw Error("Documento non valido");
      }
      return {
        id: String(d.id).slice(0, 100),
        hash: String(d.hash),
        nome: String(d.nome).slice(0, 200),
        path: String(d.path),
        mime: String(d.mime),
        dati: validaLetturaBolletta(
          d.dati,
          numero(d.pagine_totali)
            ? Math.max(1, Math.min(100, Math.floor(d.pagine_totali)))
            : 1,
        ),
        estratti: validaLetturaBolletta(
          d.estratti,
          numero(d.pagine_totali)
            ? Math.max(1, Math.min(100, Math.floor(d.pagine_totali)))
            : 1,
        ),
        confermato: d.confermato === true,
        pagine_totali: numero(d.pagine_totali)
          ? Math.max(1, Math.min(100, Math.floor(d.pagine_totali)))
          : 1,
        pagine_non_lette: Array.isArray(d.pagine_non_lette)
          ? d.pagine_non_lette.filter((p): p is number =>
            numero(p) && p > 0
          )
          : [],
        metodo: d.metodo === "testo" ? "testo" : "ai",
      };
    });
  } catch {
    return null;
  }
  out.podSelezionato = typeof raw.podSelezionato === "string"
    ? raw.podSelezionato.slice(0, 30)
    : "";
  out.proiezioneConfermata = raw.proiezioneConfermata === true;
  if (record(raw.correzioni)) {
    for (
      const k of [
        "consumoAnnuo",
        "spesaAnnua",
        "costiFissiAnnui",
        "costiEvitabiliAnnui",
      ] as const
    ) {
      if (
        numero(raw.correzioni[k]) && raw.correzioni[k] >= 0 &&
        raw.correzioni[k] <= 1e9
      ) out.correzioni[k] = raw.correzioni[k];
    }
  }
  if (record(raw.correzioniPerPod)) {
    out.correzioniPerPod = {};
    for (const [pod, c] of Object.entries(raw.correzioniPerPod).slice(0, 60)) {
      if (!/^IT\d{3}E\d{8,9}$/.test(pod) || !record(c)) continue;
      const v: AnalisiConsumiFv["correzioni"] = {};
      for (
        const k of [
          "consumoAnnuo",
          "spesaAnnua",
          "costiFissiAnnui",
          "costiEvitabiliAnnui",
        ] as const
      ) if (numero(c[k]) && c[k] >= 0 && c[k] <= 1e9) v[k] = c[k];
      out.correzioniPerPod[pod] = v;
    }
  }
  const p = raw.profilo;
  if (
    record(p) && Array.isArray(p.giorni) && Array.isArray(p.pesiMensili) &&
    p.pesiMensili.length === 12 &&
    p.pesiMensili.every((x) => numero(x) && x >= 0 && x <= 100) &&
    numero(p.oraInizio) && numero(p.oraFine) && p.oraInizio >= 0 &&
    p.oraFine <= 24 && p.oraFine > p.oraInizio && numero(p.quotaFuoriOrario) &&
    p.quotaFuoriOrario >= 0 && p.quotaFuoriOrario <= 1 &&
    numero(p.aumentoConsumiPct) && p.aumentoConsumiPct >= 0 &&
    p.aumentoConsumiPct <= 500
  ) {
    out.profilo = {
      tipo: p.tipo === "azienda" ? "azienda" : "residenziale",
      giorni: [
        ...new Set(
          p.giorni.filter((x): x is number =>
            numero(x) && Number.isInteger(x) && x >= 0 && x <= 6
          ),
        ),
      ],
      oraInizio: p.oraInizio,
      oraFine: p.oraFine,
      quotaFuoriOrario: p.quotaFuoriOrario,
      pesiMensili: p.pesiMensili as number[],
      aumentoConsumiPct: p.aumentoConsumiPct,
    };
  } else return null;
  if (["spesa", "autoconsumo", "copertura"].includes(String(raw.obiettivo))) {
    out.obiettivo = raw.obiettivo as AnalisiConsumiFv["obiettivo"];
  }
  if (
    numero(raw.coperturaObiettivo) && raw.coperturaObiettivo > 0 &&
    raw.coperturaObiettivo <= 1
  ) out.coperturaObiettivo = raw.coperturaObiettivo;
  if (
    numero(raw.prezzoImmissione) && raw.prezzoImmissione >= 0 &&
    raw.prezzoImmissione <= 2
  ) out.prezzoImmissione = raw.prezzoImmissione;
  if (["contenuta", "consigliata", "accumulo", "massima"].includes(String(raw.scenario))) {
    out.scenario = raw.scenario as AnalisiConsumiFv["scenario"];
  }
  if (
    Array.isArray(raw.consumiAggiuntivi) && raw.consumiAggiuntivi.length <= 8
  ) {
    out.consumiAggiuntivi = raw.consumiAggiuntivi.filter((x) =>
      record(x) &&
      typeof x.id === "string" && x.id.length <= 60 &&
      typeof x.nome === "string" &&
      x.nome.length <= 100 && numero(x.kwhAnnui) && x.kwhAnnui >= 0 &&
      x.kwhAnnui <= 1e6
    ) as NonNullable<AnalisiConsumiFv["consumiAggiuntivi"]>;
  }
  return out;
}
export function aggiornaConsumiAggiuntiviFv(
  a: AnalisiConsumiFv,
  consumo: number,
): AnalisiConsumiFv {
  if (!a.consumiAggiuntivi?.length || !(consumo > 0)) return a;
  const incremento = a.consumiAggiuntivi.reduce((s, x) => s + x.kwhAnnui, 0) /
    consumo * 100;
  return { ...a, profilo: { ...a.profilo, aumentoConsumiPct: incremento } };
}
export function riepilogoBollette(a: AnalisiConsumiFv) {
  const avvisi: string[] = [],
    esclusi: string[] = [],
    mesi = new Set<string>(),
    giorni = new Set<number>(),
    hashes = new Set<string>();
  const selezionati = a.documenti.filter((d) =>
    d.confermato && (d.dati.pod ?? "") === a.podSelezionato
  ).sort((a, b) =>
    (b.dati.periodo_al ?? "").localeCompare(a.dati.periodo_al ?? "")
  );
  let consumo = 0, spesa = 0, fissi = 0, fissiPresenti = false;
  let variabili = 0, consumoConVariabili = 0;
  let spesaCompleta = true, fissiCompleti = true;
  for (const d of selezionati) {
    const v = d.dati;
    if (hashes.has(d.hash) || v.rettifica || Math.abs(v.conguagli ?? 0) > 0) {
      esclusi.push(d.id);
      avvisi.push(
        `${d.nome}: duplicato o conguaglio escluso dalla somma dei periodi.`,
      );
      continue;
    }
    hashes.add(d.hash);
    if (!v.periodo_dal || !v.periodo_al || v.consumo_periodo_kwh == null) {
      continue;
    }
    const inizio = Date.parse(v.periodo_dal) / 86400000,
      fine = Date.parse(v.periodo_al) / 86400000;
    if (fine - inizio > 730) {
      avvisi.push(`${d.nome}: periodo troppo esteso, verifica le date.`);
      continue;
    }
    const periodo = Array.from(
      { length: Math.floor(fine - inizio) + 1 },
      (_, i) => inizio + i,
    );
    if (periodo.some((n) => giorni.has(n))) {
      esclusi.push(d.id);
      avvisi.push(`${d.nome}: periodo sovrapposto escluso dalla somma.`);
      continue;
    }
    for (const g of periodo) {
      giorni.add(g);
      mesi.add(new Date(g * 86400000).toISOString().slice(0, 7));
    }
    consumo += v.consumo_periodo_kwh;
    if (v.quote_consumi != null && v.consumo_periodo_kwh > 0) {
      variabili += v.quote_consumi;
      consumoConVariabili += v.consumo_periodo_kwh;
    }
    // TV, depositi, arretrati e importi a credito non diventano energia risparmiabile.
    if (v.totale_da_pagare != null) {
      spesa += v.totale_da_pagare - (v.canone_tv ?? 0) - (v.depositi ?? 0) -
        (v.arretrati ?? 0) + (Math.abs(v.bonus ?? 0)) +
        (Math.abs(v.crediti ?? 0));
    } else spesaCompleta = false;
    fissi += (v.quote_fisse ?? 0) + (v.quote_potenza ?? 0);
    fissiPresenti ||= v.quote_fisse != null || v.quote_potenza != null;
    fissiCompleti &&= v.quote_fisse != null;
  }
  const mensili = new Map<string, number>();
  for (
    const d of selezionati.filter((d) => !d.dati.rettifica && !d.dati.conguagli)
  ) {
    for (const r of d.dati.storico_mensile) {
      if (!mensili.has(r.mese)) mensili.set(r.mese, r.kwh);
      else if (mensili.get(r.mese) !== r.kwh) {
        avvisi.push(
          `${r.mese}: storico rettificato o discordante, usato il documento più recente.`,
        );
      }
    }
  }
  const ultimiMesi = [...mensili.keys()].sort().slice(-12),
    continuo = ultimiMesi.length === 12 &&
      ultimiMesi.every((m, i) =>
        i === 0 ||
        new Date(
            Date.UTC(
              Number(ultimiMesi[i - 1].slice(0, 4)),
              Number(ultimiMesi[i - 1].slice(5)),
              1,
            ),
          ).toISOString().slice(0, 7) === m
      );
  const storicoCompleto = continuo
    ? ultimiMesi.reduce((sum, m) => sum + mensili.get(m)!, 0)
    : null;
  const dichiarato =
    selezionati.find((d) =>
      !d.dati.rettifica && !d.dati.conguagli && d.dati.consumo_annuo_kwh != null
    )?.dati.consumo_annuo_kwh ?? storicoCompleto;
  const annua =
    selezionati.find((d) => d.dati.spesa_annua != null)?.dati.spesa_annua ??
      null;
  const giorniMensili = new Set<number>();
  for (const mese of ultimiMesi) {
    const [anno, m] = mese.split("-").map(Number),
      inizio = Date.UTC(anno, m - 1, 1) / 86400000,
      fine = Date.UTC(anno, m, 1) / 86400000;
    for (let g = inizio; g < fine; g++) giorniMensili.add(g);
  }
  // Storico e periodi fatturati sono due rappresentazioni degli stessi consumi:
  // scegli quella con più copertura, senza sommarle fra loro.
  const usaMensili = giorniMensili.size > giorni.size;
  const coperti = usaMensili ? giorniMensili : giorni,
    consumoBase = usaMensili
      ? ultimiMesi.reduce((sum, m) => sum + mensili.get(m)!, 0)
      : consumo;
  const fattore = giorni.size ? 365 / giorni.size : 0,
    stimato = dichiarato == null && coperti.size > 0 && coperti.size < 364;
  const consumoAnnuo = a.correzioni.consumoAnnuo ?? dichiarato ??
    (consumoBase > 0 && coperti.size ? consumoBase * 365 / coperti.size : null);
  const spesaAnnua = a.correzioni.spesaAnnua ?? annua ??
    (spesaCompleta && spesa > 0 && fattore ? spesa * fattore : null);
  const fissiAnnui = a.correzioni.costiFissiAnnui ??
    (fissiCompleti && fissiPresenti && fattore ? fissi * fattore : null);
  // Solo componenti effettivamente lette e confermate: mai tutto il totale da pagare.
  const daQuote =
    consumo > 0 && Math.abs(consumoConVariabili - consumo) < .01 &&
      consumoAnnuo != null
      ? variabili / consumo * consumoAnnuo
      : null;
  const daDifferenza =
    spesaAnnua != null && fissiAnnui != null && spesaAnnua >= fissiAnnui
      ? spesaAnnua - fissiAnnui
      : null;
  const evitabili = a.correzioni.costiEvitabiliAnnui ?? daQuote ?? daDifferenza;
  if (
    dichiarato != null &&
    selezionati.some((d) =>
      d.dati.consumo_annuo_kwh != null &&
      Math.abs(d.dati.consumo_annuo_kwh - dichiarato) > .1
    )
  ) {
    avvisi.push(
      "Storici annui discordanti: proposto quello della bolletta più recente, senza sommarli.",
    );
  }
  const costiCoerenti = spesaAnnua == null ||
    ((fissiAnnui ?? 0) + (evitabili ?? 0) <= spesaAnnua + .02);
  if (!costiCoerenti) {
    avvisi.push(
      "Quote fisse e costi evitabili superano la spesa annua ricorrente: verifica gli importi prima di applicarli.",
    );
  }
  if (!a.podSelezionato && a.documenti.length) {
    avvisi.push("Seleziona e verifica il POD della fornitura.");
  }
  if (stimato && !a.proiezioneConfermata && a.correzioni.consumoAnnuo == null) {
    avvisi.push("Conferma la proiezione annua basata sul periodo disponibile.");
  }
  return {
    consumoAnnuo,
    spesaAnnua,
    fissiAnnui,
    spesaStimata: a.correzioni.spesaAnnua == null && annua == null &&
      giorni.size > 0 && giorni.size < 364,
    costiEvitabiliAnnui: evitabili,
    fonteCosto: a.correzioni.costiEvitabiliAnnui != null
      ? "operatore"
      : daQuote != null
      ? "quote_consumi"
      : daDifferenza != null
      ? "spesa_meno_fissi"
      : null,
    costoEvitabileKwh: consumoAnnuo && evitabili != null
      ? evitabili / consumoAnnuo
      : null,
    stimato,
    costiCoerenti,
    giorniCoperti: coperti.size,
    mesiCoperti: usaMensili ? ultimiMesi : [...mesi].sort(),
    esclusi,
    avvisi,
    pronto: costiCoerenti && !!consumoAnnuo && !!a.podSelezionato &&
      (!stimato || a.proiezioneConfermata || a.correzioni.consumoAnnuo != null),
  };
}

/** Le correzioni restano nella fornitura cui si riferiscono, anche cambiando POD. */
export function selezionaFornituraFv(
  a: AnalisiConsumiFv,
  pod: string,
): AnalisiConsumiFv {
  const correzioniPerPod = {
    ...a.correzioniPerPod,
    ...(a.podSelezionato ? { [a.podSelezionato]: a.correzioni } : {}),
  };
  return {
    ...a,
    podSelezionato: pod,
    correzioniPerPod,
    correzioni: correzioniPerPod[pod] ?? {},
    proiezioneConfermata: false,
    scenario: undefined,
  };
}
export function problemiConsumiFv(
  raw: unknown,
  consumo: number | null | undefined,
  costo: number | null | undefined,
): string[] {
  if (raw == null) return [];
  const a = leggiAnalisiConsumi(raw);
  if (!a) {
    return [
      "Verifica giorni, orari e dati della fornitura nella fase Consumi.",
    ];
  }
  const r = riepilogoBollette(a), errori: string[] = [];
  if (!r.costiCoerenti) {
    errori.push(
      "Quote fisse e costi evitabili superano la spesa annua: correggi gli importi nella fase Consumi.",
    );
  }
  if (a.documenti.length && !r.pronto) {
    errori.push(
      "Conferma bollette, POD ed eventuale proiezione nella fase Consumi, poi applica i dati al simulatore.",
    );
  }
  if (
    r.consumoAnnuo != null && Math.abs(r.consumoAnnuo - (consumo ?? 0)) > 1 ||
    r.costoEvitabileKwh != null &&
      // fv_progetti.costo_kwh_attuale è numeric(...,4): la riapertura
      // può differire dal rapporto esatto fino a mezzo decimillesimo.
      Math.abs(r.costoEvitabileKwh - (costo ?? 0)) > .000050000001
  ) errori.push("Applica al simulatore i dati confermati nella fase Consumi.");
  if (costo == null || !Number.isFinite(costo) || costo < 0) {
    errori.push(
      "Conferma il costo dei kWh evitabili nella fase Consumi prima del calcolo economico.",
    );
  }
  return errori;
}
