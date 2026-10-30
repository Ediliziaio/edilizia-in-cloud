// src/components/orders/generali/documenti/statoVisivo.ts
// Come si vede lo stato di una voce della checklist: colore e parole brevi (l'icona è in IconaStato.tsx).
import { formattaData, testoCasella, type CasellaDocumento } from "@/lib/orders/generali/documenti";

export type Tono = "verde" | "ambra" | "rosso" | "spento";

export const COLORE_TONO: Record<Tono, string> = {
  verde: "text-emerald-600 dark:text-emerald-400",
  ambra: "text-amber-600 dark:text-amber-400",
  rosso: "text-destructive",
  spento: "text-muted-foreground",
};

export function tonoCasella(c: CasellaDocumento): Tono {
  switch (c.stato) {
    case "presente": return c.senzaData ? "ambra" : "verde";
    case "in_scadenza": return "ambra";
    case "scaduto": return "rosso";
    case "mancante": return c.obbligatoria ? "rosso" : "spento";
    case "non_serve": return "spento";
  }
}

/** Il nome corto per le colonne: «APE — attestato…» → «APE», «Titolo edilizio (PdC…)» → «Titolo edilizio». */
export const nomeBreve = (nome: string) => nome.split(" — ")[0].split(" (")[0];

/** Per il telefono e le caselle della tabella: due o tre parole. */
export function testoBreve(c: CasellaDocumento): string {
  if (c.stato === "presente" && c.senzaData) return "Senza scadenza";
  if (c.stato === "presente") return c.scadenza ? `Scade ${formattaData(c.scadenza).slice(0, 5)}` : "Presente";
  if (c.stato === "scaduto") return "Scaduto";
  if (c.stato === "non_serve") return "Non serve";
  return testoCasella(c);
}
