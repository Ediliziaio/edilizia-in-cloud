// ============================================================================
// PlatformEmailSignaturePanel — Firma di piattaforma (super_admin)
// ============================================================================
// Modifica i default globali di EiC per le email transazionali:
//   - Nome mittente "From"
//   - Footer copyright/disclaimer
//   - Email di supporto
//   - Firma HTML + versione testo
//
// Questi valori entrano come fallback quando `company_email_preferences` è
// vuoto. Si salvano come chiavi in `platform_settings`.
// ============================================================================

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Loader2, Info, CheckCircle2, Code2, Eye } from "lucide-react";
import {
  usePlatformEmailSignature,
  useUpsertPlatformEmailSignature,
  type PlatformEmailSignature,
} from "@/hooks/useEmailTemplates";

const EMPTY: PlatformEmailSignature = {
  from_name: "",
  footer_text: "",
  support_mail: "",
  signature_text: "",
  signature_html: "",
};

export function PlatformEmailSignaturePanel() {
  const query = usePlatformEmailSignature();
  const upsert = useUpsertPlatformEmailSignature();

  const [form, setForm] = useState<PlatformEmailSignature>(EMPTY);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.data) {
      setForm(query.data);
      setDirty(false);
    }
  }, [query.data]);

  const update = <K extends keyof PlatformEmailSignature>(
    key: K,
    value: PlatformEmailSignature[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    if (!form.from_name.trim()) return;
    upsert.mutate(form, {
      onSuccess: () => setDirty(false),
    });
  };

  if (query.isLoading) {
    return <Skeleton className="h-[500px]" />;
  }

  if (query.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Errore caricamento firma: {(query.error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Questi valori sono il <strong>fallback</strong> globale della
          piattaforma: se un'azienda non ha configurato il proprio branding
          email, le sue notifiche useranno la firma qui sotto. Le aziende che
          hanno già un footer/logo personalizzato non sono influenzate.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Firma predefinita</CardTitle>
          <CardDescription>
            Modifica nome mittente, footer e firma HTML usati quando un cliente
            non ha override.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="from_name">Nome mittente (From) *</Label>
              <Input
                id="from_name"
                value={form.from_name}
                onChange={(e) => update("from_name", e.target.value)}
                placeholder="Edilizia in Cloud"
              />
              <p className="text-xs text-muted-foreground">
                Visualizzato come mittente nell'inbox dei destinatari.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="support_mail">Email di supporto</Label>
              <Input
                id="support_mail"
                type="email"
                value={form.support_mail}
                onChange={(e) => update("support_mail", e.target.value)}
                placeholder="supporto@ediliziaincloud.it"
              />
              <p className="text-xs text-muted-foreground">
                Indirizzo usato come Reply-To per le email generiche di sistema.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="footer_text">Testo footer</Label>
            <Input
              id="footer_text"
              value={form.footer_text}
              onChange={(e) => update("footer_text", e.target.value)}
              placeholder="© Edilizia in Cloud — Tutti i diritti riservati."
            />
            <p className="text-xs text-muted-foreground">
              Stringa breve in fondo a ogni email (copyright o disclaimer legale).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Firma email</Label>
            <Tabs defaultValue="html" className="mt-1">
              <TabsList>
                <TabsTrigger value="html" className="gap-2">
                  <Code2 className="h-4 w-4" />
                  HTML
                </TabsTrigger>
                <TabsTrigger value="text" className="gap-2">
                  <Code2 className="h-4 w-4" />
                  Testo
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2">
                  <Eye className="h-4 w-4" />
                  Anteprima
                </TabsTrigger>
              </TabsList>
              <TabsContent value="html">
                <Textarea
                  value={form.signature_html}
                  onChange={(e) => update("signature_html", e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                  spellCheck={false}
                  placeholder='<p>Il team di <strong>Edilizia in Cloud</strong></p>'
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Snippet HTML usato in chiusura alle email. Può contenere link,
                  logo testuali, claim. Evita immagini embedded troppo grandi.
                </p>
              </TabsContent>
              <TabsContent value="text">
                <Textarea
                  value={form.signature_text}
                  onChange={(e) => update("signature_text", e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                  placeholder={"Il team di Edilizia in Cloud\nhttps://ediliziaincloud.it"}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Versione plain text per client senza supporto HTML.
                </p>
              </TabsContent>
              <TabsContent value="preview">
                <div className="rounded-md border bg-white p-4 min-h-[140px]">
                  {form.signature_html ? (
                    <iframe
                      srcDoc={`<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;margin:0;padding:8px;">${form.signature_html}</body></html>`}
                      title="Anteprima firma"
                      className="w-full h-[120px] border-0"
                      sandbox=""
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nessuna firma configurata.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              onClick={handleSave}
              disabled={
                upsert.isPending ||
                !dirty ||
                !form.from_name.trim()
              }
            >
              {upsert.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salva firma
            </Button>

            {dirty ? (
              <span className="text-xs text-muted-foreground ml-auto">
                Modifiche non salvate
              </span>
            ) : (
              <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Salvato
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
