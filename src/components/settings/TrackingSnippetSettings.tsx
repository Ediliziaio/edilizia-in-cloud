import { useState } from "react";
import { getTrackingSnippet } from "@/constants/trackingSnippet";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Copy, Check, ExternalLink, Code, Zap, BarChart3 } from "lucide-react";
import { toast } from "sonner";

const UTM_PARAMS = [
  { param: "utm_source", desc: "Sorgente traffico", example: "google, facebook, newsletter" },
  { param: "utm_medium", desc: "Mezzo", example: "cpc, email, social" },
  { param: "utm_campaign", desc: "Nome campagna", example: "spring_sale, brand" },
  { param: "utm_content", desc: "Variante", example: "banner_a, link_top" },
  { param: "utm_term", desc: "Keyword", example: "ristrutturazione casa" },
  { param: "gclid", desc: "Google Click ID", example: "Automatico da Google Ads" },
  { param: "fbclid", desc: "Facebook Click ID", example: "Automatico da Meta Ads" },
];

export function TrackingSnippetSettings() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id || "";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const [copied, setCopied] = useState(false);
  const [testUrl, setTestUrl] = useState("");

  const snippet = getTrackingSnippet(companyId, supabaseUrl);

  const copySnippet = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("Snippet copiato!");
    setTimeout(() => setCopied(false), 2000);
  };

  const parsedParams = (() => {
    try {
      const url = new URL(testUrl);
      return Array.from(url.searchParams.entries()).filter(([k]) =>
        ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"].includes(k)
      );
    } catch {
      return [];
    }
  })();

  return (
    <div className="space-y-6">
      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Come funziona</CardTitle>
          <CardDescription>Il tracking UTM cattura l'origine dei visitatori sul tuo sito</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Code className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">1. Installa lo snippet</p>
                <p className="text-xs text-muted-foreground">Copia il codice e incollalo nel tag &lt;head&gt; del tuo sito</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">2. Usa link con UTM</p>
                <p className="text-xs text-muted-foreground">Aggiungi parametri UTM ai link delle tue campagne</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">3. Analizza i risultati</p>
                <p className="text-xs text-muted-foreground">Vedi le sorgenti di traffico nei report e nelle schede contatto</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Snippet */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Code className="h-4 w-4" /> Snippet di tracking
          </CardTitle>
          <CardDescription>Incolla questo codice nel tag &lt;head&gt; di ogni pagina del tuo sito</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto max-h-[200px] font-mono">
              {snippet}
            </pre>
            <Button
              size="sm"
              variant="secondary"
              className="absolute top-2 right-2 gap-1"
              onClick={copySnippet}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiato" : "Copia"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Supported params */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parametri supportati</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {UTM_PARAMS.map((p) => (
              <div key={p.param} className="flex items-start gap-3 py-1.5 border-b last:border-0">
                <Badge variant="outline" className="font-mono text-[10px] shrink-0">{p.param}</Badge>
                <div className="min-w-0">
                  <p className="text-sm">{p.desc}</p>
                  <p className="text-xs text-muted-foreground">Es: {p.example}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* URL tester */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="h-4 w-4" /> Test URL
          </CardTitle>
          <CardDescription>Incolla un URL con parametri UTM per verificare che vengano riconosciuti</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="https://tuosito.com/?utm_source=google&utm_medium=cpc"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
          />
          {testUrl && parsedParams.length > 0 && (
            <div className="space-y-1">
              {parsedParams.map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary" className="font-mono text-[10px]">{k}</Badge>
                  <span className="text-foreground">{v}</span>
                  <Check className="h-3.5 w-3.5 text-green-600" />
                </div>
              ))}
            </div>
          )}
          {testUrl && parsedParams.length === 0 && (
            <p className="text-sm text-muted-foreground">Nessun parametro UTM trovato nell'URL</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
