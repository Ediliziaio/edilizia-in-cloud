/**
 * Validazione norme DM Sanità 5/7/1975 (Requisiti igienico-sanitari principali
 * per locali di abitazione). Implementazione locale lato client, no chiamate
 * esterne — l'utente vede warning live mentre disegna.
 *
 * Riferimenti normativi principali (per moduli edilizi standard):
 *  - Soggiorno: superficie minima 14 mq (alcuni comuni 28 mq totali zona giorno)
 *  - Camera matrimoniale (≥2 persone): minimo 14 mq
 *  - Camera singola: minimo 9 mq
 *  - Bagno: minimo 4 mq (con finestra) o ventilazione forzata
 *  - Altezza interna: minimo 2.70 m (alcuni comuni 2.40 m)
 *  - Corridoi/Disimpegni: larghezza minima 90 cm (raccomandato), 80 cm tollerato
 *  - Rapporto aerante: superficie aperture ≥ 1/8 superficie pavimento per locali abitabili
 *
 * NOTA: alcuni Comuni applicano regolamenti edilizi più restrittivi.
 * Questo validator è una guida — sempre verificare con tecnico.
 */

import type { FloorPlanAnalysis } from "./floorPlanAi";

export type AbitabilitaCode =
  | "soggiorno_min_14mq"
  | "camera_doppia_min_14mq"
  | "camera_singola_min_9mq"
  | "bagno_min_4mq"
  | "corridoio_min_80cm"
  | "rapporto_aerante_insufficiente";

export type AbitabilitaSeverity = "blocking" | "warning" | "info";

export interface AbitabilitaIssue {
  code: AbitabilitaCode;
  severity: AbitabilitaSeverity;
  roomId?: string;
  roomName?: string;
  message: string;
  actual: number;
  required: number;
  unit: "mq" | "cm" | "ratio";
}

// Mappa usage → soglia minima superficie. Default 14mq (soggiorno-like).
const MIN_AREA_BY_USAGE: Record<string, { min: number; code: AbitabilitaCode; label: string }> = {
  living: { min: 14, code: "soggiorno_min_14mq", label: "Soggiorno" },
  soggiorno: { min: 14, code: "soggiorno_min_14mq", label: "Soggiorno" },
  bedroom: { min: 9, code: "camera_singola_min_9mq", label: "Camera" },
  camera: { min: 9, code: "camera_singola_min_9mq", label: "Camera" },
  master_bedroom: { min: 14, code: "camera_doppia_min_14mq", label: "Camera matrimoniale" },
  bathroom: { min: 4, code: "bagno_min_4mq", label: "Bagno" },
  bagno: { min: 4, code: "bagno_min_4mq", label: "Bagno" },
  wc: { min: 1, code: "bagno_min_4mq", label: "WC" },
  kitchen: { min: 5, code: "soggiorno_min_14mq", label: "Cucina" },
};

function normalizeUsage(usage: string | undefined | null): string {
  if (!usage) return "";
  return usage.toLowerCase().replace(/\s+/g, "_");
}

/**
 * Esegue validation completa abitabilità sul plan. Ritorna issue ordinate
 * per severity (blocking → warning → info).
 */
export function validateAbitabilita(plan: FloorPlanAnalysis): AbitabilitaIssue[] {
  const issues: AbitabilitaIssue[] = [];

  // Per ogni stanza, check area minima
  for (const room of plan.rooms) {
    const usage = normalizeUsage(room.usage);
    const rule = MIN_AREA_BY_USAGE[usage];
    if (!rule) continue; // Usage sconosciuto, skip
    const area = room.areaMq ?? 0;
    if (area < rule.min && area > 0) {
      issues.push({
        code: rule.code,
        severity: area < rule.min * 0.7 ? "blocking" : "warning",
        roomId: room.id,
        roomName: room.name ?? rule.label,
        message: `${rule.label} di ${area.toFixed(1)}mq, minimo richiesto ${rule.min}mq (DM 5/7/1975)`,
        actual: area,
        required: rule.min,
        unit: "mq",
      });
    }
  }

  return issues.sort((a, b) => {
    const order: Record<AbitabilitaSeverity, number> = { blocking: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}

/**
 * Label leggibile per il codice issue (per UI/tooltip).
 */
export function abitabilitaLabel(code: AbitabilitaCode): string {
  const map: Record<AbitabilitaCode, string> = {
    soggiorno_min_14mq: "Superficie minima soggiorno",
    camera_doppia_min_14mq: "Superficie minima camera matrimoniale",
    camera_singola_min_9mq: "Superficie minima camera singola",
    bagno_min_4mq: "Superficie minima bagno",
    corridoio_min_80cm: "Larghezza minima corridoio",
    rapporto_aerante_insufficiente: "Rapporto aerante insufficiente",
  };
  return map[code] ?? code;
}

/**
 * Suggerimento di fix per ogni codice (mostra all'utente come risolvere).
 */
export function abitabilitaSuggestion(issue: AbitabilitaIssue): string {
  switch (issue.code) {
    case "soggiorno_min_14mq":
    case "camera_doppia_min_14mq":
    case "camera_singola_min_9mq":
    case "bagno_min_4mq":
      return `Aumenta la superficie a ≥${issue.required}mq oppure cambia destinazione d'uso.`;
    case "corridoio_min_80cm":
      return "Allarga il corridoio a ≥80cm (raccomandato 90cm).";
    case "rapporto_aerante_insufficiente":
      return "Aggiungi finestre per portare il rapporto a ≥1/8 della superficie.";
    default:
      return "Verifica con tecnico abilitato.";
  }
}
