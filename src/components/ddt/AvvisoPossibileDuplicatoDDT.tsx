import { Link } from "react-router-dom";
import type { PossibileDuplicatoDDT } from "@/lib/ddt/documentiPersistenti";

export function AvvisoPossibileDuplicatoDDT({ duplicato }: { duplicato: PossibileDuplicatoDDT }) {
  const percorso = duplicato.registrato
    ? `/azienda/ddt/${duplicato.altro_id}`
    : `/azienda/ordini?tab=ddt&ddt_documento=${duplicato.altro_id}`;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-amber-800 dark:text-amber-300">
      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium dark:bg-amber-950">Possibile duplicato</span>
      <Link className="font-medium underline underline-offset-2" to={percorso} target="_blank" rel="noopener">Confronta bolla</Link>
    </div>
  );
}
