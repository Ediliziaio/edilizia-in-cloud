/**
 * «Arrivata merce» — registrare un arrivo in un gesto solo.
 *
 * Prima c'erano due sole strade e nessuna copriva il caso normale:
 *   - la scansione dei codici a barre, che pretende il barcode su ogni articolo;
 *   - il bottone «ricevuto», che chiude tutto in blocco e non sa dire che di 10
 *     pezzi ne sono arrivati 7.
 * Qui le righe arrivano già compilate col residuo: se è arrivato tutto basta
 * confermare, se manca qualcosa si corregge solo la riga che non torna. Chi ha
 * la bolla in mano può farla leggere dall'AI invece di digitare.
 *
 * Il salvataggio passa dalla RPC `oda_registra_arrivo`: aggiorna le righe (mai
 * oltre il residuo), crea la bolla, carica il magazzino solo per le righe
 * abbinate a un articolo e porta l'ordine in «parziale» o «ricevuto».
 */
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackageCheck, Camera, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { queryKeys } from "@/lib/queryKeys";

interface RigaOda {
  id: string;
  description: string | null;
  sku: string | null;
  unit_of_measure: string | null;
  quantity: number;
  quantity_received: number | null;
}

function oggiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OdaArrivoMerceSheet({
  open,
  onOpenChange,
  odaId,
  companyId,
  warehouseId = null,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  odaId: string;
  companyId: string;
  /** Se l'azienda tiene il magazzino, le righe abbinate a un articolo lo caricano. */
  warehouseId?: string | null;
}) {
  const queryClient = useQueryClient();
  const [quantita, setQuantita] = useState<Record<string, string>>({});
  const [numeroBolla, setNumeroBolla] = useState("");
  const [dataBolla, setDataBolla] = useState(oggiIso());
  const [note, setNote] = useState("");
  const [analisiInCorso, setAnalisiInCorso] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: righe = [], isLoading } = useQuery({
    queryKey: ["oda-arrivo-righe", odaId],
    enabled: open && !!odaId,
    queryFn: async (): Promise<RigaOda[]> => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("id, description, sku, unit_of_measure, quantity, quantity_received")
        .eq("purchase_order_id", odaId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RigaOda[];
    },
  });

  const residuo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of righe) m[r.id] = Math.max(Number(r.quantity ?? 0) - Number(r.quantity_received ?? 0), 0);
    return m;
  }, [righe]);

  const daRicevere = useMemo(() => righe.filter((r) => (residuo[r.id] ?? 0) > 0), [righe, residuo]);

  // Nessuna inizializzazione via effect: finché una riga non viene toccata il
  // campo mostra il residuo, che è il caso normale («è arrivato tutto»).
  const valoreRiga = (id: string) => quantita[id] ?? String(residuo[id] ?? 0);

  const chiudi = (v: boolean) => {
    if (!v) {
      setQuantita({});
      setNumeroBolla("");
      setDataBolla(oggiIso());
      setNote("");
    }
    onOpenChange(v);
  };

  const totale = useMemo(
    () => daRicevere.reduce((s, r) => s + (Number(quantita[r.id] ?? residuo[r.id] ?? 0) || 0), 0),
    [daRicevere, quantita, residuo],
  );
  const totaleAtteso = useMemo(
    () => daRicevere.reduce((s, r) => s + (residuo[r.id] ?? 0), 0),
    [daRicevere, residuo],
  );
  const mancaQualcosa = totale < totaleAtteso;

  const tuttoArrivato = () =>
    setQuantita(Object.fromEntries(daRicevere.map((r) => [r.id, String(residuo[r.id] ?? 0)])));
  const azzera = () => setQuantita(Object.fromEntries(daRicevere.map((r) => [r.id, "0"])));

  /** Legge la bolla e riempie le quantità che riesce ad abbinare. */
  const leggiBolla = async (file: File) => {
    setAnalisiInCorso(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error ?? new Error("Lettura file non riuscita"));
        reader.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("ai-ddt-analyzer", {
        body: { file_base64: base64, mime: file.type || "image/jpeg", company_id: companyId },
      });
      if (error) throw error;
      const payload = data as {
        success?: boolean;
        error?: string;
        extracted?: {
          document_number?: string | null;
          document_date?: string | null;
          items?: Array<{ description?: string | null; quantity?: number | string | null; code?: string | null }>;
        };
      };
      if (!payload?.success) throw new Error(payload?.error ?? "Non sono riuscito a leggere la bolla");

      const estratte = payload.extracted?.items ?? [];
      const prossime: Record<string, string> = Object.fromEntries(daRicevere.map((r) => [r.id, valoreRiga(r.id)]));
      let abbinate = 0;
      for (const voce of estratte) {
        const q = Number(voce.quantity ?? 0);
        if (!q || q <= 0) continue;
        const codice = (voce.code ?? "").trim().toLowerCase();
        const desc = (voce.description ?? "").trim().toLowerCase();
        const riga = daRicevere.find((r) => {
          const sku = (r.sku ?? "").trim().toLowerCase();
          if (codice && sku && sku === codice) return true;
          const rd = (r.description ?? "").trim().toLowerCase();
          return !!rd && !!desc && (rd.includes(desc) || desc.includes(rd));
        });
        if (riga) {
          prossime[riga.id] = String(Math.min(q, residuo[riga.id] ?? q));
          abbinate++;
        }
      }
      setQuantita(prossime);
      if (payload.extracted?.document_number && !numeroBolla) setNumeroBolla(payload.extracted.document_number);
      if (payload.extracted?.document_date) setDataBolla(payload.extracted.document_date.slice(0, 10));

      toast.success(
        abbinate > 0 ? `Bolla letta: ${abbinate} righe compilate` : "Bolla letta, ma nessuna riga riconosciuta",
        { description: abbinate > 0 ? "Controlla le quantità prima di confermare." : "Scrivi le quantità a mano." },
      );
    } catch (e) {
      toast.error("Lettura non riuscita", { description: userErrorMessage(e) });
    } finally {
      setAnalisiInCorso(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const registra = useMutation({
    mutationFn: async () => {
      const payload = daRicevere
        .map((r) => ({ item_id: r.id, quantity: Number(quantita[r.id] ?? residuo[r.id] ?? 0) || 0 }))
        .filter((r) => r.quantity > 0);
      if (payload.length === 0) throw new Error("Non hai indicato nessuna quantità arrivata.");
      const { data, error } = await supabase.rpc("oda_registra_arrivo", {
        p_oda_id: odaId,
        p_righe: payload,
        p_ddt_number: numeroBolla.trim() || null,
        p_ddt_data: dataBolla || null,
        p_warehouse_id: warehouseId,
        p_note: note.trim() || null,
      } as never);
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as {
        righe_registrate: number;
        quantita_totale: number;
        oda_completo: boolean;
      };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(odaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(odaId) });
      queryClient.invalidateQueries({ queryKey: ["oda-arrivo-righe", odaId] });
      queryClient.invalidateQueries({ queryKey: ["ddt-ricezione", odaId] });
      toast.success(
        res?.oda_completo ? "Arrivo registrato: ordine completo" : "Arrivo registrato: ordine ancora parziale",
        {
          description: res?.oda_completo
            ? "Tutte le righe sono arrivate."
            : "Il residuo resta in attesa sull'ordine.",
        },
      );
      chiudi(false);
    },
    onError: (e) => toast.error("Arrivo non registrato", { description: userErrorMessage(e) }),
  });

  return (
    <Sheet open={open} onOpenChange={chiudi}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" /> Arrivata merce
          </SheetTitle>
          <SheetDescription>
            Le quantità sono già quelle che mancavano. Se è arrivato tutto conferma, altrimenti correggi solo
            la riga che non torna.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : daRicevere.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Su questo ordine è già arrivato tutto.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={tuttoArrivato} className="flex-1">
                È arrivato tutto
              </Button>
              <Button size="sm" variant="outline" onClick={azzera}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Azzera
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={analisiInCorso}
                onClick={() => fileRef.current?.click()}
              >
                {analisiInCorso ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="mr-1 h-3.5 w-3.5" />
                )}
                Foto bolla
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void leggiBolla(f);
                }}
              />
            </div>

            <div className="space-y-2">
              {daRicevere.map((r) => {
                const res = residuo[r.id] ?? 0;
                const val = Number(valoreRiga(r.id)) || 0;
                const parziale = val > 0 && val < res;
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border p-3 ${parziale ? "border-red-200 bg-red-50" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.description || "Riga senza descrizione"}</p>
                        <p className="text-xs text-muted-foreground">
                          Ordinati {Number(r.quantity)} {r.unit_of_measure || "pz"}
                          {Number(r.quantity_received ?? 0) > 0 && <> · già arrivati {Number(r.quantity_received)}</>}
                          {" · mancano "}
                          <strong>{res}</strong>
                        </p>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max={res}
                        step="any"
                        inputMode="decimal"
                        className="h-9 w-24 shrink-0 text-right"
                        value={valoreRiga(r.id)}
                        onChange={(e) => setQuantita((p) => ({ ...p, [r.id]: e.target.value }))}
                      />
                    </div>
                    {parziale && (
                      <p className="mt-2 text-xs font-medium text-red-700">
                        Ne mancano {res - val}: la riga resta aperta sull&apos;ordine.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Numero bolla</Label>
                <Input
                  value={numeroBolla}
                  onChange={(e) => setNumeroBolla(e.target.value)}
                  placeholder="Se non ce l'hai, lascia vuoto"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={dataBolla} onChange={(e) => setDataBolla(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Note (facoltative)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Es. imballo danneggiato, mancano le viti"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span>In arrivo ora</span>
              <span className="flex items-center gap-2 font-semibold">
                {totale} / {totaleAtteso}
                {mancaQualcosa && <Badge className="bg-red-100 text-red-800">incompleto</Badge>}
              </span>
            </div>

            <Button
              className="w-full"
              disabled={registra.isPending || totale <= 0}
              onClick={() => registra.mutate()}
            >
              {registra.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {mancaQualcosa ? "Registra arrivo parziale" : "Registra arrivo"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
