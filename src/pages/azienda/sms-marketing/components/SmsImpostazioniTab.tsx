/**
 * Tab SMS nelle impostazioni azienda.
 * Sezioni: numero attivo, mittente display, wallet crediti, test invio, notifiche.
 */
import { useState } from "react";
import { Phone, Copy, Send, Loader2, Wallet, Bell, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTelnyxSetup } from "@/hooks/useTelnyxSetup";
import { useSmsWallet, useSmsWalletTransazioni } from "@/hooks/useSmsWallet";
import { useSmsProviderConfig } from "@/hooks/useSmsProviderConfig";
import { SmsRicaricaModal } from "@/pages/azienda/sms-marketing/components/SmsRicaricaModal";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { TelnyxTestInvioRequest, TelnyxTestInvioResponse } from "@/types/sms-marketing";

export function SmsImpostazioniTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { numero, isLoadingNumero } = useTelnyxSetup();
  const { wallet, isLoadingWallet, creditiResidui } = useSmsWallet();
  const { config, isLoading: isLoadingConfig, saveConfig, isSaving } = useSmsProviderConfig();
  const { data: transazioniData } = useSmsWalletTransazioni(0, 5);

  const [ricaricaOpen, setRicaricaOpen] = useState(false);
  const [mittente, setMittente] = useState(config?.mittente_display ?? "");
  const [notificaEmail, setNotificaEmail] = useState(config?.notifica_soglia_email ?? true);
  const [notificaInapp, setNotificaInapp] = useState(config?.notifica_soglia_inapp ?? true);
  const [telTest, setTelTest] = useState("");
  const [msgTest, setMsgTest] = useState("Test SMS da Edilizia in Cloud — funziona!");
  const [isInviandoTest, setIsInviandoTest] = useState(false);

  // Sincronizza state con dati config
  if (config && mittente === "" && config.mittente_display) {
    setMittente(config.mittente_display);
  }

  const handleCopiaNumero = () => {
    if (numero?.numero_e164) {
      navigator.clipboard.writeText(numero.numero_e164);
      toast.success("Numero copiato negli appunti");
    }
  };

  const handleSaveConfig = async () => {
    await saveConfig({
      mittente_display: mittente || null,
      notifica_soglia_email: notificaEmail,
      notifica_soglia_inapp: notificaInapp,
    });
  };

  const handleTestInvio = async () => {
    if (!telTest.trim()) { toast.error("Inserisci il numero di destinazione"); return; }
    if (!companyId)       { toast.error("Azienda non selezionata"); return; }

    setIsInviandoTest(true);
    try {
      const { data, error } = await supabase.functions.invoke<TelnyxTestInvioResponse>(
        "telnyx-test-invio",
        { body: { company_id: companyId, telefono_destinatario: telTest.trim(), messaggio_test: msgTest } satisfies TelnyxTestInvioRequest }
      );
      if (error) throw new Error(error.message);
      if (data?.success) {
        toast.success(`SMS di prova inviato! Costo: €${data.costo_addebitato?.toFixed(4) ?? "0.06"}`);
      } else {
        toast.error(data?.error ?? "Invio non riuscito");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore durante il test");
    } finally {
      setIsInviandoTest(false);
    }
  };

  if (isLoadingNumero || isLoadingConfig || isLoadingWallet) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Numero dedicato */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Il tuo numero SMS</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {numero ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-mono font-bold">{numero.numero_display}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Attivato il {format(new Date(numero.data_acquisto), "d MMMM yyyy", { locale: it })}
                    {numero.prossimo_rinnovo && ` · Rinnovo: ${format(new Date(numero.prossimo_rinnovo), "d MMM yyyy", { locale: it })}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-emerald-600 border-emerald-200">Attivo</Badge>
                  <Button variant="ghost" size="sm" onClick={handleCopiaNumero}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessun numero attivo. Vai alla sezione SMS Marketing per configurarne uno.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Wallet crediti */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Crediti SMS</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={() => setRicaricaOpen(true)}>
              + Ricarica crediti
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {wallet ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(creditiResidui)}
                </span>
                <span className="text-sm text-muted-foreground">disponibili</span>
              </div>
              {wallet.crediti_riservati > 0 && (
                <p className="text-xs text-amber-600">
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(wallet.crediti_riservati)} riservati per campagne in corso
                </p>
              )}
              {/* Ultime transazioni */}
              {transazioniData && transazioniData.items.length > 0 && (
                <div className="space-y-1 border-t pt-3 mt-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Ultimi movimenti</p>
                  {transazioniData.items.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[60%]">{t.descrizione}</span>
                      <span className={t.importo >= 0 ? "text-emerald-600 font-medium" : "text-destructive"}>
                        {t.importo >= 0 ? "+" : ""}
                        {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Math.abs(t.importo))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Wallet non ancora inizializzato</p>
          )}
        </CardContent>
      </Card>

      {/* Mittente display */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mittente display</CardTitle>
          <CardDescription>Opzionale — nome visualizzato al posto del numero (max 11 caratteri)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mittente">Nome mittente</Label>
            <Input
              id="mittente"
              value={mittente}
              onChange={(e) => {
                const v = e.target.value;
                if (/^[A-Za-z0-9 ]*$/.test(v) && v.length <= 11) setMittente(v);
              }}
              placeholder="Es: Edilizia"
              maxLength={11}
            />
            <p className="text-xs text-muted-foreground">{mittente.length}/11 caratteri · Solo lettere, numeri e spazi</p>
          </div>
          <Button size="sm" onClick={handleSaveConfig} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Salva impostazioni
          </Button>
        </CardContent>
      </Card>

      {/* Test invio */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TestTube2 className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Test invio SMS</CardTitle>
          </div>
          <CardDescription>Invia un SMS di prova al tuo numero per verificare il funzionamento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tel-test">Numero destinatario</Label>
              <Input
                id="tel-test"
                value={telTest}
                onChange={(e) => setTelTest(e.target.value)}
                placeholder="+39 333 123 4567"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="msg-test">Messaggio di prova</Label>
              <Input
                id="msg-test"
                value={msgTest}
                onChange={(e) => setMsgTest(e.target.value.slice(0, 160))}
                placeholder="Testo del messaggio di prova"
                maxLength={160}
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleTestInvio}
            disabled={isInviandoTest || !numero}
          >
            {isInviandoTest ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            Invia SMS di prova
          </Button>
          {!numero && <p className="text-xs text-muted-foreground">Attiva prima il tuo numero SMS per inviare un test</p>}
        </CardContent>
      </Card>

      {/* Notifiche */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Notifiche crediti</CardTitle>
          </div>
          <CardDescription>Avvisami quando i crediti SMS stanno per esaurirsi</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Notifica via email</p>
              <p className="text-xs text-muted-foreground">Ricevi un'email quando scendi sotto la soglia minima</p>
            </div>
            <Switch
              checked={notificaEmail}
              onCheckedChange={(v) => { setNotificaEmail(v); }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Notifica in-app</p>
              <p className="text-xs text-muted-foreground">Mostra un avviso nella dashboard SMS</p>
            </div>
            <Switch
              checked={notificaInapp}
              onCheckedChange={(v) => { setNotificaInapp(v); }}
            />
          </div>
          <Button size="sm" onClick={handleSaveConfig} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Salva notifiche
          </Button>
        </CardContent>
      </Card>

      <SmsRicaricaModal open={ricaricaOpen} onOpenChange={setRicaricaOpen} />
    </div>
  );
}
