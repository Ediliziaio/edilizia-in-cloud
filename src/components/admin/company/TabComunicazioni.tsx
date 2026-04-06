import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Mail, MessageSquare, Bell, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NuovaComunicazioneModal } from "./NuovaComunicazioneModal";
import { useComunicazioniAzienda, type ComunicazioneRow, type NuovaComunicazione } from "@/hooks/useComunicazioniAzienda";

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
  const { comunicazioni, isLoading, isError, inviaComuinicazione } =
    useComunicazioniAzienda(companyId);
  const [modalOpen, setModalOpen] = useState(false);

  const handleInvia = (data: NuovaComunicazione) => {
    inviaComuinicazione.mutate(
      { ...data, company_id: companyId },
      { onSuccess: () => setModalOpen(false) }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
          ) : (
            <div className="divide-y">
              {comunicazioni.map((com) => (
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
        isLoading={inviaComuinicazione.isPending}
      />
    </div>
  );
}
