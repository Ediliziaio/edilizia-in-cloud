import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { agganciaSopralluogo, listSurveysByOrder, sopralluoghiDaAgganciare, updateSurvey } from "@/lib/api/surveys";
import { surveyAddress } from "@/lib/surveys/report";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import {
  ClipboardCheck,
  Plus,
  MapPin,
  Calendar,
  ChevronRight,
  Ruler,
  Loader2,
  ArrowRightLeft,
  Link2,
} from "lucide-react";
import { OfficeSelect } from "./OfficeSelect";

/**
 * OrderSurveysCard — mostra, dentro la commessa, i sopralluoghi (rilievi misure)
 * ad essa collegati (surveys.order_id). È il punto in cui, entrando nella
 * commessa, si ritrovano i dettagli dei sopralluoghi e si crea un nuovo
 * rilievo già agganciato (NuovoSopralluogo legge ?order=ID).
 *
 * Sola lettura + navigazione: nessuna scrittura, quindi additivo e sicuro.
 */

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: {
    label: "Bozza",
    color: "bg-slate-100 text-slate-700 border-slate-300",
  },
  in_progress: {
    label: "In corso",
    color: "bg-amber-100 text-amber-700 border-amber-300",
  },
  completed: {
    label: "Completato",
    color: "bg-emerald-100 text-emerald-700 border-emerald-300",
  },
  reviewed: {
    label: "Verificato",
    color: "bg-blue-100 text-blue-700 border-blue-300",
  },
  signed: {
    label: "Firmato",
    color: "bg-emerald-100 text-emerald-700 border-emerald-300",
  },
  converted: {
    label: "Convertito",
    color: "bg-blue-100 text-blue-700 border-blue-300",
  },
  archived: {
    label: "Archiviato",
    color: "bg-slate-100 text-slate-700 border-slate-300",
  },
  cancelled: {
    label: "Annullato",
    color: "bg-slate-100 text-slate-700 border-slate-300",
  },
};
const PortaRilievoDialog = lazy(() =>
  import("@/components/orders/PortaRilievoDialog").then((m) => ({
    default: m.PortaRilievoDialog,
  })),
);
const SurveyDetailDialog = lazy(() =>
  import("@/components/sopralluoghi/SurveyDetailDialog").then((m) => ({
    default: m.SurveyDetailDialog,
  })),
);

interface OrderSurveysCardProps {
  orderId: string;
}

