/** Miniature delle foto di un ordine di servizio (link firmati per 10 minuti). */
import { useQuery } from "@tanstack/react-query";
import { linkFotoOs } from "@/lib/campo/ordiniServizio";

export function FotoOs({ percorsi }: { percorsi: string[] }) {
  const q = useQuery({ queryKey: ["os-foto", percorsi.join("|")], enabled: percorsi.length > 0, staleTime: 300_000, queryFn: () => linkFotoOs(percorsi) });
  if (!percorsi.length || !q.data?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {q.data.map(u => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" className="size-16 rounded-lg border object-cover" /></a>
      ))}
    </div>
  );
}
