import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronRight, ChevronLeft, Check, Tag } from "lucide-react";
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
  const [step, setStep] = useState(1);

  // Step 1 fields
  const [customerId, setCustomerId] = useState("");
  const [tipoImpianto, setTipoImpianto] = useState("");
  const [marca, setMarca] = useState("");
  const [modello, setModello] = useState("");
  const [matricola, setMatricola] = useState("");
  const [dataInstallazione, setDataInstallazione] = useState("");
  const [garanziaScadenza, setGaranziaScadenza] = useState("");

  // Step 2 fields
  const [hasPiano, setHasPiano] = useState(false);
  const [titoloManutenzione, setTitoloManutenzione] = useState("Manutenzione ordinaria");
  const [frequenza, setFrequenza] = useState("annuale");
  const [primaManutenzione, setPrimaManutenzione] = useState("");
  const [tecnicoPreferito, setTecnicoPreferito] = useState("__none__");

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

      // 1. Crea impianto
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
        })
        .select()
        .single();
      if (impErr) throw impErr;

      // 2. Crea contratto se richiesto
      let contrattoId: string | null = null;
      if (hasContratto && nomeContratto.trim() && importoCanone) {
        const { data: contratto, error: contErr } = await supabase
          .from("contratti_manutenzione")
          .insert({
            company_id: companyId,
            impianto_id: impianto.id,
            customer_id: customerId,
            nome_contratto: nomeContratto.trim(),
            importo_canone: parseFloat(importoCanone),
            tipo_fatturazione: tipoFatturazione,
            data_inizio: new Date().toISOString().split("T")[0],
            rinnovo_automatico: rinnovoAutomatico,
          })
          .select()
          .single();
        if (contErr) throw contErr;
        contrattoId = contratto.id;
      }

      // 3. Crea piano se richiesto (contratto opzionale)
      if (hasPiano && titoloManutenzione.trim()) {
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
      }
    },
    onSuccess: () => {
      toast.success("Impianto registrato con successo");
      onSuccess();
      handleClose();
    },
    onError: (err: Error) => toast.error(err.message || "Errore nel salvataggio"),
  });

  const handleClose = () => {
    setStep(1);
    setCustomerId(""); setTipoImpianto(""); setMarca(""); setModello(""); setMatricola("");
    setDataInstallazione(""); setGaranziaScadenza("");
    setHasPiano(false); setTitoloManutenzione("Manutenzione ordinaria"); setFrequenza("annuale");
    setPrimaManutenzione(""); setTecnicoPreferito("__none__");
    setHasContratto(false); setNomeContratto(""); setImportoCanone(""); setTipoFatturazione("annuale");
    setRinnovoAutomatico(true);
    setCanoneTipoImpiantoId(""); setCanoneTipoInterventoId("");
    onClose();
  };

  const canNext1 = !!customerId && !!tipoImpianto;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo Impianto</DialogTitle>
          <div className="flex gap-1 mt-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`flex-1 h-1 rounded-full ${s <= step ? "bg-blue-500" : "bg-gray-200"}`} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Passo {step} di 3: {step === 1 ? "Cliente e impianto" : step === 2 ? "Piano manutenzione" : "Contratto"}
          </p>
        </DialogHeader>

        <div className="space-y-4 min-h-[240px]">
          {/* Step 1 */}
          {step === 1 && (
            <>
              <div className="space-y-1.5">
                <Label>Cliente *</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Seleziona cliente..." /></SelectTrigger>
                  <SelectContent>
                    {clienti.map((c) => <SelectItem key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo impianto *</Label>
                <Select value={tipoImpianto} onValueChange={setTipoImpianto}>
                  <SelectTrigger><SelectValue placeholder="Seleziona tipo..." /></SelectTrigger>
                  <SelectContent>
                    {TIPI_IMPIANTO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Marca</Label>
                  <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Es. Baxi" />
                </div>
                <div className="space-y-1.5">
                  <Label>Modello</Label>
                  <Input value={modello} onChange={(e) => setModello(e.target.value)} placeholder="Es. Luna3" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Data installazione</Label>
                  <Input type="date" value={dataInstallazione} onChange={(e) => setDataInstallazione(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Scadenza garanzia</Label>
                  <Input type="date" value={garanziaScadenza} onChange={(e) => setGaranziaScadenza(e.target.value)} />
                </div>
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
                <div className="space-y-3 pl-7">
                  <div className="space-y-1.5">
                    <Label>Titolo piano</Label>
                    <Input value={titoloManutenzione} onChange={(e) => setTitoloManutenzione(e.target.value)} />
                    <p className="text-xs text-muted-foreground mt-1">
                      Puoi aggiungere un contratto a pagamento nel passo successivo.
                      Il piano funziona anche senza contratto.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Frequenza</Label>
                      <Select value={frequenza} onValueChange={setFrequenza}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FREQUENZE.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Prima manutenzione</Label>
                      <Input type="date" value={primaManutenzione} onChange={(e) => setPrimaManutenzione(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tecnico preferito</Label>
                    <Select value={tecnicoPreferito} onValueChange={setTecnicoPreferito}>
                      <SelectTrigger><SelectValue placeholder="Qualsiasi tecnico" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Qualsiasi tecnico</SelectItem>
                        {tecnici.map((t) => <SelectItem key={t.id} value={t.id}>{[t.first_name, t.last_name].filter(Boolean).join(" ") || t.id}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
                <div className="space-y-3 pl-7">
                  <div className="space-y-1.5">
                    <Label>Nome contratto</Label>
                    <Input value={nomeContratto} onChange={(e) => setNomeContratto(e.target.value)} placeholder="Es. Manutenzione Caldaia Annuale" />
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
                          <Label className="text-xs">Tipo impianto</Label>
                          <Select value={canoneTipoImpiantoId} onValueChange={setCanoneTipoImpiantoId}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                            <SelectContent>
                              {tipiImpianto.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Tipo intervento</Label>
                          <Select value={canoneTipoInterventoId} onValueChange={setCanoneTipoInterventoId}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
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
                                  {prezzoListino.prezzo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
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
                      <Label>Importo canone (€)</Label>
                      <Input type="number" min="0" step="0.01" value={importoCanone} onChange={(e) => setImportoCanone(e.target.value)} placeholder="150.00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tipo fatturazione</Label>
                      <Select value={tipoFatturazione} onValueChange={setTipoFatturazione}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
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
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={step === 1 ? handleClose : () => setStep((s) => s - 1)}>
            {step === 1 ? "Annulla" : <><ChevronLeft className="h-4 w-4 mr-1" />Indietro</>}
          </Button>
          <div className="flex gap-2">
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !canNext1}>
                Avanti <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-1" />}
                Salva Impianto
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
