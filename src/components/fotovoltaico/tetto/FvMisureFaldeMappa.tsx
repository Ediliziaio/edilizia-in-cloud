import type { DisegnoCommercialeFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { misureFaldeMappa } from "./misureFaldeMappa";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const numero = (n: number) => n.toLocaleString(intlCampo(), { maximumFractionDigits: 2 });

export function FvMisureFaldeMappa({ piano }: { piano: DisegnoCommercialeFv }) {
  const t = useT();
  const misure = misureFaldeMappa(piano);
  if (!misure.length) return null;
  return <details className="fv-roof-map-measures">
    <summary>{t("Misure delle falde dalla mappa")} <span>{misure.length} {misure.length === 1 ? t("falda") : t("falde")} · {numero(misure.reduce((totale, f) => totale + f.superficie, 0))} m²</span></summary>
    <div className="fv-roof-measures-scroll">
      <table aria-label={t("Misure delle falde disegnate sulla mappa")}>
        <thead><tr><th>{t("Falda")}</th><th>{t("Area in pianta")}</th><th>{t("Superficie inclinata")}</th><th>{t("Pendenza")}</th><th>{t("Esposizione")}</th><th>{t("Lati sulla falda")}</th></tr></thead>
        <tbody>{misure.map((f) => <tr key={f.id}>
          <th scope="row">{f.nome}</th><td>{numero(f.pianta)} m²</td><td>{numero(f.superficie)} m²</td>
          <td>{numero(f.inclinazione)}°{f.stimata ? ` ${t("· da verificare")}` : ""}</td>
          <td>{numero(f.azimut)}°</td><td>{f.lati.map(numero).join(" · ")} m</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p>{t("Pianta, posa 2D e vista 3D usano gli stessi contorni. La superficie e i lati inclinati dipendono dalla pendenza indicata. Nord 0°, est 90°, sud 180°. Verifica le misure nel sopralluogo.")}</p>
  </details>;
}
