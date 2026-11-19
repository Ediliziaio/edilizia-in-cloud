export interface VarianteSal {
  status: string;
  impatto_economico: number | string | null;
  approval_recorded_at?: string | null;
  firmato_il?: string | null;
  offline_signed_on?: string | null;
}

/** Il verbale usa lo stesso contratto netto della commessa, incluse solo le varianti approvate. */
export function valoreContrattoSal(base: number | null, variations: ReadonlyArray<VarianteSal>) {
  if (base != null && !Number.isFinite(Number(base))) throw new Error("Importo del contratto non verificabile");
  const approved = variations.filter(v => v.status === "approvato");
  if (approved.some(v => !Number.isFinite(Number(v.impatto_economico ?? 0)))) throw new Error("Importo delle varianti approvate non verificabile");
  const varianti = approved.reduce((sum, v) => sum + Number(v.impatto_economico ?? 0), 0);
  return { totale: Math.round((Number(base ?? 0) + varianti) * 100) / 100, varianti: Math.round(varianti * 100) / 100 };
}

const calendarioRoma = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });

/** Nei verbali già emessi prima del salvataggio del contratto, usa le date documentate. */
export function variantiAlVerbale(varianti: ReadonlyArray<VarianteSal>, sal: { stato: string; data_emissione: string; created_at?: string | null }) {
  if (sal.stato === "bozza") return varianti;
  const creato = Date.parse(sal.created_at ?? "");
  const orarioNoto = Number.isFinite(creato) && calendarioRoma.format(creato) === sal.data_emissione;
  return varianti.filter(v => {
    if (v.status !== "approvato") return false;
    const quando = Date.parse(v.approval_recorded_at ?? v.firmato_il ?? "");
    if (Number.isFinite(quando)) {
      return orarioNoto ? quando <= creato : calendarioRoma.format(quando) <= sal.data_emissione;
    }
    return !!v.offline_signed_on && v.offline_signed_on <= sal.data_emissione;
  });
}
