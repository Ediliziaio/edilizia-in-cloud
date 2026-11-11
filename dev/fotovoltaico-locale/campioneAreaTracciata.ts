import punti from "./esempi/perimetro-delft-tracciato.json";
import {posaCasaReale,edificioCasaReale} from "./casaTettoReale";
import {FOTO_BBOX,dallaFotoAlDisegno} from "./tettoReale";
import {applicaAreaPosa} from "./areaPosa";
/** Quattro punti scelti a mano nella UI locale; area prudenziale, non un rilievo topografico. */
export const PUNTI_AREA_CASA_TRACCIATA=punti;
export const posaCasaTracciata=applicaAreaPosa(posaCasaReale,"faccia-22",punti.map(p=>dallaFotoAlDisegno(edificioCasaReale,"faccia-22",{x:FOTO_BBOX.minX+p.x*(FOTO_BBOX.maxX-FOTO_BBOX.minX)/800-edificioCasaReale.origine.x,y:FOTO_BBOX.maxY-p.y*(FOTO_BBOX.maxY-FOTO_BBOX.minY)/800-edificioCasaReale.origine.y}))).piano;
