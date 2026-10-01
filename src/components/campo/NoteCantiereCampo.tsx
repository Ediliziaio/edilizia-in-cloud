/**
 * App di cantiere: le istruzioni dell'ufficio per questo lavoro (26/09/2026).
 * Solo le note per me, per la mia squadra o per tutti; quelle importanti in
 * cima. Quando le vedo, l'ufficio lo sa («letta da…»).
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface NotaCampo {
  id: string;
  testo: string;
  importante: boolean;
  per: "tutti" | "squadra" | "persona";
  per_chi: string;
  fase: string | null;
  autore: string | null;
  creata_il: string;
  letta: boolean;
}

export function NoteCantiereCampo({ orderId }: { orderId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["campo-note", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campo_note_cantiere", { p_order_id: orderId });
      if (error) throw error;
      return (data ?? []) as unknown as NotaCampo[];
    },
    enabled: !!orderId,
    staleTime: 60_000,
  });

  // Segna come lette quelle nuove, una volta sola per visita. Il bollino
  // «Nuova» resta finché la pagina è aperta: si capisce cosa è arrivato.
  const segnate = useRef(new Set<string>());
  useEffect(() => {
    for (const n of data) {
      if (n.letta || segnate.current.has(n.id)) continue;
      segnate.current.add(n.id);
      void supabase.rpc("campo_nota_letta", { p_nota_id: n.id });
    }
  }, [data]);

  if (data.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-background p-4 shadow-sm" aria-labelledby="note-ufficio">
      <h2 id="note-ufficio" className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />Istruzioni dall'ufficio
      </h2>
      <ul className="space-y-2.5">
        {data.map((n) => (
          <li
            key={n.id}
            className={cn(
              "rounded-xl border px-3 py-2.5",
              n.importante ? "border-amber-300 bg-amber-50" : "border-border bg-muted/30",
            )}
          >
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold">
              {n.importante && (
                <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Importante</span>
              )}
              <span className={n.per === "persona" ? "text-primary" : "text-muted-foreground"}>{n.per_chi}</span>
              {n.fase && <span className="text-muted-foreground">· {n.fase}</span>}
              {!n.letta && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Nuova</span>}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{n.testo}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {n.autore ?? "Ufficio"} · {new Date(n.creata_il).toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
