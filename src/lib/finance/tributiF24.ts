import type { BankMovement } from "@/lib/finance/bankWorkspace";

/** Tipi di «Tributi pagati» che tesoreria_f24_registra accetta (28/11/2026). */
export type TipoTributo = "iva" | "ritenute" | "contributi" | "altro";
export const TIPI_TRIBUTO: { id: TipoTributo; label: string }[] = [
  { id: "iva", label: "IVA" },
  { id: "ritenute", label: "Ritenute" },
  { id: "contributi", label: "Contributi" },
  { id: "altro", label: "Altro" },
];

/** Il pannello F24 compare solo dove serve: un'uscita F24 «da gestire» con qualcosa da collegare. */
export function mostraTributiF24(natura: string, esito: string, m: Pick<BankMovement, "amount" | "chiuso_senza_documento" | "links">) {
  return natura === "f24" && esito === "da_gestire" && Number(m.amount) < 0 && !m.chiuso_senza_documento && Number(m.links?.remaining) > 0.004;
}
