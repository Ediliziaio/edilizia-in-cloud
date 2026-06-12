// src/lib/fatturazione/calcoli.ts
// Centralized calculation engine for native billing documents

import type {
  RigaDocumento,
  RiepilogoIVA,
  DocumentoFiscale,
  ClienteSnapshot,
} from "@/types/fatturazione";

// ─── Helpers ─────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Single row calculation ──────────────────────────────────

export function calcolaRiga(r: RigaDocumento): RigaDocumento {
  const base = r.prezzo_unitario * r.quantita;
  const scontoVal = r.sconto_percentuale
    ? base * (r.sconto_percentuale / 100)
    : (r.sconto_valore ?? 0);
  const imponibile = round2(base - scontoVal);
  const aliquota = parseFloat(r.aliquota_iva) || 0;
  const imposta = r.natura_iva ? 0 : round2(imponibile * (aliquota / 100));
  return {
    ...r,
    imponibile,
    imposta,
    totale_riga: round2(imponibile + imposta),
  };
}

// ─── IVA riepilogo ───────────────────────────────────────────

export interface RiepilogoIVAOptions {
  proportionalDiscount?: number;
  /** Split payment (scissione pagamenti) per PA: imposta EsigibilitaIVA = "S" */
  splitPayment?: boolean;
  /** Default esigibilita from document level */
  esigibilitaDefault?: "I" | "D" | "S";
}

export function calcolaRiepilogoIVA(
  righe: RigaDocumento[],
  proportionalDiscountOrOptions: number | RiepilogoIVAOptions = 0
): RiepilogoIVA[] {
  // Backwards-compatible: accept number or options object
  const options: RiepilogoIVAOptions =
    typeof proportionalDiscountOrOptions === "number"
      ? { proportionalDiscount: proportionalDiscountOrOptions }
      : proportionalDiscountOrOptions;

  const proportionalDiscount = options.proportionalDiscount ?? 0;
  const splitPayment = options.splitPayment ?? false;
  const esigibilitaDefault = options.esigibilitaDefault ?? "I";

  const ivaMap = new Map<string, RiepilogoIVA>();

  for (const r of righe) {
    const key = `${r.aliquota_iva}|${r.natura_iva ?? ""}`;
    const existing = ivaMap.get(key);
    if (existing) {
      existing.imponibile += r.imponibile;
      existing.imposta += r.imposta;
    } else {
      ivaMap.set(key, {
        aliquota: r.aliquota_iva,
        natura: r.natura_iva,
        imponibile: r.imponibile,
        imposta: r.imposta,
        esigibilita: esigibilitaDefault,
      });
    }
  }

  return Array.from(ivaMap.values()).map((r) => {
    // Apply proportional global discount
    const discountedImponibile = round2(
      r.imponibile - r.imponibile * proportionalDiscount
    );
    const aliquota = parseFloat(r.aliquota) || 0;
    const discountedImposta = r.natura
      ? 0
      : round2(discountedImponibile * (aliquota / 100));

    // Split payment: EsigibilitaIVA = "S" per righe con IVA effettiva (non esente/natura)
    const esigibilita: "I" | "D" | "S" =
      splitPayment && !r.natura && aliquota > 0
        ? "S"
        : r.esigibilita;

    return {
      ...r,
      imponibile: discountedImponibile,
      imposta: discountedImposta,
      esigibilita,
    };
  });
}

// ─── Document totals ─────────────────────────────────────────

export interface TotaliOptions {
  scontoGlobalePerc?: number;
  scontoGlobaleValore?: number;
  bolloVirtuale?: boolean;
  bolloImporto?: number;
  ritenutaAcconto?: boolean;
  ritenutaAliquota?: number;
  cassaPrevidenziale?: boolean;
  cassaAliquota?: number;
  cassaImponibile?: number;
  /** Aliquota IVA applicata al contributo cassa previdenziale (default 22).
   *  Il contributo integrativo cassa è parte della base imponibile IVA. */
  cassaAliquotaIva?: string | number;
  /** Cassa soggetta a ritenuta d'acconto (flag <Ritenuta>SI</Ritenuta> nell'XML):
   *  se true, la base della ritenuta include anche il contributo cassa. */
  cassaRitenuta?: boolean;
  rivalsaInps?: boolean;
  rivalsaAliquota?: number;
  altraRitenuta?: boolean;
  altraRitenutaAliquota?: number;
  arrotondamento?: number;
  /** Split payment per PA: IVA pagata direttamente dall'ente, sottratta dal totale_da_pagare */
  splitPayment?: boolean;
  /** Default esigibilita from document level */
  esigibilitaDefault?: "I" | "D" | "S";
}

