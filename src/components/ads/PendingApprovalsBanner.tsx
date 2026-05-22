/**
 * PendingApprovalsBanner — banner persistent visibile al titolare nella home modulo.
 *
 * Mostra le campagne in stato 'review' (budget > soglia) con bottoni
 * "Approva" / "Rifiuta" inline.
 */
import { useState } from "react";
import {
  AlertCircle,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Euro,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAdsPendingApprovals } from "@/hooks/useAdsPendingApprovals";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

function formatEuro(cents: number | null) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

interface Props {
  companyId: string | undefined;
  onOpenCampaign?: (id: string) => void;
}

export function PendingApprovalsBanner({ companyId, onOpenCampaign }: Props) {
  const { pending, count, isLoading, decide, isDeciding } = useAdsPendingApprovals(companyId);
  const { role } = useAuth();
  const [expanded, setExpanded] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  // Solo company_admin vede il banner approval (operai no)
  const canApprove = role === "company_admin" || role === "super_admin";

  if (isLoading || !canApprove || count === 0) return null;

  return (
    <Card className="border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/30">
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="text-left">
              <CardTitle className="text-base text-amber-900">
                {count} campagn{count === 1 ? "a" : "e"} in attesa della tua approvazione
              </CardTitle>
              <p className="text-xs text-amber-700">
                Budget sopra soglia o nuove campagne create dai tuoi operatori.
              </p>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-amber-700" />
          ) : (
            <ChevronDown className="h-5 w-5 text-amber-700" />
          )}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3 pt-0">
          {pending.map((c) => {
            const isRejecting = rejectingId === c.id;
            return (
              <div
                key={c.id}
                className={cn(
                  "rounded-xl border bg-white p-3 shadow-sm",
                  isRejecting && "border-red-200 bg-red-50/30",
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <button
                    type="button"
                    onClick={() => onOpenCampaign?.(c.id)}
                    className="flex-1 text-left"
                  >
                    <p className="font-semibold text-slate-950 hover:text-slate-700">{c.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <Euro className="h-3 w-3" />
                        <strong>{formatEuro(c.daily_budget_cents)}</strong>/giorno
                      </span>
                      {c.created_by && (
                        <span className="flex items-center gap-1">
                          <UserIcon className="h-3 w-3" />
                          Creata da operatore
                        </span>
                      )}
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                        {c.objective.replace("OUTCOME_", "").toLowerCase()}
                      </Badge>
                    </div>
                  </button>

                  {!isRejecting && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isDeciding}
                        onClick={() => {
                          setRejectingId(c.id);
                          setReason("");
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                        Rifiuta
                      </Button>
                      <Button
                        size="sm"
                        disabled={isDeciding}
                        onClick={() =>
                          void decide({ campaign_id: c.id, decision: "approve" })
                        }
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        {isDeciding ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Approva
                      </Button>
                    </div>
                  )}
                </div>

                {isRejecting && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Motivazione del rifiuto (opzionale, ma utile per l'operatore)"
                      className="min-h-[60px] text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectingId(null);
                          setReason("");
                        }}
                      >
                        Annulla
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isDeciding}
                        onClick={async () => {
                          await decide({
                            campaign_id: c.id,
                            decision: "reject",
                            reason: reason.trim() || undefined,
                          });
                          setRejectingId(null);
                          setReason("");
                        }}
                      >
                        {isDeciding ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        Conferma rifiuto
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
