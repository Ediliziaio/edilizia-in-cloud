import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { leggiSchedeTecnichePreventivo } from "@/lib/fotovoltaico/schedeTecnichePreventivo";

export function FvAllegatiTecniciPreventivo({ companyId, articoloIds }: { companyId: string; articoloIds: Array<string | null | undefined> }) {
  const ids = [...new Set(articoloIds.filter((id): id is string => !!id))];
  const { data, isPending, error } = useQuery({
    queryKey: ["fv-allegati-preventivo", companyId, ids],
    enabled: !!companyId && !!ids.length,
    queryFn: () => leggiSchedeTecnichePreventivo(ids, companyId),
    staleTime: 0,
  });
  return <section className="mb-4 rounded-lg border bg-white p-4" aria-label="Allegati tecnici del preventivo">
    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" />Allegati tecnici dei prodotti</h3>
    {error ? <p role="alert" className="text-sm text-destructive">Non è stato possibile verificare gli allegati. Riprova prima di scaricare il PDF.</p>
      : ids.length && isPending ? <p className="text-sm text-muted-foreground">Verifico le schede dei prodotti scelti…</p>
      : data?.length ? <><p className="mb-2 text-sm text-muted-foreground">{data.length} {data.length === 1 ? "scheda da allegare" : "schede da allegare"} con “Scarica PDF”, prima delle condizioni contrattuali.</p><ul className="space-y-1 text-sm">{data.map(s => <li key={s.url}>{/^https?:\/\//i.test(s.url) ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{s.nome}</a> : s.nome}</li>)}</ul></>
      : <p className="text-sm text-muted-foreground">Nessuna scheda abilitata per questi prodotti. Le schede si caricano nel componente del Listino e si attivano con “Allega”.</p>}
  </section>;
}
