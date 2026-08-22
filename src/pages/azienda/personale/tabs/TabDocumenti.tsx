/**
 * Tab "Documenti" in PersonalePage.
 *
 * Leggeva `documenti_operai`, mentre il badge scadenze della lista Profili e la
 * scheda del dipendente leggevano `hr_documenti`: due tabelle diverse nella
 * stessa pagina, per giunta con l'upload rotto (il bucket `documenti-operai`
 * non è mai esistito, quindi ogni caricamento falliva). Ora la fonte è una
 * sola, `hr_documenti`: la stessa dei badge, della scheda profilo, degli avvisi
 * di scadenza e di quello che l'operaio vede sul telefono.
 *
 * Sezione 1: scadenze di tutta l'azienda.
 * Sezione 2: documenti della singola persona (stesso editor della scheda).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useHrScadenzeAzienda } from "@/hooks/useHrDocumenti";
import { STATO_BADGE, categoriaLabel } from "@/types/hrDocumenti";
import { FileText, AlertTriangle, User, CheckCircle2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { HrDocumentiSection } from "@/components/hr/HrDocumentiSection";
import { PushConsentBanner } from "@/components/hr/PushConsentBanner";
import { Skeleton } from "@/components/ui/skeleton";

interface ProfiloOption {
  id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
  reparto: string | null;
}

function fmt(d: string): string {
  const [y, m, g] = d.split("-");
  return `${g}/${m}/${y}`;
}

export function TabDocumenti() {
  const companyId = useEffectiveCompanyId();
  const [selectedProfilo, setSelectedProfilo] = useState<string>("");
  const [pushBannerDismissed, setPushBannerDismissed] = useState(false);

  // Niente più filtro `user_id IS NOT NULL`: i documenti stanno sul profilo HR,
  // quindi anche chi non ha (ancora) un accesso alla piattaforma è gestibile.
  const { data: profili = [], isLoading: loadingProfili } = useQuery<ProfiloOption[]>({
    queryKey: ["hr-profili-documenti-list", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_profili")
        .select("id, nome, cognome, mansione, reparto")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("cognome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProfiloOption[];
    },
    enabled: !!companyId,
  });

  const { data: scadenze = [], isLoading: loadingScadenze } = useHrScadenzeAzienda();

  const daVedere = useMemo(
    () => scadenze.filter((s) => s.stato === "scaduto" || s.stato === "in_scadenza"),
    [scadenze],
  );
  const scaduti = daVedere.filter((s) => s.stato === "scaduto").length;
  const inScadenza = daVedere.filter((s) => s.stato === "in_scadenza").length;

  return (
    <div className="space-y-5">
      {!pushBannerDismissed && (
        <PushConsentBanner onDismiss={() => setPushBannerDismissed(true)} />
      )}

      <Tabs defaultValue="scadenze">
        <TabsList className="h-auto gap-1 p-1">
          <TabsTrigger value="scadenze" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Scadenze globali
          </TabsTrigger>
          <TabsTrigger value="per-persona" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Per persona
          </TabsTrigger>
        </TabsList>

        {/* ── Scadenze di tutta l'azienda ───────────────────────────────────── */}
        <TabsContent value="scadenze" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-semibold text-red-600">{scaduti}</p>
                <p className="text-xs text-muted-foreground">Scaduti</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-semibold text-amber-600">{inScadenza}</p>
                <p className="text-xs text-muted-foreground">In scadenza</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-semibold">{scadenze.length}</p>
                <p className="text-xs text-muted-foreground">Documenti con scadenza</p>
              </CardContent>
            </Card>
          </div>

          {loadingScadenze ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : daVedere.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
              <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500/60" />
              <p className="text-sm font-medium">Nessuna scadenza da gestire</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {scadenze.length === 0
                  ? "Non ci sono ancora documenti con una data di scadenza."
                  : `Tutti i ${scadenze.length} documenti con scadenza sono in regola.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daVedere.map((s) => {
                    const badge = STATO_BADGE[s.stato];
                    return (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedProfilo(s.hr_profilo_id)}
                      >
                        <TableCell className="text-sm font-medium">
                          {s.persona}
                          {s.mansione && (
                            <span className="block text-xs font-normal text-muted-foreground">{s.mansione}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.titolo || categoriaLabel(s.categoria)}
                          {s.titolo && (
                            <span className="block text-xs text-muted-foreground">{categoriaLabel(s.categoria)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{fmt(s.data_scadenza)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badge.cls}>{badge.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Documenti della singola persona ───────────────────────────────── */}
        <TabsContent value="per-persona" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              Persona
            </div>
            {loadingProfili ? (
              <Skeleton className="h-9 w-64 rounded-md" />
            ) : (
              <Select value={selectedProfilo} onValueChange={setSelectedProfilo}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Seleziona persona…" />
                </SelectTrigger>
                <SelectContent>
                  {profili.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.nome, p.cognome].filter(Boolean).join(" ") || p.id.slice(0, 8)}
                      {p.mansione ? ` · ${p.mansione}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedProfilo && companyId ? (
            <HrDocumentiSection profiloId={selectedProfilo} companyId={companyId} />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
              <User className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                Seleziona una persona per gestire i suoi documenti
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Contratto, visita medica, corsi sicurezza, patente, permesso di soggiorno e altro
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
