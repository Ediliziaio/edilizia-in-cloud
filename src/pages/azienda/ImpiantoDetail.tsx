import { usePermissions } from "@/hooks/usePermissions";
import { useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NuovoInterventoDialog } from "@/components/interventi/NuovoInterventoDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, AlertCircle, Plus, Loader2, Wrench, Pencil, Archive, ArchiveRestore, MessageCircle, Mail, History, Camera, Receipt, Settings, FileText, Calendar, LayoutDashboard, Package, Wallet, Users, ClipboardCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { statoManutenzione, STATO_MANUT_META, etichettaScadenza } from "@/lib/manutenzione/statoManutenzione";
import { QuickContactSendDialog } from "@/components/contacts/QuickContactSendDialog";
import { RapportiniIntervento } from "@/components/tickets/RapportiniIntervento";
import { CreaFatturaAssistenzaDialog } from "@/components/tickets/CreaFatturaAssistenzaDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

export default function ImpiantoDetail() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const operazioneEsecuzione = useRef<{ dati: string; id: string } | null>(null);
  const [esecuzioneOpen, setEsecuzioneOpen] = useState(false);
  const [selectedPianoId, setSelectedPianoId] = useState<string | null>(null);
  const [esecuzioneForm, setEsecuzioneForm] = useState({ data: new Date().toLocaleDateString("en-CA"), esito: "ok", note: "" });
  const [nuovoInterventoOpen, setNuovoInterventoOpen] = useState(false);
  // ── Correggere e disfare (ondata 4) ────────────────────────────────────
  // La scheda impianto era di sola lettura: una matricola sbagliata o un
  // impianto smantellato restavano lì com'erano, per sempre.
  const [modificaOpen, setModificaOpen] = useState(false);
  const [fatturaOpen, setFatturaOpen] = useState(false);
  const [contattoCanale, setContattoCanale] = useState<"whatsapp" | "email" | null>(null);
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
        .select("*, customer:profiles!impianti_cliente_customer_id_fkey(id, first_name, last_name, email, phone)")
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

  const { data: piani = [], isPending: caricamentoPiani, isError: errorePiani, refetch: ricaricaPiani } = useQuery({
    queryKey: ["piani-impianto", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piani_manutenzione")
        .select("*, tecnico:profiles!piani_manutenzione_tecnico_preferito_fkey(first_name, last_name)")
        .eq("impianto_id", id!)
        .order("prossima_scadenza", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: interventiImpianto = [] } = useQuery({
    queryKey: ["interventi-impianto", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("tickets")
        .select("id, subject, status, priority, tipo, data_intervento_prevista, created_at, assigned_to, a_pagamento, pagato, importo_finale, importo_preventivato, costo_materiale, costo_trasferta, costo_orario_applicato, ore_effettive, durata_ore")
        .eq("impianto_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  /** I materiali di tutti i rapportini di questa manutenzione, messi insieme:
   *  erano già scritti dentro ogni rapportino, ma non li sommava nessuno. */
  const { data: rapportiniMateriali = [] } = useQuery({
    queryKey: ["materiali-manutenzione", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("rapportini_intervento")
        .select("id, numero, data_intervento, materiali_usati, ticket_id")
        .eq("impianto_id", id)
        .order("data_intervento", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: esecuzioni = [] } = useQuery({
    queryKey: ["esecuzioni-impianto", id, piani.map((p) => p.id)],
    queryFn: async () => {
      if (piani.length === 0) return [];
      const { data, error } = await supabase
        .from("esecuzioni_manutenzione")
        .select("*, piano:piani_manutenzione(titolo)")
        .in("piano_id", piani.map((p) => p.id))
        .order("data_esecuzione", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: piani.length > 0,
  });

  const registraEsecuzioneMutation = useMutation({
    mutationFn: async () => {
      if (permissions.solaLettura) throw new Error(t("Modalità di sola lettura"));
      if (!selectedPianoId) throw new Error(t("Seleziona un piano"));
      if (!esecuzioneForm.data) throw new Error(t("La data è obbligatoria"));
      if (!id) throw new Error(t("Manutenzione non disponibile"));
      const dati = {
        p_piano_id: selectedPianoId,
        p_impianto_id: id,
        p_data: esecuzioneForm.data,
        p_esito: esecuzioneForm.esito,
        p_note: esecuzioneForm.note.trim() || null,
      };
      const versione = JSON.stringify(dati);
      if (operazioneEsecuzione.current?.dati !== versione) {
        operazioneEsecuzione.current = { dati: versione, id: crypto.randomUUID() };
      }
      const { error } = await supabase.rpc("manutenzione_registra_esecuzione", {
        ...dati,
        p_operazione: operazioneEsecuzione.current.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      operazioneEsecuzione.current = null;
      toast.success(t("Esecuzione registrata"));
      queryClient.invalidateQueries({ queryKey: ["esecuzioni-impianto", id] });
      queryClient.invalidateQueries({ queryKey: ["piani-impianto", id] });
      queryClient.invalidateQueries({ queryKey: ["piani-attivi", effectiveCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["cal-manutenzioni", effectiveCompany?.id] });
      setEsecuzioneOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || t("Errore nella registrazione")),
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
      if (permissions.solaLettura) throw new Error(t("Modalità di sola lettura"));
      if (!formImpianto.tipo_impianto.trim()) throw new Error(t("Il tipo è obbligatorio"));
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
      toast.success(t("Manutenzione aggiornata"));
      queryClient.invalidateQueries({ queryKey: ["impianto", id] });
      setModificaOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || t("Salvataggio non riuscito")),
  });

  /**
   * Archivia invece di cancellare: `impianti_cliente.attivo` esiste già e
   * l'elenco manutenzione filtra su di lui. Così un impianto smantellato esce
   * dalle liste ma non si porta dietro nel nulla contratti, piani e interventi
   * che lo citano — e si può rimettere.
   */
  const cambiaArchiviazione = useMutation({
    mutationFn: async (attivo: boolean) => {
      if (permissions.solaLettura) throw new Error(t("Modalità di sola lettura"));
      const { error } = await supabase
        .from("impianti_cliente")
        .update({ attivo })
        .eq("id", id!)
        .eq("company_id", effectiveCompany!.id);
      if (error) throw error;
      return attivo;
    },
    onSuccess: (attivo) => {
      toast.success(attivo ? t("Manutenzione ripristinata") : t("Manutenzione archiviata"));
      queryClient.invalidateQueries({ queryKey: ["impianto", id] });
      setArchiviaOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || t("Operazione non riuscita")),
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
      if (permissions.solaLettura) throw new Error(t("Modalità di sola lettura"));
      if (!contratto?.id) throw new Error(t("Contratto non disponibile"));
      if (!formContratto.nome_contratto.trim()) throw new Error(t("Il nome del contratto è obbligatorio"));
      if (!formContratto.data_inizio) throw new Error(t("La data di inizio è obbligatoria"));
      const canone = Number(formContratto.importo_canone.replace(",", "."));
      if (!Number.isFinite(canone) || canone < 0) throw new Error(t("Il canone non è un importo valido"));
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
      toast.success(t("Contratto aggiornato"));
      queryClient.invalidateQueries({ queryKey: ["contratto-impianto", id] });
      setModificaContrattoOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || t("Salvataggio non riuscito")),
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
        <AlertDescription>{t("Non riesco a leggere la manutenzione. Riprova.")}</AlertDescription>
      </Alert>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/azienda/manutenzione")}>{t("Torna alla lista")}</Button>
    </div>
  );

  if (!impianto) return (
    <div className="p-6 text-center py-20">
      <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500">{t("Manutenzione non trovata")}</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/azienda/manutenzione")}>{t("Torna alla lista")}</Button>
    </div>
  );

  const garanziaGiorni = impianto.garanzia_scadenza ? differenceInDays(new Date(impianto.garanzia_scadenza), new Date()) : null;

  // ── Quello che la testata deve dire senza far scorrere ───────────────────
  const pianoPrincipale = (piani as any[]).find((pi) => pi.prossima_scadenza) ?? (piani as any[])[0] ?? null;
  const stato = statoManutenzione(pianoPrincipale?.prossima_scadenza ?? null, piani.length > 0);
  const statoMeta = STATO_MANUT_META[stato];
  const pallinoStato = stato === "scaduta" ? "bg-red-500" : stato === "in_scadenza" ? "bg-amber-500" : stato === "in_regola" ? "bg-emerald-500" : "bg-slate-400";
  const incaricato = [pianoPrincipale?.tecnico?.first_name, pianoPrincipale?.tecnico?.last_name].filter(Boolean).join(" ");
  const clienteNome = [(impianto.customer as any)?.first_name, (impianto.customer as any)?.last_name].filter(Boolean).join(" ");

  // ── I soldi: si sommano gli interventi, il calcolo del singolo esiste già ─
  const interventiSoldi = (interventiImpianto as any[]);
  const importoDi = (iv: any) => Number(iv.importo_finale ?? iv.importo_preventivato ?? 0);
  const incassato = interventiSoldi.filter((iv) => iv.a_pagamento && iv.pagato).reduce((n, iv) => n + importoDi(iv), 0);
  const daIncassare = interventiSoldi.filter((iv) => iv.a_pagamento && !iv.pagato).reduce((n, iv) => n + importoDi(iv), 0);
  const costoDi = (iv: any) => (Number(iv.ore_effettive ?? iv.durata_ore ?? 0) * Number(iv.costo_orario_applicato ?? 0)) + Number(iv.costo_trasferta ?? 0) + Number(iv.costo_materiale ?? 0);
  const costoTotale = interventiSoldi.reduce((n, iv) => n + costoDi(iv), 0);
  // La garanzia è costo puro: nessuno la paga, ma qualcuno la fa.
  const costoGaranzia = interventiSoldi.filter((iv) => !iv.a_pagamento).reduce((n, iv) => n + costoDi(iv), 0);
  const margine = incassato + daIncassare - costoTotale;
  const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  // ── I materiali di tutti i rapportini, una riga per materiale ────────────
  const righeMateriali = (rapportiniMateriali as any[]).flatMap((r) =>
    (Array.isArray(r.materiali_usati) ? r.materiali_usati : []).map((m: any, i: number) => ({
      key: `${r.id}-${i}`,
      nome: m?.nome ?? "—",
      quantita: m?.quantita ?? null,
      unita: m?.unita ?? "",
      data: r.data_intervento as string | null,
      ticketId: r.ticket_id as string | null,
    })),
  );

  // La scheda aperta sta nell'indirizzo: le notifiche e i link salvati
  // riaprono quella giusta, e il vecchio indirizzo senza «scheda» apre la
  // Panoramica, cioè quello che si vedeva prima in cima alla pagina.
  const schedaRichiesta = searchParams.get("scheda");
  const scheda = ["panoramica", "lavoro", "materiali", "soldi"].includes(schedaRichiesta ?? "") ? schedaRichiesta! : "panoramica";
  const vaiAScheda = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("scheda", v);
    setSearchParams(next, { replace: true });
  };

  return (
    // Niente p-6 né colonna da 896px: il margine lo dà il layout e la scheda
    // tecnica sta su tre colonne da 1024 (sul telefono era già p-0).
    <div className="space-y-6 max-sm:space-y-3">
      {/* ── Testata: in cima c'è tutto quello che serve a capire di che
          manutenzione si parla, senza scorrere di un dito (26/11/2026). Prima
          qui c'erano solo il tipo e il nome del cliente: stato, prossima
          visita, incaricato e canone erano sparsi in fondo alla pagina. ── */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm max-sm:rounded-xl max-sm:px-3 max-sm:py-2.5">
        <div className="flex flex-wrap items-center gap-3 max-sm:flex-nowrap max-sm:gap-2">
          <Button aria-label={t("Torna alle manutenzioni")} variant="ghost" size="sm" onClick={() => navigate("/azienda/manutenzione")} className="-ml-2 max-sm:hidden">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 max-sm:gap-1.5">
              {impianto.codice && (
                <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold tracking-tight text-slate-700">{impianto.codice}</span>
              )}
              <h1 className="min-w-0 text-xl font-bold capitalize max-sm:text-base max-sm:leading-tight">{impianto.tipo_impianto?.replace("_", " ")} {impianto.marca && `— ${impianto.marca}`}</h1>
            </div>
            <p className="mt-0.5 truncate text-sm text-gray-500 max-sm:text-xs">{clienteNome}</p>
          </div>
        {/* Barra azioni: secondaria icon-only, CTA che riempie su mobile. */}
        <div className="flex w-full items-center gap-2 sm:w-auto max-sm:w-auto max-sm:shrink-0">
          {/* Scrivi al cliente dell'impianto, come nelle commesse. */}
          {(impianto.customer as { phone?: string | null } | null)?.phone && (
            <Button variant="outline" size="icon" className="shrink-0 tap-compact text-emerald-700 max-sm:h-8 max-sm:w-8" title={t("WhatsApp al cliente")} onClick={() => setContattoCanale("whatsapp")}>
              <MessageCircle className="h-4 w-4" />
            </Button>
          )}
          {(impianto.customer as { email?: string | null } | null)?.email && (
            <Button variant="outline" size="icon" className="shrink-0 tap-compact text-blue-700 max-sm:h-8 max-sm:w-8" title={t("Email al cliente")} onClick={() => setContattoCanale("email")}>
              <Mail className="h-4 w-4" />
            </Button>
          )}
          {/* Storico completo: la linea del tempo di tutti gli interventi, con
              foto, ore e firma. Prima esisteva ma non la raggiungeva nessuno. */}
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 tap-compact max-sm:h-8 max-sm:w-8"
            title={t("Storico interventi e rapportini")}
            onClick={() => navigate(`/azienda/impianti/${id}/storico`)}
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 tap-compact max-sm:h-8 max-sm:w-8"
            title={impianto.attivo === false ? t("Ripristina manutenzione") : t("Archivia manutenzione")}
            disabled={permissions.solaLettura} onClick={() => setArchiviaOpen(true)}
          >
            {impianto.attivo === false ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </Button>
          <Button className="flex-1 sm:flex-none gap-2 tap-compact max-sm:h-8 max-sm:w-8 max-sm:flex-none max-sm:p-0" aria-label={t("Modifica manutenzione")} disabled={permissions.solaLettura} onClick={apriModificaImpianto}>
            <Pencil className="h-4 w-4" /> <span className="max-sm:hidden">{t("Modifica")}</span>
          </Button>
        </div>
        </div>

        {/* La riga che risponde alle quattro domande di sempre. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-2.5 text-sm max-sm:mt-2 max-sm:gap-x-3 max-sm:pt-2 max-sm:text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", pallinoStato)} aria-hidden="true" />
            {stato === "senza_piano" ? t("Senza ricorrenza") : etichettaScadenza(pianoPrincipale?.prossima_scadenza ?? null)}
          </span>
          {pianoPrincipale?.prossima_scadenza && (
            <span className="text-muted-foreground">
              {t("Prossima visita:")} <span className="font-medium text-foreground">{format(new Date(pianoPrincipale.prossima_scadenza), "dd MMM yyyy", { locale: dateFnsCampo() })}</span>
            </span>
          )}
          <span className="text-muted-foreground">
            {t("Incaricato:")} <span className="font-medium text-foreground">{incaricato || t("nessuno")}</span>
          </span>
          {contratto && (
            <span className="text-muted-foreground">
              {t("Canone:")} <span className="font-medium text-violet-700">{eur(Number(contratto.importo_canone))}</span> {contratto.tipo_fatturazione}
            </span>
          )}
        </div>
      </div>

      {impianto.attivo === false && (
        <Alert>
          <Archive className="h-4 w-4" />
          <AlertDescription>
            {t("Questa manutenzione è archiviata: non compare più nell’elenco. Contratto, ricorrenza e interventi restano collegati e si possono ancora consultare.")}
          </AlertDescription>
        </Alert>
      )}

      <Separator className="mb-4 max-sm:mb-1" />

      {/* ── Quattro schede, come la commessa (26/11/2026) ──────────────────
          Prima era un rotolo unico: per sapere se il cliente aveva pagato
          bisognava scorrere fino in fondo, e sul telefono il contratto
          arrivava dopo tre schermate. Ogni scheda risponde a una domanda
          sola: che cos'è · che cosa si fa · che cosa si consuma · quanto vale. */}
      <Tabs value={scheda} onValueChange={vaiAScheda} className="space-y-4 max-sm:space-y-3">
        <TabsList aria-label={t("Aree della manutenzione")} className="flex h-auto w-full items-stretch gap-1">
          {[
            { value: "panoramica", label: t("Panoramica"), icon: LayoutDashboard },
            { value: "lavoro", label: t("Lavoro"), icon: Wrench },
            { value: "materiali", label: t("Materiali"), icon: Package },
            ...(permissions.canViewCosts ? [{ value: "soldi", label: t("Soldi"), icon: Wallet }] : []),
          ].map((sc) => {
            const Icona = sc.icon;
            return (
              <TabsTrigger
                key={sc.value}
                value={sc.value}
                className="min-h-11 min-w-0 flex-1 flex-col gap-0.5 whitespace-normal px-1 py-1.5 text-[11px] leading-tight data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 sm:gap-1 sm:py-2 sm:text-sm lg:flex-row lg:gap-1.5 lg:px-3"
              >
                <Icona className="h-4 w-4 shrink-0" aria-hidden="true" />
                {sc.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* ── Panoramica: che cos'è, di chi è, quando si torna ── */}
        <TabsContent value="panoramica" className="mt-0">
          <div className="flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] gap-4 max-md:gap-3">
            <div className="space-y-4 max-md:space-y-3">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Settings className="h-4 w-4 text-muted-foreground" /> {t("Che cosa manuteniamo")}
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: t("Tipo"), value: impianto.tipo_impianto?.replace("_", " ") },
                    { label: t("Marca"), value: impianto.marca },
                    { label: t("Modello"), value: impianto.modello },
                    { label: t("Matricola"), value: impianto.matricola },
                    { label: t("Data installazione"), value: impianto.data_installazione ? format(new Date(impianto.data_installazione), "dd MMM yyyy", { locale: dateFnsCampo() }) : null },
                    { label: t("Scadenza garanzia"), value: impianto.garanzia_scadenza ? format(new Date(impianto.garanzia_scadenza), "dd MMM yyyy", { locale: dateFnsCampo() }) : null },
                  ].map((f) => f.value && (
                    <div key={f.label}>
                      <div className="text-xs text-muted-foreground">{f.label}</div>
                      <div className="mt-0.5 font-medium capitalize">{f.value}</div>
                    </div>
                  ))}
                </div>
                {garanziaGiorni !== null && (
                  <Badge className={garanziaGiorni < 0 ? "bg-red-100 text-red-800" : garanziaGiorni < 90 ? "bg-yellow-100 text-yellow-800" : "bg-emerald-100 text-emerald-700"}>
                    {garanziaGiorni < 0 ? t("Garanzia scaduta {valore}gg fa", { valore: Math.abs(garanziaGiorni) }) : t("Garanzia valida ancora {garanziaGiorni} giorni", { garanziaGiorni: String(garanziaGiorni ?? "") })}
                  </Badge>
                )}
                {impianto.note_tecniche && (
                  <div className="rounded bg-muted/50 p-3 text-sm text-muted-foreground">{impianto.note_tecniche}</div>
                )}
                {/* Foto dell'impianto (targa, matricola, posizione). Le foto di ogni
                    intervento stanno nei rapportini. */}
                {Array.isArray((impianto as { foto_urls?: string[] | null }).foto_urls) &&
                  ((impianto as { foto_urls?: string[] | null }).foto_urls?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Camera className="h-3.5 w-3.5" /> {t("Foto")}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {(impianto as { foto_urls?: string[] | null }).foto_urls!.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                             className="h-16 w-16 overflow-hidden rounded border transition-opacity hover:opacity-80">
                            <img loading="lazy" src={url} alt={t("Foto {i}", { i: i + 1 })} className="h-full w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>

            </div>
            <div className="space-y-4 max-md:space-y-3">
            {/* Piano di manutenzione */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Calendar className="h-4 w-4 text-muted-foreground" /> {t("Ogni quanto si torna")}
                    {piani.length > 0 && <span className="text-muted-foreground">({piani.length})</span>}
                  </h3>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={permissions.solaLettura || errorePiani || piani.length === 0}
                          onClick={() => { setSelectedPianoId(piani[0]?.id ?? null); setEsecuzioneOpen(true); }}>
                    <Plus className="h-3.5 w-3.5" /> {t("Segna la visita fatta")}
                  </Button>
                </div>
                {caricamentoPiani ? (
                  <Skeleton className="h-14" />
                ) : errorePiani ? (
                  <div className="flex items-center justify-between gap-3 text-sm" role="alert">
                    <span>{t("Non riesco a leggere la ricorrenza.")}</span>
                    <Button size="sm" variant="outline" onClick={() => void ricaricaPiani()}>{t("Riprova")}</Button>
                  </div>
                ) : piani.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("Non è ancora stabilito ogni quanto si torna.")}</p>
                ) : (
                  <div className="space-y-2">
                    {piani.map((piano) => (
                      <div key={piano.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-sm font-medium">{piano.titolo}</span>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {piano.frequenza_tipo} {t("· Prossima:")} {piano.prossima_scadenza ? format(new Date(piano.prossima_scadenza), "dd MMM yyyy", { locale: dateFnsCampo() }) : "—"}
                              {piano.ultima_esecuzione && t(" · Ultima: {valore}", { valore: format(new Date(piano.ultima_esecuzione), "dd MMM yyyy", { locale: dateFnsCampo() }) })}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={permissions.solaLettura} onClick={() => { setSelectedPianoId(piano.id); setEsecuzioneOpen(true); }}>
                            {t("Esegui")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>


              {/* Chi se ne occupa: prima era scritto solo dentro la ricorrenza,
                  e dalla scheda non si capiva di chi fosse il lavoro. */}
              <Card>
                <CardContent className="space-y-2 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4 text-muted-foreground" /> {t("Chi se ne occupa")}
                  </h3>
                  <p className="text-sm">{incaricato || <span className="text-muted-foreground">{t("Nessuno assegnato")}</span>}</p>
                </CardContent>
              </Card>

            {/* Contratto */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-muted-foreground" /> {t("Contratto")}
                </h3>
                {!contratto ? (
                  <p className="text-sm text-muted-foreground">{t("Nessun contratto collegato a questa manutenzione.")}</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{contratto.nome_contratto}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t("{tipo_fatturazione} · Inizio {valore}", { tipo_fatturazione: String(contratto.tipo_fatturazione ?? ""), valore: format(new Date(contratto.data_inizio), "dd/MM/yyyy") })}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-bold text-violet-700">€{Number(contratto.importo_canone).toFixed(2)}</div>
                        <Badge className={cn("text-xs capitalize", contratto.stato === "attivo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>{contratto.stato}</Badge>
                      </div>
                    </div>
                    {contratto.rinnovo_automatico && <Badge className="bg-blue-100 text-blue-800 text-xs">{t("Rinnovo automatico")}</Badge>}
                    {contratto.note && <p className="rounded bg-muted/50 p-2 text-muted-foreground">{contratto.note}</p>}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button variant="outline" size="sm" className="w-full gap-2 sm:flex-1" disabled={permissions.solaLettura} onClick={apriModificaContratto}>
                        <Pencil className="h-4 w-4" /> {t("Modifica")}
                      </Button>
                      <Button variant="outline" size="sm" className="w-full gap-2 sm:flex-1" disabled={permissions.solaLettura} onClick={() => setFatturaOpen(true)}>
                        <Receipt className="h-4 w-4" /> {t("Fattura canone")}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Lavoro: che cosa si fa, chi ci va, che cosa è stato fatto ── */}
        <TabsContent value="lavoro" className="mt-0">
          <div className="space-y-4 max-md:space-y-3">
            {/* Interventi sull'impianto */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Wrench className="h-4 w-4 text-muted-foreground" /> {t("Interventi")}
                    {interventiImpianto.length > 0 && <span className="text-muted-foreground">({interventiImpianto.length})</span>}
                  </h3>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={permissions.solaLettura} onClick={() => setNuovoInterventoOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> {t("Nuovo intervento")}
                  </Button>
                </div>
                {interventiImpianto.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("Nessun intervento registrato.")}</p>
                ) : (
                  <div className="space-y-2">
                    {interventiImpianto.map((iv: any) => (
                      <button key={iv.id} type="button"
                              className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                              onClick={() => navigate(`/azienda/assistenza/${iv.id}`)}>
                        <div className="flex min-w-0 items-center gap-3">
                          <Wrench className="h-4 w-4 shrink-0 text-orange-500" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{iv.subject}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {iv.tipo ?? t("supporto")} · {format(new Date(iv.created_at), "dd MMM yyyy", { locale: dateFnsCampo() })}
                              {iv.data_intervento_prevista && t(" · Previsto {valore}", { valore: format(new Date(iv.data_intervento_prevista), "dd MMM yyyy", { locale: dateFnsCampo() }) })}
                            </div>
                          </div>
                        </div>
                        <Badge className={cn("shrink-0 text-[10px]", iv.status === "risolto" ? "bg-emerald-100 text-emerald-700" : iv.status === "in_lavorazione" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600")}>
                          {iv.status === "risolto" ? t("Risolto") : iv.status === "in_lavorazione" ? t("In lavorazione") : t("Aperto")}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>


            <Card>
              <CardContent className="space-y-2 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <ClipboardCheck className="h-4 w-4 text-muted-foreground" /> {t("Visite fatte")}
                  {esecuzioni.length > 0 && <span className="text-muted-foreground">({esecuzioni.length})</span>}
                </h3>
                {esecuzioni.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("Nessuna visita registrata.")}</p>
                ) : (
                  <div className="space-y-2">
                    {esecuzioni.length > 0 && (
                      <div className="space-y-2 border-t pt-3">
                        <h4 className="text-xs font-medium text-muted-foreground">{t("Visite fatte")}</h4>
                        {esecuzioni.map((e) => (
                          <div key={e.id} className="flex items-start justify-between gap-2 rounded bg-muted/50 p-2.5 text-sm">
                            <div className="min-w-0">
                              <span className="font-medium">{e.piano?.titolo}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{format(new Date(e.data_esecuzione), "dd MMM yyyy", { locale: dateFnsCampo() })}</span>
                              {e.note && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{e.note}</p>}
                            </div>
                            <Badge className={cn("text-[10px]", e.esito === "ok" ? "bg-emerald-100 text-emerald-700" : e.esito === "anomalia_rilevata" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600")}>
                              {e.esito === "ok" ? "OK" : e.esito === "anomalia_rilevata" ? t("Anomalia") : t("Rinviata")}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <RapportiniIntervento impiantoId={id} />
          </div>
        </TabsContent>

        {/* ── Materiali: che cosa è stato consumato ──
            I dati c'erano già dentro i rapportini, ma non li sommava nessuno. */}
        <TabsContent value="materiali" className="mt-0">
          <Card>
            <CardContent className="space-y-3 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Package className="h-4 w-4 text-muted-foreground" /> {t("Materiali usati")}
                {righeMateriali.length > 0 && <span className="text-muted-foreground">({righeMateriali.length})</span>}
              </h3>
              {righeMateriali.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{t("Nessun materiale registrato nei rapportini di questa manutenzione.")}</p>
              ) : (
                <div className="space-y-2">
                  {righeMateriali.map((m) => (
                    <div key={m.key} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm max-sm:px-3 max-sm:py-2.5">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.nome}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {m.data ? format(new Date(m.data), "dd MMM yyyy", { locale: dateFnsCampo() }) : "—"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-semibold tabular-nums">
                        {m.quantita ?? "—"} <span className="text-xs font-normal text-muted-foreground">{m.unita}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Soldi: quanto incassiamo, quanto ci costa ──
            Si sommano gli interventi: il conto del singolo esisteva già. */}
        {permissions.canViewCosts && (
          <TabsContent value="soldi" className="mt-0">
            <div className="space-y-4 max-md:space-y-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: t("Incassato"), value: eur(incassato), tone: "text-emerald-700" },
                  { label: t("Da incassare"), value: eur(daIncassare), tone: daIncassare > 0 ? "text-amber-700" : "text-foreground" },
                  { label: t("Costi"), value: eur(costoTotale), tone: "text-foreground" },
                  { label: t("Margine"), value: eur(margine), tone: margine < 0 ? "text-red-700" : "text-emerald-700" },
                ].map((k) => (
                  <Card key={k.label}>
                    <CardContent className="p-4 max-sm:p-3">
                      <div className="text-xs text-muted-foreground">{k.label}</div>
                      <div className={cn("mt-1 text-xl font-bold tabular-nums max-sm:text-lg", k.tone)}>{k.value}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardContent className="space-y-2 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Receipt className="h-4 w-4 text-muted-foreground" /> {t("Interventi a pagamento")}
                  </h3>
                  {interventiSoldi.filter((iv) => iv.a_pagamento).length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">{t("Nessun intervento a pagamento.")}</p>
                  ) : (
                    <div className="space-y-2">
                      {interventiSoldi.filter((iv) => iv.a_pagamento).map((iv) => (
                        <button key={iv.id} type="button"
                                className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/50"
                                onClick={() => navigate(`/azienda/assistenza/${iv.id}`)}>
                          <span className="min-w-0 truncate font-medium">{iv.subject}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-semibold tabular-nums">{eur(importoDi(iv))}</span>
                            <Badge className={cn("text-[10px]", iv.pagato ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                              {iv.pagato ? t("Pagato") : t("Da incassare")}
                            </Badge>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {costoGaranzia > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold">{t("Quanto ci costa la garanzia")}</h3>
                    <p className="mt-1 text-xl font-bold tabular-nums">{eur(costoGaranzia)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("Interventi che nessuno paga: ore, trasferte e materiale a nostro carico.")}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Modifica impianto */}
      <Dialog open={modificaOpen} onOpenChange={setModificaOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Modifica manutenzione")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="imp-tipo">{t("Che cosa manuteniamo *")}</Label>
              <Input
                id="imp-tipo"
                value={formImpianto.tipo_impianto}
                onChange={(e) => setFormImpianto((f) => ({ ...f, tipo_impianto: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="imp-marca">{t("Marca")}</Label>
                <Input id="imp-marca" value={formImpianto.marca} onChange={(e) => setFormImpianto((f) => ({ ...f, marca: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-modello">{t("Modello")}</Label>
                <Input id="imp-modello" value={formImpianto.modello} onChange={(e) => setFormImpianto((f) => ({ ...f, modello: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imp-matricola">{t("Matricola")}</Label>
              <Input id="imp-matricola" value={formImpianto.matricola} onChange={(e) => setFormImpianto((f) => ({ ...f, matricola: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="imp-installazione">{t("Data installazione")}</Label>
                <Input id="imp-installazione" type="date" value={formImpianto.data_installazione} onChange={(e) => setFormImpianto((f) => ({ ...f, data_installazione: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-garanzia">{t("Scadenza garanzia")}</Label>
                <Input id="imp-garanzia" type="date" value={formImpianto.garanzia_scadenza} onChange={(e) => setFormImpianto((f) => ({ ...f, garanzia_scadenza: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imp-note">{t("Note tecniche")}</Label>
              <Textarea id="imp-note" rows={3} value={formImpianto.note_tecniche} onChange={(e) => setFormImpianto((f) => ({ ...f, note_tecniche: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto max-sm:hidden" onClick={() => setModificaOpen(false)}>{t("Annulla")}</Button>
            <Button className="w-full sm:w-auto" onClick={() => salvaImpianto.mutate()} disabled={permissions.solaLettura || salvaImpianto.isPending}>
              {salvaImpianto.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("Salvataggio...")}</> : t("Salva")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modifica contratto */}
      <Dialog open={modificaContrattoOpen} onOpenChange={setModificaContrattoOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Modifica contratto")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ctr-nome">{t("Nome contratto *")}</Label>
              <Input id="ctr-nome" value={formContratto.nome_contratto} onChange={(e) => setFormContratto((f) => ({ ...f, nome_contratto: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ctr-canone">{t("Canone (€)")}</Label>
                <Input id="ctr-canone" inputMode="decimal" value={formContratto.importo_canone} onChange={(e) => setFormContratto((f) => ({ ...f, importo_canone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ctr-stato">{t("Stato")}</Label>
                <Select value={formContratto.stato} onValueChange={(v) => setFormContratto((f) => ({ ...f, stato: v }))}>
                  <SelectTrigger id="ctr-stato"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attivo">{t("Attivo")}</SelectItem>
                    <SelectItem value="sospeso">{t("Sospeso")}</SelectItem>
                    <SelectItem value="cessato">{t("Cessato")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ctr-inizio">{t("Data inizio *")}</Label>
                <Input id="ctr-inizio" type="date" value={formContratto.data_inizio} onChange={(e) => setFormContratto((f) => ({ ...f, data_inizio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ctr-scadenza">{t("Data scadenza")}</Label>
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
              {t("Rinnovo automatico")}
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="ctr-note">{t("Note")}</Label>
              <Textarea id="ctr-note" rows={3} value={formContratto.note} onChange={(e) => setFormContratto((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto max-sm:hidden" onClick={() => setModificaContrattoOpen(false)}>{t("Annulla")}</Button>
            <Button className="w-full sm:w-auto" onClick={() => salvaContratto.mutate()} disabled={permissions.solaLettura || salvaContratto.isPending}>
              {salvaContratto.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("Salvataggio...")}</> : t("Salva")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archivia / ripristina impianto */}
      <AlertDialog open={archiviaOpen} onOpenChange={setArchiviaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {impianto.attivo === false ? t("Ripristinare la manutenzione?") : t("Archiviare la manutenzione?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {impianto.attivo === false
                ? t("Tornerà nell’elenco insieme alle manutenzioni attive.")
                : t("Esce dall'elenco manutenzione. Contratti, piani e interventi restano collegati e consultabili, e si può ripristinare quando vuoi: per questo non si cancella.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={permissions.solaLettura || cambiaArchiviazione.isPending}
              onClick={(e) => { e.preventDefault(); cambiaArchiviazione.mutate(impianto.attivo === false); }}
            >
              {impianto.attivo === false ? t("Ripristina") : t("Archivia")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog nuovo intervento */}
      <NuovoInterventoDialog
        open={nuovoInterventoOpen && !permissions.solaLettura}
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
          <DialogHeader><DialogTitle><span className="max-sm:hidden">{t("Registra Esecuzione Manutenzione")}</span><span className="sm:hidden">{t("Registra esecuzione")}</span></DialogTitle></DialogHeader>
          <div className="space-y-4 max-sm:space-y-3">
            {piani.length > 1 && (
              <div className="space-y-1.5">
                <Label>{t("Piano")}</Label>
                <Select value={selectedPianoId ?? ""} onValueChange={setSelectedPianoId}>
                  <SelectTrigger aria-label={t("Piano di manutenzione")}><SelectValue placeholder={t("Seleziona piano...")} /></SelectTrigger>
                  <SelectContent>
                    {piani.map((p) => <SelectItem key={p.id} value={p.id}>{p.titolo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Mobile: data ed esito affiancati. */}
            <div className="space-y-4 max-sm:grid max-sm:grid-cols-2 max-sm:gap-3 max-sm:space-y-0">
            <div className="space-y-1.5">
              <Label htmlFor="manutenzione-data-esecuzione">{t("Data")} <span className="max-sm:hidden">{t("esecuzione")}</span> <span className="text-destructive">*</span></Label>
              <Input
                id="manutenzione-data-esecuzione"
                type="date"
                value={esecuzioneForm.data}
                onChange={(e) => setEsecuzioneForm((f) => ({ ...f, data: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manutenzione-esito">{t("Esito")}</Label>
              <Select value={esecuzioneForm.esito} onValueChange={(v) => setEsecuzioneForm((f) => ({ ...f, esito: v }))}>
                <SelectTrigger id="manutenzione-esito"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ok">{t("OK — Tutto regolare")}</SelectItem>
                  <SelectItem value="anomalia_rilevata">{t("Anomalia rilevata")}</SelectItem>
                  <SelectItem value="rinviata">{t("Rinviata")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manutenzione-note-esecuzione">{t("Note")}</Label>
              <Textarea id="manutenzione-note-esecuzione" value={esecuzioneForm.note} onChange={(e) => setEsecuzioneForm((f) => ({ ...f, note: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="max-sm:hidden" onClick={() => setEsecuzioneOpen(false)}>{t("Annulla")}</Button>
            <Button onClick={() => registraEsecuzioneMutation.mutate()} disabled={permissions.solaLettura || registraEsecuzioneMutation.isPending}>
              {registraEsecuzioneMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("Salva")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scrivi al cliente dell'impianto: WhatsApp o Email. */}
      <QuickContactSendDialog
        open={contattoCanale !== null}
        onOpenChange={(o) => { if (!o) setContattoCanale(null); }}
        contactId={(impianto.customer as { id?: string } | null)?.id ?? null}
        name={[(impianto.customer as { first_name?: string | null } | null)?.first_name, (impianto.customer as { last_name?: string | null } | null)?.last_name].filter(Boolean).join(" ") || null}
        phone={(impianto.customer as { phone?: string | null } | null)?.phone}
        email={(impianto.customer as { email?: string | null } | null)?.email}
        context={impianto.tipo_impianto ? `Impianto ${impianto.tipo_impianto}` : "Impianto"}
        defaultChannel={contattoCanale ?? "whatsapp"}
      />

      {/* Fattura del canone di manutenzione. */}
      <CreaFatturaAssistenzaDialog
        open={fatturaOpen && !permissions.solaLettura}
        onOpenChange={setFatturaOpen}
        customerId={(impianto.customer as { id?: string } | null)?.id ?? null}
        customerName={[(impianto.customer as { first_name?: string | null } | null)?.first_name, (impianto.customer as { last_name?: string | null } | null)?.last_name].filter(Boolean).join(" ") || "Cliente"}
        defaultDescrizione={contratto?.nome_contratto
          ? `Canone manutenzione — ${contratto.nome_contratto}`
          : `Manutenzione ${impianto.tipo_impianto ?? ""}`.trim()}
        defaultImporto={Number(contratto?.importo_canone ?? 0)}
        defaultNota={contratto?.nome_contratto ? `Rif. contratto ${contratto.nome_contratto}` : "Rif. manutenzione"}
      />
    </div>
  );
}
