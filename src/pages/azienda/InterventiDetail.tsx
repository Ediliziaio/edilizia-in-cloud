import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, MapPin, User, Calendar, Clock, FileText,
  ExternalLink, Wrench, Plus, AlertCircle, CheckCircle2, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { RapportinoForm } from "@/components/interventi/RapportinoForm";
import type { Intervento, RapportinoIntervento } from "@/types/interventi";

const STATO_CONFIG: Record<string, { label: string; color: string }> = {
  aperto: { label: "Aperto", color: "bg-blue-100 text-blue-800" },
  in_lavorazione: { label: "In lavorazione", color: "bg-yellow-100 text-yellow-800" },
  in_attesa: { label: "In attesa", color: "bg-orange-100 text-orange-800" },
  risolto: { label: "Risolto", color: "bg-green-100 text-green-800" },
  chiuso: { label: "Chiuso", color: "bg-gray-100 text-gray-600" },
};

export default function InterventiDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [rapportinoOpen, setRapportinoOpen] = useState(false);

  const { data: intervento, isLoading } = useQuery({
    queryKey: ["intervento", id],
    queryFn: async () => {
      if (!id) throw new Error("ID mancante");
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id, company_id, customer_id, order_id, subject, status, priority,
          tipo, indirizzo_intervento, data_intervento_prevista,
          data_intervento_effettiva, durata_ore, assigned_to, note_tecnico, created_at,
          internal_notes,
          assigned_profile:profiles!tickets_assigned_to_fkey(id, first_name, last_name),
          customer:profiles!tickets_customer_id_fkey(id, first_name, last_name, email, phone)
        `)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Intervento & {
        internal_notes: string | null;
        customer: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
        assigned_profile: { id: string; first_name: string | null; last_name: string | null } | null;
      };
    },
    enabled: !!id,
  });

  const { data: rapportini = [] } = useQuery({
    queryKey: ["rapportini", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rapportini_intervento")
        .select("*")
        .eq("ticket_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RapportinoIntervento[];
    },
    enabled: !!id,
  });

  const { data: tecnici = [] } = useQuery({
    queryKey: ["tecnici", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, role")
        .eq("company_id", effectiveCompany.id)
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Query tariffa oraria dalla configurazione aziendale
  // Cerca tipo='posa' unita='h' (manodopera oraria)
  const { data: tariffaOraria } = useQuery({
    queryKey: ['tariffa-oraria-interventi', effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return null;
      const { data } = await (supabase as any)
        .from('tariffe_aziendali')
        .select('prezzo_vendita, nome')
        .eq('company_id', effectiveCompany.id)
        .eq('tipo', 'posa')
        .eq('unita', 'h')
        .eq('attiva', true)
        .order('prezzo_vendita', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.prezzo_vendita as number | null) ?? null;
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  const assegnaTecnicoMutation = useMutation({
    mutationFn: async (tecnicoId: string) => {
      const { error } = await supabase
        .from("tickets")
        .update({ assigned_to: tecnicoId || null })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tecnico assegnato");
      queryClient.invalidateQueries({ queryKey: ["intervento", id] });
    },
    onError: () => toast.error("Errore nell'assegnazione del tecnico"),
  });

  const chiudiInterventoMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("tickets")
        .update({ status: "risolto", data_intervento_effettiva: new Date().toISOString() })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Intervento chiuso");
      queryClient.invalidateQueries({ queryKey: ["intervento", id] });
    },
    onError: () => toast.error("Errore nella chiusura dell'intervento"),
  });

  const generaCostoMutation = useMutation({
    mutationFn: async (rapportino: RapportinoIntervento) => {
      if (!effectiveCompany?.id) throw new Error("Company mancante");
      // Tariffa da Impostazioni > Tariffe (tipo posa, unita h), fallback 50
      const tariffaH = tariffaOraria ?? 50;
      const totale = Math.round((rapportino.ore_lavoro ?? 0) * tariffaH * 100) / 100;
      const { error } = await supabase.from("company_costs").insert({
        company_id: effectiveCompany.id,
        name: `Intervento: ${intervento?.subject ?? "Senza titolo"}`,
        amount: totale,
        category: "Interventi",
        cost_type: "variabile",
        due_date: new Date().toISOString().split("T")[0],
        is_paid: false,
        recurrence: "nessuna",
        recurrence_auto: false,
        order_id: intervento?.order_id ?? null,
        notes: `Rapportino #${rapportino.numero} · ${rapportino.ore_lavoro}h di lavoro`,
      });
      if (error) throw error;
      // Aggiorna stato rapportino a 'fatturato'
      await supabase
        .from("rapportini_intervento")
        .update({ stato: "fatturato" })
        .eq("id", rapportino.id);
    },
    onSuccess: () => {
      toast.success(
        `Costo registrato: ${rapportino.ore_lavoro}h × €${tariffaOraria ?? 50}/h = €${totale.toFixed(2)}`
      );
      queryClient.invalidateQueries({ queryKey: ["rapportini", id] });
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["rapportini-firmati-count"] });
    },
    onError: (e: Error) => toast.error(e.message || "Errore nella generazione del costo"),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!intervento) {
    return (
      <div className="p-6 text-center py-20">
        <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Intervento non trovato</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/azienda/interventi")}>
          Torna agli interventi
        </Button>
      </div>
    );
  }

  const mapUrl = intervento.indirizzo_intervento
    ? `https://maps.google.com/?q=${encodeURIComponent(intervento.indirizzo_intervento)}`
    : null;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/interventi")} className="mt-1 -ml-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{intervento.subject}</h1>
            <Badge className={intervento.tipo === "emergenza" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}>
              {intervento.tipo === "emergenza" ? "Emergenza" : "Intervento"}
            </Badge>
            {(() => {
              const s = STATO_CONFIG[intervento.status] ?? { label: intervento.status, color: "bg-gray-100 text-gray-600" };
              return <Badge className={s.color}>{s.label}</Badge>;
            })()}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Creato il {format(new Date(intervento.created_at), "dd MMMM yyyy", { locale: it })}
          </p>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Info & Tecnico</TabsTrigger>
          <TabsTrigger value="rapportini">
            Rapportini {rapportini.length > 0 && <span className="ml-1 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5">{rapportini.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4 mt-4">
          {/* Cliente + Indirizzo */}
          <div className="bg-white rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold text-gray-800">Dettagli Intervento</h3>
            {intervento.customer && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-gray-400" />
                <span className="text-gray-700">{[intervento.customer?.first_name, intervento.customer?.last_name].filter(Boolean).join(" ") || "—"}</span>
              </div>
            )}
            {intervento.indirizzo_intervento && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-gray-400" />
                <span className="text-gray-700">{intervento.indirizzo_intervento}</span>
                {mapUrl && (
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-0.5 text-xs">
                    <ExternalLink className="h-3 w-3" /> Maps
                  </a>
                )}
              </div>
            )}
            {intervento.data_intervento_prevista && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="text-gray-700">
                  Previsto: {format(new Date(intervento.data_intervento_prevista), "dd MMM yyyy HH:mm", { locale: it })}
                </span>
              </div>
            )}
            {intervento.durata_ore && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-gray-700">Durata stimata: {intervento.durata_ore}h</span>
              </div>
            )}
            {intervento.note_tecnico && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded p-2 mt-2">
                <FileText className="h-3 w-3 inline mr-1" />
                {intervento.note_tecnico}
              </div>
            )}
          </div>

          {/* Assegnazione tecnico */}
          <div className="bg-white rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold text-gray-800">Tecnico Assegnato</h3>
            <Select
              value={intervento.assigned_to ?? ""}
              onValueChange={(v) => assegnaTecnicoMutation.mutate(v)}
              disabled={assegnaTecnicoMutation.isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona tecnico..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nessuno</SelectItem>
                {tecnici.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{[t.first_name, t.last_name].filter(Boolean).join(" ") || t.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Azioni */}
          <div className="flex gap-3 flex-wrap">
            {intervento.status !== "risolto" && intervento.status !== "chiuso" && (
              <Button
                variant="outline"
                className="gap-2 text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => chiudiInterventoMutation.mutate()}
                disabled={chiudiInterventoMutation.isPending}
              >
                <CheckCircle2 className="h-4 w-4" />
                Chiudi Intervento
              </Button>
            )}
            {intervento.order_id && (
              <Button variant="outline" className="gap-2" asChild>
                <Link to={`/azienda/ordini/${intervento.order_id}`}>
                  <ExternalLink className="h-4 w-4" />
                  Vai all'Ordine
                </Link>
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="rapportini" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Rapportini Intervento</h3>
            <Button onClick={() => setRapportinoOpen(true)} className="gap-2" size="sm">
              <Plus className="h-4 w-4" />
              Crea Rapportino
            </Button>
          </div>

          {/* Info tariffa applicata */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded px-3 py-2">
            <Clock className="h-3 w-3 text-blue-400 shrink-0" />
            {tariffaOraria != null ? (
              <span>
                Tariffa applicata:{' '}
                <strong className="text-blue-700">€{tariffaOraria}/h</strong>
                {' '}(Impostazioni &gt; Tariffe)
              </span>
            ) : (
              <span>
                Tariffa non configurata — verranno usati{' '}
                <strong>€50/h</strong> di default.{' '}
                <Link
                  to="/azienda/impostazioni/tariffe"
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  Configura ora
                </Link>
              </span>
            )}
          </div>

          {rapportini.length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="font-medium text-gray-700">Nessun rapportino</p>
              <p className="text-sm mt-1">Crea il primo rapportino per questo intervento</p>
              <Button className="mt-4 gap-2" size="sm" onClick={() => setRapportinoOpen(true)}>
                <Plus className="h-4 w-4" />
                Crea Rapportino
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {rapportini.map((r) => (
                <div key={r.id} className="bg-white rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Rapportino #{r.numero}</span>
                        <Badge className={r.stato === "firmato" ? "bg-green-100 text-green-800" : r.stato === "fatturato" ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-600"}>
                          {r.stato === "bozza" ? "Bozza" : r.stato === "firmato" ? "Firmato" : "Fatturato"}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{r.descrizione}</p>
                      <div className="flex gap-4 mt-2 text-xs text-gray-400">
                        <span>Ore lavoro: {r.ore_lavoro}h</span>
                        {r.firmato_da && <span>Firmato da: {r.firmato_da}</span>}
                        <span>{format(new Date(r.data_intervento), "dd MMM yyyy", { locale: it })}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {r.firma_cliente && (
                        <img src={r.firma_cliente} alt="Firma cliente" className="h-12 w-24 object-contain border rounded" />
                      )}
                      {r.stato === "firmato" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => generaCostoMutation.mutate(r)}
                          disabled={generaCostoMutation.isPending}
                        >
                          {generaCostoMutation.isPending
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <CheckCircle2 className="h-3 w-3" />
                          }
                          Registra Costo
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <RapportinoForm
        open={rapportinoOpen}
        onClose={() => setRapportinoOpen(false)}
        ticketId={id!}
        companyId={effectiveCompany?.id ?? ""}
        nextNumero={(rapportini[0]?.numero ?? 0) + 1}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["rapportini", id] });
          queryClient.invalidateQueries({ queryKey: ["intervento", id] });
        }}
      />
    </div>
  );
}
