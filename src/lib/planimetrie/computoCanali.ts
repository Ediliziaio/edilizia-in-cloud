import { ConflittoComputoCloud, leggiComputoCloud, salvaComputoCloud } from "@/lib/computo/cloudComputo";
import { arrotondaDecimale, bozzaVuota, chiaveBozzaComputo, quantitaMisura, voceVuota, type MisuraEditor, type VoceEditor } from "@/lib/computo/editorNativo";
import { idComputoStudio } from "./studioImmobiliare";
import type { RicostruzioneCanali, TrattoCanale } from "./canaliDaTavola";
import { NOMI_RACCORDI } from "./raccordiCanali";
import type { ReteAria } from "./tavolaTecnica";

export const NOMI_RETE_ARIA: Record<ReteAria, string> = { mandata: "Mandata", ripresa: "Ripresa" };

function misuraRettifilo(t: TrattoCanale): MisuraEditor | null {
  if (t.lunghezzaM === null || !t.sezione) return null;
  const perimetro = 2 * (t.sezione.larghezzaMm + t.sezione.altezzaMm) / 1000;
  return {
    id: t.id, descrizione: `Tratto rettilineo ${t.id.split("-").at(-1)} · asse visibile in pianta`,
    parti: "", lunghezza: String(arrotondaDecimale(t.lunghezzaM, 3)), larghezza: String(perimetro), altezza: "", formula: "",
  };
}

export function superficieRettifilo(t: TrattoCanale): number | null {
  const misura = misuraRettifilo(t);
  return misura ? quantitaMisura(misura) : null;
}

export function bozzaComputoCanali(studio: RicostruzioneCanali, titolo: string, versione: number) {
  const bozza = bozzaVuota();
  const conRaccordi = studio.raccordi.length > 0;
  bozza.titolo = `Computo canali${conRaccordi ? " e raccordi" : ""} · ${titolo}`.slice(0, 160);
  bozza.oggetto = `Computo preliminare dalla tavola HVAC · planimetria v${versione}`;
  bozza.formatoPdf = "tecnico";
  bozza.mostraMisurePdf = true;
  const noti = new Map<string, { rete: ReteAria; sezione: NonNullable<TrattoCanale["sezione"]>; misure: MisuraEditor[] }>();
  for (const t of studio.tratti) {
    const misura = misuraRettifilo(t);
    if (!misura || !t.sezione) continue;
    const chiave = `${t.rete}:${t.sezione.larghezzaMm}:${t.sezione.altezzaMm}`;
    const gruppo = noti.get(chiave);
    if (gruppo) gruppo.misure.push(misura);
    else noti.set(chiave, { rete: t.rete, sezione: t.sezione, misure: [misura] });
  }
  const righe: VoceEditor[] = [...noti.values()].map(({ rete, sezione, misure }) => ({
      ...voceVuota(), capitolo: "Impianto aeraulico", categoria: NOMI_RETE_ARIA[rete],
      descrizione: `Canale rettilineo rettangolare ${sezione.larghezzaMm} × ${sezione.altezzaMm} mm · ${NOMI_RETE_ARIA[rete].toLowerCase()}`,
      unita: "mq", misure,
      noteMisure: conRaccordi
        ? "Sviluppo laterale 2 × (larghezza + altezza) × lunghezza d’asse in pianta. Per i rettifili netti, detrarre gli ingombri dei raccordi dopo il rilievo."
        : "Sviluppo laterale 2 × (larghezza + altezza) × lunghezza in pianta. Lunghezza stimata su scale distinte per i due assi. Confermare sull’originale.",
  }));
  const daMisurare = (categoria: string, descrizione: string, noteMisure: string) => ({
    ...voceVuota(), capitolo: "Impianto aeraulico", categoria, descrizione, noteMisure, daQuantificare: true,
  });
  for (const rete of ["mandata", "ripresa"] as const) {
    const aperti = studio.tratti.filter((t) => t.rete === rete && (t.lunghezzaM === null || !t.sezione));
    if (aperti.length) righe.push(daMisurare(NOMI_RETE_ARIA[rete], `Canali ${NOMI_RETE_ARIA[rete].toLowerCase()} · ${aperti.length} tratti da misurare`,
      "Verificare sezioni, dimensioni e continuità del tracciato sulla tavola impiantistica."));
    if (conRaccordi) {
      const raccordi = studio.raccordi.filter(r => r.rete === rete);
      for (const tipo of ["curva", "derivazione"] as const) {
        const visibili = raccordi.filter(r => r.tipo === tipo && !r.trattoCoperto);
        if (!visibili.length) continue;
        righe.push({
          ...voceVuota(), capitolo: "Raccordi aeraulici", categoria: NOMI_RETE_ARIA[rete],
          descrizione: `${NOMI_RACCORDI[tipo]} · ${NOMI_RETE_ARIA[rete].toLowerCase()}`,
          unita: "cad",
          misure: visibili.map(r => ({
            id: r.id, descrizione: `Raccordo ${r.id.split("-").at(-1)} · lettura dalla tavola`,
            parti: "1", lunghezza: "", larghezza: "", altezza: "", formula: "",
          })),
          noteMisure: "Conteggio preliminare. Verificare sezioni d’imbocco, ingombri e raggi di posa.",
        });
      }
      const coperti = raccordi.filter(r => r.trattoCoperto);
      if (coperti.length) righe.push({
        ...daMisurare(NOMI_RETE_ARIA[rete], `Raccordi coperti · ${NOMI_RETE_ARIA[rete].toLowerCase()} · ${coperti.length} da confermare`,
          "Controllare il collegamento, la sezione e il raggio sull’originale prima di conteggiare i pezzi."),
        capitolo: "Raccordi aeraulici", unita: "cad",
      });
    }
  }
  righe.push(daMisurare("Collegamenti e accessori", conRaccordi ? "Attacchi UTA, salti di quota e accessori" : "Raccordi, raccordo UTA, salti di quota e accessori",
    "Verificare giunzioni, riduzioni, calate, diffusori, griglie, serrande, staffaggi e isolamento. Misurare anche i tratti coperti."));
  return { ...bozza, voci: righe };
}

export async function apriComputoCanali(
  studio: RicostruzioneCanali,
  dati: { companyId: string; userId: string; planimetriaId: string; versione: number; livelloId: string; titolo: string },
) {
  const { companyId, userId, planimetriaId, versione, livelloId, titolo } = dati;
  if (!studio.tratti.length) throw new Error("Carica una tavola con i tracciati di mandata e ripresa.");
  const varianteId = `hvac:${livelloId}${studio.raccordi.length ? ":raccordi" : ""}`;
  const id = await idComputoStudio({ planimetriaId, versione, varianteId });
  if (await leggiComputoCloud(companyId, id)) return id;
  const scope = chiaveBozzaComputo(companyId, userId, `preventivo:${id}`);
  try {
    await salvaComputoCloud(companyId, id, scope, bozzaComputoCanali(studio, titolo, versione), 0);
  } catch (e) {
    if (!(e instanceof ConflittoComputoCloud) || !await leggiComputoCloud(companyId, id)) throw e;
  }
  return id;
}
