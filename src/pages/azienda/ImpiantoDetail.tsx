import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NuovoInterventoDialog } from "@/components/interventi/NuovoInterventoDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, AlertCircle, Plus, Loader2, Wrench } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function ImpiantoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const [esecuzioneOpen, setEsecuzioneOpen] = useState(false);
  const [selectedPianoId, setSelectedPianoId] = useState<string | null>(null);
  const [esecuzioneForm, setEsecuzioneForm] = useState({ data: new Date().toLocaleDateString("en-CA"), esito: "ok", note: "" });
  const [nuovoInterventoOpen, setNuovoInterventoOpen] = useState(false);

  const { data: impianto, isLoading } = useQuery({
    queryKey: ["impianto", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("impianti_cliente")
        .select("*, customer:profiles!impianti_cliente_customer_id_fkey(id, first_name, last_name, email)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: contratto } = useQuery({
    queryKey: ["contratto-impianto", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("contratti_manutenzione")
        .select("*")
        .eq("impianto_id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: piani = [] } = useQuery({
    queryKey: ["piani-impianto", contratto?.id],
    queryFn: async () => {
      if (!contratto?.id) return [];
      const { data, error } = await supabase
        .from("piani_manutenzione")
        .select("*, tecnico:profiles!piani_manutenzione_tecnico_preferito_fkey(first_name, last_name)")
        .eq("contratto_id", contratto.id)
        .order("prossima_scadenza", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!contratto?.id,
  });

  const { data: interventiImpianto = [] } = useQuery({
    queryKey: ["interventi-impianto", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("tickets")
        .select("id, subject, status, priority, tipo, data_intervento_prevista, created_at, assigned_to")
        .eq("impianto_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: esecuzioni = [] } = useQuery({
    queryKey: ["esecuzioni-impianto", piani.map((p: any) => p.id).join(",")],
    queryFn: async () => {
      if (piani.length === 0) return [];
      const { data } = await supabase
        .from("esecuzioni_manutenzione")
        .select("*, piano:piani_manutenzione(titolo)")
        .in("piano_id", piani.map((p: any) => p.id))
        .order("data_esecuzione", { ascending: false });
      return data ?? [];
    },
    enabled: piani.length > 0,
  });

  const registraEsecuzioneMutation = useMutation({
    mutationFn: async () => {
      // 2026-05-27 (UX audit): precondizioni esplicite + payload completo.
      // Prima: data poteva essere "" (Input non-required) → insert rifiutato.
      // company_id/tecnico_id mancanti → orfanaggio + zero traccia "chi ha eseguito".
      if (!selectedPianoId) throw new Error("Seleziona un piano");
      if (!esecuzioneForm.data) throw new Error("La data è obbligatoria");
      if (!effectiveCompany?.id) throw new Error("Azienda non disponibile");

      const { error } = await supabase.from("esecuzioni_manutenzione").insert({
        piano_id: selectedPianoId,
        company_id: effectiveCompany.id,
        tecnico_id: user?.id ?? null,
        data_esecuzione: esecuzioneForm.data,
        esito: esecuzioneForm.esito,
        note: esecuzioneForm.note.trim() || null,
      });
      if (error) throw error;
      await supabase.from("piani_manutenzione").update({ ultima_esecuzione: esecuzioneForm.data }).eq("id", selectedPianoId);
    },
    onSuccess: () => {
      toast.success("Esecuzione registrata");
      queryClient.invalidateQueries({ queryKey: ["esecuzioni-impianto"] });
      queryClient.invalidateQueries({ queryKey: ["piani-impianto", contratto?.id] });
      setEsecuzioneOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "Errore nella registrazione"),
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );

  if (!impianto) return (
    <div className="p-6 text-center py-20">
      <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500">Impianto non trovato</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/azienda/manutenzione")}>Torna alla lista</Button>
    </div>
  );

  const garanziaGiorni = impianto.garanzia_scadenza ? differenceInDays(new Date(impianto.garanzia_scadenza), new Date()) : null;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/manutenzione")} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold capitalize">{impianto.tipo_impianto?.replace("_", " ")} {impianto.marca && `— ${impianto.marca}`}</h1>
          <p className="text-sm text-gray-500">{[(impianto.customer as any)?.first_name, (impianto.customer as any)?.last_name].filter(Boolean).join(" ") || ""}</p>
        </div>
      </div>

      <Tabs defaultValue="scheda">
        <TabsList>
          <TabsTrigger value="scheda">Scheda Tecnica</TabsTrigger>
          <TabsTrigger value="piano">Piano Manutenzione ({piani.length})</TabsTrigger>
          <TabsTrigger value="interventi">Interventi ({interventiImpianto.length})</TabsTrigger>
          <TabsTrigger value="contratto">Contratto</TabsTrigger>
        </TabsList>

        {/* Scheda Tecnica */}
        <TabsContent value="scheda" className="mt-4 space-y-4">
          <div className="bg-white rounded-lg border p-4 grid grid-cols-2 gap-4 text-sm">
            {[
              { label: "Tipo", value: impianto.tipo_impianto?.replace("_", " ") },
              { label: "Marca", value: impianto.marca },
              { label: "Modello", value: impianto.modello },
              { label: "Matricola", value: impianto.matricola },
              { label: "Data installazione", value: impianto.data_installazione ? format(new Date(impianto.data_installazione), "dd MMMM yyyy", { locale: it }) : null },
              { label: "Scadenza garanzia", value: impianto.garanzia_scadenza ? format(new Date(impianto.garanzia_scadenza), "dd MMMM yyyy", { locale: it }) : null },
            ].map((f) => f.value && (
              <div key={f.label}>
                <div className="text-gray-400 text-xs">{f.label}</div>
                <div className="font-medium mt-0.5">{f.value}</div>
              </div>
            ))}
          </div>
          {garanziaGiorni !== null && (
            <Badge className={garanziaGiorni < 0 ? "bg-red-100 text-red-800" : garanziaGiorni < 90 ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}>
              {garanziaGiorni < 0 ? `Garanzia scaduta ${Math.abs(garanziaGiorni)}gg fa` : `Garanzia valida ancora ${garanziaGiorni} giorni`}
            </Badge>
          )}
          {impianto.note_tecniche && (
            <div className="bg-gray-50 rounded p-3 text-sm text-gray-700">{impianto.note_tecniche}</div>
          )}
        </TabsContent>

        {/* Piano Manutenzione */}
        <TabsContent value="piano" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Piani di manutenzione</h3>
            <Button size="sm" onClick={() => { setSelectedPianoId(piani[0]?.id ?? null); setEsecuzioneOpen(true); }} disabled={piani.length === 0} className="gap-2">
              <Plus className="h-4 w-4" /> Registra Esecuzione
            </Button>
          </div>

          {piani.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Nessun piano configurato per questo impianto</p>
          ) : piani.map((piano: any) => (
            <div key={piano.id} className="bg-white rounded-lg border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-medium">{piano.titolo}</span>
                  <div className="text-sm text-gray-500 mt-1">
                    Frequenza: {piano.frequenza_tipo} · Prossima: {piano.prossima_scadenza ? format(new Date(piano.prossima_scadenza), "dd MMM yyyy", { locale: it }) : "—"}
                  </div>
                  {piano.ultima_esecuzione && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Ultima: {format(new Date(piano.ultima_esecuzione), "dd MMM yyyy", { locale: it })}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => { setSelectedPianoId(piano.id); setEsecuzioneOpen(true); }}>
                  Esegui
                </Button>
              </div>
            </div>
          ))}

          {esecuzioni.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Storico esecuzioni</h4>
              <div className="space-y-2">
                {esecuzioni.map((e: any) => (
                  <div key={e.id} className="bg-gray-50 rounded p-3 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{e.piano?.titolo}</span>
                      <span className="text-gray-400 ml-2">{format(new Date(e.data_esecuzione), "dd MMM yyyy", { locale: it })}</span>
                    </div>
                    <Badge className={e.esito === "ok" ? "bg-green-100 text-green-800 text-xs" : e.esito === "anomalia_rilevata" ? "bg-red-100 text-red-800 text-xs" : "bg-gray-100 text-gray-600 text-xs"}>
                      {e.esito === "ok" ? "OK" : e.esito === "anomalia_rilevata" ? "Anomalia" : "Rinviata"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Interventi collegati all'impianto */}
        <TabsContent value="interventi" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Interventi su questo impianto</h3>
            <Button size="sm" variant="outline" onClick={() => setNuovoInterventoOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nuovo Intervento
            </Button>
          </div>
          {interventiImpianto.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Wrench className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nessun intervento registrato per questo impianto</p>
            </div>
          ) : (
            <div className="space-y-2">
              {interventiImpianto.map((iv: any) => (
                <div
                  key={iv.id}
                  className="bg-white rounded-lg border p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => navigate(`/azienda/assistenza/${iv.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <Wrench className="h-4 w-4 text-orange-500 shrink-0" />
                    <div>
                      <div className="font-medium text-sm">{iv.subject}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {iv.tipo ?? "supporto"} · {format(new Date(iv.created_at), "dd MMM yyyy", { locale: it })}
                        {iv.data_intervento_prevista && ` · Previsto: ${format(new Date(iv.data_intervento_prevista), "dd MMM yyyy", { locale: it })}`}
                      </div>
                    </div>
                  </div>
                  <Badge className={
                    iv.status === "risolto" ? "bg-green-100 text-green-800 text-xs" :
                    iv.status === "in_lavorazione" ? "bg-blue-100 text-blue-800 text-xs" :
                    "bg-gray-100 text-gray-600 text-xs"
                  }>
                    {iv.status === "risolto" ? "Risolto" : iv.status === "in_lavorazione" ? "In lavorazione" : "Aperto"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Contratto */}
        <TabsContent value="contratto" className="mt-4">
          {!contratto ? (
            <div className="text-center py-12 text-gray-500">
              <p>Nessun contratto collegato a questo impianto</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border p-4 space-y-3 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-base">{contratto.nome_contratto}</h3>
                  <div className="text-gray-500 mt-1">{contratto.tipo_fatturazione} · Inizio: {format(new Date(contratto.data_inizio), "dd/MM/yyyy")}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-purple-700 text-lg">€{Number(contratto.importo_canone).toFixed(2)}</div>
                  <Badge className={contratto.stato === "attivo" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}>
                    {contratto.stato}
                  </Badge>
                </div>
              </div>
              {contratto.rinnovo_automatico && <Badge className="text-xs bg-blue-100 text-blue-800">Rinnovo automatico</Badge>}
              {contratto.note && <p className="text-gray-600 bg-gray-50 p-2 rounded">{contratto.note}</p>}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog nuovo intervento */}
      <NuovoInterventoDialog
        open={nuovoInterventoOpen}
        onClose={() => setNuovoInterventoOpen(false)}
        defaultCustomerId={(impianto?.customer as any)?.id}
        defaultImpiantoId={id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["interventi-impianto", id] });
        }}
      />

      {/* Dialog esecuzione */}
      <Dialog open={esecuzioneOpen} onOpenChange={setEsecuzioneOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Registra Esecuzione Manutenzione</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {piani.length > 1 && (
              <div className="space-y-1.5">
                <Label>Piano</Label>
                <Select value={selectedPianoId ?? ""} onValueChange={setSelectedPianoId}>
                  <SelectTrigger><SelectValue placeholder="Seleziona piano..." /></SelectTrigger>
                  <SelectContent>
                    {piani.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.titolo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Data esecuzione <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={esecuzioneForm.data}
                onChange={(e) => setEsecuzioneForm((f) => ({ ...f, data: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Esito</Label>
              <Select value={esecuzioneForm.esito} onValueChange={(v) => setEsecuzioneForm((f) => ({ ...f, esito: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ok">OK — Tutto regolare</SelectItem>
                  <SelectItem value="anomalia_rilevata">Anomalia rilevata</SelectItem>
                  <SelectItem value="rinviata">Rinviata</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea value={esecuzioneForm.note} onChange={(e) => setEsecuzioneForm((f) => ({ ...f, note: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEsecuzioneOpen(false)}>Annulla</Button>
            <Button onClick={() => registraEsecuzioneMutation.mutate()} disabled={registraEsecuzioneMutation.isPending}>
              {registraEsecuzioneMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
