import {
  normalizzaProdottoPos,
  type ProdottoPos,
} from "../../../supabase/functions/_shared/posProdotti";
import type { ImpiegoProdottoSds } from "./prodottiSds";
/** Only the saved inventory version is proposed. Current live documents never silently replace it. */
export function fotografaProdottoPos(p: ImpiegoProdottoSds): ProdottoPos {
  const e = p.evidenza_snapshot;
  return normalizzaProdottoPos({
    impiego_id: p.id,
    versione: p.versione,
    nome: p.nome,
    produttore: p.produttore,
    codice: p.codice,
    impiego: p.impiego,
    area: p.area,
    fase_id: p.fase_id,
    subappaltatore_id: p.subappaltatore_id,
    dal: p.dal,
    al: p.al,
    sds_necessaria: p.sds_necessaria,
    motivo_non_necessaria: p.motivo_non_necessaria,
    materiale_id: p.materiale_id,
    materiale_impronta: p.materiale_impronta,
    evidenza_id: p.evidenza_id,
    evidenza_impronta: p.evidenza_impronta,
    sds_revisione: e?.revisione,
    sds_data: e?.data_rilascio,
    sds_stato: e?.stato,
    sds_file_name: e?.file_name,
    corrispondenza_confermata: p.corrispondenza_confermata,
    verificato: false,
  });
}
