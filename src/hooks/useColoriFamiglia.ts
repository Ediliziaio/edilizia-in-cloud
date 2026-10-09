import { useState } from "react";
import type { FamilyWithAxes } from "@/types/articleFamily";
import { cambiaLato, leggiColori, scriviLato, snapshotColori, type LatoColore } from "@/lib/serramenti/coloriDentroFuori";
import { coloriDentroFuoriAbilitati, guidaPrezzoColori, leggiCatalogoColori, testiColoriCatalogo, verificaColori } from "@/lib/serramenti/catalogoColori";

/** Stesso stato e serializzazione nel simulatore desktop e nel preventivo generico. */
export function useColoriFamiglia(family: FamilyWithAxes, selections: Record<string, string>, prezzo: (id: string) => number | null) {
  const asse = coloriDentroFuoriAbilitati(family) ? family.axes.find(a => a.codice === "colore") : undefined;
  const iniziali = () => asse ? leggiColori(asse, { valori_assi: selections }) : null;
  const [salvati, setSalvati] = useState(() => ({ familyId: family.id, colori: iniziali() }));
  const colori = salvati.familyId === family.id && salvati.colori ? salvati.colori : iniziali();
  const setColori = (aggiorna: (prima: NonNullable<typeof colori> | null) => typeof colori) => setSalvati({ familyId: family.id, colori: aggiorna(colori) });
  const catalogo = leggiCatalogoColori(family.custom_field_values);
  const guida = asse && colori ? guidaPrezzoColori(asse, colori, catalogo, prezzo) : null;
  const stato = asse && colori ? verificaColori(asse, colori, catalogo) : null;
  const testi = asse && colori ? testiColoriCatalogo(asse, colori, catalogo) : null;
  const selezione = { ...selections };
  if (asse && colori) {
    delete selezione.colore;
    if (guida) selezione.colore = guida.valueId;
    Object.assign(selezione, snapshotColori(colori, testi ?? undefined));
  }
  return {
    asse, colori, catalogo, guida, stato, testi, selezione,
    cambia: (lato: LatoColore, valueId: string, voce: string | null) => setColori(prima => prima ? cambiaLato(prima, lato, valueId, voce) : prima),
    scrivi: (lato: LatoColore, testo: string) => setColori(prima => prima ? scriviLato(prima, lato, testo, guida) : prima),
    elenco: (lato: LatoColore) => setColori(prima => prima && guida ? cambiaLato(prima, lato, guida.valueId, guida.voce) : prima),
  };
}
