import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { useFontiGenerale } from "@/hooks/useGeneraleInvestitori";
import { useIsMobile } from "@/hooks/use-mobile";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { stimaMancante } from "@/lib/orders/generali/budgetCompletezza";
import { moduliDelModello } from "@/lib/orders/generali/moduli";
import type { UnitaDalPiano } from "@/lib/orders/generali/unitaDalPiano";
import { euro } from "../piano/formato";
import { CompletaOperazione, type PassoOperazione } from "./CompletaOperazione";
import { useT } from "@/lib/campo/lingua/LinguaCampo";


export function AvvisiPiano({
  riepilogo,
  dalPiano = null,
  puoModificare = false,
}: {
  riepilogo: RiepilogoGenerale;
  /** Le unità che il piano elenca e non sono ancora state create (useUnitaDalPiano). */
  dalPiano?: UnitaDalPiano | null;
  puoModificare?: boolean;
}) {
  const n = useGeneralePianoNumeri(riepilogo);
  // Il quinto passo: da dove arrivano i soldi (era in «Per partire», che col piano non compare più).
  const conFonti = riepilogo.generale.modello !== "appalto" && riepilogo.permessi.margini;
  const fonti = useFontiGenerale(riepilogo.generale.id, conFonti);
  const [parametri, setParametri] = useSearchParams();
  const telefono = useIsMobile();
  const t = useT();
  if (!riepilogo.permessi.margini || n.isLoading || n.isError || (conFonti && fonti.isLoading)) return null;

  const vai = (scheda: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", scheda);
    if (scheda === "piano") {
      p.set("vista-piano", "voci");
      p.delete("categorie-costo");
    }
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    setParametri(p);
  };

  // Il percorso dell'operazione appena caricata: finché manca qualcosa, prende il posto degli
  // avvisi sul budget (che direbbero le stesse cose senza dire da dove si comincia).
  const passi: PassoOperazione[] = [];
  if (!n.vuoto && n.inVista) {
    const senzaMese = n.voci.filter((v) => v.importo > 0 && !v.mese).length;
    const daStimare = n.voci.filter(stimaMancante).length;
    const approvato = !!n.approvata;
    const conUnita = moduliDelModello(riepilogo.generale.modello).includes("unita");
    const unitaCreate = riepilogo.figlie.length;
    const bozzaModificabile = puoModificare && n.inVista.stato === "bozza";
    const quanteFonti = conFonti && Array.isArray(fonti.data) ? fonti.data.length : null;
    if (senzaMese || daStimare || dalPiano || !approvato || quanteFonti === 0) {
      if (conUnita && (dalPiano || unitaCreate > 0))
        passi.push({
          id: "unita",
          titolo: t("Cosa vendi"),
          fatto: unitaCreate > 0 && !dalPiano,
          testo: dalPiano
            ? t("Il piano elenca {composizione}: creale per seguire acquirenti e incassi.", { composizione: dalPiano.composizione })
            : t(unitaCreate === 1 ? "1 unità creata." : "{n} unità create.", { n: unitaCreate }),
          azione: dalPiano && puoModificare ? { etichetta: t("Crea le unità dal piano"), apri: () => vai("unita", { "dal-piano": "1" }) } : undefined,
        });
      passi.push({
        id: "calendario",
        titolo: t("Quando entrano ed escono i soldi"),
        fatto: senzaMese === 0,
        testo: senzaMese
          ? t(senzaMese === 1 ? "1 voce non ha il mese: senza, niente cassa né capitale impegnato." : "{n} voci non hanno il mese: senza, niente cassa né capitale impegnato.", { n: senzaMese })
          : t("Ogni voce con un importo ha il suo mese."),
        azione: { etichetta: bozzaModificabile ? t("Metti i mesi") : t("Apri il piano"), apri: () => vai("piano", bozzaModificabile ? { calendario: "1" } : {}) },
      });
      passi.push({
        id: "stime",
        titolo: t("Le stime che mancano"),
        fatto: daStimare === 0,
        testo: daStimare
          ? t(daStimare === 1 ? "1 voce è ancora da stimare, o da confermare a zero." : "{n} voci sono ancora da stimare, o da confermare a zero.", { n: daStimare })
          : t("Tutte le voci hanno una stima."),
        azione: { etichetta: t("Completa le stime"), apri: () => vai("piano", bozzaModificabile ? { stime: "1" } : {}) },
      });
      passi.push({
        id: "approva",
        titolo: t("Approva il budget"),
        fatto: approvato,
        testo: approvato
          ? t("Approvato: è il riferimento per gli scostamenti.")
          : t("Il piano è ancora in bozza. L’approvazione fissa il riferimento per gli scostamenti."),
        azione: puoModificare ? { etichetta: t("Apri il piano economico"), apri: () => vai("piano") } : undefined,
      });
      if (quanteFonti !== null)
        passi.push({
          id: "fonti",
          titolo: t("Da dove arrivano i soldi"),
          fatto: quanteFonti > 0,
          testo: quanteFonti > 0
            ? t(quanteFonti === 1 ? "1 fonte indicata." : "{n} fonti indicate.", { n: quanteFonti })
            : t("Mezzi propri, soci, banca: per sapere se coprono il capitale che l'operazione chiede."),
          azione: puoModificare ? { etichetta: t("Indica le fonti"), apri: () => vai("investitori") } : undefined,
        });
    }
  }

  const avvisi: string[] = [];
  if (n.vuoto)
    avvisi.push(t("Imposta il budget per confrontare costi e previsione finale."));
  const scarto = n.piano?.confronto.totali.margine.scostamento;
  if (n.piano?.budgetCompleto !== false && scarto !== undefined && scarto < -0.5)
    avvisi.push(t("Il margine stimato è sotto il previsto di {importo}.", { importo: euro(-scarto) }));

  if (!passi.length && !avvisi.length) return null;
  return (
    <>
      {passi.length > 0 && <CompletaOperazione passi={passi} telefono={telefono} />}
      {avvisi.length > 0 && (
        <div className="generale-plan-attention">
          <AlertTriangle aria-hidden="true" />
          <div>
            {avvisi.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
          {!telefono && (
            <button type="button" onClick={() => vai("piano")}>
              {t("Controlla il piano")} <ArrowUpRight aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
