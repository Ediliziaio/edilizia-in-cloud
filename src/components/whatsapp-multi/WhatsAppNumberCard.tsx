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
  PURPOSE_LABELS,
  etichettaStatoNumero,
  useConnectWANumber,
  useDeleteWANumber,
  type WANumber,
  type WAPurpose,
} from "@/hooks/whatsapp/useWhatsAppNumbers";
import { usePermissions } from "@/hooks/usePermissions";
import { WhatsAppProfiloDialog } from "./WhatsAppProfiloDialog";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

/** «10,00 €»; per cifre piccolissime (la spesa AI di un giorno) qualche decimale in più, così non sembra zero. */
const euro = (valore: number) =>
  valore.toLocaleString(intlCampo(), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: valore > 0 && valore < 0.01 ? 4 : 2,
  });

interface Props {
  number: WANumber;
  onOpenSettings?: (id: string) => void;
}

export function WhatsAppNumberCard({ number, onOpenSettings }: Props) {
  const t = useT();
  const del = useDeleteWANumber();
  const connect = useConnectWANumber();
  const purpose = number.purpose as WAPurpose;
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
                {number.display_name || t(PURPOSE_LABELS[purpose])}
              </h3>
              {active ? (
                <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {t("Attivo")}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {/* prima: stato grezzo ("active" dentro un badge d'allarme se
                      mancava solo il webhook) — ora label parlante, la stessa di Integrazioni */}
                  {etichettaStatoNumero(number.stato, number.webhook_verified)}
                </Badge>
              )}
              {/* Health Meta: quality rating early-warning (prima invisibile:
                  un numero RED — verso il blocco Meta — appariva come uno GREEN) */}
              {number.quality_rating && (
                <Badge variant="outline" className={
                  number.quality_rating === "GREEN" ? "border-green-300 text-green-700 dark:border-green-800 dark:text-green-400"
                  : number.quality_rating === "YELLOW" ? "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                  : "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
                } title={`${t("Qualità Meta: {valore}", { valore: String(number.quality_rating ?? "") })}${number.messaging_limit_tier ? ` · tier ${number.messaging_limit_tier}` : ""}`}>
                  {number.quality_rating === "GREEN" ? t("Qualità ✓") : number.quality_rating === "YELLOW" ? t("Qualità ⚠") : t("Qualità ✗")}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t(PURPOSE_LABELS[purpose])}
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
          <div className="text-xs text-muted-foreground">{t("Spesa massima AI al giorno: {massimo} · speso oggi: {speso}", { massimo: euro(Number(number.daily_budget_eur)), speso: euro(Number(number.current_day_spend_eur ?? 0)) })}</div>
        )}

        {/* Una frase sola: come lavora Silvio su questo numero. Descrizione ed esempi stanno nella pagina del numero. */}
        <p className="text-xs text-muted-foreground">
          {t(PURPOSE_AUTONOMY[purpose])}
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {onOpenSettings && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenSettings(number.id)}
              aria-label={t("Impostazioni {nome}", { nome: number.display_name ?? number.numero ?? "" })}
            >
              <Settings2 className="mr-1 h-4 w-4" />
              {t("Impostazioni")}
            </Button>
          )}

          {canEditProfilo && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProfiloOpen(true)}
              aria-label={t("Profilo WhatsApp {nome}", { nome: number.display_name ?? number.numero ?? "" })}
            >
              <UserCircle className="mr-1 h-4 w-4" />
              {t("Profilo")}
            </Button>
          )}

          {canReconnect && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTokenOpen(true)}
              aria-label={t("Aggiorna token {nome}", { nome: number.display_name ?? number.numero ?? "" })}
            >
              <KeyRound className="mr-1 h-4 w-4" />
              {t("Aggiorna token")}
            </Button>
          )}

          {/* Togliere il numero spetta a chi amministra: il database lo nega agli altri. */}
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  aria-label={t("Rimuovi numero")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("Rimuovere questo numero?")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("Il numero {numero} viene disattivato. Lo storico dei messaggi resta consultabile e lo puoi ricollegare in futuro.", { numero: String(number.numero ?? "") })}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => del.mutate(number.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t("Rimuovi")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
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
            <DialogTitle>{t("Aggiorna access token")}</DialogTitle>
            <DialogDescription>{t("Incolla un nuovo access token Meta per {numero}. Il numero resta lo stesso (Phone ID e WABA invariati); aggiorniamo solo il token, lo ri-sottoscriviamo e lo riportiamo attivo.", { numero: String(number.numero ?? "") })}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t("Lo trovi in")} <b>{t("Meta Business Manager → WhatsApp → Configurazione API")}</b>{t(". I token temporanei dei numeri di test scadono dopo ~24h: per la produzione usa un token permanente da Utente di sistema.")}
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
              {t("Annulla")}
            </Button>
            <Button disabled={!newToken.trim() || connect.isPending} onClick={submitNewToken}>
              {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("Aggiorna e riattiva")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
