import { FvFotoSolar } from "./FvFotoSolar";
import { useMemo, useState } from "react";
import { edificioDaMappaFv } from "./mappaGeometria";
import { FotoTettoReale } from "./FotoTettoReale";
import { RilievoContext } from "./RilievoContext";
import {
  type DimensioniMappaGoogleFv,
  MappaGoogleFv,
  type StatoMappaGoogleFv,
} from "./MappaGoogleFv";
import type { RilievoRuntime } from "./rilievoLocale";
import { riferimentoMappaGoogleFv } from "./riferimentoMappaGoogle";

export function FotoGoogleMappa(props: Parameters<typeof FotoTettoReale>[0]) {
  const mappa = props.piano.mappa!;
  const [centro, aggiornaCentro] = useState(mappa.origine),
    [zoom, aggiornaZoom] = useState(20),
    [naviga, setNaviga] = useState(false);
  const [comandoVista, setComandoVista] = useState(0);
  const setCentro: typeof aggiornaCentro = (c) => {
    aggiornaCentro(c);
    setComandoVista((v) => v + 1);
  };
  const setZoom: typeof aggiornaZoom = (z) => {
    aggiornaZoom(z);
    setComandoVista((v) => v + 1);
  };
  const [dimensioni, setDimensioni] = useState<DimensioniMappaGoogleFv>({
    w: 640,
    h: 440,
  });
  const [stato, setStato] = useState<StatoMappaGoogleFv>({
    caricando: true,
    pronto: false,
    errore: "",
  });
  const [tentativo, setTentativo] = useState(0);
  const runtime = useMemo<RilievoRuntime>(() => ({
    edificio: edificioDaMappaFv(mappa, props.piano.schema3d?.altezza ?? 8),
    orto: riferimentoMappaGoogleFv(mappa.origine, centro, zoom, dimensioni),
    modello: null,
    fonte: null,
  }), [mappa, centro, zoom, dimensioni, props.piano.schema3d?.altezza]);
  return (
    <>
      <p className="mb-2 text-xs text-slate-600">
        Posa sulla falda inclinata, proiettata sulla vista satellitare. Bordi,
        ostacoli e spazi fra i moduli seguono il disegno metrico.
      </p>
      <div
        className="fv-roof-photo-tools"
        role="group"
        aria-label="Navigazione della mappa del tetto"
      >
        <button
          type="button"
          aria-pressed={naviga}
          onClick={() => setNaviga((v) => !v)}
        >
          Sposta mappa
        </button>
        <button
          type="button"
          aria-label="Avvicina la mappa del tetto"
          disabled={zoom >= 21}
          onClick={() => setZoom((z) => Math.min(21, z + 1))}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Allontana la mappa del tetto"
          disabled={zoom <= 17}
          onClick={() => setZoom((z) => Math.max(17, z - 1))}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            setCentro(mappa.origine);
            setZoom(20);
          }}
        >
          Torna al tetto
        </button>
      </div>
      {stato.caricando && <p role="status">Caricamento del tetto…</p>}
      {stato.errore && (
        <p role="status">
          {stato.errore}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setTentativo((t) => t + 1)}
          >
            Riprova mappa
          </button>{" "}
          Puoi continuare sulla pianta metrica.
        </p>
      )}
      <RilievoContext.Provider value={runtime}>
        <FotoTettoReale
          {...props}
          mostraImmagineIntera
          navigazioneMappa={stato.pronto && naviga}
          onScegliStrumento={() => setNaviga(false)}
          sfondoMappa={
            <>
            <MappaGoogleFv
              key={tentativo}
              centro={centro}
              zoom={zoom}
              comandoVista={comandoVista}
              navigabile={naviga}
              onStato={setStato}
              onDimensioni={(d) =>
                setDimensioni((p) =>
                  Math.abs(p.w - d.w) < .5 && Math.abs(p.h - d.h) < .5 ? p : d
                )}
              onVista={(c, z) => {
                aggiornaCentro((p) =>
                  Math.abs(p.lat - c.lat) < 1e-9 &&
                    Math.abs(p.lng - c.lng) < 1e-9
                    ? p
                    : c
                );
                aggiornaZoom(z);
              }}
            />
            <FvFotoSolar foto={mappa.fotoSolar} centro={centro} zoom={zoom} w={dimensioni.w} h={dimensioni.h}/>
            </>
          }
        />
      </RilievoContext.Provider>
    </>
  );
}
