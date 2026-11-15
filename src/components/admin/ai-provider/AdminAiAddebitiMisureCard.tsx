/**
 * AdminAiAddebitiMisureCard — le misure dell'AI per il titolare (15/11/2026).
 *
 * Legge `ai_metriche_piattaforma(giorni)` (solo super admin): le due strade di
 * addebito insieme (router e chiamate dirette), quanto si chiude senza AI
 * (regole, dati già presenti, triage email), il costo medio, le chiamate per
 * tipo, e quanto paga la piattaforma per conto suo. Dettaglio e regole:
 * docs/ai-addebiti-censimento.md.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Gauge } from "lucide-react";

interface Totali {
  chiamate: number; addebitate: number; costo_reale_eur: number | null; addebitato_eur: number | null;
  costo_medio_eur: number | null; pct_lavori_senza_ai: number | null;
}
interface RigaCompito {
  compito: string; origine: string; chiamate: number; addebitate: number;
  costo_reale_eur: number | null; addebitato_eur: number | null; costo_medio_eur: number | null;
}
interface RigaAzienda {
  company_id: string; azienda: string | null; chiamate: number; addebitate: number;
  costo_reale_eur: number | null; addebitato_eur: number | null; costo_non_addebitato_eur: number | null;
  pct_lavori_senza_ai: number | null;
}
interface RigaFlusso { flusso: string; totali: number; senza_ai: number; pct_senza_ai: number | null; chiamate_ai: number }
interface Metriche {
  totali?: Totali; compiti?: RigaCompito[]; aziende?: RigaAzienda[]; flussi?: RigaFlusso[];
  interno?: { router_senza_azienda_usd: number; diretta_senza_azienda_usd: number; registro_interno_usd: number };
}

const eur = (n: number | null | undefined, cifre = 2) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: cifre, maximumFractionDigits: cifre }).format(Number(n ?? 0));
const usd = (n: number | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(n ?? 0));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("it-IT")}%`);

const FLUSSI: Record<string, string> = {
  email_triage: "Triage email",
  fattura_classifica: "Classificazione fatture ricevute",
};

export function AdminAiAddebitiMisureCard() {
  const [giorni, setGiorni] = useState(30);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ai_metriche_piattaforma", giorni],
    queryFn: async () => {
      const { data: r, error: e } = await supabase.rpc("ai_metriche_piattaforma", { p_giorni: giorni });
      if (e) throw e;
      return (r ?? {}) as Metriche;
    },
  });

  const t = data?.totali;
  const interno = data?.interno;
  const internoTot = Number(interno?.router_senza_azienda_usd ?? 0) + Number(interno?.diretta_senza_azienda_usd ?? 0) + Number(interno?.registro_interno_usd ?? 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> AI: addebiti e lavori senza AI</CardTitle>
            <CardDescription>
              Router e chiamate dirette insieme. Ultimi {giorni} giorni.
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {[7, 30, 90].map((g) => (
              <Button key={g} size="sm" variant={g === giorni ? "default" : "outline"} onClick={() => setGiorni(g)}>{g} gg</Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <Skeleton className="h-40" />}
        {error && <p className="text-sm text-destructive">Misure non disponibili: {(error as Error).message}</p>}
        {t && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div><div className="text-muted-foreground text-xs">Lavori chiusi senza AI</div><div className="text-xl font-semibold">{pct(t.pct_lavori_senza_ai)}</div></div>
              <div><div className="text-muted-foreground text-xs">Chiamate (addebitate)</div><div className="text-xl font-semibold">{t.chiamate.toLocaleString("it-IT")} ({t.addebitate.toLocaleString("it-IT")})</div></div>
              <div><div className="text-muted-foreground text-xs">Costo reale</div><div className="text-xl font-semibold">{eur(t.costo_reale_eur)}</div></div>
              <div><div className="text-muted-foreground text-xs">Addebitato alle aziende</div><div className="text-xl font-semibold">{eur(t.addebitato_eur)}</div></div>
              <div><div className="text-muted-foreground text-xs">Costo medio per chiamata</div><div className="text-xl font-semibold">{eur(t.costo_medio_eur, 4)}</div></div>
            </div>
            <p className="text-xs text-muted-foreground">
              A carico della piattaforma (senza azienda: Silvio dei super admin, diagnostica, KB): {usd(internoTot)}.
            </p>

            {(data?.flussi ?? []).length > 0 && (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Flusso</TableHead><TableHead className="text-right">Lavori</TableHead>
                  <TableHead className="text-right">Senza AI</TableHead><TableHead className="text-right">Chiamate AI</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(data?.flussi ?? []).map((f) => (
                    <TableRow key={f.flusso}>
                      <TableCell>{FLUSSI[f.flusso] ?? f.flusso}</TableCell>
                      <TableCell className="text-right">{f.totali.toLocaleString("it-IT")}</TableCell>
                      <TableCell className="text-right">{pct(f.pct_senza_ai)}</TableCell>
                      <TableCell className="text-right">{f.chiamate_ai.toLocaleString("it-IT")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <Table>
              <TableHeader><TableRow>
                <TableHead>Compito</TableHead><TableHead>Strada</TableHead>
                <TableHead className="text-right">Chiamate</TableHead><TableHead className="text-right">Addebitate</TableHead>
                <TableHead className="text-right">Costo</TableHead><TableHead className="text-right">Addebitato</TableHead>
                <TableHead className="text-right">Medio</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(data?.compiti ?? []).slice(0, 15).map((c) => (
                  <TableRow key={`${c.origine}-${c.compito}`}>
                    <TableCell className="font-mono text-xs">{c.compito}</TableCell>
                    <TableCell className="text-xs">{c.origine}</TableCell>
                    <TableCell className="text-right">{c.chiamate.toLocaleString("it-IT")}</TableCell>
                    <TableCell className="text-right">{c.addebitate.toLocaleString("it-IT")}</TableCell>
                    <TableCell className="text-right">{eur(c.costo_reale_eur, 4)}</TableCell>
                    <TableCell className="text-right">{eur(c.addebitato_eur, 4)}</TableCell>
                    <TableCell className="text-right">{eur(c.costo_medio_eur, 4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Table>
              <TableHeader><TableRow>
                <TableHead>Azienda</TableHead><TableHead className="text-right">Chiamate</TableHead>
                <TableHead className="text-right">Costo</TableHead><TableHead className="text-right">Addebitato</TableHead>
                <TableHead className="text-right">Non addebitato</TableHead><TableHead className="text-right">Senza AI</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(data?.aziende ?? []).slice(0, 15).map((a) => (
                  <TableRow key={a.company_id}>
                    <TableCell>{a.azienda ?? a.company_id}</TableCell>
                    <TableCell className="text-right">{a.chiamate.toLocaleString("it-IT")}</TableCell>
                    <TableCell className="text-right">{eur(a.costo_reale_eur)}</TableCell>
                    <TableCell className="text-right">{eur(a.addebitato_eur)}</TableCell>
                    <TableCell className="text-right">{eur(a.costo_non_addebitato_eur)}</TableCell>
                    <TableCell className="text-right">{pct(a.pct_lavori_senza_ai)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
