/**
 * «Commerciale» o «Tecnico» accanto al codice del sopralluogo (piano sopralluoghi, lotto 2).
 * Il tecnico è il caso normale: con `soloCommerciale` si segna solo l'eccezione, per non
 * riempire le liste di etichette uguali.
 */
export function TipoSopralluogoBadge({ tipo, soloCommerciale = false }: { tipo?: string | null; soloCommerciale?: boolean }) {
  const commerciale = tipo === "commerciale";
  if (!commerciale && soloCommerciale) return null;
  return (
    <span
      className={commerciale
        ? "inline-flex shrink-0 items-center rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-sky-200"
        : "inline-flex shrink-0 items-center rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 ring-1 ring-orange-200"}
      title={commerciale ? "Sopralluogo commerciale: misure di massima per l'offerta" : "Sopralluogo tecnico: misure precise"}
    >
      {commerciale ? "Commerciale" : "Tecnico"}
    </span>
  );
}
