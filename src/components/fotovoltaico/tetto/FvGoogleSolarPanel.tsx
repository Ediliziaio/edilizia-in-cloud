import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  MappaFv,
  PosizioneMappaFv,
} from "../../../../supabase/functions/_shared/fvMappa";
import type {
  FotoSolarFv,
} from "../../../../supabase/functions/_shared/fvGoogleSolar";
import type {
  MisureTettoSolarFv,
  RasterSolarFv,
} from "@/lib/fotovoltaico/solarRaster";
import { qualitaSolarValida } from "../../../../supabase/functions/_shared/fvGoogleSolar";
import { Button } from "@/components/ui/button";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
const qualitaFoto = { HIGH: "alta", MEDIUM: "media", BASE: "base" };
type Analisi = {
  chiave: string;
  foto: Omit<FotoSolarFv, "path">;
  jpeg: string;
  dsm: RasterSolarFv;
  mask: RasterSolarFv;
};
export function FvGoogleSolarPanel({
  progettoId,
  posizione,
  mappa,
  modificabile,
  pannelli,
  onFoto,
  onMisure,
}: {
  progettoId?: string | null;
  posizione: PosizioneMappaFv;
  mappa: MappaFv;
  modificabile: boolean;
  pannelli: number;
  onFoto: (foto: FotoSolarFv | undefined) => void;
  onMisure: (misure: MisureTettoSolarFv) => void;
}) {
  const t = useT();
  const [analisi, setAnalisi] = useState<Analisi | null>(null),
    [occupato, setOccupato] = useState(false),
    [errore, setErrore] = useState(""),
    [misure, setMisure] = useState<
      { chiave: string; valore: MisureTettoSolarFv } | null
    >(null);
  const chiave = `${progettoId}:${posizione.lat}:${posizione.lng}`,
    corrente = useRef(chiave);
  useEffect(() => {
    corrente.current = chiave;
    return () => {
      corrente.current = "";
    };
  }, [chiave]);
  const attuale = analisi?.chiave === chiave ? analisi : null,
    confini = JSON.stringify(mappa.falde),
    chiaveMisure = `${chiave}:${confini}`;
  const invoca = async (
    azione: string,
    extra: Record<string, unknown> = {},
  ) => {
    const { data, error } = await supabase.functions.invoke(
      "fv-solar-api-fetch",
      {
        body: {
          progetto_id: progettoId,
          lat: posizione.lat,
          lng: posizione.lng,
          azione,
          ...extra,
        },
      },
    );
    if (error || data?.error) {
      throw Error(
        data?.message || t("Il collegamento Google Solar non risponde. Riprova."),
      );
    }
    return data;
  };
  const carica = async () => {
    if (occupato) return;
    setOccupato(true);
    setErrore("");
    try {
      // Foto e DSM possono esserci anche senza un edificio classificato in Building Insights.
      const layers = await invoca("layers");
      const quality = layers.qualitaGoogle === "LOW"
        ? "BASE"
        : layers.qualitaGoogle;
      if (layers.disponibile !== true || !qualitaSolarValida(quality)) {
        throw Error(t("Google non ha restituito una foto verificabile del tetto"));
      }
      const [rgb, dsm, mask] = await Promise.all(
        ["rgb", "dsm", "mask"].map((livello) => invoca("raster", { livello })),
      );
      const { rasterSolarFv, jpegSolarFv } = await import(
        "@/lib/fotovoltaico/solarRaster"
      );
      const [r, d, m] = await Promise.all([
        rasterSolarFv(rgb.contenuto, true),
        rasterSolarFv(dsm.contenuto),
        rasterSolarFv(mask.contenuto),
      ]);
      if (!layers.imagery_date) {
        throw Error(
          t("Google non ha indicato la data della foto: riprova o continua con la mappa"),
        );
      }
      if (corrente.current !== chiave) return;
      setAnalisi({
        chiave,
        foto: {
          larghezza: r.w,
          altezza: r.h,
          angoli: [r.gps(0, 0), r.gps(r.w, 0), r.gps(0, r.h)],
          data: layers.imagery_date,
          qualita: quality,
          risoluzione: r.passo,
        },
        jpeg: jpegSolarFv(r),
        dsm: d,
        mask: m,
      });
      setMisure(null);
    } catch (e) {
      if (corrente.current === chiave) {
        setErrore(
          e instanceof Error ? e.message : t("Analisi Google non disponibile"),
        );
      }
    } finally {
      setOccupato(false);
    }
  };
  const salvaFoto = async () => {
    if (!attuale || occupato) return;
    setOccupato(true);
    setErrore("");
    try {
      const { path } = await invoca("salva_foto", {
        contenuto: attuale.jpeg.split(",")[1],
      });
      if (corrente.current === chiave) onFoto({ ...attuale.foto, path });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : t("Foto non salvata"));
    } finally {
      setOccupato(false);
    }
  };
  const misura = async () => {
    if (!attuale) return;
    setErrore("");
    try {
      const { misureTettoSolarFv } = await import(
        "@/lib/fotovoltaico/solarRaster"
      );
      const valore = misureTettoSolarFv(mappa, attuale.dsm, attuale.mask, attuale.foto.data);
      setMisure({ chiave: chiaveMisure, valore });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : t("Quote non disponibili"));
    }
  };
  const proponi = misure?.chiave === chiaveMisure ? misure.valore : null;
  return (
    <section
      aria-label={t("Foto e misure Google Solar")}
      className="my-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm"
    >
      <h4 className="font-semibold">{t("Foto e misure Google Solar")}</h4>
      <p className="text-xs text-slate-600">
        {t("Una foto georeferenziata e quote del tetto, dove disponibili.")}
      </p>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={!progettoId || occupato || !modificabile}
        onClick={() => void carica()}
      >
        {occupato
          ? t("Analisi Google in corso…")
          : t("Analizza questo tetto con Google")}
      </Button>
      {!progettoId && (
        <p className="text-xs">{t("Salva prima la bozza per analizzare il tetto.")}</p>
      )}
      {errore && (
        <p role="status" className="text-xs text-amber-800">{t("{errore} Il disegno salvato resta disponibile.", { errore: String(errore ?? "") })}</p>
      )}
      {mappa.fotoSolar && (
        <p className="text-xs text-slate-600">{t("Foto salvata: {data} · qualità {valore} · {valore2} cm/pixel", { data: String(mappa.fotoSolar.data ?? ""), valore: String(qualitaFoto[mappa.fotoSolar.qualita] ?? ""), valore2: Math.round(mappa.fotoSolar.risoluzione * 100) })}</p>
      )}
      {mappa.fotoSolar && modificabile && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => onFoto(undefined)}
        >
          {t("Usa la vista Google Maps")}
        </Button>
      )}
      {attuale && (
        <>
          <img
            src={attuale.jpeg}
            alt={t("Anteprima della foto Google Solar del tetto")}
            className="w-full rounded-lg"
          />
          <p className="text-xs" translate="no">
            Google Maps · Source: Includes solar data from Google
          </p>
          <p className="text-xs">{t("Google Solar · {data} · qualità {valore} · {valore2} cm/pixel", { data: String(attuale.foto.data ?? ""), valore: String(qualitaFoto[attuale.foto.qualita] ?? ""), valore2: Math.round(attuale.foto.risoluzione * 100) })}</p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={occupato || !modificabile}
            onClick={() => void salvaFoto()}
          >
            {t("Usa la foto Google Solar")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!mappa.falde.length || occupato}
            onClick={() => void misura()}
          >
            {t("Misura le falde disegnate")}
          </Button>
          {proponi && (
            <div className="space-y-2 text-xs">
              <p>
                {proponi.altezza == null ? t("Altezza da confermare manualmente") : t("Gronda minima dal terreno: {altezza} m", { altezza: proponi.altezza.toLocaleString(intlCampo(), { maximumFractionDigits: 2 }) })}
                {" · "}{t("scarto del piano:")} {proponi.scarto.toLocaleString(intlCampo(), { maximumFractionDigits: 2 })} m
              </p>
              {proponi.avvisoAltezza && <p className="text-amber-800">{t("{avvisoAltezza}. Le pendenze restano consultabili; l’altezza già inserita viene mantenuta.", { avvisoAltezza: String(proponi.avvisoAltezza ?? "") })}</p>}
              {proponi.falde.map((f) => (
                <p key={f.id}>{t("{nome}: {inclinazione}° · azimut {azimut}°", { nome: String(f.nome ?? ""), inclinazione: f.inclinazione.toFixed(1), azimut: f.azimut.toFixed(0) })}</p>
              ))}
              <Button
                type="button"
                className="w-full"
                disabled={!modificabile || pannelli > 0}
                onClick={() => onMisure(proponi)}
              >
                {t("Applica le misure alle falde")}
              </Button>
              {pannelli > 0 && (
                <p>
                  {t("La posa contiene già pannelli: le misure sono consultabili. Per applicarle prepara una nuova disposizione senza moduli.")}
                </p>
              )}
              <p>
                {t("Stima da dati Google, da confermare con sopralluogo. Le quote non sostituiscono un rilievo.")}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
