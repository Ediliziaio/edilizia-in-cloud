/**
 * Il disegno dell'articolo nel preventivatore: serramento = vista interna ed esterna con le quote,
 * persiana = vista da fuori. Si ridisegna da solo a ogni cambio di misure o scelte.
 */
import { miniaturaDaFamiglia, type DisegnoFamiglia } from "@/lib/serramenti/disegnoDaFamiglia";
import type { FamilyWithAxes } from "@/types/articleFamily";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DisegnoSerramentoSvg } from "./DisegnoSerramentoSvg";

const ETICHETTA = { interna: "Da dentro", esterna: "Da fuori" } as const;
const ETICHETTA_PERSIANA = { interna: "Da dentro (si spinge per aprire)", esterna: "Da fuori" } as const;

/**
 * `compatto`: l'anteprima piccola della riga e del listino. Il disegno sta in un riquadro alto `altezza` (la classe
 * `h-*` da sola non basta: l'SVG ha l'altezza in automatico e seguirebbe la larghezza), con poco bianco attorno e le
 * didascalie su una riga. Senza, resta com'era per gli altri (editor del listino, preventivatore generico).
 */
export function AnteprimaDisegnoFamiglia({ disegno, altezza = "h-56", colonna = false, compatto = false }: { disegno: DisegnoFamiglia; altezza?: string; colonna?: boolean; compatto?: boolean }) {
  const griglia = compatto
    ? `grid ${colonna ? "grid-cols-1" : "grid-cols-2"} gap-1 rounded-md border bg-white p-1`
    : colonna ? "grid grid-cols-1 gap-2 rounded-md border bg-white p-2" : "grid grid-cols-2 gap-2 rounded-md border bg-white p-3";
  const didascalia = compatto ? "text-center text-[10px] leading-tight text-muted-foreground" : "text-xs text-muted-foreground";
  const figura = compatto ? "m-0 flex flex-col items-center gap-0.5" : "m-0 flex flex-col items-center gap-1";
  // Compatto: il disegno si adatta al riquadro (centrato, senza uscirne); altrimenti l'SVG prende la larghezza e l'altezza che ne vengono.
  const classeSvg = compatto ? undefined : `${altezza} w-full`;
  const inRiquadro = (svg: ReactNode) => (compatto ? <div className={`${altezza} w-full [&>svg]:!h-full [&>svg]:!w-full [&>svg]:!max-w-none`}>{svg}</div> : svg);
  if (disegno.tipo === "persiana") {
    return (
      <div className={griglia}>
        {disegno.viste.map(({ vista, scena }) => (
          <figure key={vista} className={figura}>
            {inRiquadro(<DisegnoSerramentoSvg scena={scena} vista={vista} finituraInterna={disegno.finituraEsterna} finituraEsterna={disegno.finituraEsterna} compatto={compatto} className={classeSvg} />)}
            <figcaption className={compatto ? didascalia : "text-center text-xs text-muted-foreground"}>{vista === "interna" && disegno.apertura
                ? `Da dentro, apertura a ${disegno.apertura === "dx" ? "destra" : "sinistra"} (si spinge per aprire)`
                : ETICHETTA_PERSIANA[vista]}</figcaption>
          </figure>
        ))}
      </div>
    );
  }
  return (
    <div className={griglia}>
      {disegno.viste.map(({ vista, disegno: d }) => (
        <figure key={vista} className={figura}>
          {inRiquadro(
            <DisegnoSerramentoSvg
              disegno={d}
              finituraInterna={disegno.finituraInterna}
              finituraEsterna={disegno.finituraEsterna}
              finituraTapparella={disegno.finituraTapparella}
              finituraCassonetto={disegno.finituraCassonetto}
              compatto={compatto}
              className={classeSvg}
            />,
          )}
          <figcaption className={didascalia}>
            {vista === "interna" && disegno.aperturaNome ? `Da dentro · ${disegno.aperturaNome}` : vista === "interna" && disegno.apertura ? `Da dentro, apertura a ${disegno.apertura === "dx" ? "destra" : "sinistra"}` : ETICHETTA[vista]}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** La miniatura per l'elenco dei prodotti: il disegno al posto della foto. Null se l'articolo non ha il disegno. */
export function MiniaturaDisegnoFamiglia({ family, className }: { family: FamilyWithAxes; className?: string }) {
  const d = miniaturaDaFamiglia(family);
  if (!d) return null;
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <div className="absolute inset-0 [&>svg]:!h-full [&>svg]:!w-full [&>svg]:!max-w-none">
        {d.tipo === "persiana" ? (
          <DisegnoSerramentoSvg scena={d.viste[0].scena} vista="esterna" mostraQuote={false} />
        ) : (
          <DisegnoSerramentoSvg disegno={d.viste[0].disegno} mostraQuote={false} />
        )}
      </div>
    </div>
  );
}

/**
 * Il disegno dentro una riga del preventivo: piccolo, con la linguetta «Disegno» per chiuderlo.
 * Aperto o chiuso resta per la prossima volta (solo in questo browser).
 */
export function DisegnoDellaRiga({ disegno, colonna = false }: { disegno: DisegnoFamiglia; colonna?: boolean }) {
  const [aperto, setAperto] = useState<boolean>(() => {
    try { return localStorage.getItem("sr_disegno_riga_aperto") !== "0"; } catch { return true; }
  });
  const cambia = () => {
    setAperto((a) => {
      try { localStorage.setItem("sr_disegno_riga_aperto", a ? "0" : "1"); } catch { /* resta valido per questa visita */ }
      return !a;
    });
  };
  return (
    <div>
      <button
        type="button"
        onClick={cambia}
        aria-expanded={aperto}
        className="mb-1 inline-flex items-center gap-1 rounded-t-md border border-b-0 border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
      >
        {aperto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Disegno
      </button>
      {aperto && (
        <div className={`${colonna ? "" : "mx-auto max-w-sm "}rounded-md bg-slate-50 p-1 ring-1 ring-slate-200`}>
          <AnteprimaDisegnoFamiglia disegno={disegno} altezza="h-40" colonna={colonna} compatto />
        </div>
      )}
    </div>
  );
}
