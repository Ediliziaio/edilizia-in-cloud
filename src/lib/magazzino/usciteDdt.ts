/**
 * Uscite di magazzino → DDT: le regole pure, senza React, così si provano da
 * sole e i componenti restano solo componenti.
 */
import type { UscitaRow } from "@/hooks/warehouse/useWarehouseUscita";
import type { DestinatarioUscita } from "@/lib/ddt/causaliTrasporto";

/** Quello che serve alla finestra del DDT di un'uscita. */
export interface UscitaPerDdt {
  id: string;
  numero: string;
  destinatario_tipo: DestinatarioUscita;
  /** Chi riceve, per il titolo. */
  destinatario: string;
  /** Righe dell'uscita: proposte come numero di colli. */
  righe: number;
}

/** Il nome del destinatario di un'uscita, come si legge nell'elenco. */
export function destinatarioLabel(
  u: Pick<UscitaRow, "cliente_snapshot" | "destinatario_libero" | "destinatario_tipo">,
): string {
  return (
    u.cliente_snapshot?.ragione_sociale ||
    u.destinatario_libero?.ragione_sociale ||
    (u.destinatario_tipo === "cantiere" ? "Cantiere/commessa" : u.destinatario_tipo === "cliente" ? "Cliente" : "Destinatario libero")
  );
}

export function uscitaPerDdt(u: UscitaRow): UscitaPerDdt {
  return {
    id: u.id,
    numero: u.numero,
    destinatario_tipo: u.destinatario_tipo,
    destinatario: destinatarioLabel(u),
    righe: Array.isArray(u.righe) ? u.righe.length : 0,
  };
}

/** I dati di trasporto come li vuole `create_ddt_from_uscita` (p_ddt_extra). */
export function datiTrasportoDdt(v: {
  causale: string;
  porto: string;
  colli: string;
  aspetto: string;
  peso: string;
}): Record<string, string> {
  const extra: Record<string, string> = { causale_trasporto: v.causale, porto: v.porto };
  const colli = Number.parseInt(v.colli, 10);
  if (Number.isFinite(colli) && colli > 0) extra.numero_colli = String(colli);
  if (v.aspetto.trim()) extra.aspetto_beni = v.aspetto.trim();
  if (v.peso.trim()) extra.peso = v.peso.trim();
  return extra;
}