export interface TotaliDocumento {
  subtotale: number;
  scontoGlobaleValore: number;
  imponibile_totale: number;
  riepilogo_iva: RiepilogoIVA[];
  iva_totale: number;
  totale_documento: number;
  ritenuta_importo: number;
  cassa_importo: number;
  rivalsa_importo: number;
  altra_ritenuta_importo: number;
  totale_da_pagare: number;
}

export function calcolaTotaliDocumento(
  righe: RigaDocumento[],
  options: TotaliOptions = {}
): TotaliDocumento {
  const computed = righe.map(calcolaRiga);

  const subtotale = computed.reduce((s, r) => s + r.imponibile, 0);

  const scontoGlobaleValore = options.scontoGlobalePerc
    ? round2(subtotale * (options.scontoGlobalePerc / 100))
    : (options.scontoGlobaleValore ?? 0);

  const imponibile_totale = round2(subtotale - scontoGlobaleValore);

  // Proportional discount ratio for IVA riepilogo
  const discountRatio = subtotale > 0 ? scontoGlobaleValore / subtotale : 0;
  const riepilogo_iva = calcolaRiepilogoIVA(computed, {
    proportionalDiscount: discountRatio,
    splitPayment: options.splitPayment,
    esigibilitaDefault: options.esigibilitaDefault,
  });

  // ── Contributo cassa previdenziale (contributo integrativo) ──
  // Calcolato sull'imponibile delle righe (o su cassaImponibile se fornito).
  // NB: il contributo NON è incluso in imponibile_totale né nelle righe.
  const cassa_importo =
    options.cassaPrevidenziale && options.cassaAliquota
      ? round2(
          (options.cassaImponibile ?? imponibile_totale) *
            (options.cassaAliquota / 100)
        )
      : 0;

  // FIX #1 — Il contributo cassa è parte della base imponibile IVA.
  // Va aggiunto al riepilogo IVA nell'aliquota propria della cassa (cassaAliquotaIva,
  // default 22% — coerente con generateXML.ts che usa doc.cassa_aliquota_iva || "22").
  // Così l'IVA sul contributo confluisce in iva_totale (= Σ riepilogo.imposta) e il
  // <DatiRiepilogo> dell'XML resta coerente con il <DatiCassaPrevidenziale>
  // (controlli SDI 00421 Imposta=Imponibile×Aliquota e 00423 coerenza imponibile).
  const cassaIvaRaw = options.cassaAliquotaIva;
  const cassaAliquotaIvaNum =
    cassaIvaRaw == null || cassaIvaRaw === ""
      ? 22
      : typeof cassaIvaRaw === "number"
        ? cassaIvaRaw
        : parseFloat(cassaIvaRaw) || 0;
  if (cassa_importo > 0 && cassaAliquotaIvaNum > 0) {
    const bucket = riepilogo_iva.find(
      (r) => !r.natura && (parseFloat(r.aliquota) || 0) === cassaAliquotaIvaNum
    );
    if (bucket) {
      bucket.imponibile = round2(bucket.imponibile + cassa_importo);
      bucket.imposta = round2(bucket.imponibile * (cassaAliquotaIvaNum / 100));
    } else {
      riepilogo_iva.push({
        aliquota:
          typeof cassaIvaRaw === "string" && cassaIvaRaw !== ""
            ? cassaIvaRaw
            : String(cassaAliquotaIvaNum),
        natura: undefined,
        imponibile: cassa_importo,
        imposta: round2(cassa_importo * (cassaAliquotaIvaNum / 100)),
        esigibilita: options.splitPayment ? "S" : (options.esigibilitaDefault ?? "I"),
      });
    }
  }

  // iva_totale ora include l'IVA sul contributo cassa (FIX #1).
  const iva_totale = round2(riepilogo_iva.reduce((s, r) => s + r.imposta, 0));

  const bollo = options.bolloVirtuale ? (options.bolloImporto ?? 2) : 0;

  // FIX #1 + FIX #3 — totale_documento (→ XML <ImportoTotaleDocumento>) comprende:
  //   imponibile righe + contributo cassa + IVA (righe + cassa) + bollo + arrotondamento.
  // Prima erano esclusi sia il contributo cassa con la sua IVA (FIX #1) sia il bollo (FIX #3),
  // quindi il totale documento trasmesso a SDI risultava SOTTOSTIMATO.
  const totale_documento = round2(
    imponibile_totale + cassa_importo + iva_totale + bollo + (options.arrotondamento ?? 0)
  );

  // FIX #2 — Se la cassa è soggetta a ritenuta (cassa_ritenuta → <Ritenuta>SI</Ritenuta>),
  // la base della ritenuta d'acconto include anche il contributo cassa (imponibile + cassa).
  const ritenutaBase =
    imponibile_totale + (options.cassaRitenuta ? cassa_importo : 0);
  const ritenuta_importo =
    options.ritenutaAcconto && options.ritenutaAliquota
      ? round2(ritenutaBase * (options.ritenutaAliquota / 100))
      : 0;

  const rivalsa_importo =
    options.rivalsaInps && options.rivalsaAliquota
      ? round2(imponibile_totale * (options.rivalsaAliquota / 100))
      : 0;

  const altra_ritenuta_importo =
    options.altraRitenuta && options.altraRitenutaAliquota
      ? round2(imponibile_totale * (options.altraRitenutaAliquota / 100))
      : 0;

  // Split payment PA: l'IVA è versata direttamente dall'ente PA allo Stato,
  // quindi il fornitore incassa solo imponibile (senza IVA).
  const splitPaymentIva = options.splitPayment ? iva_totale : 0;

  // FIX #3 — bollo e contributo cassa sono già dentro totale_documento:
  // qui NON vanno più ri-sommati (evita il doppio conteggio).
  const totale_da_pagare = round2(
    totale_documento + rivalsa_importo - ritenuta_importo - altra_ritenuta_importo - splitPaymentIva
  );

  return {
    subtotale,
    scontoGlobaleValore,
    imponibile_totale,
    riepilogo_iva,
    iva_totale,
    totale_documento,
    ritenuta_importo,
    cassa_importo,
    rivalsa_importo,
    altra_ritenuta_importo,
    totale_da_pagare,
  };
}

