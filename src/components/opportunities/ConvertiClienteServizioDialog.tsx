/**
 * ConvertiClienteServizioDialog — trasforma un'opportunita' VINTA del CRM di
 * piattaforma in un cliente-servizio AEDIX.
 *
 * E' l'anello che mancava. Prima d'ora `aedix_service_clients` si popolava solo
 * a mano dalla pagina Clienti-Servizio, e la colonna `opportunity_id` non la
 * scriveva nessuno: la trattativa vinta e la relazione ricorrente restavano due
 * mondi separati, e Fatturato Servizi non poteva che restare vuoto.
 *
 * Qui si precompila tutto quello che l'opportunita' sa gia' (cliente, servizio,
 * pacchetto, importo) e si lascia correggere il resto. Il modello di incasso si
 * propone dalla ricorrenza del servizio ma resta modificabile: lo stesso
 * servizio puo' essere venduto a retainer a un cliente e a provvigione a un
 * altro.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, Plus, Trash2, HandCoins } from "lucide-react";
import { ServizioAedixFields, useAedixProductLines, useAedixPackages } from "./ServizioAedixFields";

const sb = () => supabase as any;

const BILLING = [
  { value: "retainer_fisso", label: "Retainer fisso" },
  { value: "provvigione", label: "Provvigione %" },
  { value: "performance", label: "Performance" },
  { value: "una_tantum", label: "Una-tantum" },
];
const RICORRENZE = [
  { value: "mensile", label: "Mensile" },
  { value: "annuale", label: "Annuale" },
  { value: "una_tantum", label: "Una-tantum" },
];
const COMM_BASE = [
  { value: "fatturato", label: "Fatturato cliente" },
  { value: "incassato", label: "Incassato cliente" },
];

interface CommLine { etichetta: string; base: string; percentuale: number }

interface Props {
  opportunity: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome leggibile del cliente, gia' risolto dal chiamante (contatto o azienda). */
  clienteNome: string;
  onConverted?: () => void;
}

