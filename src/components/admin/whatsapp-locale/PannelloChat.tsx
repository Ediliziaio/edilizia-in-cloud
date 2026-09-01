/**
 * WhatsApp Locale — pannello laterale della conversazione: chiudi, assegna,
 * note interne.
 *
 * Senza queste tre cose l'inbox non regge l'uso quotidiano: le chat non
 * finiscono mai (la lista cresce all'infinito), in due si risponde sopra
 * all'altro senza accorgersene, e per annotare "richiamare lunedi" bisogna
 * mandarlo al cliente.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RotateCcw, StickyNote, UserCheck } from "lucide-react";

interface Nota {
  id: string;
  testo: string;
  autore: string | null;
  created_at: string;
  profiles?: { first_name: string | null; last_name: string | null } | null;
}

interface Props {
  chatId: string;
  stato: string;
  assegnatoA: string | null;
  onCambiato: () => void;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function PannelloChat({ chatId, stato, assegnatoA, onCambiato }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [nuovaNota, setNuovaNota] = useState("");

  // Staff a cui si puo' assegnare: i super admin della piattaforma.
  const { data: staff = [] } = useQuery({
    queryKey: ["openwa", "staff"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("user_roles")
        .select("user_id, profiles:user_id(first_name, last_name, email)")
        .eq("role", "super_admin");
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.user_id as string,
        nome: [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(" ") || r.profiles?.email || "Utente",
      }));
    },
  });

  const { data: note = [], isLoading: noteInCorso } = useQuery({
    queryKey: ["openwa", "note", chatId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("openwa_note")
        .select("id, testo, autore, created_at, profiles:autore(first_name, last_name)")
        .eq("wa_chat_id", chatId)
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as Nota[];
    },
  });

  /** Upsert dello stato conversazione: la riga nasce alla prima azione. */
  const salvaStato = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("openwa_conversazioni")
        .upsert({ wa_chat_id: chatId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "wa_chat_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["openwa"] });
      onCambiato();
    },
    onError: (e: Error) => toast.error(e.message || "Operazione non riuscita"),
  });

  const aggiungiNota = useMutation({
    mutationFn: async () => {
      const testo = nuovaNota.trim();
      if (!testo) throw new Error("Scrivi qualcosa");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("openwa_note")
        .insert({ wa_chat_id: chatId, testo, autore: user?.id ?? null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setNuovaNota("");
      toast.success("Nota salvata");
      qc.invalidateQueries({ queryKey: ["openwa", "note", chatId] });
      qc.invalidateQueries({ queryKey: ["openwa", "threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chiusa = stato === "chiusa";

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      {/* Stato */}
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Stato</p>
        {chiusa ? (
          <div className="space-y-2">
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Conversazione chiusa
            </Badge>
            <Button size="sm" variant="outline" className="w-full" disabled={salvaStato.isPending}
              onClick={() => salvaStato.mutate({ stato: "aperta", chiusa_at: null, chiusa_da: null })}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Riapri
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="w-full" disabled={salvaStato.isPending}
            onClick={() => salvaStato.mutate({ stato: "chiusa", chiusa_at: new Date().toISOString(), chiusa_da: user?.id ?? null })}>
            {salvaStato.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
            Segna come chiusa
          </Button>
        )}
      </div>

      {/* Assegnazione */}
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Chi la segue</p>
        <Select
          value={assegnatoA ?? "nessuno"}
          onValueChange={(v) => salvaStato.mutate({ assegnato_a: v === "nessuno" ? null : v })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nessuno" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nessuno" className="text-xs">Nessuno</SelectItem>
            {staff.map((u: { id: string; nome: string }) => (
              <SelectItem key={u.id} value={u.id} className="text-xs">{u.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {assegnatoA !== user?.id && (
          <Button size="sm" variant="ghost" className="h-7 w-full text-xs" disabled={salvaStato.isPending}
            onClick={() => salvaStato.mutate({ assegnato_a: user?.id ?? null })}>
            <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Prendo in carico io
          </Button>
        )}
      </div>

      {/* Note interne */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <StickyNote className="h-3 w-3" /> Note interne
        </p>
        <p className="text-[10px] text-muted-foreground">Non vengono mai inviate al contatto.</p>
        <Textarea
          value={nuovaNota}
          onChange={(e) => setNuovaNota(e.target.value.slice(0, 2000))}
          placeholder="Es. richiamare lunedì mattina…"
          rows={2}
          className="resize-none text-xs"
        />
        <Button size="sm" className="h-7 text-xs" disabled={!nuovaNota.trim() || aggiungiNota.isPending}
          onClick={() => aggiungiNota.mutate()}>
          {aggiungiNota.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Aggiungi nota
        </Button>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {noteInCorso ? (
            <p className="text-xs text-muted-foreground">…</p>
          ) : note.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nessuna nota.</p>
          ) : (
            note.map((n) => (
              <div key={n.id} className="rounded-md border bg-amber-50 px-2.5 py-2 text-xs dark:bg-amber-950/30">
                <p className="whitespace-pre-wrap break-words">{n.testo}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {[n.profiles?.first_name, n.profiles?.last_name].filter(Boolean).join(" ") || "—"} · {quando(n.created_at)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
