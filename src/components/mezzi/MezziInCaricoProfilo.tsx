/**
 * «Mezzi e attrezzi in carico» nella scheda di una persona del Personale: il
 * furgone, l'auto aziendale, gli attrezzi. Solo lettura, con il link alla
 * scheda del mezzo; si cambia da lì. Non compare se non c'è niente (o se chi
 * guarda non ha il permesso dei mezzi).
 */
import { Link } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useMezziInCaricoA } from "@/hooks/useMezzi";
import { tipoMezzoLabel } from "@/types/mezzi";

export function MezziInCaricoProfilo({ hrProfiloId }: { hrProfiloId: string }) {
  const perms = usePermissions();
  const vede = perms.canViewMezzi === true || perms.isAdmin;
  const { data: mezzi = [] } = useMezziInCaricoA(vede ? hrProfiloId : undefined);
  if (!vede || mezzi.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-muted-foreground">MEZZI E ATTREZZI IN CARICO</h4>
      <ul className="divide-y rounded-lg border">
        {mezzi.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <Link to={`/azienda/mezzi/${m.id}`} className="min-w-0 truncate font-medium hover:text-orange-700 hover:underline">
              {m.nome}
            </Link>
            <span className="shrink-0 text-xs text-muted-foreground">
              {tipoMezzoLabel(m.tipo)}{m.targa || m.codice ? ` · ${m.targa ?? m.codice}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
