import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileSignature, FileText, Hammer, Info, Link2, Mail, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { FEABannerEsVsFea } from "@/components/fea/FEABannerEsVsFea";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { usePermissions } from "@/hooks/usePermissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type FeaConfig = Database["public"]["Tables"]["fea_configurazione"]["Row"];
type PreventivoImpostazioni = Pick<
  Database["public"]["Tables"]["preventivo_impostazioni"]["Row"],
  "firma_digitale_abilitata"
>;

type SettingsFormState = {
  firmaPreventivi: boolean;
  testoRecessoB2c: string;
};

const DEFAULT_RECESSO_B2C =
  "Il cliente dichiara di aver letto il documento, di accettarne il contenuto e di autorizzare l'uso della firma elettronica avanzata con verifica OTP.";

export default function SettingsFirmaElettronica() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  // La firma dei preventivi e il testo del recesso li cambia chi ha le
  // integrazioni in modifica: è la regola del database dal 26/09/2026.
  const puoModificare = usePermissions().canEditSettingsIntegrations;

  const [firmaPreventivi, setFirmaPreventivi] = useState(true);
  const [testoRecessoB2c, setTestoRecessoB2c] = useState(DEFAULT_RECESSO_B2C);
  const [savedState, setSavedState] = useState<SettingsFormState | null>(null);

  const { data: feaConfig, isLoading: isLoadingFea, isError: isErrorFea } = useQuery<FeaConfig | null>({
    queryKey: ["fea-configurazione", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fea_configurazione")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const { data: preventivoSettings, isLoading: isLoadingPreventivi, isError: isErrorPreventivi } = useQuery<PreventivoImpostazioni | null>({
    queryKey: ["preventivo-impostazioni-firma", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("preventivo_impostazioni")
        .select("firma_digitale_abilitata")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const currentState = useMemo<SettingsFormState>(() => ({
    firmaPreventivi,
    testoRecessoB2c,
  }), [firmaPreventivi, testoRecessoB2c]);

  const isDirty = useMemo(() => {
    if (!savedState) return false;
    return (
      savedState.firmaPreventivi !== currentState.firmaPreventivi ||
      savedState.testoRecessoB2c !== currentState.testoRecessoB2c
    );
  }, [currentState, savedState]);

  useBeforeUnload(isDirty);

  useEffect(() => {
    if (isLoadingFea || isLoadingPreventivi) return;
    const nextState: SettingsFormState = {
      firmaPreventivi: preventivoSettings?.firma_digitale_abilitata ?? true,
      testoRecessoB2c: feaConfig?.testo_recesso_b2c || DEFAULT_RECESSO_B2C,
    };
    setFirmaPreventivi(nextState.firmaPreventivi);
    setTestoRecessoB2c(nextState.testoRecessoB2c);
    setSavedState(nextState);
  }, [feaConfig, isLoadingFea, isLoadingPreventivi, preventivoSettings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile.");
      const snapshot = { ...currentState, testoRecessoB2c: currentState.testoRecessoB2c.trim() || DEFAULT_RECESSO_B2C };

      const [feaResult, preventivoResult] = await Promise.all([
        supabase
          .from("fea_configurazione")
          .upsert(
            {
              company_id: companyId,
              testo_recesso_b2c: snapshot.testoRecessoB2c,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "company_id" },
          ),
        supabase
          .from("preventivo_impostazioni")
          .upsert(
            {
              company_id: companyId,
              firma_digitale_abilitata: snapshot.firmaPreventivi,
            },
            { onConflict: "company_id" },
          ),
      ]);

      if (feaResult.error) throw feaResult.error;
      if (preventivoResult.error) throw preventivoResult.error;
      return snapshot;
    },
    onSuccess: (snapshot) => {
      setFirmaPreventivi(snapshot.firmaPreventivi);
      setTestoRecessoB2c(snapshot.testoRecessoB2c);
      setSavedState(snapshot);
      queryClient.invalidateQueries({ queryKey: ["fea-configurazione", companyId] });
      queryClient.invalidateQueries({ queryKey: ["preventivo-impostazioni-firma", companyId] });
      queryClient.invalidateQueries({ queryKey: ["preventivo-impostazioni", companyId] });
      toast.success("Impostazioni Firma Elettronica salvate");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Salvataggio non riuscito");
    },
  });

  const isLoading = isLoadingFea || isLoadingPreventivi;
  const isErrorConfig = isErrorFea || isErrorPreventivi;

  if (isErrorConfig) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Alert variant="destructive">
          <AlertTitle>Errore di caricamento</AlertTitle>
          <AlertDescription>
            Impossibile caricare la configurazione. Ricarica la pagina prima di modificare.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="border-orange-200 bg-gradient-to-br from-white via-white to-orange-50/60">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm shadow-orange-200">
                  <FileSignature className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Impostazioni Firma Elettronica</CardTitle>
                  <CardDescription>
                    Regole generali per firme OTP, preventivi e documenti firmabili.
                  </CardDescription>
                </div>
              </div>
            </div>
            {isDirty && (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                Modifiche non salvate
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Alert className="border-blue-200 bg-blue-50">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-950">Flusso corretto</AlertTitle>
            <AlertDescription className="text-blue-800">
              Le firme non si creano da questa pagina: partono dal preventivo, dal collaudo o dal documento
              operativo. L'area Firma Elettronica resta l'archivio dove controlli inviati, in attesa e firmati.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-blue-600" />
              Marketing & Vendite
            </CardTitle>
            <CardDescription>Preventivi e contratti commerciali usano i template offerte.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              onClick={() => navigate("/azienda/impostazioni/template-preventivi")}
            >
              Template offerte
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="border-orange-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hammer className="h-4 w-4 text-orange-600" />
              Cantieri & Lavori
            </CardTitle>
            <CardDescription>Collaudi, moduli, DDT e documenti operativi partono dalla console firme.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              onClick={() => navigate("/azienda/firma-elettronica")}
            >
              Moduli e firme operative
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="border-emerald-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Archivio firme
            </CardTitle>
            <CardDescription>Ogni firma resta collegata a cliente, preventivo, ordine o documento.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              onClick={() => navigate("/azienda/firma-elettronica")}
            >
              Apri archivio
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Metodo firma
            </CardTitle>
            <CardDescription>Dove proporre la firma al cliente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="firma-preventivi">Firma elettronica sui preventivi</Label>
                <p className="text-sm text-muted-foreground">
                  Mostra il flusso firma quando invii un preventivo al cliente.
                </p>
              </div>
              <Switch
                id="firma-preventivi"
                checked={firmaPreventivi}
                disabled={isLoading || !puoModificare}
                onCheckedChange={setFirmaPreventivi}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-blue-600" />
              Messaggi e archivio
            </CardTitle>
            <CardDescription>Cosa succede quando viene richiesta una firma.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="font-medium text-slate-950">Invio</p>
              <p className="mt-1 text-muted-foreground">Email con link sicuro e OTP collegato alla richiesta.</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="font-medium text-slate-950">Archivio</p>
              <p className="mt-1 text-muted-foreground">Ogni firma finisce nella console Firma Elettronica con stato e audit.</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="font-medium text-slate-950">Origine documento</p>
              <p className="mt-1 text-muted-foreground">Preventivo, collaudo, ordine o template operativo restano il punto di partenza.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-orange-600" />
            Testo consenso B2C
          </CardTitle>
          <CardDescription>
            Testo mostrato nei flussi cliente quando serve esplicitare consenso e accettazione.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={testoRecessoB2c}
            onChange={(event) => setTestoRecessoB2c(event.target.value)}
            rows={5}
            disabled={isLoading || !puoModificare}
            placeholder={DEFAULT_RECESSO_B2C}
          />
          <p className="text-xs text-muted-foreground">
            Questo testo non sostituisce le condizioni contrattuali: serve come consenso operativo nel flusso firma.
          </p>
        </CardContent>
      </Card>

      <FEABannerEsVsFea dismissible={false} />

      {puoModificare ? (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button
            className="gap-2 shadow-lg"
            onClick={() => saveMutation.mutate()}
            disabled={isLoading || saveMutation.isPending || !isDirty}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Salvataggio..." : isDirty ? "Salva impostazioni" : "Impostazioni salvate"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Queste impostazioni le cambia chi ha il permesso «Integrazioni» in modifica.
        </p>
      )}
    </div>
  );
}
