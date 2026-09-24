/**
 * WhatsApp Locale — "chi sta scrivendo".
 *
 * Un numero che scrive in inbox e' quasi sempre qualcuno che conosciamo gia':
 * un contatto del CRM, oppure un'azienda cliente. Senza questo riconoscimento
 * l'operatore risponde alla cieca e — peggio — creando un contatto nuovo ogni
 * volta si duplicano schede su un archivio di quasi 90.000 nominativi.
 *
 * Qui il numero viene cercato in entrambi gli archivi (ultime 9 cifre, come nel
 * webhook) e si offrono tre strade: collega al contatto trovato, cerca un altro
 * contatto, crea la scheda solo se davvero non esiste.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, ExternalLink, Link2, Loader2, Search, UserPlus, UserRound } from "lucide-react";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";

interface ContattoTrovato {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  tags: string[] | null;
  optout_whatsapp: boolean | null;
}

interface AziendaTrovata {
  id: string;
  name: string;
  phone: string | null;
}

export function nomeContatto(c: ContattoTrovato): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
    || c.company_name
    || c.phone
    || "Senza nome";
}

/** Ultime 9 cifre: tollera i formati diversi con cui i numeri sono salvati. */
function ultime9(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}

interface Props {
  chatId: string;
  phone: string | null;
  contactId: string | null;
  /** Nome mostrato in chat (di solito il nome WhatsApp del mittente). */
  nomeVisualizzato: string;
  /** Da richiamare dopo un collegamento, per rinfrescare l'inbox. */
  onCambiato: () => void;
}

