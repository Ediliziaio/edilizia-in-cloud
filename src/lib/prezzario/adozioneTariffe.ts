import { legacyUnitaFrom } from "@/lib/tariffe/prezziarioImport";
import {
  campiProvenienza,
  conversioneUnitaTariffa,
  erroreVoceTariffa,
  idVoceAdottata,
  prezziTariffaRegionale,
} from "./catalogo";
import type { PrezzarioCapitolo, PrezzarioVoce } from "./tipi";

export async function payloadTariffaRegionale(
  v: PrezzarioVoce,
  opzioni: {
    companyId: string;
    fonte: string;
    capitoli: PrezzarioCapitolo[];
    ricarico: number;
    costoVisibile: boolean;
  },
) {
  const errore = erroreVoceTariffa(v, opzioni.ricarico);
  if (errore) throw new Error(`${v.codice ?? "Voce"}: ${errore}`);
  if (!Number.isFinite(opzioni.ricarico) || opzioni.ricarico < 0)
    throw new Error("Ricarico non valido");
  const conversione = conversioneUnitaTariffa(v.unita_misura)!;
  const { costo, vendita } = prezziTariffaRegionale(v, opzioni.ricarico)!;
  if (!Number.isFinite(vendita) || vendita <= 0)
    throw new Error("Prezzo convertito non valido");
  return {
    id: await idVoceAdottata(opzioni.companyId, "tariffe_aziendali", v.id),
    company_id: opzioni.companyId,
    nome: v.descrizione.trim().slice(0, 120),
    descrizione: v.descrizione.trim(),
    codice: v.codice,
    tipo: conversione.unita === "h" ? "manodopera" : "altro",
    unita_fatturazione: conversione.unita,
    unita: legacyUnitaFrom(conversione.unita),
    prezzo_vendita: vendita,
    fonte: opzioni.fonte,
    attivo: true,
    vertical_associato: null as string | null,
    incidenza_manodopera_pct: v.incidenza_manodopera_pct,
    custom_field_values: campiProvenienza(v, opzioni.capitoli),
    ...(opzioni.costoVisibile
      ? { costo_interno: costo, prezzo_costo: costo }
      : {}),
  };
}