// ─── Validation ──────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export function validateDocumento(
  doc: Partial<DocumentoFiscale>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const tipo = doc.tipo ?? "fattura";
  const isNC = tipo === "nota_credito";

  // Cliente required (except proforma/preventivo)
  if (!["proforma", "preventivo"].includes(tipo)) {
    const snap = doc.cliente_snapshot as ClienteSnapshot | undefined;
    if (!snap?.ragione_sociale) {
      errors.push({
        field: "cliente",
        message: "Il cliente è obbligatorio",
        severity: "error",
      });
    }
  }

  // Data emissione
  if (!doc.data_emissione) {
    errors.push({
      field: "data_emissione",
      message: "La data di emissione è obbligatoria",
      severity: "error",
    });
  }

  // At least 1 riga
  const righe = doc.righe ?? [];
  if (righe.length === 0) {
    errors.push({
      field: "righe",
      message: "Il documento deve avere almeno una riga",
      severity: "error",
    });
  }

  // Each riga validation
  righe.forEach((r, i) => {
    if (!r.descrizione?.trim()) {
      errors.push({
        field: `righe[${i}].descrizione`,
        message: `Riga ${i + 1}: descrizione mancante`,
        severity: "error",
      });
    }
    if (!isNC && r.quantita <= 0) {
      errors.push({
        field: `righe[${i}].quantita`,
        message: `Riga ${i + 1}: quantità deve essere > 0`,
        severity: "error",
      });
    }
    // IVA 0% without natura — only trigger when aliquota is explicitly "0"
    // (parseFloat(undefined) = NaN which incorrectly matches 0 via the || operator)
    if (
      r.aliquota_iva !== undefined &&
      r.aliquota_iva !== null &&
      r.aliquota_iva !== "" &&
      Number(r.aliquota_iva) === 0 &&
      !r.natura_iva
    ) {
      errors.push({
        field: `righe[${i}].natura_iva`,
        message: `Riga ${i + 1}: natura IVA obbligatoria con aliquota 0%`,
        severity: "error",
      });
    }
  });

  // PA without CIG
  const snap = doc.cliente_snapshot as ClienteSnapshot | undefined;
  if (snap?.tipo_cliente === "PA" && !doc.cig) {
    errors.push({
      field: "cig",
      message: "CIG obbligatorio per la Pubblica Amministrazione",
      severity: "warning",
    });
  }

  // RF19 forfettario: all righe must have natura_iva and aliquota 0
  // (This is a soft warning — the XML generator enforces it via Causale)
  if (doc.regime_fiscale === "RF19" || (doc as any)._regimeFiscale === "RF19") {
    righe.forEach((r, i) => {
      if (Number(r.aliquota_iva) > 0) {
        errors.push({
          field: `righe[${i}].aliquota_iva`,
          message: `Riga ${i + 1}: regime forfettario RF19 — IVA deve essere 0% con natura N2.2`,
          severity: "warning",
        });
      }
    });
  }

  // Scadenze mismatch
  const scadenze = doc.scadenze_pagamento ?? [];
  if (scadenze.length > 0) {
    const sumScadenze = round2(
      scadenze.reduce((s, sc) => s + (sc.importo ?? 0), 0)
    );
    if (Math.abs(sumScadenze - (doc.totale_da_pagare ?? 0)) > 0.01) {
      errors.push({
        field: "scadenze",
        message: `La somma delle scadenze (€${sumScadenze.toFixed(2)}) non corrisponde al totale da pagare`,
        severity: "warning",
      });
    }
  }

  // Bollo virtuale obbligatorio: operazioni esenti/escluse/non soggette
  // sopra €77,47 richiedono l'imposta di bollo da €2 (DPR 642/72).
  if (
    !doc.bollo_virtuale &&
    !isNC &&
    !["preventivo", "proforma", "ddt"].includes(tipo) &&
    shouldSuggestBollo(righe, doc.totale_documento ?? 0)
  ) {
    errors.push({
      field: "bollo_virtuale",
      message:
        "Operazioni esenti/escluse sopra €77,47: l'imposta di bollo da €2 è obbligatoria (attivala in Opzioni avanzate)",
      severity: "warning",
    });
  }

  // Sconto globale: percentuale e valore fisso insieme sono ambigui
  // (il calcolo usa la percentuale e ignora il valore).
  if ((doc.sconto_globale_percentuale ?? 0) > 0 && (doc.sconto_globale_valore ?? 0) > 0) {
    const valoreDaPerc = round2(
      (doc.subtotale ?? 0) * ((doc.sconto_globale_percentuale ?? 0) / 100)
    );
    if (Math.abs(valoreDaPerc - (doc.sconto_globale_valore ?? 0)) > 0.01) {
      errors.push({
        field: "sconto_globale",
        message:
          "Indica lo sconto globale come percentuale O come valore fisso, non entrambi (viene applicata la percentuale)",
        severity: "warning",
      });
    }
  }

  return errors;
}

// ─── Bollo suggestion ────────────────────────────────────────

export function shouldSuggestBollo(
  righe: RigaDocumento[],
  totale: number
): boolean {
  if (totale <= 77.47) return false;
  return righe.every(
    (r) => !!r.natura_iva && ["N1", "N2_1", "N2_2", "N4"].includes(r.natura_iva)
  );
}
