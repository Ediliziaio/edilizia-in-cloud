/** Cose in comune fra le schede della contabilità dei lavori pubblici. */
import type { VoceComputo } from "@/lib/computo/alberoComputo";
import { formatEuro } from "@/lib/computo/computoStrutturato";
import type { RegistrazioneLibretto, VoceContratto } from "@/lib/computo/contabilitaLavori";
import type { IntestazioneContabilita } from "@/lib/computo/stampeContabilita";
import type { ComputoCommessa } from "@/hooks/useComputoCommessa";
import type { ImpostazioniContabilita, RegistrazioneLibrettoDb } from "@/hooks/useContabilitaLavori";

export type SchedaContabilita = "elenco" | "libretto" | "registro" | "sal" | "varianti";

export const euro = (n: number | null | undefined) => (n == null ? "—" : `${formatEuro(n)} €`);
export const quant = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("it-IT", { maximumFractionDigits: 3 }));
export const oggi = () => new Date().toLocaleDateString("en-CA");
export const dataIt = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT") : "");

export function intestazioneDa(computo: ComputoCommessa, imp: ImpostazioniContabilita, orderLabel?: string | null): IntestazioneContabilita {
  const contratto = [imp.contratto_estremi, imp.contratto_data && `del ${dataIt(imp.contratto_data)}`].filter(Boolean).join(" ");
  return {
    lavori: computo.oggetto_lavori || computo.titolo || (orderLabel ? `Commessa ${orderLabel}` : computo.file_name),
    stazioneAppaltante: computo.stazione_appaltante, cig: computo.cig, cup: computo.cup, impresa: imp.impresa,
    contratto: contratto || null, direttoreLavori: imp.direttore_lavori, rup: imp.rup, ribasso: computo.ribasso_percentuale ?? 0,
  };
}

export const comeRegistrazioni = (libretto: RegistrazioneLibrettoDb[]): RegistrazioneLibretto[] =>
  libretto.map(r => ({ id: r.id, numero: r.numero, data: r.data, voce_radice: r.voce_radice, quantita: r.quantita, sal_id: r.sal_id }));

export interface PropsScheda {
  computo: ComputoCommessa;
  voci: VoceComputo[];
  contratto: VoceContratto[];
  orderId: string;
  companyId: string;
  canEdit: boolean;
  canViewAmounts: boolean;
  orderLabel?: string | null;
  impostazioni: ImpostazioniContabilita;
}