export function OrderSurveysCard({ orderId }: OrderSurveysCardProps) {
  const navigate = useNavigate();
  // La rotta di creazione rimanda indietro chi è in sola lettura: meglio spegnere il bottone.
  const { solaLettura, canViewSopralluoghi, canViewOrders, canEditOrders } = usePermissions();
  const [selected, setSelected] = useState<string | null>(null);
  const [daPortare, setDaPortare] = useState<string | null>(null);
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const {
    data: surveys,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["order-surveys", orderId, effectiveCompany?.id],
    queryFn: () => listSurveysByOrder(orderId, effectiveCompany!.id),
    enabled: !!orderId && !!effectiveCompany?.id && canViewSopralluoghi,
    staleTime: 30_000,
  });

  // Sopralluoghi fatti prima della commessa, sullo stesso cliente o contatto.
  const { data: daAgganciare } = useQuery({
    queryKey: ["order-surveys-da-agganciare", orderId, effectiveCompany?.id],
    queryFn: () => sopralluoghiDaAgganciare(orderId),
    enabled: !!orderId && !!effectiveCompany?.id && canViewSopralluoghi && canViewOrders && canEditOrders && !solaLettura,
    staleTime: 30_000,
  });
  const aggiorna = () => {
    qc.invalidateQueries({ queryKey: ["order-surveys", orderId] });
    qc.invalidateQueries({ queryKey: ["order-surveys-da-agganciare", orderId] });
  };
  const aggancia = useMutation({
    mutationFn: (surveyId: string) => agganciaSopralluogo(surveyId, orderId),
    onSuccess: () => {
      aggiorna();
      toast.success("Sopralluogo collegato alla commessa");
    },
    onError: (e) => toast.error((e as Error).message || "Sopralluogo non collegato"),
  });
  const cambiaRuolo = useMutation({
    mutationFn: (p: { id: string; ruolo: "preliminare" | "definitivo" | null }) => updateSurvey(p.id, { ruolo_misure: p.ruolo }),
    onSuccess: aggiorna,
    onError: () => toast.error("Non sono riuscito a cambiare il tipo di misure"),
  });

  const goNew = () => navigate(`/azienda/sopralluoghi/nuovo?order=${orderId}`);
  if (!canViewSopralluoghi)
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Per consultare i rilievi serve il permesso «Sopralluoghi».
      </p>
    );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 max-sm:p-3 max-sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg min-w-0">
          <ClipboardCheck className="h-4 w-4 shrink-0 text-orange-500" />
          <span className="truncate">Rilievi e sopralluoghi</span>
          {surveys && surveys.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground shrink-0">
              ({surveys.length})
            </span>
          )}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 shrink-0 border-slate-300 font-semibold text-blue-950"
          onClick={goNew}
          disabled={solaLettura}
          title={solaLettura ? "Sei in sola lettura" : undefined}
        >
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          <span>Nuovo sopralluogo</span>
        </Button>
      </CardHeader>
      <CardContent className="max-sm:p-3 max-sm:pt-0">
        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carico i sopralluoghi…
          </div>
        )}

        {isError && (
          <p className="py-6 text-sm text-red-600">
            Errore nel caricamento dei sopralluoghi.
          </p>
        )}

        {!isLoading && !isError && (!surveys || surveys.length === 0) && (
          <div className="flex items-center gap-3 py-1 text-sm text-muted-foreground max-sm:py-0 max-sm:text-xs">
            <Ruler className="h-5 w-5 shrink-0 text-muted-foreground/40 max-sm:hidden" />
            <span className="flex-1">
              Nessun sopralluogo collegato.
              <span className="max-sm:hidden">
                {" "}
                Le misure definitive del rilievo confermano quelle del
                preventivo prima di ordinare al fornitore.
              </span>
            </span>
          </div>
        )}

        {!isLoading && !isError && surveys && surveys.length > 0 && (
          <ul className="divide-y">
            {surveys.map((s) => {
              const cfg = STATUS_LABEL[s.status] ?? STATUS_LABEL.draft;
              const when = s.completed_at ?? s.scheduled_at ?? s.created_at;
              const place = surveyAddress(s);
              return (
                <li key={s.id} className="py-1">
                  <button
                    type="button"
                    onClick={() => setSelected(s.id)}
                    aria-haspopup="dialog"
                    className="-mx-2 flex w-full items-center gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {s.code || "Sopralluogo"}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${cfg.color}`}
                        >
                          {cfg.label}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {when && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(when), "d MMM yy", { locale: it })}
                          </span>
                        )}
                        {place && (
                          <span className="flex min-w-0 items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{place}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                  <div className="flex flex-wrap items-center gap-2 pb-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      Misure
                      <OfficeSelect
                        className="h-9 px-2 text-xs text-foreground"
                        label={`Tipo di misure del sopralluogo ${s.code || ""}`.trim()}
                        disabled={solaLettura || cambiaRuolo.isPending}
                        value={s.ruolo_misure ?? ""}
                        onValueChange={(v) => cambiaRuolo.mutate({ id: s.id, ruolo: (v || null) as "preliminare" | "definitivo" | null })}
                        options={[
                          { value: "", label: "Non indicato" },
                          { value: "preliminare", label: "Preliminari" },
                          { value: "definitivo", label: "Definitive" },
                        ]}
                      />
                    </label>
                    {canEditOrders && !solaLettura && (
                      <Button size="sm" variant="outline" className="min-h-9 text-xs" onClick={() => setDaPortare(s.id)}>
                        <ArrowRightLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Porta le misure in commessa
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {canEditOrders && !solaLettura && daAgganciare && daAgganciare.length > 0 && (
          <div className="mt-3 space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-xs font-medium">Sopralluoghi dello stesso cliente, non ancora collegati</p>
            {daAgganciare.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {s.code || "Sopralluogo"}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {format(new Date(s.completed_at ?? s.created_at), "d MMM yy", { locale: it })}
                    {s.city ? ` · ${s.city}` : ""}
                  </span>
                </span>
                <Button size="sm" variant="outline" className="min-h-9 text-xs" disabled={aggancia.isPending} onClick={() => aggancia.mutate(s.id)}>
                  <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Collega
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {daPortare && (
        <Suspense fallback={<p role="status" className="px-4 pb-4 text-sm text-muted-foreground">Apro il rilievo…</p>}>
          <PortaRilievoDialog surveyId={daPortare} orderId={orderId} onClose={() => setDaPortare(null)} />
        </Suspense>
      )}
      {selected && (
        <Suspense
          fallback={
            <p
              role="status"
              className="px-4 pb-4 text-sm text-muted-foreground"
            >
              Apro il sopralluogo…
            </p>
          }
        >
          <SurveyDetailDialog
            key={`${effectiveCompany?.id}:${orderId}:${selected}`}
            surveyId={selected}
            orderId={orderId}
            onClose={() => setSelected(null)}
          />
        </Suspense>
      )}
    </Card>
  );
}
