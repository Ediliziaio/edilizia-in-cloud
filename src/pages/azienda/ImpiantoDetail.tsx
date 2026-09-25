import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NuovoInterventoDialog } from "@/components/interventi/NuovoInterventoDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, AlertCircle, Plus, Loader2, Wrench, Pencil, Archive, ArchiveRestore } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  // ── Correggere e disfare (ondata 4) ────────────────────────────────────
  // La scheda impianto era di sola lettura: una matricola sbagliata o un
  // impianto smantellato restavano lì com'erano, per sempre.
  const [modificaOpen, setModificaOpen] = useState(false);
  const [archiviaOpen, setArchiviaOpen] = useState(false);
  const [formImpianto, setFormImpianto] = useState({
    tipo_impianto: "", marca: "", modello: "", matricola: "",
    data_installazione: "", garanzia_scadenza: "", note_tecniche: "",
  });
  const [modificaContrattoOpen, setModificaContrattoOpen] = useState(false);
  const [formContratto, setFormContratto] = useState({
    nome_contratto: "", importo_canone: "", data_inizio: "", data_scadenza: "",
    stato: "attivo", rinnovo_automatico: false, note: "",
  });

  const { data: impianto, isLoading, isError: impiantoError } = useQuery({
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
      const { data, error } = await supabase
        .from("contratti_manutenzione")
        .select("*")
        .eq("impianto_id", id!)
        .maybeSingle();
      if (error) throw error;
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
      const { data, error } = await supabase
        .from("esecuzioni_manutenzione")
        .select("*, piano:piani_manutenzione(titolo)")
        .in("piano_id", piani.map((p: any) => p.id))
        .order("data_esecuzione", { ascending: false });
      if (error) throw error;
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

      // esecuzioni_manutenzione NON ha company_id, per scelta: la RLS
      // (esecuzioni_company) ricava l'azienda dal piano collegato. Passarlo
      // faceva rifiutare ogni inserimento con PGRST204, quindi "Registra
      // esecuzione" non ha mai funzionato. L'ambito resta garantito dal
      // piano_id, che qui e' obbligatorio.
      const { error } = await supabase.from("esecuzioni_manutenzione").insert({
        piano_id: selectedPianoId,
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

  /** Riempie il modulo di modifica coi dati attuali e lo apre. */
  const apriModificaImpianto = () => {
    if (!impianto) return;
    setFormImpianto({
      tipo_impianto: impianto.tipo_impianto ?? "",
      marca: impianto.marca ?? "",
      modello: impianto.modello ?? "",
      matricola: impianto.matricola ?? "",
      data_installazione: impianto.data_installazione ?? "",
      garanzia_scadenza: impianto.garanzia_scadenza ?? "",
      note_tecniche: impianto.note_tecniche ?? "",
    });
    setModificaOpen(true);
  };

  const salvaImpianto = useMutation({
    mutationFn: async () => {
      if (!formImpianto.tipo_impianto.trim()) throw new Error("Il tipo di impianto è obbligatorio");
      const { error } = await supabase
        .from("impianti_cliente")
        .update({
          tipo_impianto: formImpianto.tipo_impianto.trim(),
          marca: formImpianto.marca.trim() || null,
          modello: formImpianto.modello.trim() || null,
          matricola: formImpianto.matricola.trim() || null,
          data_installazione: formImpianto.data_installazione || null,
          garanzia_scadenza: formImpianto.garanzia_scadenza || null,
          note_tecniche: formImpianto.note_tecniche.trim() || null,
        })
        .eq("id", id!)
        .eq("company_id", effectiveCompany!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Impianto aggiornato");
      queryClient.invalidateQueries({ queryKey: ["impianto", id] });
      setModificaOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "Salvataggio non riuscito"),
  });

  /**
   * Archivia invece di cancellare: `impianti_cliente.attivo` esiste già e
   * l'elenco manutenzione filtra su di lui. Così un impianto smantellato esce
   * dalle liste ma non si porta dietro nel nulla contratti, piani e interventi
   * che lo citano — e si può rimettere.
   */
  const cambiaArchiviazione = useMutation({
    mutationFn: async (attivo: boolean) => {
      const { error } = await supabase
        .from("impianti_cliente")
        .update({ attivo })
        .eq("id", id!)
        .eq("company_id", effectiveCompany!.id);
      if (error) throw error;
      return attivo;
    },
    onSuccess: (attivo) => {
      toast.success(attivo ? "Impianto ripristinato" : "Impianto archiviato");
      queryClient.invalidateQueries({ queryKey: ["impianto", id] });
      setArchiviaOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "Operazione non riuscita"),
  });

  const apriModificaContratto = () => {
    if (!contratto) return;
    setFormContratto({
      nome_contratto: contratto.nome_contratto ?? "",
      importo_canone: contratto.importo_canone != null ? String(contratto.importo_canone) : "",
      data_inizio: contratto.data_inizio ?? "",
      data_scadenza: contratto.data_scadenza ?? "",
      stato: contratto.stato ?? "attivo",
      rinnovo_automatico: contratto.rinnovo_automatico === true,
      note: contratto.note ?? "",
    });
    setModificaContrattoOpen(true);
  };

  const salvaContratto = useMutation({
    mutationFn: async () => {
      if (!contratto?.id) throw new Error("Contratto non disponibile");
      if (!formContratto.nome_contratto.trim()) throw new Error("Il nome del contratto è obbligatorio");
      if (!formContratto.data_inizio) throw new Error("La data di inizio è obbligatoria");
      const canone = Number(formContratto.importo_canone.replace(",", "."));
      if (!Number.isFinite(canone) || canone < 0) throw new Error("Il canone non è un importo valido");
      const { error } = await supabase
        .from("contratti_manutenzione")
        .update({
          nome_contratto: formContratto.nome_contratto.trim(),
          importo_canone: canone,
          data_inizio: formContratto.data_inizio,
          data_scadenza: formContratto.data_scadenza || null,
          stato: formContratto.stato,
          rinnovo_automatico: formContratto.rinnovo_automatico,
          note: formContratto.note.trim() || null,
        })
        .eq("id", contratto.id)
        .eq("company_id", effectiveCompany!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contratto aggiornato");
      queryClient.invalidateQueries({ queryKey: ["contratto-impianto", id] });
      setModificaContrattoOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "Salvataggio non riuscito"),
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );

  if (impiantoError) return (
    <div className="p-6 max-w-md mx-auto">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Errore nel caricamento dell'impianto. Riprova.</AlertDescription>
      </Alert>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/azienda/manutenzione")}>Torna alla lista</Button>
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
    <div className="p-6 space-y-6 max-w-4xl max-sm:space-y-3 max-sm:p-0">
      {/* Mobile: titolo e due icone sulla stessa riga; la freccia indietro è
          già nella barra in alto. */}
      <div className="flex flex-wrap items-center gap-3 max-sm:flex-nowrap max-sm:gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/manutenzione")} className="-ml-2 max-sm:hidden">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold capitalize max-sm:text-lg max-sm:leading-tight">{impianto.tipo_impianto?.replace("_", " ")} {impianto.marca && `— ${impianto.marca}`}</h1>
          <p className="text-sm text-gray-500 max-sm:text-xs">{[(impianto.customer as any)?.first_name, (impianto.customer as any)?.last_name].filter(Boolean).join(" ") || ""}</p>
        </div>
        {/* Barra azioni: secondaria icon-only, CTA che riempie su mobile. */}
        <div className="flex w-full items-center gap-2 sm:w-auto max-sm:w-auto max-sm:shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 tap-compact max-sm:h-8 max-sm:w-8"
            title={impianto.attivo === false ? "Ripristina impianto" : "Archivia impianto"}
            onClick={() => setArchiviaOpen(true)}
          >
            {impianto.attivo === false ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </Button>
          <Button className="flex-1 sm:flex-none gap-2 tap-compact max-sm:h-8 max-sm:w-8 max-sm:flex-none max-sm:p-0" aria-label="Modifica impianto" onClick={apriModificaImpianto}>
            <Pencil className="h-4 w-4" /> <span className="max-sm:hidden">Modifica</span>
          </Button>
        </div>
      </div>

      {impianto.attivo === false && (
        <Alert>
          <Archive className="h-4 w-4" />
          <AlertDescription>
            Questo impianto è archiviato: non compare più nell'elenco manutenzione.
            Contratti, piani e interventi restano collegati e si possono ancora consultare.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="scheda">
        {/* Mobile: scheda, piano e interventi (quel che serve sul posto); il
            contratto si gestisce al computer. */}
        <TabsList className="max-sm:grid max-sm:w-full max-sm:grid-cols-3">
          <TabsTrigger value="scheda" className="max-sm:text-xs"><span className="max-sm:hidden">Scheda Tecnica</span><span className="sm:hidden">Scheda</span></TabsTrigger>
          <TabsTrigger value="piano" className="max-sm:text-xs"><span className="max-sm:hidden">Piano Manutenzione ({piani.length})</span><span className="sm:hidden">Piano ({piani.length})</span></TabsTrigger>
          <TabsTrigger value="interventi" className="max-sm:text-xs">Interventi ({interventiImpianto.length})</TabsTrigger>
          <TabsTrigger value="contratto" className="max-sm:hidden">Contratto</TabsTrigger>
        </TabsList>

        {/* Scheda Tecnica */}
        <TabsContent value="scheda" className="mt-4 space-y-4 max-sm:mt-3 max-sm:space-y-3">
          <div className="bg-white rounded-lg border p-4 grid grid-cols-2 gap-4 text-sm max-sm:gap-3 max-sm:p-3 max-sm:text-[13px]">
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
        <TabsContent value="piano" className="mt-4 space-y-4 max-sm:mt-3 max-sm:space-y-3">
          {/* Mobile: senza piani il bottone spento non serve; il titolo è la scheda. */}
          <div className={`flex items-center justify-between max-sm:justify-end ${piani.length === 0 ? "max-sm:hidden" : ""}`}>
            <h3 className="font-semibold max-sm:hidden">Piani di manutenzione</h3>
            <Button size="sm" onClick={() => { setSelectedPianoId(piani[0]?.id ?? null); setEsecuzioneOpen(true); }} disabled={piani.length === 0} className="gap-2 max-sm:h-8 max-sm:text-xs">
              <Plus className="h-4 w-4" /> Registra Esecuzione
            </Button>
          </div>

          {piani.length === 0 ? (
            <p className="text-center text-gray-500 py-8 max-sm:py-5 max-sm:text-sm">Nessun piano configurato per questo impianto</p>
          ) : piani.map((piano: any) => (
            <div key={piano.id} className="bg-white rounded-lg border p-4 max-sm:p-3">
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
        <TabsContent value="interventi" className="mt-4 space-y-3 max-sm:mt-3">
          <div className="flex items-center justify-between max-sm:justify-end">
            <h3 className="font-semibold max-sm:hidden">Interventi su questo impianto</h3>
            <Button size="sm" variant="outline" onClick={() => setNuovoInterventoOpen(true)} className="gap-2 max-sm:h-8 max-sm:text-xs">
              <Plus className="h-4 w-4" /> Nuovo Intervento
            </Button>
          </div>
          {interventiImpianto.length === 0 ? (
            <div className="text-center py-12 text-gray-400 max-sm:py-5 max-sm:text-sm">
              <Wrench className="h-10 w-10 mx-auto mb-3 opacity-30 max-sm:hidden" />
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
              {/* Il contratto era di sola lettura: un canone sbagliato o una
                  disdetta non si potevano registrare da nessuna parte. */}
              <Button variant="outline" size="sm" className="w-full gap-2 sm:w-auto" onClick={apriModificaContratto}>
                <Pencil className="h-4 w-4" /> Modifica contratto
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modifica impianto */}
      <Dialog open={modificaOpen} onOpenChange={setModificaOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifica impianto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="imp-tipo">Tipo impianto *</Label>
              <Input
                id="imp-tipo"
                value={formImpianto.tipo_impianto}
                onChange={(e) => setFormImpianto((f) => ({ ...f, tipo_impianto: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="imp-marca">Marca</Label>
                <Input id="imp-marca" value={formImpianto.marca} onChange={(e) => setFormImpianto((f) => ({ ...f, marca: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-modello">Modello</Label>
                <Input id="imp-modello" value={formImpianto.modello} onChange={(e) => setFormImpianto((f) => ({ ...f, modello: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imp-matricola">Matricola</Label>
              <Input id="imp-matricola" value={formImpianto.matricola} onChange={(e) => setFormImpianto((f) => ({ ...f, matricola: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="imp-installazione">Data installazione</Label>
                <Input id="imp-installazione" type="date" value={formImpianto.data_installazione} onChange={(e) => setFormImpianto((f) => ({ ...f, data_installazione: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-garanzia">Scadenza garanzia</Label>
                <Input id="imp-garanzia" type="date" value={formImpianto.garanzia_scadenza} onChange={(e) => setFormImpianto((f) => ({ ...f, garanzia_scadenza: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imp-note">Note tecniche</Label>
              <Textarea id="imp-note" rows={3} value={formImpianto.note_tecniche} onChange={(e) => setFormImpianto((f) => ({ ...f, note_tecniche: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto max-sm:hidden" onClick={() => setModificaOpen(false)}>Annulla</Button>
            <Button className="w-full sm:w-auto" onClick={() => salvaImpianto.mutate()} disabled={salvaImpianto.isPending}>
              {salvaImpianto.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvataggio...</> : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modifica contratto */}
      <Dialog open={modificaContrattoOpen} onOpenChange={setModificaContrattoOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifica contratto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ctr-nome">Nome contratto *</Label>
              <Input id="ctr-nome" value={formContratto.nome_contratto} onChange={(e) => setFormContratto((f) => ({ ...f, nome_contratto: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ctr-canone">Canone (€)</Label>
                <Input id="ctr-canone" inputMode="decimal" value={formContratto.importo_canone} onChange={(e) => setFormContratto((f) => ({ ...f, importo_canone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ctr-stato">Stato</Label>
                <Select value={formContratto.stato} onValueChange={(v) => setFormContratto((f) => ({ ...f, stato: v }))}>
                  <SelectTrigger id="ctr-stato"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attivo">Attivo</SelectItem>
                    <SelectItem value="sospeso">Sospeso</SelectItem>
                    <SelectItem value="cessato">Cessato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ctr-inizio">Data inizio *</Label>
                <Input id="ctr-inizio" type="date" value={formContratto.data_inizio} onChange={(e) => setFormContratto((f) => ({ ...f, data_inizio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ctr-scadenza">Data scadenza</Label>
                <Input id="ctr-scadenza" type="date" value={formContratto.data_scadenza} onChange={(e) => setFormContratto((f) => ({ ...f, data_scadenza: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={formContratto.rinnovo_automatico}
                onChange={(e) => setFormContratto((f) => ({ ...f, rinnovo_automatico: e.target.checked }))}
              />
              Rinnovo automatico
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="ctr-note">Note</Label>
              <Textarea id="ctr-note" rows={3} value={formContratto.note} onChange={(e) => setFormContratto((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto max-sm:hidden" onClick={() => setModificaContrattoOpen(false)}>Annulla</Button>
            <Button className="w-full sm:w-auto" onClick={() => salvaContratto.mutate()} disabled={salvaContratto.isPending}>
              {salvaContratto.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvataggio...</> : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archivia / ripristina impianto */}
      <AlertDialog open={archiviaOpen} onOpenChange={setArchiviaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {impianto.attivo === false ? "Ripristinare l'impianto?" : "Archiviare l'impianto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {impianto.attivo === false
                ? "Tornerà nell'elenco manutenzione insieme agli impianti attivi."
                : "Esce dall'elenco manutenzione. Contratti, piani e interventi restano collegati e consultabili, e si può ripristinare quando vuoi: per questo non si cancella."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={cambiaArchiviazione.isPending}
              onClick={(e) => { e.preventDefault(); cambiaArchiviazione.mutate(impianto.attivo === false); }}
            >
              {impianto.attivo === false ? "Ripristina" : "Archivia"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog nuovo intervento */}
      <NuovoInterventoDialog
        open={nuovoInterventoOpen}
        onClose={() => setNuovoInterventoOpen(false)}
        defaultCustomerId={(impianto?.customer as any)?.id}
        defaultCustomerLabel={[(impianto?.customer as any)?.first_name, (impianto?.customer as any)?.last_name].filter(Boolean).join(" ") || undefined}
        defaultImpiantoId={id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["interventi-impianto", id] });
        }}
      />

      {/* Dialog esecuzione */}
      <Dialog open={esecuzioneOpen} onOpenChange={setEsecuzioneOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle><span className="max-sm:hidden">Registra Esecuzione Manutenzione</span><span className="sm:hidden">Registra esecuzione</span></DialogTitle></DialogHeader>
          <div className="space-y-4 max-sm:space-y-3">
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
            {/* Mobile: data ed esito affiancati. */}
            <div className="space-y-4 max-sm:grid max-sm:grid-cols-2 max-sm:gap-3 max-sm:space-y-0">
            <div className="space-y-1.5">
              <Label>Data <span className="max-sm:hidden">esecuzione</span> <span className="text-destructive">*</span></Label>
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
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea value={esecuzioneForm.note} onChange={(e) => setEsecuzioneForm((f) => ({ ...f, note: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="max-sm:hidden" onClick={() => setEsecuzioneOpen(false)}>Annulla</Button>
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
