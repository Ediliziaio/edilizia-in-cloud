import type { DisegnoCommercialeFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { misureFaldeMappa } from "./misureFaldeMappa";

const numero = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

export function FvMisureFaldeMappa({ piano }: { piano: DisegnoCommercialeFv }) {
  const misure = misureFaldeMappa(piano);
  if (!misure.length) return null;
  return <details className="fv-roof-map-measures" open>
    <summary>Misure delle falde dalla mappa <span>{misure.length} {misure.length === 1 ? "falda" : "falde"}</span></summary>
    <div className="fv-roof-measures-scroll">
      <table aria-label="Misure delle falde disegnate sulla mappa">
        <thead><tr><th>Falda</th><th>Area in pianta</th><th>Superficie inclinata</th><th>Pendenza</th><th>Esposizione</th><th>Lati sulla falda</th></tr></thead>
        <tbody>{misure.map((f) => <tr key={f.id}>
          <th scope="row">{f.nome}</th><td>{numero(f.pianta)} m²</td><td>{numero(f.superficie)} m²</td>
          <td>{numero(f.inclinazione)}°{f.stimata ? " · da verificare" : ""}</td>
          <td>{numero(f.azimut)}°</td><td>{f.lati.map(numero).join(" · ")} m</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p>Pianta, posa 2D e vista 3D usano gli stessi contorni. La superficie e i lati inclinati dipendono dalla pendenza indicata. Nord 0°, est 90°, sud 180°. Verifica le misure nel sopralluogo.</p>
  </details>;
}
