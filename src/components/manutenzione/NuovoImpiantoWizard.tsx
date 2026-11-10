import { useDialogFocusReturn } from "@/hooks/useDialogFocusReturn";
import { useState, useId, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronRight, ChevronLeft, Check, Tag, UserPlus, Users, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useTipiImpianto, useTipiIntervento } from "@/lib/manutenzione/tipiManutenzione";
import { usePrezzoIntervento } from "@/lib/manutenzione/prezzoIntervento";

const TIPI_IMPIANTO = [
  { value: "caldaia", label: "🔥 Caldaia" },
  { value: "fotovoltaico", label: "☀️ Fotovoltaico" },
  { value: "climatizzatore", label: "❄️ Climatizzatore" },
  { value: "impianto_elettrico", label: "⚡ Impianto Elettrico" },
  { value: "infissi", label: "🪟 Infissi" },
  { value: "idraulico", label: "💧 Idraulico" },
  { value: "altro", label: "🔧 Altro" },
];

const FREQUENZE = [
  { value: "mensile", label: "Mensile" },
  { value: "trimestrale", label: "Trimestrale" },
  { value: "semestrale", label: "Semestrale" },
  { value: "annuale", label: "Annuale" },
];

const TIPO_FATTURAZIONE = [
  { value: "mensile", label: "Mensile" },
  { value: "trimestrale", label: "Trimestrale" },
  { value: "semestrale", label: "Semestrale" },
  { value: "annuale", label: "Annuale" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onSuccess: () => void;
}

export function NuovoImpiantoWizard({ open, onClose, companyId, onSuccess }: Props) {
  const fieldId = useId();
  const focusReturn = useDialogFocusReturn();
  const pendingRef = useRef(false);
  const progressRef = useRef({ impiantoId: null as string | null, contrattoId: null as string | null, pianoCreato: false, primoCreato: false });
  const [createdImpiantoId, setCreatedImpiantoId] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  // Step 1 fields
  const [customerId, setCustomerId] = useState("");
  const [nuovoClienteOpen, setNuovoClienteOpen] = useState(false);
  const [tipoImpianto, setTipoImpianto] = useState("");
  const [marca, setMarca] = useState("");
  const [modello, setModello] = useState("");
  const [matricola, setMatricola] = useState("");
  const [dataInstallazione, setDataInstallazione] = useState("");
  const [garanziaScadenza, setGaranziaScadenza] = useState("");
  const [noteTecniche, setNoteTecniche] = useState("");

  // Step 2 fields — piano ricorrente
  const [hasPiano, setHasPiano] = useState(false);
  const [titoloManutenzione, setTitoloManutenzione] = useState("Manutenzione ordinaria");
  const [frequenza, setFrequenza] = useState("annuale");
  const [primaManutenzione, setPrimaManutenzione] = useState("");
  const [tecnicoPreferito, setTecnicoPreferito] = useState("__none__");

  // Step 2 fields — primo intervento in calendario (una tantum)
  const [programmaPrimo, setProgrammaPrimo] = useState(false);
  const [primoData, setPrimoData] = useState("");
  const [primoTecnico, setPrimoTecnico] = useState("__none__");
  const [primoSquadra, setPrimoSquadra] = useState("__none__");
  const [primoNote, setPrimoNote] = useState("");

  // Step 3 fields
  const [hasContratto, setHasContratto] = useState(false);
  const [nomeContratto, setNomeContratto] = useState("");
  const [importoCanone, setImportoCanone] = useState("");
  const [tipoFatturazione, setTipoFatturazione] = useState("annuale");
  const [rinnovoAutomatico, setRinnovoAutomatico] = useState(true);
  // Listino manutenzione (opt-in): suggerisce il canone dal listino tariffe
  const [canoneTipoImpiantoId, setCanoneTipoImpiantoId] = useState("");
  const [canoneTipoInterventoId, setCanoneTipoInterventoId] = useState("");

  const { data: clienti = [] } = useCompanyCustomers(companyId, open);
  const { data: tecnici = [] } = useCompanyStaffUsers(open ? companyId : null, "all");
  const { data: squadre = [] } = useQuery({
    queryKey: ["squadre-interne", companyId],
    enabled: open,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_teams")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("kind", "interna")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const { data: tipiImpianto = [] } = useTipiImpianto(open ? companyId : null);
  const { data: tipiIntervento = [] } = useTipiIntervento(open ? companyId : null);
  const { data: prezzoListino, isFetching: prezzoLoading } = usePrezzoIntervento({
    companyId,
    tipoImpiantoId: canoneTipoImpiantoId || null,
    tipoInterventoId: canoneTipoInterventoId || null,
    clienteId: customerId || null,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Seleziona un cliente");
      if (!tipoImpianto) throw new Error("Seleziona il tipo di impianto");
      // Se l'utente ha scelto di creare un contratto, i campi obbligatori
      // devono essere compilati: altrimenti il contratto verrebbe saltato in
      // silenzio (l'impianto si salva ma il contratto no). Meglio un errore chiaro.
      if (hasContratto) {
        if (!nomeContratto.trim())
          throw new Error('Inserisci il nome del contratto, oppure deseleziona "Crea contratto di manutenzione".');
        if (!importoCanone.trim() || Number.isNaN(parseFloat(importoCanone)))
          throw new Error('Inserisci un importo canone valido, oppure deseleziona "Crea contratto di manutenzione".');
      }
      if (hasPiano && !titoloManutenzione.trim())
        throw new Error("Inserisci un titolo per il piano di manutenzione, oppure deseleziona l'opzione.");

      if (programmaPrimo && (!primoData || Number.isNaN(new Date(primoData).getTime())))
        throw new Error("Indica data e ora per programmare il primo intervento.");

      // Riprende le fasi già confermate senza ricreare gli oggetti precedenti.
      let impiantoId = progressRef.current.impiantoId;
      if (!impiantoId) {
        const { data: impianto, error: impErr } = await supabase
          .from("impianti_cliente")
          .insert({
            company_id: companyId,
            customer_id: customerId,
            tipo_impianto: tipoImpianto,
            marca: marca.trim() || null,
            modello: modello.trim() || null,
            matricola: matricola.trim() || null,
            data_installazione: dataInstallazione || null,
            garanzia_scadenza: garanziaScadenza || null,
            note_tecniche: noteTecniche.trim() || null,
          })
          .select()
          .single();
        if (impErr) throw impErr;
        if (!impianto?.id) throw new Error("Il server non ha restituito l’ID dell’impianto.");
        impiantoId = impianto.id;
        progressRef.current.impiantoId = impiantoId;
        setCreatedImpiantoId(impiantoId);
      }
      // 2. Crea contratto se richiesto
      let contrattoId = progressRef.current.contrattoId;
      if (hasContratto && !contrattoId) {
        const { data: contratto, error: contErr } = await supabase
          .from("contratti_manutenzione")
          .insert({
            company_id: companyId,
            impianto_id: impiantoId,
            customer_id: customerId,
            nome_contratto: nomeContratto.trim(),
            importo_canone: parseFloat(importoCanone),
            tipo_fatturazione: tipoFatturazione,
            data_inizio: new Date().toLocaleDateString("en-CA"),
            rinnovo_automatico: rinnovoAutomatico,
          })
          .select()
          .single();
        if (contErr) throw contErr;
        if (!contratto?.id) throw new Error("Il server non ha restituito l’ID del contratto.");
        contrattoId = contratto.id;
        progressRef.current.contrattoId = contrattoId;
      }

      // 3. Crea piano se richiesto (contratto opzionale)
      if (hasPiano && !progressRef.current.pianoCreato) {
        const { error: pianoErr } = await supabase
          .from("piani_manutenzione")
          .insert({
            company_id: companyId,
            contratto_id: contrattoId ?? null,
            titolo: titoloManutenzione.trim(),
            frequenza_tipo: frequenza,
            prossima_scadenza: primaManutenzione || null,
            tecnico_preferito: tecnicoPreferito && tecnicoPreferito !== "__none__" ? tecnicoPreferito : null,
          });
        if (pianoErr) throw pianoErr;
        progressRef.current.pianoCreato = true;
      }

      // 4. Programma il primo intervento (una tantum) come vero intervento
      // sull'impianto: assegnato a operaio o squadra, con data e note. Compare
      // in assistenza, nel calendario e nell'app di chi ci va.
      if (programmaPrimo && !progressRef.current.primoCreato) {
        const etichettaTipo = TIPI_IMPIANTO.find((t) => t.value === tipoImpianto)?.label?.replace(/^[^\p{L}]+/u, "").trim() || tipoImpianto;
        const { error: tErr } = await supabase
          .from("tickets")
          .insert({
            company_id: companyId,
            customer_id: customerId,
            impianto_id: impiantoId,
            subject: `Primo intervento — ${etichettaTipo}`,
            tipo: "intervento",
            status: "aperto",
            priority: "normale",
            assigned_to: primoTecnico && primoTecnico !== "__none__" ? primoTecnico : null,
            squadra_id: primoSquadra && primoSquadra !== "__none__" ? primoSquadra : null,
            data_intervento_prevista: primoData ? new Date(primoData).toISOString() : null,
            note_tecnico: primoNote.trim() || null,
          } as never);
        if (tErr) throw tErr;
        progressRef.current.primoCreato = true;
      }
    },
    onSuccess: () => {
      toast.success("Impianto registrato con successo");
      onSuccess();
      pendingRef.current = false;
      handleClose();
    },
    onError: (err: Error) => toast.error(err.message || "Errore nel salvataggio"),
    onSettled: () => { pendingRef.current = false; },
  });

  const handleClose = () => {
    if (pendingRef.current) return;
    progressRef.current = { impiantoId: null, contrattoId: null, pianoCreato: false, primoCreato: false };
    setCreatedImpiantoId(null);
    setStep(1);
    setCustomerId(""); setTipoImpianto(""); setMarca(""); setModello(""); setMatricola("");
    setDataInstallazione(""); setGaranziaScadenza(""); setNoteTecniche("");
    setHasPiano(false); setTitoloManutenzione("Manutenzione ordinaria"); setFrequenza("annuale");
    setPrimaManutenzione(""); setTecnicoPreferito("__none__");
    setProgrammaPrimo(false); setPrimoData(""); setPrimoTecnico("__none__"); setPrimoSquadra("__none__"); setPrimoNote("");
    setHasContratto(false); setNomeContratto(""); setImportoCanone(""); setTipoFatturazione("annuale");
    setRinnovoAutomatico(true);
    setCanoneTipoImpiantoId(""); setCanoneTipoInterventoId("");
    onClose();
  };

  const canNext1 = !!customerId && !!tipoImpianto;
  const canNext2 = !programmaPrimo || Boolean(primoData) && Number.isFinite(new Date(primoData).getTime());

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent {...focusReturn} aria-busy={mutation.isPending} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo Impianto</DialogTitle>
          <div className="flex gap-1 mt-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`flex-1 h-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Passo {step} di 3: {step === 1 ? "Cliente e impianto" : step === 2 ? "Manutenzione e primo intervento" : "Contratto"}
          </DialogDescription>
        </DialogHeader>

        {createdImpiantoId && mutation.isError && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            L’impianto è già stato registrato. Riprova per completare le operazioni mancanti senza ricreare quelle confermate.
            Chiudendo abbandoni il completamento in questo modulo.
          </div>
        )}
        <fieldset disabled={mutation.isPending || Boolean(createdImpiantoId)} className="space-y-4 min-h-[240px] max-sm:min-h-0 max-sm:space-y-3">
          {/* Step 1 */}
          {step === 1 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`${fieldId}-customerId`}>Cliente *</Label>
                <div className="flex gap-2">
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger id={`${fieldId}-customerId`} className="flex-1"><SelectValue placeholder="Seleziona cliente..." /></SelectTrigger>
                    <SelectContent>
                      {clienti.map((c) => <SelectItem key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {/* Cliente non ancora nel gestionale: si crea al volo. */}
                  <Button type="button" variant="outline" className="shrink-0 gap-1.5" onClick={() => setNuovoClienteOpen(true)}>
                    <UserPlus className="h-4 w-4" /><span className="max-sm:hidden">Nuovo</span>
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${fieldId}-tipoImpianto`}>Tipo impianto *</Label>
                <Select value={tipoImpianto} onValueChange={setTipoImpianto}>
                  <SelectTrigger id={`${fieldId}-tipoImpianto`}><SelectValue placeholder="Seleziona tipo..." /></SelectTrigger>
                  <SelectContent>
                    {TIPI_IMPIANTO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${fieldId}-marca`}>Marca</Label>
                  <Input id={`${fieldId}-marca`} value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Es. Baxi" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${fieldId}-modello`}>Modello</Label>
                  <Input id={`${fieldId}-modello`} value={modello} onChange={(e) => setModello(e.target.value)} placeholder="Es. Luna3" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${fieldId}-dataInstallazione`}>Data installazione</Label>
                  <Input id={`${fieldId}-dataInstallazione`} type="date" value={dataInstallazione} onChange={(e) => setDataInstallazione(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${fieldId}-garanziaScadenza`}>Scadenza garanzia</Label>
                  <Input id={`${fieldId}-garanziaScadenza`} type="date" value={garanziaScadenza} onChange={(e) => setGaranziaScadenza(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${fieldId}-noteTecniche`}>Note (posizione, matricola, accessi…)</Label>
                <Textarea id={`${fieldId}-noteTecniche`} value={noteTecniche} onChange={(e) => setNoteTecniche(e.target.value)} rows={2} placeholder="Dove si trova, come si accede, dettagli utili…" />
              </div>
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={hasPiano} onChange={(e) => setHasPiano(e.target.checked)} className="h-4 w-4 rounded" />
                <span className="font-medium">Aggiungi piano di manutenzione</span>
              </label>
              {hasPiano && (
                <div className="space-y-3 pl-7 max-sm:pl-0">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${fieldId}-titoloManutenzione`}>Titolo piano</Label>
                    <Input id={`${fieldId}-titoloManutenzione`} value={titoloManutenzione} onChange={(e) => setTitoloManutenzione(e.target.value)} />
                    <p className="text-xs text-muted-foreground mt-1 max-sm:hidden">
                      Puoi aggiungere un contratto a pagamento nel passo successivo.
                      Il piano funziona anche senza contratto.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${fieldId}-frequenza`}>Frequenza</Label>
                      <Select value={frequenza} onValueChange={setFrequenza}>
                        <SelectTrigger id={`${fieldId}-frequenza`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FREQUENZE.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${fieldId}-primaManutenzione`}>Prima manutenzione</Label>
                      <Input id={`${fieldId}-primaManutenzione`} type="date" value={primaManutenzione} onChange={(e) => setPrimaManutenzione(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${fieldId}-tecnicoPreferito`}>Tecnico preferito</Label>
                    <Select value={tecnicoPreferito} onValueChange={setTecnicoPreferito}>
                      <SelectTrigger id={`${fieldId}-tecnicoPreferito`}><SelectValue placeholder="Qualsiasi tecnico" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Qualsiasi tecnico</SelectItem>
                        {tecnici.map((t) => <SelectItem key={t.id} value={t.id}>{[t.first_name, t.last_name].filter(Boolean).join(" ") || t.id}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Primo intervento una tantum: lo fissa in calendario e lo assegna
                  a un operaio o a una squadra, come un'assistenza. */}
              <label className="flex items-center gap-3 cursor-pointer pt-1">
                <input type="checkbox" checked={programmaPrimo} onChange={(e) => setProgrammaPrimo(e.target.checked)} className="h-4 w-4 rounded" />
                <span className="flex items-center gap-1.5 font-medium"><CalendarClock className="h-4 w-4 text-muted-foreground" />Programma il primo intervento</span>
              </label>
              {programmaPrimo && (
                <div className="space-y-3 pl-7 max-sm:pl-0">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${fieldId}-primoData`}>Data e ora *</Label>
                    <Input id={`${fieldId}-primoData`} required aria-describedby={!primoData ? `${fieldId}-primo-hint` : undefined} type="datetime-local" value={primoData} onChange={(e) => setPrimoData(e.target.value)} />
                    {!primoData && <p id={`${fieldId}-primo-hint`} className="text-xs text-muted-foreground">Indica data e ora per programmare il primo intervento.</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${fieldId}-primoTecnico`}>Assegna a un operaio</Label>
                      <Select value={primoTecnico} onValueChange={setPrimoTecnico}>
                        <SelectTrigger id={`${fieldId}-primoTecnico`}><SelectValue placeholder="Nessuno" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nessuno</SelectItem>
                          {tecnici.map((t) => <SelectItem key={t.id} value={t.id}>{[t.first_name, t.last_name].filter(Boolean).join(" ") || t.id}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${fieldId}-primoSquadra`} className="flex items-center gap-1"><Users className="h-3 w-3" /> Oppure a una squadra</Label>
                      <Select value={primoSquadra} onValueChange={setPrimoSquadra}>
                        <SelectTrigger id={`${fieldId}-primoSquadra`}><SelectValue placeholder="Nessuna squadra" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nessuna squadra</SelectItem>
                          {squadre.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${fieldId}-primoNote`}>Note per chi interviene</Label>
                    <Textarea id={`${fieldId}-primoNote`} value={primoNote} onChange={(e) => setPrimoNote(e.target.value)} rows={2} placeholder="Cosa fare, materiali, accessi…" />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={hasContratto} onChange={(e) => setHasContratto(e.target.checked)} className="h-4 w-4 rounded" />
                <span className="font-medium">Crea contratto di manutenzione</span>
              </label>
              {hasContratto && (
                <div className="space-y-3 pl-7 max-sm:pl-0">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${fieldId}-nomeContratto`}>Nome contratto</Label>
                    <Input id={`${fieldId}-nomeContratto`} value={nomeContratto} onChange={(e) => setNomeContratto(e.target.value)} placeholder="Es. Manutenzione Caldaia Annuale" />
                  </div>

                  {/* Suggerimento canone dal listino manutenzione (opt-in: solo se l'azienda ha configurato il listino) */}
                  {tipiImpianto.length > 0 && (
                    <div className="rounded-lg border border-dashed border-teal-300 bg-teal-50/50 p-3 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700">
                        <Tag className="h-3.5 w-3.5" />
                        Suggerisci canone dal listino
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor={`${fieldId}-canoneTipoImpiantoId`} className="text-xs">Tipo impianto</Label>
                          <Select value={canoneTipoImpiantoId} onValueChange={setCanoneTipoImpiantoId}>
                            <SelectTrigger id={`${fieldId}-canoneTipoImpiantoId`} className="h-9"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                            <SelectContent>
                              {tipiImpianto.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${fieldId}-canoneTipoInterventoId`} className="text-xs">Tipo intervento</Label>
                          <Select value={canoneTipoInterventoId} onValueChange={setCanoneTipoInterventoId}>
                            <SelectTrigger id={`${fieldId}-canoneTipoInterventoId`} className="h-9"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                            <SelectContent>
                              {tipiIntervento.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {canoneTipoImpiantoId && canoneTipoInterventoId && (
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          {prezzoLoading ? (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" /> Ricerca prezzo…
                            </span>
                          ) : prezzoListino ? (
                            <>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-semibold text-teal-700">
                                  {prezzoListino.prezzo.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" })}
                                </span>
                                {prezzoListino.iva != null && (
                                  <span className="text-xs text-muted-foreground">+ IVA {prezzoListino.iva}%</span>
                                )}
                                {prezzoListino.da_override && (
                                  <Badge variant="secondary" className="text-[10px]">Prezzo cliente</Badge>
                                )}
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setImportoCanone(String(prezzoListino.prezzo))}
                              >
                                Usa come canone
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Nessuna tariffa a listino per questa combinazione.</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${fieldId}-importoCanone`}>Importo canone (€)</Label>
                      <Input id={`${fieldId}-importoCanone`} type="number" min="0" step="0.01" value={importoCanone} onChange={(e) => setImportoCanone(e.target.value)} placeholder="150.00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${fieldId}-tipoFatturazione`}>Tipo fatturazione</Label>
                      <Select value={tipoFatturazione} onValueChange={setTipoFatturazione}>
                        <SelectTrigger id={`${fieldId}-tipoFatturazione`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIPO_FATTURAZIONE.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={rinnovoAutomatico} onChange={(e) => setRinnovoAutomatico(e.target.checked)} className="h-4 w-4 rounded" />
                    <span className="text-sm">Rinnovo automatico</span>
                  </label>
                  {(!nomeContratto.trim() || !importoCanone.trim()) && (
                    <p className="text-xs text-amber-600">
                      Compila nome e importo per creare il contratto, oppure deseleziona l&apos;opzione qui sopra.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </fieldset>

        <DialogFooter className="flex justify-between">
          {/* Mobile: al primo passo «Annulla» è la X; il bottone avanti riempie la riga. */}
          <Button variant="outline" disabled={mutation.isPending || Boolean(createdImpiantoId)} className={step === 1 ? "max-sm:hidden" : undefined} onClick={step === 1 ? handleClose : () => setStep((s) => s - 1)}>
            {step === 1 ? "Annulla" : <><ChevronLeft className="h-4 w-4 mr-1" />Indietro</>}
          </Button>
          <div className="flex gap-2 max-sm:[&>button]:w-full">
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={mutation.isPending || (step === 1 && !canNext1) || (step === 2 && !canNext2)}>
                Avanti <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={() => {
                if (pendingRef.current) return;
                pendingRef.current = true;
                mutation.mutate();
              }} disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-1" />}
                {createdImpiantoId ? "Completa impianto" : "Salva Impianto"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <CreateCustomerDialog
      open={nuovoClienteOpen}
      onOpenChange={setNuovoClienteOpen}
      onCustomerCreated={(id) => { setCustomerId(id); setNuovoClienteOpen(false); }}
    />
    </>
  );
}