export default function IdentitaThread({ chatId, phone, contactId, nomeVisualizzato, onCambiato }: Props) {
  const queryClient = useQueryClient();
  const [cercaAperta, setCercaAperta] = useState(false);
  const [termine, setTermine] = useState("");

  const last9 = useMemo(() => ultime9(phone ?? chatId), [phone, chatId]);

  // Contatto gia' collegato al thread.
  const collegato = useQuery({
    queryKey: ["openwa", "contatto", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("marketing_contacts")
        .select("id, first_name, last_name, phone, email, company_name, tags, optout_whatsapp")
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw error;
      return data as ContattoTrovato | null;
    },
    staleTime: 60_000,
  });

  // Riconoscimento dal numero: contatto CRM + azienda cliente.
  const riconoscimento = useQuery({
    queryKey: ["openwa", "riconosci", last9],
    enabled: !contactId && last9.length === 9,
    queryFn: async () => {
      const [contatti, aziende] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("marketing_contacts")
          .select("id, first_name, last_name, phone, email, company_name, tags, optout_whatsapp")
          .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
          .ilike("phone", `%${last9}%`)
          .limit(5),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("companies")
          .select("id, name, phone")
          .ilike("phone", `%${last9}%`)
          .limit(3),
      ]);
      return {
        contatti: (contatti.data ?? []) as ContattoTrovato[],
        aziende: (aziende.data ?? []) as AziendaTrovata[],
      };
    },
    staleTime: 60_000,
  });

  // Ricerca manuale fra i contatti (server-side: l'archivio e' troppo grande
  // per essere filtrato nel browser).
  const ricerca = useQuery({
    queryKey: ["openwa", "cerca-contatti", termine],
    enabled: cercaAperta && termine.trim().length >= 2,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from("marketing_contacts")
        .select("id, first_name, last_name, phone, email, company_name, tags, optout_whatsapp")
        .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
        .is("deleted_at", null);
      for (const filtro of filtriRicercaContatti(termine)) query = query.or(filtro);
      const { data, error } = await query.limit(20);
      if (error) throw error;
      return (data ?? []) as ContattoTrovato[];
    },
  });

  /** Aggancia TUTTI i messaggi del thread a un contatto esistente. */
  const collega = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("openwa_messages")
        .update({ contact_id: id })
        .eq("wa_chat_id", chatId);
      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: () => {
      toast.success("Conversazione collegata al contatto");
      setCercaAperta(false);
      setTermine("");
      queryClient.invalidateQueries({ queryKey: ["openwa"] });
      onCambiato();
    },
    onError: (e: Error) => toast.error(e.message || "Collegamento non riuscito"),
  });

  /** Crea la scheda solo dopo essersi assicurati che non esista gia'. */
  const creaContatto = useMutation({
    mutationFn: async () => {
      const numero = phone || chatId.replace(/@.*$/, "");
      if (last9) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: gia } = await (supabase as any)
          .from("marketing_contacts")
          .select("id")
          .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
          .ilike("phone", `%${last9}%`)
          .limit(1);
        // Esiste gia': collega invece di creare un doppione.
        if (gia?.[0]?.id) return { id: gia[0].id as string, creato: false };
      }
      const sembraNumero = /^\+?[\d\s]+$/.test((nomeVisualizzato || "").trim());
      const parti = (nomeVisualizzato || "").trim().split(/\s+/);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("marketing_contacts")
        .insert({
          company_id: PLATFORM_ADMIN_COMPANY_ID,
          phone: numero,
          first_name: sembraNumero ? null : (parti[0] || null),
          last_name: sembraNumero ? null : (parti.slice(1).join(" ") || null),
          source: "whatsapp_locale",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: data.id as string, creato: true };
    },
    onSuccess: async ({ id, creato }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("openwa_messages").update({ contact_id: id }).eq("wa_chat_id", chatId);
      toast.success(creato ? "Contatto creato e collegato" : "Il contatto esisteva già: conversazione collegata");
      queryClient.invalidateQueries({ queryKey: ["openwa"] });
      onCambiato();
    },
    onError: (e: Error) => toast.error(e.message || "Creazione contatto non riuscita"),
  });

  const inCorso = collega.isPending || creaContatto.isPending;
  const c = collegato.data;
  const suggerito = riconoscimento.data?.contatti?.[0] ?? null;
  const azienda = riconoscimento.data?.aziende?.[0] ?? null;

  // ── Collegato: mostra chi e', con la via d'uscita verso il CRM ─────────────
  if (contactId && c) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <UserRound className="h-3 w-3" /> {nomeContatto(c)}
        </Badge>
        {c.company_name && (
          <Badge variant="outline" className="gap-1">
            <Building2 className="h-3 w-3" /> {c.company_name}
          </Badge>
        )}
        {c.optout_whatsapp && <Badge variant="destructive">Ha chiesto di non essere ricontattato</Badge>}
        {(c.tags ?? []).slice(0, 3).map((t) => (
          <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
        ))}
        <Button asChild size="sm" variant="ghost" className="h-7 px-2">
          <Link to={`/admin/marketing/contatti/${c.id}`}>
            Scheda <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>
    );
  }

  // ── Non collegato: riconoscimento + azioni ────────────────────────────────
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {riconoscimento.isLoading ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> cerco nei contatti…
          </span>
        ) : suggerito ? (
          <>
            <Badge variant="outline" className="gap-1">Forse è {nomeContatto(suggerito)}</Badge>
            <Button size="sm" variant="secondary" className="h-7" disabled={inCorso}
              onClick={() => collega.mutate(suggerito.id)}>
              <Link2 className="mr-1 h-3.5 w-3.5" /> Collega
            </Button>
          </>
        ) : (
          <Badge variant="outline">Sconosciuto</Badge>
        )}

        {azienda && (
          <Badge className="gap-1 bg-sky-600 hover:bg-sky-600">
            <Building2 className="h-3 w-3" /> Cliente: {azienda.name}
          </Badge>
        )}

        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setCercaAperta(true)}>
          <Search className="mr-1 h-3.5 w-3.5" /> Cerca
        </Button>
        <Button size="sm" variant="outline" className="h-7" disabled={inCorso}
          onClick={() => creaContatto.mutate()}>
          {creaContatto.isPending
            ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            : <UserPlus className="mr-1 h-3.5 w-3.5" />}
          Crea contatto
        </Button>
      </div>

      <Dialog open={cercaAperta} onOpenChange={setCercaAperta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collega la conversazione a un contatto</DialogTitle>
            <DialogDescription>
              Cerca per nome, azienda, email o numero. Il collegamento vale per tutti i
              messaggi di questa chat.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Nome, azienda, email o numero…"
            value={termine}
            onChange={(e) => setTermine(e.target.value)}
          />
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {termine.trim().length < 2 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Scrivi almeno due caratteri.</p>
            ) : ricerca.isLoading ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> cerco…
              </p>
            ) : !ricerca.data?.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessun contatto trovato.</p>
            ) : (
              ricerca.data.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={inCorso}
                  onClick={() => collega.mutate(r.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left hover:bg-muted disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{nomeContatto(r)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[r.phone, r.company_name, r.email].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
