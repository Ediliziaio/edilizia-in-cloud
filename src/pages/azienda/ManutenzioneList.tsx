import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings, AlertCircle, CheckCircle2, TrendingUp, Plus, Calendar,
  User, Zap, Sun, Wind, Bolt, Home, Droplets
} from "lucide-react";
import { format, addDays, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { NuovoImpiantoWizard } from "@/components/manutenzione/NuovoImpiantoWizard";

const TIPO_ICONE: Record<string, React.ElementType> = {
  caldaia: Zap,
  fotovoltaico: Sun,
  climatizzatore: Wind,
  impianto_elettrico: Bolt,
  infissi: Home,
  idraulico: Droplets,
};

function GaranziaScadenzaBadge({ date }: { date: string | null }) {
  if (!date) return null;
  const days = differenceInDays(new Date(date), new Date());
  if (days < 0) return <Badge className="text-xs bg-red-100 text-red-800">Garanzia scaduta</Badge>;
  if (days < 90) return <Badge className="text-xs bg-yellow-100 text-yellow-800">Garanzia: {days}gg</Badge>;
  return <Badge className="text-xs bg-green-100 text-green-800">Garanzia ok</Badge>;
}

export default function ManutenzioneList() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: impianti = [], isLoading: loadingImpianti } = useQuery({
    queryKey: ["impianti", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("impianti_cliente")
        .select("*, customer:profiles!impianti_cliente_customer_id_fkey(full_name)")
        .eq("company_id", effectiveCompany.id)
        .eq("attivo", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const { data: contratti = [], isLoading: loadingContratti } = useQuery({
    queryKey: ["contratti-manutenzione", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("contratti_manutenzione")
        .select("*, impianto:impianti_cliente(tipo_impianto, marca, modello), customer:profiles!contratti_manutenzione_customer_id_fkey(full_name)")
        .eq("company_id", effectiveCompany.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const { data: pianiInScadenza = [], isLoading: loadingPiani } = useQuery({
    queryKey: ["piani-scadenza", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const scadenza14 = addDays(new Date(), 14).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("piani_manutenzione")
        .select("*, contratto:contratti_manutenzione(nome_contratto, customer_id, customer:profiles!contratti_manutenzione_customer_id_fkey(full_name)), tecnico:profiles!piani_manutenzione_tecnico_preferito_fkey(full_name)")
        .eq("company_id", effectiveCompany.id)
        .eq("attivo", true)
        .lte("prossima_scadenza", scadenza14)
        .order("prossima_scadenza", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const pianificaMutation = useMutation({
    mutationFn: async (piano: { id: string; titolo: string; contratto: { customer_id: string; nome_contratto: string } | null; tecnico_preferito: string | null; frequenza_tipo: string; frequenza_giorni: number | null }) => {
      // Calcola prossima scadenza in base alla frequenza
      const oggi = new Date();
      const FREQ_GIORNI: Record<string, number> = {
        mensile: 30, trimestrale: 90, semestrale: 180, annuale: 365
      };
      const giorniFreq = piano.frequenza_giorni ?? FREQ_GIORNI[piano.frequenza_tipo] ?? 365;
      const prossima = addDays(oggi, giorniFreq).toISOString().split("T")[0];

      // Crea ticket intervento
      const customerId = piano.contratto?.customer_id;
      if (!customerId || !effectiveCompany?.id) throw new Error("Dati mancanti");

      const { error: ticketErr } = await supabase.from("tickets").insert({
        company_id: effectiveCompany.id,
        customer_id: customerId,
        subject: `Manutenzione programmata: ${piano.titolo}`,
        tipo: "intervento",
        status: "aperto",
        priority: "normale",
        assigned_to: piano.tecnico_preferito || null,
      });
      if (ticketErr) throw ticketErr;

      // Aggiorna prossima_scadenza e ultima_esecuzione
      const { error: pianoErr } = await supabase
        .from("piani_manutenzione")
        .update({ prossima_scadenza: prossima, ultima_esecuzione: oggi.toISOString().split("T")[0] })
        .eq("id", piano.id);
      if (pianoErr) throw pianoErr;
    },
    onSuccess: () => {
      toast.success("Intervento pianificato e ticket creato");
      queryClient.invalidateQueries({ queryKey: ["piani-scadenza", effectiveCompany?.id] });
    },
    onError: () => toast.error("Errore nella pianificazione"),
  });

  const mrr = contratti
    .filter((c) => c.stato === "attivo")
    .reduce((sum: number, c) => {
      const mensile = c.tipo_fatturazione === "mensile" ? c.importo_canone
        : c.tipo_fatturazione === "trimestrale" ? c.importo_canone / 3
        : c.tipo_fatturazione === "semestrale" ? c.importo_canone / 6
        : c.importo_canone / 12;
      return sum + mensile;
    }, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="h-6 w-6 text-blue-600" />
            Manutenzione Programmata
          </h1>
          <p className="text-sm text-gray-500 mt-1">Impianti, contratti e piani manutenzione clienti</p>
        </div>
        <Button onClick={() => setWizardOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuovo Impianto
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500 flex items-center gap-1"><Settings className="h-4 w-4 text-blue-500" />Impianti</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{impianti.length}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500 flex items-center gap-1"><AlertCircle className="h-4 w-4 text-orange-500" />In scadenza</div>
          <div className="text-2xl font-bold text-orange-600 mt-1">{pianiInScadenza.length}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500 flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-green-500" />Contratti attivi</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{contratti.filter((c) => c.stato === "attivo").length}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500 flex items-center gap-1"><TrendingUp className="h-4 w-4 text-purple-500" />MRR</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">€{mrr.toFixed(0)}</div>
        </div>
      </div>

      <Tabs defaultValue="scadenza">
        <TabsList>
          <TabsTrigger value="scadenza">
            In Scadenza {pianiInScadenza.length > 0 && <span className="ml-1 text-xs bg-orange-100 text-orange-700 rounded-full px-1.5">{pianiInScadenza.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="impianti">Impianti ({impianti.length})</TabsTrigger>
          <TabsTrigger value="contratti">Contratti ({contratti.length})</TabsTrigger>
        </TabsList>

        {/* Tab: In Scadenza */}
        <TabsContent value="scadenza" className="mt-4 space-y-3">
          {loadingPiani ? (
            <div className="space-y-3">{[1,2,3].map((n) => <Skeleton key={n} className="h-16 rounded-lg" />)}</div>
          ) : pianiInScadenza.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CheckCircle2 className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p>Nessuna manutenzione in scadenza nei prossimi 14 giorni</p>
            </div>
          ) : pianiInScadenza.map((piano: any) => {
            const days = piano.prossima_scadenza ? differenceInDays(new Date(piano.prossima_scadenza), new Date()) : null;
            return (
              <div key={piano.id} className="bg-white rounded-lg border p-4 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{piano.titolo}</span>
                    {days !== null && (
                      <Badge className={days < 0 ? "bg-red-100 text-red-800 text-xs" : days <= 7 ? "bg-orange-100 text-orange-800 text-xs" : "bg-yellow-100 text-yellow-800 text-xs"}>
                        {days < 0 ? `Scaduto ${Math.abs(days)}gg fa` : days === 0 ? "Scade oggi" : `Scade tra ${days}gg`}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-1 flex gap-3 flex-wrap">
                    {(piano.contratto as any)?.customer?.full_name && (
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{(piano.contratto as any).customer.full_name}</span>
                    )}
                    {piano.prossima_scadenza && (
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(piano.prossima_scadenza), "dd MMM yyyy", { locale: it })}</span>
                    )}
                    {(piano.tecnico as any)?.full_name && (
                      <span className="text-blue-600">{(piano.tecnico as any).full_name}</span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pianificaMutation.isPending}
                  onClick={() => pianificaMutation.mutate(piano)}
                >
                  Pianifica
                </Button>
              </div>
            );
          })}
        </TabsContent>

        {/* Tab: Impianti */}
        <TabsContent value="impianti" className="mt-4 space-y-3">
          {loadingImpianti ? (
            <div className="space-y-3">{[1,2,3].map((n) => <Skeleton key={n} className="h-16 rounded-lg" />)}</div>
          ) : impianti.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Settings className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p>Nessun impianto registrato</p>
              <Button className="mt-4 gap-2" size="sm" onClick={() => setWizardOpen(true)}>
                <Plus className="h-4 w-4" /> Aggiungi Impianto
              </Button>
            </div>
          ) : impianti.map((impianto: any) => {
            const ImpiantoIcon = TIPO_ICONE[impianto.tipo_impianto] ?? Settings;
            return (
              <Link key={impianto.id} to={`/azienda/manutenzione/impianto/${impianto.id}`}
                className="block bg-white rounded-lg border p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <ImpiantoIcon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold capitalize">{impianto.tipo_impianto.replace('_', ' ')}</span>
                        {impianto.marca && <span className="text-gray-500 text-sm">{impianto.marca} {impianto.modello}</span>}
                      </div>
                      <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {impianto.customer?.full_name ?? "—"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <GaranziaScadenzaBadge date={impianto.garanzia_scadenza} />
                    {impianto.data_installazione && (
                      <div className="text-xs text-gray-400">
                        Installato: {format(new Date(impianto.data_installazione), "dd/MM/yyyy")}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </TabsContent>

        {/* Tab: Contratti */}
        <TabsContent value="contratti" className="mt-4 space-y-3">
          {loadingContratti ? (
            <div className="space-y-3">{[1,2].map((n) => <Skeleton key={n} className="h-16 rounded-lg" />)}</div>
          ) : contratti.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <TrendingUp className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p>Nessun contratto attivo</p>
            </div>
          ) : contratti.map((contratto: any) => (
            <div key={contratto.id} className="bg-white rounded-lg border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{contratto.nome_contratto}</span>
                    <Badge className={contratto.stato === "attivo" ? "bg-green-100 text-green-800 text-xs" : contratto.stato === "sospeso" ? "bg-yellow-100 text-yellow-800 text-xs" : "bg-gray-100 text-gray-600 text-xs"}>
                      {contratto.stato}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {contratto.customer?.full_name} · {contratto.impianto?.tipo_impianto?.replace('_', ' ')} {contratto.impianto?.marca}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-purple-700">€{Number(contratto.importo_canone).toFixed(2)}</div>
                  <div className="text-xs text-gray-400">{contratto.tipo_fatturazione}</div>
                </div>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <NuovoImpiantoWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        companyId={effectiveCompany?.id ?? ""}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["impianti", effectiveCompany?.id] });
          queryClient.invalidateQueries({ queryKey: ["contratti-manutenzione", effectiveCompany?.id] });
        }}
      />
    </div>
  );
}
