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
import { CheckCircle2, Loader2, RotateCcw, StickyNote, UserCheck, Building2, ExternalLink, Mail, Megaphone, Target, Ban } from "lucide-react";
import { Link } from "react-router-dom";

interface Nota {
  id: string;
  testo: string;
  autore: string | null;
  created_at: string;
  profiles?: { first_name: string | null; last_name: string | null } | null;
}

interface Contesto {
  contatto: {
    id: string; first_name: string | null; last_name: string | null;
    email: string | null; phone: string | null; company_name: string | null;
    city: string | null; tags: string[] | null; optout_whatsapp: boolean | null;
    source: string | null; lead_score: number | null;
  } | null;
  campagne: Array<{ nome: string; stato: string; primo_inviato_at: string | null; risposto_at: string | null }>;
  opportunita: Array<{ id: string; name: string; value: number | null; status: string; stage: string | null; expected_close_date: string | null }>;
  telefono: string | null;
}

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

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
      // Due query: la FK di user_roles punta ad auth.users, non a profiles, e
      // l'embed "profiles:user_id(...)" rispondeva PGRST200 — errore che veniva
      // inghiottito, cosi' "Chi la segue" era sempre vuoto.
      const { data, error } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "platform_manager", "platform_marketing", "platform_sales", "platform_support", "platform_implementation"]);
      if (error) throw error;
      const ids = [...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id))];
      if (ids.length === 0) return [];
      const { data: profili, error: e2 } = await (supabase as any)
        .from("profiles").select("id, first_name, last_name, email").in("id", ids);
      if (e2) throw e2;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byId = new Map<string, any>((profili ?? []).map((p: any) => [p.id, p]));
      return ids.map((id) => {
        const p = byId.get(id);
        return { id, nome: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || "Utente" };
      });
    },
  });

  // Chi e' la persona, da dove arriva, cosa c'e' in ballo: tutto in una
  // chiamata sola, perche' sono dati che si guardano sempre insieme.
  const { data: ctx } = useQuery({
    queryKey: ["openwa", "contesto", chatId],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("openwa_contesto_chat", { p_chat_id: chatId });
      if (error) return null;
      return data as Contesto | null;
    },
  });

  const { data: note = [], isLoading: noteInCorso } = useQuery({
    queryKey: ["openwa", "note", chatId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("openwa_note")
        .select("id, testo, autore, created_at")
        .eq("wa_chat_id", chatId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const note = (data ?? []) as Nota[];
      const autori = [...new Set(note.map((n) => n.autore).filter(Boolean))] as string[];
      if (autori.length === 0) return note;
      const { data: profili } = await (supabase as any)
        .from("profiles").select("id, first_name, last_name").in("id", autori);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byId = new Map<string, any>((profili ?? []).map((p: any) => [p.id, p]));
      return note.map((n) => ({ ...n, profiles: n.autore ? byId.get(n.autore) ?? null : null }));
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
      {/* Chi e' — prima di rispondere serve sapere con chi si parla */}
      {ctx?.contatto && (
        <div className="space-y-1.5 rounded-md border p-2.5">
          <p className="text-sm font-semibold leading-tight">
            {[ctx.contatto.first_name, ctx.contatto.last_name].filter(Boolean).join(" ") || "Senza nome"}
          </p>
          {ctx.contatto.company_name && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" /> {ctx.contatto.company_name}
            </p>
          )}
          {ctx.contatto.email && (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" /> {ctx.contatto.email}
            </p>
          )}
          {ctx.contatto.optout_whatsapp && (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <Ban className="h-3 w-3" /> Ha chiesto di non essere ricontattato
            </Badge>
          )}
          {(ctx.contatto.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(ctx.contatto.tags ?? []).slice(0, 4).map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
              ))}
            </div>
          )}
          <Button asChild size="sm" variant="ghost" className="h-6 w-full justify-start px-1 text-xs">
            <Link to={`/admin/marketing/contatti/${ctx.contatto.id}`}>
              Scheda completa <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      )}

      {/* Da dove arriva: rispondere a chi ha ricevuto un messaggio a freddo
          non e' come rispondere a chi ha scritto per primo. */}
      {(ctx?.campagne?.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Megaphone className="h-3 w-3" /> Contattato da campagna
          </p>
          {ctx!.campagne.slice(0, 3).map((c, i) => (
            <div key={i} className="rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
              <p className="truncate font-medium">{c.nome}</p>
              <p className="text-[10px] text-muted-foreground">
                {c.risposto_at ? "ha risposto" : c.primo_inviato_at ? "contattato, senza risposta" : "in coda"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Opportunita': il motivo per cui questa conversazione esiste */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Target className="h-3 w-3" /> Opportunità
        </p>
        {(ctx?.opportunita?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">Nessuna opportunità collegata.</p>
        ) : (
          ctx!.opportunita.map((o) => (
            <div key={o.id} className="rounded-md border px-2 py-1.5 text-xs">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{o.name}</span>
                {o.value ? <span className="shrink-0 tabular-nums">{EURO.format(o.value)}</span> : null}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {o.stage || o.status}
                {o.expected_close_date && ` · chiusura ${new Date(o.expected_close_date).toLocaleDateString("it-IT")}`}
              </span>
            </div>
          ))
        )}
      </div>

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
