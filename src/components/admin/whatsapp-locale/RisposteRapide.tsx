/**
 * WhatsApp Locale — frasi pronte.
 *
 * Chi presidia l'inbox riscrive a mano le stesse cinque risposte tutto il
 * giorno. Qui si salvano una volta e si inseriscono con un clic; le variabili
 * {{nome}} restano nel testo e vengono risolte al momento dell'invio, come
 * nelle campagne.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Zap } from "lucide-react";

interface Risposta {
  id: string;
  titolo: string;
  testo: string;
}

export default function RisposteRapide({ onScegli }: { onScegli: (testo: string) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [titolo, setTitolo] = useState("");
  const [testo, setTesto] = useState("");

  const { data: risposte = [], isLoading } = useQuery({
    queryKey: ["openwa", "risposte-rapide"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("openwa_risposte_rapide")
        .select("id, titolo, testo")
        .order("titolo");
      if (error) return [];
      return (data ?? []) as Risposta[];
    },
  });

  const crea = useMutation({
    mutationFn: async () => {
      const t = titolo.trim(), c = testo.trim();
      if (!t || !c) throw new Error("Servono titolo e testo");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("openwa_risposte_rapide")
        .insert({ titolo: t, testo: c, creata_da: user?.id ?? null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setTitolo(""); setTesto(""); setCreando(false);
      toast.success("Risposta salvata");
      qc.invalidateQueries({ queryKey: ["openwa", "risposte-rapide"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("openwa_risposte_rapide").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["openwa", "risposte-rapide"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full text-muted-foreground"
          title="Risposte pronte">
          <Zap className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        {creando ? (
          <div className="space-y-2">
            <Input value={titolo} onChange={(e) => setTitolo(e.target.value.slice(0, 60))}
              placeholder="Titolo (es. Richiesta preventivo)" className="h-8 text-xs" autoFocus />
            <Textarea value={testo} onChange={(e) => setTesto(e.target.value.slice(0, 2000))}
              placeholder="Testo… puoi usare {{nome}}" rows={4} className="resize-none text-xs" />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 flex-1 text-xs" disabled={crea.isPending} onClick={() => crea.mutate()}>
                {crea.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salva"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreando(false)}>Annulla</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {isLoading ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">…</p>
            ) : risposte.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                Nessuna risposta pronta.
              </p>
            ) : (
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {risposte.map((r) => (
                  <div key={r.id} className="group flex items-start gap-1 rounded-md hover:bg-muted">
                    <button type="button" className="min-w-0 flex-1 px-2 py-1.5 text-left"
                      onClick={() => { onScegli(r.testo); setAperto(false); }}>
                      <span className="block truncate text-xs font-medium">{r.titolo}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{r.testo}</span>
                    </button>
                    <Button variant="ghost" size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => elimina.mutate(r.id)} title="Elimina">
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-full justify-start text-xs"
              onClick={() => setCreando(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuova risposta pronta
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
