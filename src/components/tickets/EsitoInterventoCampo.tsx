/**
 * Nel dettaglio di una richiesta di assistenza, quello che il tecnico ha fatto dal telefono (26/11/2026): quando è
 * arrivato e quando ha finito, note, ore, materiale, foto e firma del cliente. Senza niente dal telefono non c'è.
 */
import { useQuery } from "@tanstack/react-query";
import { PenLine, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Esito {
  id: string; user_id: string; iniziato_at: string | null; finito_at: string | null; note: string | null; ore: number | null;
  materiali: string | null; foto: string[]; firma_path: string | null; firma_nome: string | null;
  tecnico?: string | null; link: Record<string, string>;
}

const db = () => supabase as unknown as { from: (t: "campo_interventi_esiti") => { select: (c: string) => { eq: (k: string, v: string) => { order: (c: string, o: { ascending: boolean }) => PromiseLike<{ data: Omit<Esito, "link" | "tecnico">[] | null; error: { message: string } | null }> } } } };

export function EsitoInterventoCampo({ ticketId }: { ticketId: string }) {
  const tr = useT();
  const { data = [] } = useQuery<Esito[]>({
    queryKey: ["ticket-esiti-campo", ticketId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: righe, error } = await db().from("campo_interventi_esiti")
        .select("id, user_id, iniziato_at, finito_at, note, ore, materiali, foto, firma_path, firma_nome")
        .eq("ticket_id", ticketId).order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const lista = righe ?? [];
      if (!lista.length) return [];
      const percorsi = lista.flatMap(r => [...(r.foto ?? []), ...(r.firma_path ? [r.firma_path] : [])]);
      const link: Record<string, string> = {};
      if (percorsi.length) {
        const { data: firmati } = await supabase.storage.from("campo-foto").createSignedUrls(percorsi, 3600);
        for (const f of firmati ?? []) if (f.path && f.signedUrl) link[f.path] = f.signedUrl;
      }
      const { data: persone } = await supabase.from("profiles").select("id, first_name, last_name").in("id", lista.map(r => r.user_id));
      const nomi = new Map((persone ?? []).map(p => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ")]));
      return lista.map(r => ({ ...r, tecnico: nomi.get(r.user_id) ?? null, link }));
    },
  });
  if (!data.length) return null;
  const ora = (iso: string | null) => iso ? new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="size-4 text-primary" aria-hidden="true" />{tr("Dal telefono del tecnico")}</h2>
        {data.map(e => (
          <div key={e.id} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0 text-sm">
            <p className="text-xs text-muted-foreground">
              {[e.tecnico, `${tr("Arrivato")}: ${ora(e.iniziato_at)}`, `${tr("Finito")}: ${e.finito_at ? ora(e.finito_at) : tr("non ancora")}`,
                e.ore != null ? tr("{n} ore", { n: String(e.ore).replace(".", ",") }) : null].filter(Boolean).join(" · ")}
            </p>
            {e.note && <p className="whitespace-pre-wrap break-words">{e.note}</p>}
            {e.materiali && <p className="text-xs"><span className="font-semibold">{tr("Materiale usato")}:</span> {e.materiali}</p>}
            {e.foto.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {e.foto.map(p => e.link[p] ? (
                  <a key={p} href={e.link[p]} target="_blank" rel="noreferrer"><img src={e.link[p]} alt={tr("Foto dell'intervento")} className="size-20 rounded-md border object-cover" /></a>
                ) : null)}
              </div>
            )}
            {e.firma_path && e.link[e.firma_path] ? (
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold"><PenLine className="size-3.5" aria-hidden="true" />{tr("Firma del cliente")}{e.firma_nome ? ` · ${e.firma_nome}` : ""}</p>
                <img src={e.link[e.firma_path]} alt={tr("Firma del cliente")} className="mt-1 h-16 rounded border bg-white" />
              </div>
            ) : e.finito_at ? <p className="text-xs text-muted-foreground">{tr("Senza firma del cliente.")}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
