import type { DisegnoCad } from './leggiDxf';
import { metriPerUnita } from './contaDisegno';

/** Provenance clues, not proof of construction scope or physical quantities. */
export function affidabilitaDisegno(d: DisegnoCad) {
  const pdfImportato = d.layer.some(name => /(?:^|[|])PDF\d*[_ -]/i.test(name));
  const labels = new Set(d.testi.map(t => t.s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('it')));
  const statiSovrapposti = labels.has('stato di fatto') && labels.has('stato di progetto');
  return { pdfImportato, statiSovrapposti,
    richiedeCalibrazione: pdfImportato || metriPerUnita(d.insunits) === null };
}

/** Blank, negative, zero, overflow and non-decimal values must not silently become 1. */
export function fattoreScalaCad(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const factor = Number(normalized);
  return Number.isFinite(factor) && factor > 0 ? factor : null;
}

export function misureCadPronte(d: DisegnoCad, scala: string, calibrazioneConfermata: boolean): boolean {
  const quality = affidabilitaDisegno(d);
  return !quality.statiSovrapposti && fattoreScalaCad(scala) !== null && (!quality.richiedeCalibrazione || calibrazioneConfermata);
}
