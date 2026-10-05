/**
 * L'anteprima live del preventivo fotovoltaico: dallo stato del wizard al contratto
 * `AnteprimaPreventivo` che il pannello a destra disegna.
 *
 * Funzione PURA. Non inventa conti: le righe sono quelle che la Fase 5 salva
 * (`righeComponentiFv`), il prezzo quello del server (`calcolaPrezzoFv`), la
 * produzione la stessa stima della Fase 5 (`stimaProduzioneFv`). Solo detrazione e
 * risparmio vengono dall'ultimo calcolo finanziario (Fase 6), e solo se quel calcolo
 * è ancora sul totale di adesso: altrimenti si dice di ricalcolare.
 */
import type { DiscountRule } from "@/hooks/useDiscountRules";
import {
  type AnteprimaPreventivo,
  type DetrazioneAnteprima,
  type GruppoAnteprima,
  type RigaAnteprima,
  type VoceSintesi,
  type VoceTotale,
  dataEstesa,
  formattaEuro,
  formattaNumero,
  formattaQuantita,
} from "@/lib/preventivatore/anteprima";
import { evaluateDiscountRules } from "@/lib/serramenti/discountRules";
import {
  type ConfigurazioneComponentiFv,
  type ListinoComponentiFv,
  type RigaComponenteFv,
  righeComponentiFv,
} from "./componentiConfigurazione";
import { aliquotaIvaFv, percentualeIvaFv } from "./importoPreventivo";
import { type PrezzoFv, calcolaPrezzoFv } from "./prezzoPreventivo";

/** Il derate di sistema (PR × perdite ≈ 0,7565) che la Fase 5 applica alle ore di sole lorde. */
export const DERATE_PRODUZIONE_FV = 0.7565;

/** La produzione annua stimata in kWh: la stessa cifra della Fase 5. */
export function stimaProduzioneFv(d: { potenza_kwp: number | null; ore_sole_annue: number | null }): number {
  return d.potenza_kwp && d.ore_sole_annue ? d.potenza_kwp * d.ore_sole_annue * DERATE_PRODUZIONE_FV : 0;
}

/** I campi del wizard che servono all'anteprima (`WizardData` li ha tutti). */
export interface DatiAnteprimaFv extends ConfigurazioneComponentiFv {
  cliente_nome: string;
  cliente_cognome: string;
  cliente_telefono: string;
  cliente_email: string;
  indirizzo: string;
  cap: string;
  comune: string;
  provincia: string;
  consumo_annuo_kwh: number | null;
  ore_sole_annue: number | null;
  numero_pannelli_max: number | null;
  potenza_max_kwp: number | null;
  prezzo_vendita_manuale: number | null;
  iva_aliquota: number;
  sconto_tipo: "pct" | "importo";
  sconto_valore: number | null;
  manodopera_righe: Array<{ descrizione: string; ore: number; tariffa_oraria_netta: number; tariffa_oraria_vendita: number }>;
  servizi_righe: Array<{ descrizione: string; quantita: number; prezzo_netto: number; prezzo_vendita: number }>;
}

export interface OpzioniAnteprimaFv {
  /** Il nome dell'azienda che emette il preventivo. */
  emittente?: string | null;
  /** Il numero del preventivo, quando c'è già (`FV-2026-0128`). */
  numero?: string | null;
  listino: ListinoComponentiFv;
  regoleSconto: DiscountRule[];
  /**
   * La scelta dell'impianto è cominciata (Fase 5 in poi). Prima, potenza e moduli
   * sono quelli di partenza del wizard, non una scelta: non si mostrano.
   */
  impiantoConfigurato: boolean;
  /** L'ultimo calcolo finanziario (`fv-calcolo-finanziario`), se è stato fatto. */
  scenario?: Record<string, unknown> | null;
  /** Falso a chi non può vedere costi e margini: il blocco impresa non si prepara. */
  conImpresa?: boolean;
  /** Per i test: la data di oggi. */
  oggi?: Date;
}

const compatta = (...parti: Array<string | null | undefined>) =>
  parti.map((p) => p?.trim()).filter(Boolean).join(" ");
