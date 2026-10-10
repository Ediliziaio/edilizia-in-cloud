import { useState } from "react";
import { getTrackingSnippet } from "@/constants/trackingSnippet";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Copy, Check, Code } from "lucide-react";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/lib/formBuilder";

// I dati che il codice raccoglie: i cinque «utm» in parole di tutti i giorni; i codici dei clic delle piattaforme pubblicitarie
// si mettono da soli e stanno in una riga.
const UTM_PARAMS = [
  { param: "utm_source", desc: "Sorgente: da dove arriva chi visita", example: "google, facebook, newsletter" },
  { param: "utm_medium", desc: "Mezzo: il tipo di canale", example: "cpc, email, social" },
  { param: "utm_campaign", desc: "Campagna", example: "spring_sale, brand" },
  { param: "utm_content", desc: "Variante dell'annuncio o del link", example: "banner_a, link_top" },
  { param: "utm_term", desc: "Parola chiave", example: "ristrutturazione casa" },
];
const CLICK_ID_PARAMS = ["gclid", "wbraid", "gbraid", "fbclid", "ttclid", "msclkid", "li_fat_id"];

const SUPPORTED_ATTRIBUTION_PARAMS = [...UTM_PARAMS.map((param) => param.param), ...CLICK_ID_PARAMS];

export function TrackingSnippetSettings() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id || "";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const [copied, setCopied] = useState(false);
  const [testUrl, setTestUrl] = useState("");

  const snippet = getTrackingSnippet(companyId, supabaseUrl);

  const copySnippet = async () => {
    try {
      await copyTextToClipboard(snippet);
      setCopied(true);
      toast.success("Codice copiato");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copia non riuscita", { description: "Seleziona il codice e copialo a mano." });
    }
  };

  const parsedParams = (() => {
    try {
      const url = new URL(testUrl);
      return Array.from(url.searchParams.entries()).filter(([k]) => SUPPORTED_ATTRIBUTION_PARAMS.includes(k));
    } catch {
      return [];
    }
  })();

  return (
    <div className="space-y-4">
      {/* L'unica cosa da fare: incollare il codice. Il resto (cosa raccoglie, la prova) sta sotto, chiuso. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Code className="h-4 w-4" /> Il codice da incollare nel sito
          </CardTitle>
          <CardDescription>
            Incolla questo codice nel sito: ogni contatto porta con sé l'annuncio o la campagna da cui è arrivato.
            Va nel tag &lt;head&gt; di ogni pagina.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="bg-muted rounded-lg p-4 pr-24 text-xs overflow-x-auto max-h-[200px] font-mono" tabIndex={0} aria-label="Codice da incollare nel sito">
              {snippet}
            </pre>
            <Button
              size="sm"
              variant="secondary"
              className="absolute top-2 right-2 gap-1 max-md:h-11"
              onClick={copySnippet}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiato" : "Copia"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <details className="group rounded-lg border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium max-md:min-h-11">
          <span>Quali dati raccoglie</span>
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">Mostra</span>
          <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Nascondi</span>
        </summary>
        <div className="space-y-2 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Quello che scrivi nei link delle tue campagne (i parametri «utm»). Aggiungili in fondo al link, per esempio
            <span className="font-mono"> ?utm_source=google&amp;utm_medium=cpc</span>.
          </p>
          {UTM_PARAMS.map((p) => (
            <div key={p.param} className="flex items-start gap-3 py-1.5 border-b last:border-0">
              <Badge variant="outline" className="font-mono text-[10px] shrink-0">{p.param}</Badge>
              <div className="min-w-0">
                <p className="text-sm">{p.desc}</p>
                <p className="text-xs text-muted-foreground">Es: {p.example}</p>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            In più il codice legge da solo i codici dei clic di Google, Facebook, TikTok, Microsoft e LinkedIn: non devi scrivere niente.
          </p>
        </div>
      </details>

      <details className="group rounded-lg border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium max-md:min-h-11">
          <span>Prova un indirizzo</span>
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">Mostra</span>
          <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Nascondi</span>
        </summary>
        <div className="space-y-3 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">Incolla un indirizzo di una tua campagna per vedere cosa riconosce il codice.</p>
          <Input
            placeholder="https://tuosito.com/?utm_source=google&utm_medium=cpc"
            aria-label="Indirizzo da provare"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            className="max-md:h-11"
          />
          {testUrl && parsedParams.length > 0 && (
            <div className="space-y-1">
              {parsedParams.map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary" className="font-mono text-[10px]">{k}</Badge>
                  <span className="text-foreground">{v}</span>
                  <Check className="h-3.5 w-3.5 text-green-600" aria-label="riconosciuto" />
                </div>
              ))}
            </div>
          )}
          {testUrl && parsedParams.length === 0 && (
            <p className="text-sm text-muted-foreground">In questo indirizzo non c'è nessun dato di campagna che il codice riconosca.</p>
          )}
        </div>
      </details>
    </div>
  );
}
