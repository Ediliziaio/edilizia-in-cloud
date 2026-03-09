import { LeadForm } from "@/hooks/useFormBuilder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  form: LeadForm;
  theme: Record<string, any>;
  settings: Record<string, any>;
  onThemeChange: (t: Record<string, any>) => void;
  onSettingsChange: (s: Record<string, any>) => void;
}

export function FormSettingsPanel({ form, theme, settings, onThemeChange, onSettingsChange }: Props) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const publicUrl = `${supabaseUrl}/functions/v1/form-render?slug=${form.slug}&company_id=${form.company_id}`;

  const iframeSnippet = `<iframe src="${publicUrl}" width="100%" height="600" frameborder="0" style="border:none;max-width:560px;margin:0 auto;display:block;"></iframe>`;
  const jsSnippet = `<div id="lf-form-${form.slug}"></div>\n<script>\n(function(){var d=document,s=d.createElement('iframe');s.src='${publicUrl}';s.style.cssText='width:100%;height:600px;border:none;max-width:560px;margin:0 auto;display:block';d.getElementById('lf-form-${form.slug}').appendChild(s);})()\n</script>`;

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiato!`);
  };

  return (
    <Tabs defaultValue="aspetto" className="h-full">
      <TabsList className="w-full grid grid-cols-3 h-8">
        <TabsTrigger value="aspetto" className="text-xs">Aspetto</TabsTrigger>
        <TabsTrigger value="impostazioni" className="text-xs">Impostazioni</TabsTrigger>
        <TabsTrigger value="condivisione" className="text-xs">Condivisione</TabsTrigger>
      </TabsList>

      <TabsContent value="aspetto" className="space-y-3 mt-3">
        <div className="space-y-1">
          <Label className="text-xs">Colore accento</Label>
          <Input
            type="color"
            value={theme.accent_color || "#2563eb"}
            onChange={(e) => onThemeChange({ ...theme, accent_color: e.target.value })}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Colore sfondo</Label>
          <Input
            type="color"
            value={theme.background_color || "#f9fafb"}
            onChange={(e) => onThemeChange({ ...theme, background_color: e.target.value })}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Testo bottone</Label>
          <Input
            value={settings.submit_label || "Invia"}
            onChange={(e) => onSettingsChange({ ...settings, submit_label: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Messaggio successo</Label>
          <Input
            value={settings.success_message || ""}
            onChange={(e) => onSettingsChange({ ...settings, success_message: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      </TabsContent>

      <TabsContent value="impostazioni" className="space-y-3 mt-3">
        <div className="space-y-1">
          <Label className="text-xs">Email notifica</Label>
          <Input
            value={settings.notification_email || ""}
            onChange={(e) => onSettingsChange({ ...settings, notification_email: e.target.value })}
            className="h-8 text-sm"
            placeholder="admin@azienda.it"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">URL redirect (dopo invio)</Label>
          <Input
            value={settings.redirectUrl || ""}
            onChange={(e) => onSettingsChange({ ...settings, redirectUrl: e.target.value })}
            className="h-8 text-sm"
            placeholder="https://..."
          />
        </div>
      </TabsContent>

      <TabsContent value="condivisione" className="space-y-3 mt-3">
        <div className="space-y-1">
          <Label className="text-xs">URL pubblica</Label>
          <div className="flex gap-1">
            <Input value={publicUrl} readOnly className="h-8 text-xs font-mono" />
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyText(publicUrl, "URL")}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Embed iframe</Label>
          <div className="flex gap-1">
            <Input value={iframeSnippet} readOnly className="h-8 text-xs font-mono" />
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyText(iframeSnippet, "Snippet iframe")}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Embed JS</Label>
          <div className="flex gap-1">
            <Input value={jsSnippet} readOnly className="h-8 text-xs font-mono" />
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyText(jsSnippet, "Snippet JS")}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
