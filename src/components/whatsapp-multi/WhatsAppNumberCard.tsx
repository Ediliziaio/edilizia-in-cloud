// MP04 — Card per singolo numero WhatsApp multi-purpose.

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, AlertTriangle, Phone, Trash2, Settings2 } from "lucide-react";
import {
  PURPOSE_DESCRIPTIONS,
  PURPOSE_LABELS,
  useDeleteWANumber,
  type WANumber,
  type WAPurpose,
} from "@/hooks/whatsapp/useWhatsAppNumbers";

interface Props {
  number: WANumber;
  onOpenSettings?: (id: string) => void;
}

export function WhatsAppNumberCard({ number, onOpenSettings }: Props) {
  const del = useDeleteWANumber();
  const purpose = number.purpose as WAPurpose;
  const active = number.stato === "active" && number.webhook_verified;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">
                {number.display_name || PURPOSE_LABELS[purpose]}
              </h3>
              {active ? (
                <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Attivo
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {number.stato ?? "pending"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {PURPOSE_LABELS[purpose]}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Phone className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono">{number.numero || "—"}</span>
        </div>

        {number.daily_budget_eur != null && (
          <div className="text-xs text-muted-foreground">
            Budget giornaliero: €{Number(number.daily_budget_eur).toFixed(2)} — speso oggi €{Number(number.current_day_spend_eur ?? 0).toFixed(4)}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {PURPOSE_DESCRIPTIONS[purpose]}
        </p>

        <div className="flex items-center gap-2 pt-2">
          {onOpenSettings && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenSettings(number.id)}
              aria-label={`Impostazioni ${number.display_name ?? number.numero}`}
            >
              <Settings2 className="mr-1 h-4 w-4" />
              Impostazioni
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                aria-label="Rimuovi numero"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rimuovere questo numero?</AlertDialogTitle>
                <AlertDialogDescription>
                  Il numero {number.numero} verrà disattivato (soft delete).
                  Lo storico messaggi resta consultabile. Puoi riconnetterlo in futuro.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => del.mutate(number.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Rimuovi
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
