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

export function calcolaRiepilogoIVA(
  righe: RigaDocumento[],
  proportionalDiscount: number = 0
): RiepilogoIVA[] {
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
        esigibilita: "I" as const,
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

    return {
      ...r,
      imponibile: discountedImponibile,
      imposta: discountedImposta,
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
  arrotondamento?: number;
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
  const riepilogo_iva = calcolaRiepilogoIVA(computed, discountRatio);

  const iva_totale = riepilogo_iva.reduce((s, r) => s + r.imposta, 0);
  const totale_documento = round2(
    imponibile_totale + iva_totale + (options.arrotondamento ?? 0)
  );

  const bollo = options.bolloVirtuale ? (options.bolloImporto ?? 2) : 0;

  const ritenuta_importo =
    options.ritenutaAcconto && options.ritenutaAliquota
      ? round2(imponibile_totale * (options.ritenutaAliquota / 100))
      : 0;

  const cassa_importo =
    options.cassaPrevidenziale && options.cassaAliquota
      ? round2(
          (options.cassaImponibile ?? imponibile_totale) *
            (options.cassaAliquota / 100)
        )
      : 0;

  const totale_da_pagare = round2(
    totale_documento + bollo + cassa_importo - ritenuta_importo
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
    if (r.quantita <= 0) {
      errors.push({
        field: `righe[${i}].quantita`,
        message: `Riga ${i + 1}: quantità deve essere > 0`,
        severity: "error",
      });
    }
    // IVA 0% without natura
    if (
      (parseFloat(r.aliquota_iva) || 0) === 0 &&
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
