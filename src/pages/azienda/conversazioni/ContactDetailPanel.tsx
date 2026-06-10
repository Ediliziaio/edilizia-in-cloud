import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { EntitaTipo } from "@/hooks/useConversazioni";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail, Phone, ExternalLink, User, Briefcase, Tag, MapPin, Star, Building2,
} from "lucide-react";

interface Props {
  entitaTipo: EntitaTipo;
  entitaId: string;
}

interface DetailData {
  nome: string;
  email: string | null;
  telefono: string | null;
  tipoLabel: string;
  source: string | null;
  tags: string[];
  city: string | null;
  score: number | null;
  ordersCount: number | null;
}

function iniziali(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (nome || "?").slice(0, 2).toUpperCase();
}

/**
 * Pannello laterale stile GoHighLevel: mostra la scheda del CONTATTO
 * (marketing_contacts) o del CLIENTE (profiles) in base a `entita_tipo`,
 * con link alla scheda completa.
 */
export default function ContactDetailPanel({ entitaTipo, entitaId }: Props) {
  const { data, isLoading } = useQuery<DetailData | null>({
    queryKey: ["conv-detail", entitaTipo, entitaId],
    enabled: !!entitaId,
    staleTime: 60_000,
    queryFn: async () => {
      if (entitaTipo === "contatto") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: c } = await (supabase as any)
          .from("marketing_contacts")
          .select("first_name, last_name, email, phone, contact_type, source, tags, city, score")
          .eq("id", entitaId)
          .maybeSingle();
        if (!c) return null;
        const tipoMap: Record<string, string> = { lead: "Lead", company: "Azienda", partner: "Partner" };
        return {
          nome: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || (c.email ?? "Senza nome"),
          email: c.email ?? null,
          telefono: c.phone ?? null,
          tipoLabel: tipoMap[c.contact_type as string] ?? "Contatto",
          source: c.source ?? null,
          tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
          city: c.city ?? null,
          score: typeof c.score === "number" ? c.score : null,
          ordersCount: null,
        };
      }
      // cliente → profiles + conteggio commesse
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: p } = await (supabase as any)
        .from("profiles")
        .select("first_name, last_name, email, phone")
        .eq("id", entitaId)
        .maybeSingle();
      if (!p) return null;
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", entitaId);
      return {
        nome: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || (p.email ?? "Cliente"),
        email: p.email ?? null,
        telefono: p.phone ?? null,
        tipoLabel: "Cliente",
        source: null,
        tags: [],
        city: null,
        score: null,
        ordersCount: count ?? 0,
      };
    },
  });

  const fullHref =
    entitaTipo === "contatto"
      ? `/azienda/marketing/contatti/${entitaId}`
      : `/azienda/clienti/${entitaId}`;

  return (
    // Layout deciso dal PARENT (colonna fissa da xl, Sheet sotto xl): il pannello riempie il contenitore
    <aside className="flex h-full w-full flex-col overflow-y-auto bg-background">
      {isLoading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-16 w-16 rounded-full mx-auto" />
          <Skeleton className="h-4 w-2/3 mx-auto" />
          <Skeleton className="h-3 w-1/2 mx-auto" />
        </div>
      ) : !data ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Scheda non disponibile.</div>
      ) : (
        <div className="flex flex-col h-full">
          <div className="p-4 text-center border-b">
            <Avatar className="h-16 w-16 mx-auto mb-2">
              <AvatarFallback className="text-lg bg-primary/10 text-primary">{iniziali(data.nome)}</AvatarFallback>
            </Avatar>
            <div className="font-semibold text-sm">{data.nome}</div>
            <Badge
              variant="secondary"
              className="mt-1.5 gap-1"
            >
              {entitaTipo === "cliente" ? <Briefcase className="h-3 w-3" /> : <User className="h-3 w-3" />}
              {data.tipoLabel}
            </Badge>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
            {data.email && (
              <a href={`mailto:${data.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground break-all">
                <Mail className="h-4 w-4 shrink-0" />{data.email}
              </a>
            )}
            {data.telefono && (
              <a href={`tel:${data.telefono}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Phone className="h-4 w-4 shrink-0" />{data.telefono}
              </a>
            )}
            {data.city && (
              <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{data.city}</div>
            )}
            {data.source && (
              <div className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4 shrink-0" />Fonte: {data.source}</div>
            )}
            {typeof data.score === "number" && (
              <div className="flex items-center gap-2 text-muted-foreground"><Star className="h-4 w-4 shrink-0" />Score: {data.score}</div>
            )}
            {typeof data.ordersCount === "number" && (
              <div className="flex items-center gap-2 text-muted-foreground"><Briefcase className="h-4 w-4 shrink-0" />Commesse: {data.ordersCount}</div>
            )}
            {data.tags.length > 0 && (
              <div className="flex items-start gap-2">
                <Tag className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                <div className="flex flex-wrap gap-1">
                  {data.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t">
            <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
              <Link to={fullHref}><ExternalLink className="h-3.5 w-3.5" />Apri scheda completa</Link>
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
