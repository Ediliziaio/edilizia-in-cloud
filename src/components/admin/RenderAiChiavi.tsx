import { useState } from "react";
import { CheckCircle2, KeyRound, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { leggiDiagnosiRenderAi, riassuntoRenderAi, type RigaDiagnosi } from "@/lib/render/diagnosiRenderAi";

const ICONA = { ok: CheckCircle2, attenzione: TriangleAlert, guasto: XCircle } as const;
const COLORE = { ok: "text-emerald-600", attenzione: "text-amber-600", guasto: "text-red-600" } as const;

/** «Chiavi dei render»: prova OpenAI e OpenRouter e dice a parole cosa può fermare un render. Solo super admin (lo impone la funzione). */
export function RenderAiChiavi() {
  const [righe, setRighe] = useState<RigaDiagnosi[] | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const controlla = async () => {
    setInCorso(true);
    setErrore(null);
    const { data, error } = await supabase.functions.invoke("debug-ai-providers");
    setInCorso(false);
    if (error) { setErrore("Non riesco a fare il controllo: serve l'accesso da super admin."); return; }
    const r = leggiDiagnosiRenderAi(data);
    if (!r.length) { setErrore("La prova non ha restituito risultati."); return; }
    setRighe(r);
  };

  const riassunto = righe ? riassuntoRenderAi(righe) : null;
  const IconaRiassunto = riassunto ? ICONA[riassunto.stato] : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-muted-foreground" />Chiavi dei render AI</span>
          <Button size="sm" variant="outline" onClick={controlla} disabled={inCorso}>
            {inCorso ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {righe ? "Ricontrolla" : "Controlla ora"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!righe && !errore && <p className="text-muted-foreground">Prova le chiavi di OpenAI e OpenRouter e dice cosa può fermare un render. Non genera immagini e non costa crediti ai clienti.</p>}
        {errore && <p className="text-red-600">{errore}</p>}
        {riassunto && IconaRiassunto && (
          <p className={`flex items-start gap-2 font-medium ${COLORE[riassunto.stato]}`}><IconaRiassunto className="mt-0.5 h-4 w-4 shrink-0" />{riassunto.frase}</p>
        )}
        {righe && (
          <ul className="divide-y rounded-md border">
            {righe.map((r) => {
              const I = ICONA[r.stato];
              return (
                <li key={r.chiave} className="flex items-start gap-2 px-3 py-2">
                  <I className={`mt-0.5 h-4 w-4 shrink-0 ${COLORE[r.stato]}`} />
                  <div className="min-w-0">
                    <p className="font-medium">{r.nome} <span className="text-xs font-normal text-muted-foreground">· {r.ruolo}</span></p>
                    <p className="text-xs text-muted-foreground">{r.frase}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
