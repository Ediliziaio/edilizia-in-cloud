import { useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Mail, MailX, ExternalLink, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Drill-down di una lista (tag): mostra i contatti veri, paginati lato server
 * (niente cap client). Ricerca su nome/azienda/email, badge email/opt-out, e
 * scorciatoia alla rubrica completa. Conteggi totali/contattabili passati dal
 * chiamante (calcolati dalla RPC outreach_tag_counts, quindi esatti).
 */

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  optout_email: boolean | null;
  source: string | null;
}

const PAGE = 50;

export function OutreachListContactsDialog({
  open, onOpenChange, companyId, tag, total, contactable,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  tag: string;
  total: number;
  contactable: number;
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const q = useQuery({
    queryKey: ["outreach-list-contacts", companyId, tag, page, debounced],
    enabled: open,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from("marketing_contacts")
        .select("id,first_name,last_name,company_name,email,optout_email,source", { count: "exact" })
        .eq("company_id", companyId)
        .contains("tags", [tag]);
      for (const filtro of filtriRicercaContatti(debounced)) query = query.or(filtro);
      const { data, error, count } = await query
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as ContactRow[], count: count ?? 0 };
    },
  });

  const rows = q.data?.rows ?? [];
  const matchCount = q.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(matchCount / PAGE));
  const fmt = (n: number) => n.toLocaleString("it-IT");

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const onSearchChange = (v: string) => {
    setSearch(v);
    setPage(0);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebounced(v.trim()), 400);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>Lista “{tag}”</span>
            <Badge variant="secondary" className="font-normal tabular-nums">{fmt(total)} contatti</Badge>
            <Badge variant="outline" className="gap-1 font-normal tabular-nums text-emerald-600">
              <Mail className="h-3 w-3" />{fmt(contactable)} contattabili
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Cerca nome, azienda o email…"
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="min-h-[280px] rounded-lg border border-border">
            {q.isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : q.isError ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <p className="text-sm font-medium">Errore nel caricamento dei contatti</p>
                <Button size="sm" variant="outline" onClick={() => q.refetch()}>Riprova</Button>
              </div>
            ) : rows.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {debounced ? "Nessun contatto trovato per la ricerca." : "Nessun contatto in questa lista."}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {rows.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
                  const noEmail = !c.email;
                  const optedOut = !!c.optout_email;
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-tight">{name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.company_name || "—"}{c.email ? ` · ${c.email}` : ""}
                        </p>
                      </div>
                      {noEmail ? (
                        <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
                          <MailX className="h-3 w-3" /> no email
                        </Badge>
                      ) : optedOut ? (
                        <Badge variant="outline" className="shrink-0 gap-1 text-amber-600">
                          <MailX className="h-3 w-3" /> opt-out
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 gap-1 text-emerald-600">
                          <Mail className="h-3 w-3" /> ok
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground tabular-nums">
              {matchCount > 0 && `${fmt(matchCount)} ${debounced ? "risultati" : "contatti"} · pagina ${page + 1}/${totalPages}`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs"
                disabled={page === 0 || q.isFetching}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prec
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs"
                disabled={page + 1 >= totalPages || q.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Succ <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"
                onClick={() => navigate(`/admin/marketing/contatti?tag=${encodeURIComponent(tag)}`)}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Rubrica
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
