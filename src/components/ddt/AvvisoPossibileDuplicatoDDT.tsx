import { Link } from "react-router-dom";
import type { PossibileDuplicatoDDT } from "@/lib/ddt/documentiPersistenti";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** `compatto`: un'etichetta sola, che è anche il link al confronto, per stare sulla riga dell'elenco
 *  DDT (25/11/2026: etichetta + «Confronta bolla» su una riga in più facevano ogni bolla alta tre righe). */
export function AvvisoPossibileDuplicatoDDT({ duplicato, compatto = false }: { duplicato: PossibileDuplicatoDDT; compatto?: boolean }) {
  const t = useT();
  const percorso = duplicato.registrato
    ? `/azienda/ddt/${duplicato.altro_id}`
    : `/azienda/ordini?tab=ddt&ddt_documento=${duplicato.altro_id}`;
  if (compatto) return (
    <Link
      to={percorso} target="_blank" rel="noopener" title={t("Confronta bolla")}
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:underline dark:bg-amber-950 dark:text-amber-300"
    >
      {t("Possibile duplicato")}<span className="sr-only"> — {t("Confronta bolla")}</span>
    </Link>
  );
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-amber-800 dark:text-amber-300">
      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium dark:bg-amber-950">{t("Possibile duplicato")}</span>
      <Link className="font-medium underline underline-offset-2" to={percorso} target="_blank" rel="noopener">{t("Confronta bolla")}</Link>
    </div>
  );
}