const compattaIndirizzo = (...parti: Array<string | null | undefined>) =>
  parti.map((p) => p?.trim()).filter(Boolean).join(", ");

const num = (x: unknown): number => {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
};

const percentuale = (p: number) => formattaNumero(p, Number.isInteger(p) ? 0 : 1);

function dettaglioComponente(r: RigaComponenteFv): string | null {
  const parti: string[] = [];
  if (r.unita_misura === "kit") {
    if (r.potenza_unitaria_kw) parti.push(`${formattaQuantita(r.potenza_unitaria_kw)} kWp`);
    if (r.capacita_kwh) parti.push(`accumulo ${formattaQuantita(r.capacita_kwh)} kWh`);
  } else if (r.categoria === "pannello" && r.potenza_unitaria_w) {
    parti.push(`${formattaQuantita(r.potenza_unitaria_w)} W`);
  } else if (r.categoria === "inverter" && r.potenza_unitaria_kw) {
    parti.push(`${formattaQuantita(r.potenza_unitaria_kw)} kW`);
  } else if (r.categoria === "accumulo" && r.capacita_kwh) {
    parti.push(`${formattaQuantita(r.capacita_kwh)} kWh`);
  }
  return parti.join(" · ") || null;
}

const costoDellaRiga = (quantita: number, netto: number): number | null =>
  quantita > 0 && netto > 0 ? quantita * netto : null;

function rigaComponente(r: RigaComponenteFv): RigaAnteprima {
  return {
    id: `componente:${r.ordinamento}`,
    titolo: r.descrizione,
    dettaglio: dettaglioComponente(r),
    quantita: r.quantita,
    unita: r.unita_misura,
    prezzoUnitario: r.prezzo_unitario_vendita,
    totale: num(r.quantita) * num(r.prezzo_unitario_vendita),
    costo: costoDellaRiga(num(r.quantita), num(r.prezzo_unitario_netto)),
  };
}

/** Detrazione e incentivi dell'ultimo calcolo: solo quelli del 50/36% sulla casa. */
function detrazioneDelCalcolo(scenario: Record<string, unknown>): DetrazioneAnteprima | null {
  const incentivi = (scenario.incentivi as Array<{ codice: string; importo_eur: number | null }> | undefined) ?? [];
  const detrazione = incentivi.find((i) => i.codice === "DETR_50_PRIMA" || i.codice === "DETR_36_SECONDA");
  if (!detrazione || !(num(detrazione.importo_eur) > 0)) return null;
  return {
    pct: detrazione.codice === "DETR_50_PRIMA" ? 50 : 36,
    importo: num(detrazione.importo_eur),
    massimale: null,
    oltreMassimale: false,
    nota: "In 10 quote annuali, dal calcolo finanziario.",
  };
}