export function ConvertiClienteServizioDialog({
  opportunity, open, onOpenChange, clienteNome, onConverted,
}: Props) {
  const qc = useQueryClient();

  const [productLineId, setProductLineId] = useState<string | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [billingModel, setBillingModel] = useState("retainer_fisso");
  const [importo, setImporto] = useState("0");
  const [ricorrenza, setRicorrenza] = useState("mensile");
  const [dataInizio, setDataInizio] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [commLines, setCommLines] = useState<CommLine[]>([{ etichetta: "", base: "fatturato", percentuale: 0 }]);

  const { data: lines = [] } = useAedixProductLines(open);
  const { data: packages = [] } = useAedixPackages(productLineId, open);

  // Precompilazione all'apertura: si riparte sempre dai dati dell'opportunita',
  // cosi' riaprire il dialog dopo un annullamento non lascia residui.
  useEffect(() => {
    if (!open) return;
    setProductLineId(opportunity?.product_line_id ?? null);
    setPackageId(opportunity?.package_id ?? null);
    setNome(clienteNome || opportunity?.company_name || opportunity?.name || "");
    setImporto(String(Number(opportunity?.value) || 0));
    setDataInizio(new Date().toISOString().slice(0, 10));
    setNote("");
    setCommLines([{ etichetta: "", base: "fatturato", percentuale: 0 }]);
  }, [open, opportunity, clienteNome]);

  const linea = useMemo(() => lines.find((l) => l.id === productLineId), [lines, productLineId]);
  const pacchetto = useMemo(() => packages.find((p) => p.id === packageId), [packages, packageId]);

  // La ricorrenza la detta il servizio (o il pacchetto, se piu' specifico); il
  // modello di incasso si propone da li' ma resta una scelta dell'utente.
  useEffect(() => {
    const r = pacchetto?.ricorrenza || linea?.ricorrenza;
    if (!r) return;
    setRicorrenza(r);
    setBillingModel((prev) => (prev === "provvigione" || prev === "performance" ? prev : r === "una_tantum" ? "una_tantum" : "retainer_fisso"));
  }, [linea, pacchetto]);

  // Il prezzo del pacchetto vince sul valore dell'opportunita' solo se questa
  // non ne aveva uno: nel CRM di piattaforma il valore e' spesso 0.
  useEffect(() => {
    if (pacchetto?.prezzo && !(Number(opportunity?.value) > 0)) setImporto(String(Number(pacchetto.prezzo)));
  }, [pacchetto, opportunity]);

  const isProv = billingModel === "provvigione";

  const converti = useMutation({
    mutationFn: async () => {
      if (!productLineId) throw new Error("Scegli il servizio venduto");
      if (!nome.trim()) throw new Error("Manca il nome del cliente");
      // Il contatto e' l'identita' del cliente-servizio (NOT NULL a database):
      // e' cio' che permette di sommare gli acquisti ripetuti della stessa
      // persona. Un'opportunita' senza contatto non puo' diventare un cliente.
      if (!opportunity?.contact_id) {
        throw new Error("Questa opportunità non è collegata a un contatto: collegalo prima di convertirla");
      }

      const attive = commLines.filter((l) => Number(l.percentuale) > 0);
      const { data, error } = await sb()
        .from("aedix_service_clients")
        .insert({
          product_line_id: productLineId,
          package_id: packageId,
          contact_id: opportunity.contact_id,
          company_id: null,
          cliente_nome: nome.trim(),
          billing_model: billingModel,
          importo: isProv ? 0 : Number(importo) || 0,
          provvigione_pct: isProv ? (attive[0] ? Number(attive[0].percentuale) || 0 : null) : null,
          ricorrenza,
          stato: "attivo",
          data_inizio: dataInizio,
          opportunity_id: opportunity?.id ?? null,
          note: note.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const clientId = (data as { id: string }).id;
      if (isProv && attive.length) {
        const { error: e2 } = await sb().from("aedix_service_commission_lines").insert(
          attive.map((l, i) => ({
            service_client_id: clientId,
            etichetta: l.etichetta.trim() || null,
            base: l.base,
            percentuale: Number(l.percentuale) || 0,
            ordine: i,
            attivo: true,
          }))
        );
        if (e2) throw e2;
      }

      // Il tag sull'opportunita' si allinea a quanto deciso qui: se la
      // conversione ha corretto servizio/pacchetto, la trattativa deve
      // raccontare la stessa storia.
      if (opportunity?.id) {
        await supabase
          .from("marketing_opportunities")
          .update({ product_line_id: productLineId, package_id: packageId })
          .eq("id", opportunity.id);
      }
      return clientId;
    },
    onSuccess: () => {
      toast.success("Cliente-servizio creato", {
        description: "Da ora entra in Clienti Servizi e nel Fatturato Servizi.",
      });
      qc.invalidateQueries({ queryKey: ["aedix-service-clients"] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      onConverted?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Conversione non riuscita", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-4 w-4" /> Trasforma in cliente-servizio
          </DialogTitle>
          <DialogDescription>
            La trattativa vinta diventa una relazione ricorrente, con i suoi incassi mensili.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ServizioAedixFields
            productLineId={productLineId}
            packageId={packageId}
            onChange={({ productLineId: pl, packageId: pk }) => { setProductLineId(pl); setPackageId(pk); }}
          />

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cliente</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome del cliente" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Come paga</Label>
              <Select value={billingModel} onValueChange={setBillingModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ogni quanto</Label>
              <Select value={ricorrenza} onValueChange={setRicorrenza}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RICORRENZE.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isProv ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Righe di provvigione</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1"
                  onClick={() => setCommLines((p) => [...p, { etichetta: "", base: "fatturato", percentuale: 0 }])}>
                  <Plus className="h-3.5 w-3.5" /> Riga
                </Button>
              </div>
              {commLines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                  <Input className="h-8" placeholder="Etichetta" value={l.etichetta}
                    onChange={(e) => setCommLines((p) => p.map((x, j) => j === i ? { ...x, etichetta: e.target.value } : x))} />
                  <Select value={l.base}
                    onValueChange={(v) => setCommLines((p) => p.map((x, j) => j === i ? { ...x, base: v } : x))}>
                    <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMM_BASE.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="h-8 w-20" type="number" step="0.01" placeholder="%" value={l.percentuale || ""}
                    onChange={(e) => setCommLines((p) => p.map((x, j) => j === i ? { ...x, percentuale: Number(e.target.value) } : x))} />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => setCommLines((p) => p.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">
                Percentuale sul fatturato o sull'incassato del cliente. La base di ogni mese si inserisce dagli Incassi.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Importo</Label>
                <Input type="number" step="0.01" value={importo} onChange={(e) => setImporto(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data inizio</Label>
                <Input type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} />
              </div>
            </div>
          )}

          {isProv && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Data inizio</Label>
              <Input type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Condizioni concordate, riferimenti…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => converti.mutate()} disabled={converti.isPending || !productLineId}>
            {converti.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crea cliente-servizio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
