import { useMemo, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Mail, MessageSquare, Bell, Plus, AlertCircle, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { NuovaComunicazioneModal } from "./NuovaComunicazioneModal";
import {
  useComunicazioniAzienda, type ComunicazioneRow, type NuovaComunicazione,
} from "@/hooks/useComunicazioniAzienda";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface TabComunicazioniProps {
  companyId: string;
}

const tipoConfig: Record<
  ComunicazioneRow["tipo"],
  { label: string; icon: React.ElementType; className: string }
> = {
  email: { label: "Email", icon: Mail, className: "bg-blue-100 text-blue-700 border-blue-200" },
  sms: { label: "SMS", icon: MessageSquare, className: "bg-green-100 text-green-700 border-green-200" },
  notifica_inapp: { label: "In-app", icon: Bell, className: "bg-purple-100 text-purple-700 border-purple-200" },
};

const statoConfig: Record<
  ComunicazioneRow["stato"],
  { label: string; className: string }
> = {
  inviato: { label: "Inviato", className: "text-muted-foreground" },
  consegnato: { label: "Consegnato", className: "text-green-600" },
  fallito: { label: "Fallito", className: "text-red-600" },
  in_coda: { label: "In coda", className: "text-yellow-600" },
};

function ComunicazioneItem({ com }: { com: ComunicazioneRow }) {
  const cfg = tipoConfig[com.tipo];
  const Icon = cfg.icon;
  const stato = statoConfig[com.stato];

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
      <div className={`mt-0.5 flex-shrink-0 rounded-md p-1.5 border ${cfg.className}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-xs ${cfg.className}`}>
            {cfg.label}
          </Badge>
          {com.is_automatica && (
            <Badge variant="secondary" className="text-xs">Automatica</Badge>
          )}
          <span className={`text-xs ${stato.className}`}>{stato.label}</span>
        </div>
        {com.oggetto && (
          <p className="text-sm font-medium mt-1 truncate">{com.oggetto}</p>
        )}
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{com.corpo}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{format(new Date(com.created_at), "dd/MM/yyyy HH:mm", { locale: it })}</span>
          {com.inviato_da_nome && <span>· da {com.inviato_da_nome}</span>}
        </div>
      </div>
    </div>
  );
}

export function TabComunicazioni({ companyId }: TabComunicazioniProps) {
  const { user, profile } = useAuth();
  // FIX: usa il nome non-typo. Vecchio alias `inviaComuinicazione` ancora
  // disponibile per retrocompat ma il code-path corrente è quello pulito.
  const { comunicazioni, isLoading, isError, inviaComunicazione } =
    useComunicazioniAzienda(companyId);
  const [modalOpen, setModalOpen] = useState(false);
  const [tipoFilter, setTipoFilter] = useState<"all" | ComunicazioneRow["tipo"]>("all");
  const [statoFilter, setStatoFilter] = useState<"all" | ComunicazioneRow["stato"]>("all");

  // Nome operatore reale per audit (prima sempre null in DB)
  const operatorName = (() => {
    if (profile?.first_name || profile?.last_name) {
      return `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
    }
    return user?.email ?? null;
  })();

  // FIX: nuovo signature onSubmit con callbacks separati → reset solo on success
  const handleInvia = (
    data: NuovaComunicazione,
    callbacks: { onSuccess: () => void },
  ) => {
    inviaComunicazione.mutate(
      {
        ...data,
        company_id: companyId,
        inviato_da_nome: data.inviato_da_nome ?? operatorName ?? undefined,
      },
      { onSuccess: callbacks.onSuccess },
    );
  };

  // KPI counts (always sui dati grezzi, indipendenti dai filtri)
  const counts = useMemo(() => {
    const acc = {
      total: comunicazioni.length,
      email: 0, sms: 0, notifica_inapp: 0,
      consegnato: 0, fallito: 0, in_coda: 0,
    };
    comunicazioni.forEach((c) => {
      acc[c.tipo]++;
      if (c.stato === "consegnato") acc.consegnato++;
      else if (c.stato === "fallito") acc.fallito++;
      else if (c.stato === "in_coda") acc.in_coda++;
    });
    return acc;
  }, [comunicazioni]);

  const filtered = useMemo(() => {
    return comunicazioni.filter(
      (c) =>
        (tipoFilter === "all" || c.tipo === tipoFilter) &&
        (statoFilter === "all" || c.stato === statoFilter),
    );
  }, [comunicazioni, tipoFilter, statoFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-medium">Comunicazioni</h3>
          <p className="text-xs text-muted-foreground">
            Storico email, SMS e notifiche in-app inviate a questa azienda
          </p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova Comunicazione
        </Button>
      </div>

      {/* KPI strip */}
      {counts.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "Totale", value: counts.total, accent: "text-primary" },
            { label: "Email", value: counts.email, accent: "text-blue-600" },
            { label: "SMS", value: counts.sms, accent: "text-emerald-600" },
            {
              label: "Falliti",
              value: counts.fallito,
              accent: counts.fallito > 0 ? "text-destructive" : "text-muted-foreground",
            },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {k.label}
                </p>
                <p className={cn("text-lg font-bold leading-tight mt-0.5", k.accent)}>
                  {k.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      {counts.total > 3 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select
            value={tipoFilter}
            onValueChange={(v) =>
              setTipoFilter(v as "all" | ComunicazioneRow["tipo"])
            }
          >
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti tipi</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="notifica_inapp">In-app</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statoFilter}
            onValueChange={(v) =>
              setStatoFilter(v as "all" | ComunicazioneRow["stato"])
            }
          >
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti stati</SelectItem>
              <SelectItem value="inviato">Inviato</SelectItem>
              <SelectItem value="consegnato">Consegnato</SelectItem>
              <SelectItem value="fallito">Fallito</SelectItem>
              <SelectItem value="in_coda">In coda</SelectItem>
            </SelectContent>
          </Select>
          {(tipoFilter !== "all" || statoFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setTipoFilter("all");
                setStatoFilter("all");
              }}
            >
              Reset
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} di {counts.total}
          </span>
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex items-center gap-2 text-destructive py-4">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Impossibile caricare le comunicazioni</span>
            </div>
          ) : comunicazioni.length === 0 ? (
            <div className="py-8 text-center">
              <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Nessuna comunicazione inviata a questa azienda
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setModalOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" /> Invia la prima comunicazione
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessuna comunicazione corrisponde ai filtri correnti
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((com) => (
                <ComunicazioneItem key={com.id} com={com} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NuovaComunicazioneModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleInvia}
        isLoading={inviaComunicazione.isPending}
      />
    </div>
  );
}
