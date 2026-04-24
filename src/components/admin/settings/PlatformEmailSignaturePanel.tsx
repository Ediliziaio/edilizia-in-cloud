// ============================================================================
// PlatformEmailSignaturePanel — Firma di piattaforma (super_admin)
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Code2, Eye, Info, Loader2, Mail, Save, WandSparkles } from "lucide-react";
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

const DEFAULT_SIGNATURE_HTML =
  '<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">Il team di <strong>Edilizia in Cloud</strong><br/><a href="https://ediliziaincloud.it" style="color:#1d4ed8;text-decoration:none;">ediliziaincloud.it</a></p>';

const DEFAULT_SIGNATURE_TEXT = "Il team di Edilizia in Cloud\nhttps://ediliziaincloud.it";

export function PlatformEmailSignaturePanel() {
  const query = usePlatformEmailSignature();
  const upsert = useUpsertPlatformEmailSignature();

  const [form, setForm] = useState<PlatformEmailSignature>(EMPTY);
  const [dirty, setDirty] = useState(false);

  // FIX: evita di sovrascrivere modifiche in corso dell'utente se un refetch
  // silenzioso del server completa DOPO che l'utente ha iniziato a digitare.
  // Prima lo useEffect su query.data ricaricava il form anche se dirty=true.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (query.data && !dirty) {
      setForm(query.data);
    }
  }, [query.data, dirty]);

  const update = <K extends keyof PlatformEmailSignature>(
    key: K,
    value: PlatformEmailSignature[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const applyPreset = () => {
    setForm((prev) => ({
      ...prev,
      from_name: prev.from_name.trim() || "Edilizia in Cloud",
      support_mail: prev.support_mail.trim() || "supporto@ediliziaincloud.it",
      footer_text: prev.footer_text.trim() || "Edilizia in Cloud - Tutti i diritti riservati.",
      signature_html: DEFAULT_SIGNATURE_HTML,
      signature_text: DEFAULT_SIGNATURE_TEXT,
    }));
    setDirty(true);
  };

  const handleSave = () => {
    if (!form.from_name.trim()) return;
    upsert.mutate(form, {
      onSuccess: () => setDirty(false),
    });
  };

  const previewHtml = useMemo(() => {
    const signature = form.signature_html.trim() || DEFAULT_SIGNATURE_HTML;
    const footer = form.footer_text.trim();
    return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px;">
        <tr><td align="center">
          <table width="520" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr><td style="padding:28px;">
              <p style="margin:0 0 18px;color:#111827;font-size:16px;line-height:1.6;">Ciao Marco,</p>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">Questa e una preview della firma predefinita usata dalle email senza branding aziendale.</p>
              <div style="border-top:1px solid #e5e7eb;padding-top:18px;">${signature}</div>
            </td></tr>
            ${footer ? `<tr><td style="padding:14px 28px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.5;">${footer}</td></tr>` : ""}
          </table>
        </td></tr>
      </table>
    </body></html>`;
  }, [form.footer_text, form.signature_html]);

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
          Fallback globale usato quando l'azienda non ha un proprio branding email.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">Firma predefinita</CardTitle>
                <CardDescription>Mittente, supporto, footer e chiusura email.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={applyPreset}>
                <WandSparkles className="mr-2 h-4 w-4" />
                Usa preset
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="from_name">Nome mittente *</Label>
                <Input
                  id="from_name"
                  value={form.from_name}
                  onChange={(e) => update("from_name", e.target.value)}
                  placeholder="Edilizia in Cloud"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="support_mail">Email supporto</Label>
                <Input
                  id="support_mail"
                  type="email"
                  value={form.support_mail}
                  onChange={(e) => update("support_mail", e.target.value)}
                  placeholder="supporto@ediliziaincloud.it"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="footer_text">Footer</Label>
              <Input
                id="footer_text"
                value={form.footer_text}
                onChange={(e) => update("footer_text", e.target.value)}
                placeholder="Edilizia in Cloud - Tutti i diritti riservati."
              />
            </div>

            <Tabs defaultValue="html" className="space-y-3">
              <TabsList>
                <TabsTrigger value="html" className="gap-2">
                  <Code2 className="h-4 w-4" />
                  HTML
                </TabsTrigger>
                <TabsTrigger value="text" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Testo
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2 lg:hidden">
                  <Eye className="h-4 w-4" />
                  Anteprima
                </TabsTrigger>
              </TabsList>
              <TabsContent value="html">
                <Textarea
                  value={form.signature_html}
                  onChange={(e) => update("signature_html", e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                  spellCheck={false}
                  placeholder={DEFAULT_SIGNATURE_HTML}
                />
              </TabsContent>
              <TabsContent value="text">
                <Textarea
                  value={form.signature_text}
                  onChange={(e) => update("signature_text", e.target.value)}
                  rows={7}
                  className="font-mono text-sm"
                  placeholder={DEFAULT_SIGNATURE_TEXT}
                />
              </TabsContent>
              <TabsContent value="preview" className="lg:hidden">
                <div className="overflow-hidden rounded-md border bg-white">
                  <iframe
                    srcDoc={previewHtml}
                    title="Anteprima firma"
                    className="h-[360px] w-full border-0"
                    sandbox=""
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex items-center gap-2 border-t pt-2">
              <Button
                onClick={handleSave}
                disabled={upsert.isPending || !dirty || !form.from_name.trim()}
              >
                {upsert.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salva firma
              </Button>

              {dirty ? (
                <span className="ml-auto text-xs text-muted-foreground">
                  Modifiche non salvate
                </span>
              ) : (
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  Salvato
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="hidden h-fit lg:block">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4" />
              Anteprima
            </CardTitle>
            <CardDescription>{form.from_name || "Edilizia in Cloud"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border bg-white">
              <iframe
                srcDoc={previewHtml}
                title="Anteprima firma"
                className="h-[460px] w-full border-0"
                sandbox=""
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
