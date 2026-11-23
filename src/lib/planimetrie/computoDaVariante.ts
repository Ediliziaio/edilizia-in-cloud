import { ConflittoComputoCloud, leggiComputoCloud, primoComputoCloudEsistente, salvaComputoCloud } from "@/lib/computo/cloudComputo";
import { chiaveBozzaComputo } from "@/lib/computo/editorNativo";
import { caricaPlanimetria, caricaVersione, elencaVersioni } from "./archivio";
import { computoStudio, computoStudioRevisionato, idComputoStudio, studioVariante, type FonteStudio } from "./studioImmobiliare";
import { ambitiDi } from "../../../shared/planimetrie/modello.ts";
import { verificaUrbanisticaAperta } from "../../../shared/planimetrie/urbanistica.ts";

/** Unica bozza per azienda, planimetria, versione e variante, qualunque sia la pagina di partenza. */
export async function apriComputoDaVariante(companyId: string, userId: string, fonte: FonteStudio) {
  const { planimetriaId, varianteId, versione } = fonte;
  const corrente = await caricaPlanimetria(planimetriaId);
  if (corrente.riga.company_id !== companyId) throw new Error("Scegli una planimetria di questa azienda.");
  const id = await idComputoStudio(fonte);
  if (await leggiComputoCloud(companyId,id)) return { id, precedente:null };

  const revisione = versione === corrente.versione.numero ? corrente.versione : await caricaVersione(planimetriaId,versione);
  const documento = revisione.documento;
  const variante = ambitiDi(documento).find(a => a.propostaId === varianteId);
  if (!variante) throw new Error("La variante non è disponibile in questa versione.");
  const studio = studioVariante(documento,varianteId);
  if (!studio.righe.length) throw new Error("Aggiungi lavorazioni alla variante per generare il computo.");
  if (studio.bagniDaRivedere.length || studio.cucineDaRivedere.length) throw new Error("Rivedi i locali degli spostamenti nella variante.");
  const aperte = verificaUrbanisticaAperta(documento.urbanistica,varianteId,versione);
  let bozza = computoStudio(fonte,`${documento.titolo || corrente.riga.titolo} · ${variante.nome}`,studio.righe,aperte);
  let precedente: number | null = null;
  const fonti = await Promise.all((await elencaVersioni(planimetriaId)).filter(v => v.numero < versione).map(async v => ({
    numero:v.numero, id:await idComputoStudio({...fonte,versione:v.numero}),
  })));
  const precedenteId = await primoComputoCloudEsistente(companyId,fonti.map(f=>f.id));
  const daRiprendere = fonti.find(f=>f.id===precedenteId);
  if (daRiprendere) {
    const cloud = await leggiComputoCloud(companyId,daRiprendere.id);
    if (cloud) {
      const vecchia = await caricaVersione(planimetriaId,daRiprendere.numero);
      bozza = computoStudioRevisionato(bozza,cloud.bozza,
        computoStudio({...fonte,versione:daRiprendere.numero},"",studioVariante(vecchia.documento,varianteId).righe),
        new Set(studio.righe.filter(r=>r.quantificazioneSospesa).map(r=>r.id)));
      precedente = daRiprendere.numero;
    }
  }

  const scope = chiaveBozzaComputo(companyId,userId,`preventivo:${id}`);
  try {
    await salvaComputoCloud(companyId,id,scope,bozza,0);
  } catch (e) {
    if (!(e instanceof ConflittoComputoCloud) || !await leggiComputoCloud(companyId,id)) throw e;
    return { id, precedente:null };
  }
  return { id, precedente };
}