export function anteprimaFotovoltaico(d: DatiAnteprimaFv, opzioni: OpzioniAnteprimaFv): AnteprimaPreventivo {
  const oggi = opzioni.oggi ?? new Date();
  const ivaAliquota = aliquotaIvaFv(d.iva_aliquota);

  const componenti = righeComponentiFv(d, opzioni.listino);
  const manodopera = d.manodopera_righe;
  const servizi = d.servizi_righe;
  // Come la Fase 5: con un kit il prezzo a corpo non vale (il kit ha il suo).
  const prezzoManuale = d.kit_bundle_id ? null : (num(d.prezzo_vendita_manuale) > 0 ? num(d.prezzo_vendita_manuale) : null);

  const haRighe = componenti.length + manodopera.length + servizi.length > 0;
  const haQualcosaDaSommare = haRighe || prezzoManuale != null;

  const prezzoPieno = componenti.reduce((s, c) => s + num(c.quantita) * num(c.prezzo_unitario_vendita), 0)
    + manodopera.reduce((s, m) => s + num(m.ore) * num(m.tariffa_oraria_vendita), 0)
    + servizi.reduce((s, x) => s + num(x.quantita) * num(x.prezzo_vendita), 0);
  const regole = evaluateDiscountRules(opzioni.regoleSconto, { importo: prezzoPieno, tipoLavoro: "fotovoltaico" });
  const prezzo: PrezzoFv = calcolaPrezzoFv({
    componenti,
    manodopera,
    servizi,
    prezzoManuale,
    sconto: { tipo: num(d.sconto_valore) > 0 ? d.sconto_tipo : null, valore: d.sconto_valore },
    scontoMaxPct: regole.scontoMaxPct,
    margineMinPct: regole.margineMinPct,
    ivaAliquota,
  });

  // ── righe ──
  const impianto = componenti.filter((r) => !(r.categoria === "altro" && r.unita_misura !== "kit"));
  const extra = componenti.filter((r) => r.categoria === "altro" && r.unita_misura !== "kit");
  const gruppi: GruppoAnteprima[] = [
    { id: "impianto", titolo: "Impianto", righe: impianto.map(rigaComponente) },
    { id: "extra", titolo: "Prodotti aggiuntivi", righe: extra.map(rigaComponente) },
    {
      id: "manodopera",
      titolo: "Installazione e manodopera",
      righe: manodopera.map((m, i): RigaAnteprima => ({
        id: `manodopera:${i}`,
        titolo: m.descrizione?.trim() || "Manodopera",
        dettaglio: null,
        quantita: num(m.ore),
        unita: "h",
        prezzoUnitario: num(m.tariffa_oraria_vendita),
        totale: num(m.ore) * num(m.tariffa_oraria_vendita),
        costo: costoDellaRiga(num(m.ore), num(m.tariffa_oraria_netta)),
      })),
    },
    {
      id: "servizi",
      titolo: "Pratiche e servizi",
      righe: servizi.map((x, i): RigaAnteprima => ({
        id: `servizio:${i}`,
        titolo: x.descrizione?.trim() || "Servizio",
        dettaglio: null,
        quantita: num(x.quantita),
        unita: null,
        prezzoUnitario: num(x.prezzo_vendita),
        totale: num(x.quantita) * num(x.prezzo_vendita),
        costo: costoDellaRiga(num(x.quantita), num(x.prezzo_netto)),
      })),
    },
  ];

  // ── totali ──
  const totali: VoceTotale[] = [];
  const note: string[] = [];
  const avvisi: string[] = [];
  if (haQualcosaDaSommare) {
    totali.push({
      id: "lordo",
      etichetta: prezzo.usaPrezzoManuale ? "Prezzo concordato" : "Totale voci",
      importo: prezzo.usaPrezzoManuale ? prezzo.imponibile : prezzo.prezzoPieno,
    });
    if (prezzo.scontoApplicato > 0.005) {
      const pct = d.sconto_tipo === "pct" ? num(d.sconto_valore) : 0;
      totali.push({
        id: "sconto",
        etichetta: pct > 0 && !prezzo.scontoLimitato ? `Sconto ${percentuale(pct)}%` : "Sconto",
        importo: prezzo.scontoApplicato,
        negativo: true,
      });
      totali.push({ id: "netto", etichetta: "Imponibile", importo: prezzo.imponibile });
    }
    totali.push({ id: "iva", etichetta: `IVA ${percentuale(percentualeIvaFv(d.iva_aliquota))}%`, importo: prezzo.ivaImporto });
    totali.push({ id: "totale", etichetta: "Totale", importo: prezzo.totale, forte: true });
  }
  if (prezzo.usaPrezzoManuale) {
    note.push(`Prezzo scritto a mano: prende il posto della somma delle voci (${formattaEuro(prezzo.prezzoPieno)}).`);
  }
  if (prezzo.scontoLimitato) {
    avvisi.push(`Sconto richiesto ${formattaEuro(prezzo.scontoRichiesto)}: le regole aziendali lo limitano a ${formattaEuro(prezzo.scontoApplicato)}.`);
  }

  // ── detrazione dall'ultimo calcolo, solo se è ancora sul totale di adesso ──
  let detrazione: DetrazioneAnteprima | null = null;
  const costiCalcolo = (opzioni.scenario?.costi as { prezzo_vendita_iva_inclusa?: number } | undefined) ?? null;
  if (opzioni.scenario && costiCalcolo?.prezzo_vendita_iva_inclusa != null && haQualcosaDaSommare) {
    const delCalcolo = num(costiCalcolo.prezzo_vendita_iva_inclusa);
    if (Math.abs(delCalcolo - prezzo.totale) <= 1) {
      detrazione = detrazioneDelCalcolo(opzioni.scenario);
    } else {
      avvisi.push(`Il calcolo finanziario era su ${formattaEuro(delCalcolo)}: ricalcolalo (Fase 6) per aggiornare detrazione e risparmio.`);
    }
  }

  // ── i numeri dell'impianto ──
  const sintesi: VoceSintesi[] = [];
  const consumo = num(d.consumo_annuo_kwh);
  if (opzioni.impiantoConfigurato) {
    const kwp = num(d.potenza_kwp);
    if (kwp > 0) sintesi.push({ id: "potenza", etichetta: "Potenza", valore: `${formattaQuantita(kwp)} kWp` });
    if (!d.kit_bundle_id && num(d.numero_pannelli_scelti) > 0) {
      sintesi.push({ id: "moduli", etichetta: "Moduli", valore: formattaQuantita(num(d.numero_pannelli_scelti)) });
    }
    if (d.con_accumulo && num(d.capacita_accumulo_kwh) > 0) {
      sintesi.push({ id: "accumulo", etichetta: "Accumulo", valore: `${formattaQuantita(num(d.capacita_accumulo_kwh))} kWh` });
    }
    const produzione = stimaProduzioneFv(d);
    if (produzione > 0) {
      sintesi.push({ id: "produzione", etichetta: "Produzione stimata", valore: `${formattaNumero(Math.round(produzione), 0)} kWh/anno` });
      if (consumo > 0) {
        sintesi.push({ id: "copertura", etichetta: "Rispetto ai consumi", valore: `${formattaNumero(Math.round((produzione / consumo) * 100), 0)}%` });
      }
    }
  } else {
    if (consumo > 0) sintesi.push({ id: "consumo", etichetta: "Consumo annuo", valore: `${formattaNumero(consumo, 0)} kWh` });
    if (num(d.ore_sole_annue) > 0) sintesi.push({ id: "ore-sole", etichetta: "Ore di sole", valore: `${formattaNumero(num(d.ore_sole_annue), 0)}/anno` });
    if (num(d.numero_pannelli_max) > 0) {
      const max = num(d.potenza_max_kwp) > 0 ? ` (${formattaQuantita(num(d.potenza_max_kwp))} kWp)` : "";
      sintesi.push({ id: "tetto", etichetta: "Tetto", valore: `fino a ${formattaNumero(num(d.numero_pannelli_max), 0)} moduli${max}` });
    }
  }

  const kwpTitolo = opzioni.impiantoConfigurato && num(d.potenza_kwp) > 0 ? ` da ${formattaQuantita(num(d.potenza_kwp))} kWp` : "";

  return {
    emittente: opzioni.emittente ?? null,
    codice: opzioni.numero ?? null,
    dataEtichetta: dataEstesa(oggi),
    titolo: `Impianto fotovoltaico${kwpTitolo}`,
    cliente: {
      nome: compatta(d.cliente_nome, d.cliente_cognome) || null,
      righe: [compatta(d.cliente_telefono), compatta(d.cliente_email)].filter(Boolean),
    },
    cantiere: compattaIndirizzo(d.indirizzo, compatta(d.cap, d.comune), d.provincia) || null,
    gruppi,
    totali,
    totaleDocumento: haQualcosaDaSommare ? prezzo.totale : null,
    prezzoACorpo: prezzo.usaPrezzoManuale,
    avvisi,
    note,
    impresa: opzioni.conImpresa === false || !haQualcosaDaSommare
      ? null
      : {
          costi: prezzo.costoNetto,
          margine: prezzo.margineEur,
          marginePct: prezzo.marginePct,
          costiCompleti: !prezzo.costiIncompleti,
          righeSenzaCosto: prezzo.righeSenzaCosto,
        },
    detrazione,
    sintesi,
  };
}
