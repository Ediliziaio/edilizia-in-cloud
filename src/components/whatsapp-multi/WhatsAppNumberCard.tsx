// MP04 — Card per singolo numero WhatsApp multi-purpose.

import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle2,
  AlertTriangle,
  Phone,
  Trash2,
  Settings2,
  KeyRound,
  Loader2,
  Info,
  UserCircle,
} from "lucide-react";
import {
  PURPOSE_AUTONOMY,
  PURPOSE_DESCRIPTIONS,
  PURPOSE_EXAMPLES,
  PURPOSE_GROUP_BY_PURPOSE,
  PURPOSE_GROUPS,
  PURPOSE_LABELS,
  useConnectWANumber,
  useDeleteWANumber,
  type WANumber,
  type WAPurpose,
} from "@/hooks/whatsapp/useWhatsAppNumbers";
import { usePermissions } from "@/hooks/usePermissions";
import { WhatsAppProfiloDialog } from "./WhatsAppProfiloDialog";

interface Props {
  number: WANumber;
  onOpenSettings?: (id: string) => void;
}

export function WhatsAppNumberCard({ number, onOpenSettings }: Props) {
  const del = useDeleteWANumber();
  const connect = useConnectWANumber();
  const purpose = number.purpose as WAPurpose;
  const group = PURPOSE_GROUPS[PURPOSE_GROUP_BY_PURPOSE[purpose]];
  const active = number.stato === "active" && number.webhook_verified;

  // Aggiorna token: i token Meta (specie numeri di test) scadono. Il wizard
  // disabilita uno scopo già collegato, quindi senza questo path non sarebbe
  // possibile rinfrescare un token scaduto. Ri-chiama whatsapp-connect, che fa
  // upsert su (company, purpose): aggiorna il token cifrato, ri-sottoscrive la
  // WABA e riporta il numero ad "active".
  const [tokenOpen, setTokenOpen] = useState(false);
  const [newToken, setNewToken] = useState("");

  const canReconnect = Boolean(number.phone_number_id && number.waba_id);

  // Profilo WhatsApp (foto, info, descrizione…): lo cambia solo chi amministra
  // l'azienda, come i template. Serve un numero collegato a Meta.
  const { isAdmin } = usePermissions();
  const [profiloOpen, setProfiloOpen] = useState(false);
  const canEditProfilo = isAdmin && Boolean(number.phone_number_id);

  const submitNewToken = () => {
    const token = newToken.trim();
    if (!token || !canReconnect) return;
    connect.mutate(
      {
        purpose,
        phone_number: number.numero ?? "",
        phone_number_id: number.phone_number_id ?? "",
        waba_id: number.waba_id ?? "",
        access_token: token,
        display_name: number.display_name ?? undefined,
      },
      {
        onSuccess: () => {
          setTokenOpen(false);
          setNewToken("");
        },
      },
    );
  };

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
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {/* prima: stato grezzo ("active" dentro un badge d'allarme se
                      mancava solo il webhook) — ora label parlante */}
                  {number.stato === "active" && !number.webhook_verified
                    ? "Webhook da verificare"
                    : ({ pending_verification: "In verifica", suspended: "Sospeso", removed: "Rimosso", pending: "In attesa" } as Record<string, string>)[number.stato ?? "pending"] ?? number.stato ?? "In attesa"}
                </Badge>
              )}
              {/* Health Meta: quality rating early-warning (prima invisibile:
                  un numero RED — verso il blocco Meta — appariva come uno GREEN) */}
              {number.quality_rating && (
                <Badge variant="outline" className={
                  number.quality_rating === "GREEN" ? "border-green-300 text-green-700 dark:border-green-800 dark:text-green-400"
                  : number.quality_rating === "YELLOW" ? "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                  : "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
                } title={`Qualità Meta: ${number.quality_rating}${number.messaging_limit_tier ? ` · tier ${number.messaging_limit_tier}` : ""}`}>
                  {number.quality_rating === "GREEN" ? "Qualità ✓" : number.quality_rating === "YELLOW" ? "Qualità ⚠" : "Qualità ✗"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {group.label}
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

        <div className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{PURPOSE_LABELS[purpose]}</span>
          <span className="block">{PURPOSE_AUTONOMY[purpose]}</span>
        </div>

        <ul className="space-y-1 text-xs text-muted-foreground">
          {PURPOSE_EXAMPLES[purpose].slice(0, 2).map((example) => (
            <li key={example} className="flex gap-1.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
              <span>{example}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2 pt-2">
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

          {canEditProfilo && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProfiloOpen(true)}
              aria-label={`Profilo WhatsApp ${number.display_name ?? number.numero}`}
            >
              <UserCircle className="mr-1 h-4 w-4" />
              Profilo
            </Button>
          )}

          {canReconnect && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTokenOpen(true)}
              aria-label={`Aggiorna token ${number.display_name ?? number.numero}`}
            >
              <KeyRound className="mr-1 h-4 w-4" />
              Aggiorna token
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

      {canEditProfilo && (
        <WhatsAppProfiloDialog number={number} open={profiloOpen} onOpenChange={setProfiloOpen} />
      )}

      {/* Dialog aggiorna token — rinfresca un access token scaduto senza dover
          rimuovere e ricreare il numero. */}
      <Dialog
        open={tokenOpen}
        onOpenChange={(o) => {
          setTokenOpen(o);
          if (!o) setNewToken("");
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle>Aggiorna access token</DialogTitle>
            <DialogDescription>
              Incolla un nuovo access token Meta per {number.numero}. Il numero
              resta lo stesso (Phone ID e WABA invariati); aggiorniamo solo il
              token, lo ri-sottoscriviamo e lo riportiamo attivo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Lo trovi in <b>Meta Business Manager → WhatsApp → Configurazione API</b>.
                I token temporanei dei numeri di test scadono dopo ~24h: per la
                produzione usa un token permanente da Utente di sistema.
              </AlertDescription>
            </Alert>

            <div className="space-y-1">
              <Label htmlFor={`token-${number.id}`}>Access Token</Label>
              <Textarea
                id={`token-${number.id}`}
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                rows={3}
                placeholder="EAAG..."
                autoComplete="off"
              />
            </div>

            <div className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground space-y-0.5">
              <div>Phone Number ID: <code>{number.phone_number_id}</code></div>
              <div>WABA ID: <code>{number.waba_id}</code></div>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setTokenOpen(false)}>
              Annulla
            </Button>
            <Button disabled={!newToken.trim() || connect.isPending} onClick={submitNewToken}>
              {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aggiorna e riattiva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
