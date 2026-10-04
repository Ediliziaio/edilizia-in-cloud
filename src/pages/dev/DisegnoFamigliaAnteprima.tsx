/** Solo sviluppo: il vero configuratore del preventivatore con articoli simili a quelli del listino. */
import { useState } from "react";
import { FamilyConfigurator } from "@/components/marketing/preventivi/configurators/FamilyConfigurator";
import type { CatalogItemFamily } from "@/types/catalogItem";
import type { FamilyWithAxes } from "@/types/articleFamily";
import { MiniaturaDisegnoFamiglia } from "@/components/serramenti/AnteprimaDisegnoFamiglia";

const val = (axis: string, i: number, label: string, def = false) => ({
  id: `${axis}-${i}`, axis_id: axis, company_id: "x", valore: label.toLowerCase(), label, descrizione: null as string | null,
  is_default: def, maggiorazione_tipo: "nessuna", maggiorazione_valore: 0, maggiorazione_acquisto: 0, attivo: true, sort_order: i,
});
const asse = (codice: string, nome: string, etichette: string[]) => ({
  id: codice, family_id: "f", company_id: "x", nome, codice, descrizione: null as string | null, tipo: "select", obbligatorio: true, sort_order: 0, created_at: "",
  values: etichette.map((e, i) => val(codice, i, e, i === 0)),
});
const COLORI = ["Bianco", "RAL 7016 Grigio antracite", "Rovere", "Noce", "RAL 6005 Verde muschio"];
const serramento = (nome: string, tip: string) => ({
  id: tip, company_id: "x", nome, disegno_tipologia: tip, modalita_prezzo_base: "mq", prezzo_base_vendita: 0,
  vat_rate: 10, unit_of_measure: "pz", griglia_asse_x_label: "Larghezza (mm)", griglia_asse_y_label: "Altezza (mm)",
  axes: [asse("colore", "Colore", COLORI), asse("apertura", "Apertura", ["Apertura a destra", "Apertura a sinistra"]), asse("tipologia_vetro", "Tipologia vetro", ["Trasparente", "Satinato", "Fumé"]),
    asse("vetrocamera", "Vetrocamera", ["Doppio vetro", "Triplo vetro"]), asse("telaio", "Telaio", ["Telaio a L", "Telaio a Z 35"])],
});
const persiana = (nome: string, tip: string, conManiglia = true) => ({ ...serramento(nome, tip), axes: [asse("colore", "Colore", COLORI), ...(conManiglia ? [asse("apertura", "Apertura", ["Apertura a destra", "Apertura a sinistra"])] : [])] });

const ARTICOLI: Array<[string, unknown]> = [
  ["Finestra 2 Ante", serramento("Finestra 2 Ante", "finestra_2_ante")],
  ["Porta Finestra 2 Ante", serramento("Porta Finestra 2 Ante", "porta_finestra_2_ante")],
  ["Traslante Scorrevole 4 Ante", serramento("Traslante Scorrevole 4 Ante", "traslante_4_ante")],
  ["Persiana 1 Anta (scelgo l'apertura)", persiana("Persiana 1 Anta", "persiana:1_anta_dx")],
  ["Persiana Finestra 2 Ante", persiana("Persiana Finestra 2 Ante", "persiana:2_ante")],
  ["Persiana a Libro 4 Ante (orientabili)", persiana("Persiana a Libro 4 Ante", "persiana:libro_4_ante:orientabili")],
  ["Persiana 3 Ante (2+1 SX)", persiana("Persiana 3 Ante (2+1 SX)", "persiana:3_ante_2_1_sx")],
  ["Senza disegno (come oggi: foto)", { ...serramento("Porta blindata", ""), disegno_tipologia: null, modalita_prezzo_base: "pz" }],
];

export default function DisegnoFamigliaAnteprima() {
  const [i, setI] = useState(0);
  const family = ARTICOLI[i][1] as FamilyWithAxes;
  const item = { source: "family", family, ha_posa_automatica: false, posa_linked: false } as unknown as CatalogItemFamily;
  return (
    <div className="mx-auto max-w-xl space-y-3 p-4">
      <select className="w-full rounded border p-2" value={i} onChange={(e) => setI(Number(e.target.value))}>
        {ARTICOLI.map(([n], k) => <option key={n} value={k}>{n}</option>)}
      </select>
      <div className="grid grid-cols-4 gap-2">
        {ARTICOLI.map(([n, f]) => (
          <div key={n} className="flex h-24 items-center justify-center rounded border bg-white p-1" title={n}>
            <MiniaturaDisegnoFamiglia family={f as FamilyWithAxes} className="h-full w-full" />
          </div>
        ))}
      </div>
      <FamilyConfigurator key={i} item={item} tariffe={[]} currentSortOrder={0} onBack={() => {}} onAddItems={() => {}} />
    </div>
  );
}
