/**
 * Caricare tante bolle insieme (05/11/2026): si scelgono i file, ognuno viene letto, e prima di salvare
 * si vede una riga per bolla con quello che il sistema ha capito. Niente entra senza conferma.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, FileUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { useAuth } from "@/contexts/AuthContext";
import { useDDTAttachments, useDDTRicezioneMutations } from "@/hooks/useDDTRicezione";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { inParallelo } from "@/lib/fatturazione/importMassivo";
import type { FornitoreInRubrica } from "@/lib/ddt/abbinaFornitore";
import { leggiDDTdaAI, quantitaTotale } from "@/lib/ddt/letturaAI";
import { contaPagine, leggiPerDividere, MAX_BYTE_DA_DIVIDERE, MAX_PAGINE_DIVISIONE, type PdfDaDividere } from "@/lib/ddt/dividiPdf";
import { DividiPdfPannello } from "@/components/ddt/DividiPdfPannello";
import {
  bollaDaFile, chiaveBolla, eUnPdf, conLettura, doppioni, dubbi, motivoScartoFile, perAttenzione, problemiBloccanti, pronte, scelteCerte,
  type ArticoloMagazzino, type BollaLetta, type RigaDaCaricare,
} from "@/lib/ddt/importBolle";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const QUANTE_INSIEME = 3;

async function leggiFile(file: File, companyId: string): Promise<unknown> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const { data, error } = await supabase.functions.invoke("ddt-ai-extract", {
    body: { image_base64: btoa(bin), mime_type: file.type || "application/pdf", file_name: file.name, company_id: companyId },
  });
  if (error) throw new Error(await edgeErrorMessage(error, "Lettura non riuscita"));
  if (!data?.success) throw new Error(data?.error ?? "Lettura non riuscita");
  return data.ddt ?? {};
}

/** Carica le righe certe della bolla e dice quante restano da abbinare. Un carico non riuscito non annulla la bolla. */
async function caricaICerti(companyId: string, ddtId: string, warehouseId: string | null): Promise<number> {
  const [{ data: righe }, { data: articoli }] = await Promise.all([
    db.from("ddt_righe").select("id, codice_articolo, descrizione, unita_misura, quantita").eq("ddt_ricezione_id", ddtId),
    supabase.from("warehouse_stock").select("id, name, internal_code, barcode").eq("company_id", companyId).eq("warehouse_id", warehouseId ?? "").limit(2000),
  ]);
  const lista = (righe ?? []) as RigaDaCaricare[];
  const scelte = scelteCerte(lista, (articoli ?? []) as ArticoloMagazzino[]);
  if (scelte.length === 0) return lista.length;
  const { data, error } = await db.rpc("bolla_carica_magazzino", { p_ddt: ddtId, p_scelte: scelte });
  return error ? lista.length : Number((data as { restano?: number } | null)?.restano ?? 0);
}

const testoErrore = (e: unknown, riserva: string) =>
  e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : riserva;

export function BolleInBloccoDialog({ open, onOpenChange, orderId, destinazione = "magazzino", warehouseId }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Aperta da una commessa: le bolle partono su quella, in cantiere. */
  orderId?: string | null;
  destinazione?: "magazzino" | "cantiere";
  warehouseId?: string | null;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const { createDDT } = useDDTRicezioneMutations(null);
  const { uploadMainDDT } = useDDTAttachments();
  const inputRef = useRef<HTMLInputElement>(null);
  const [bolle, setBolle] = useState<BollaLetta[]>([]);
  const [scartati, setScartati] = useState<{ nome: string; motivo: string }[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [daDividere, setDaDividere] = useState<{ id: string; pdf: PdfDaDividere }[]>([]);
  const [preparando, setPreparando] = useState(0);
  const annullato = useRef(false);
  const daAbbinare = useRef(0);

  const { data: rubrica = [] } = useQuery<FornitoreInRubrica[]>({
    queryKey: ["ddt-fornitori-abbinamento", companyId],
    enabled: open && !!companyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name, vat_number, fiscal_code").eq("company_id", companyId!).limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as FornitoreInRubrica[];
    },
  });

  // Le bolle che ci sono già: il fornitore può stare sulla bolla o sull'ordine a cui è legata.
  const { data: esistenti = new Set<string>() } = useQuery<Set<string>>({
    queryKey: ["ddt-chiavi-esistenti", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const chiavi = new Set<string>();
      const passo = 1000;
      for (let da = 0; ; da += passo) {
        const { data, error } = await db.from("ddt_ricezione")
          .select("id, numero_ddt, data_ricezione, supplier_id, purchase_orders(supplier_id)")
          .eq("company_id", companyId).order("id").range(da, da + passo - 1);
        if (error) throw error;
        for (const r of (data ?? []) as Array<{ numero_ddt: string; data_ricezione: string; supplier_id: string | null; purchase_orders: { supplier_id: string | null } | null }>) {
          const k = chiaveBolla(r.supplier_id ?? r.purchase_orders?.supplier_id, r.numero_ddt, r.data_ricezione);
          if (k) chiavi.add(k);
        }
        if ((data ?? []).length < passo) return chiavi;
      }
    },
  });

  useEffect(() => {
    if (!open) { annullato.current = true; setBolle([]); setScartati([]); setDaDividere([]); return; }
    annullato.current = false;
  }, [open]);

  const cambia = (id: string, patch: Partial<BollaLetta>) => setBolle((p) => p.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const leggiTutte = async (nuove: BollaLetta[]) => {
    if (!companyId) return;
    await inParallelo(nuove, QUANTE_INSIEME, async (b) => {
      if (annullato.current) return;
      cambia(b.id, { stato: "in_lettura" });
      try {
        const grezzo = await leggiFile(b.file, companyId);
        if (annullato.current) return;
        setBolle((p) => p.map((x) => (x.id === b.id ? conLettura(x, leggiDDTdaAI(grezzo), grezzo, rubrica) : x)));
      } catch (e) {
        cambia(b.id, { stato: "non_letta", errore: testoErrore(e, "Lettura non riuscita") });
      }
    });
  };

  const entra = (file: File[]) => {
    const scarti = file.flatMap((f) => { const motivo = motivoScartoFile(f); return motivo ? [{ nome: f.name, motivo }] : []; });
    setScartati((p) => [...p, ...scarti]);
    const nuove = file.filter((f) => !motivoScartoFile(f)).map((f) => bollaDaFile(f, crypto.randomUUID(), { orderId, destinazione }));
    if (!nuove.length) return;
    setBolle((p) => [...p, ...nuove]);
    void leggiTutte(nuove);
  };

  // Un PDF con più pagine può avere più bolle: prima si guarda dove tagliare, poi si legge.
  const aggiungi = async (lista: FileList | File[]) => {
    const file = Array.from(lista);
    setPreparando((n) => n + 1);
    try {
      const diretti: File[] = [];
      for (const f of file) {
        const pdfAdattoADivisione = eUnPdf(f) && f.size > 0 && f.size <= MAX_BYTE_DA_DIVIDERE;
        const pagine = pdfAdattoADivisione ? await contaPagine(f) : null;
        if (pagine == null || pagine <= 1) { diretti.push(f); continue; }
        if (pagine > MAX_PAGINE_DIVISIONE) {
          setScartati((p) => [...p, { nome: f.name, motivo: `ha ${pagine} pagine: dividilo in file fino a ${MAX_PAGINE_DIVISIONE}` }]);
          continue;
        }
        try {
          const letto = await leggiPerDividere(f);
          if (annullato.current) return;
          setDaDividere((p) => [...p, { id: crypto.randomUUID(), pdf: letto }]);
        } catch {
          diretti.push(f);
        }
      }
      if (!annullato.current) entra(diretti);
    } finally {
      setPreparando((n) => n - 1);
    }
  };

  const doppi = useMemo(() => doppioni(bolle, esistenti), [bolle, esistenti]);
  const elenco = useMemo(() => perAttenzione(bolle, doppi), [bolle, doppi]);
  const daSalvare = useMemo(() => pronte(bolle, doppi), [bolle, doppi]);
  const inLettura = bolle.some((b) => b.stato === "da_leggere" || b.stato === "in_lettura");
  const salvate = bolle.filter((b) => b.esito === "salvata").length;

  const conferma = async () => {
    setSalvando(true);
    daAbbinare.current = 0;
    await inParallelo(daSalvare, QUANTE_INSIEME, async (b) => {
      try {
        const creata = await createDDT.mutateAsync({
          silenzioso: true,
          order_id: b.orderId,
          supplier_id: b.supplierId,
          destinazione: b.destinazione,
          trasporto_a_cura_di: b.trasportoACuraDi,
          porto: b.porto,
          righe: b.righe,
          ai_lettura: b.grezzo,
          ai_confidenza: b.confidenza,
          ai_avvisi: b.avvisi,
          numero_ddt: b.numero.trim(),
          data_ricezione: b.data,
          quantita_ricevuta: quantitaTotale(b.righe),
          stato: "ricevuto",
          note: b.note,
          warehouse_id: warehouseId ?? null,
          corriere: b.corriere,
          targa_mezzo: b.targaMezzo,
          autista_nome: b.autistaNome,
        });
        await uploadMainDDT.mutateAsync({ ddtId: creata.id, file: b.file, silenzioso: true });
        // In magazzino entra subito ciò che si abbina con certezza; il resto si sceglie dalla scheda della bolla.
        if (b.destinazione === "magazzino") {
          const nonEntrate = await caricaICerti(companyId!, creata.id, creata.warehouse_id);
          daAbbinare.current += nonEntrate;
        }
        cambia(b.id, { esito: "salvata", motivoEsito: null });
      } catch (e) {
        cambia(b.id, { esito: "errore", motivoEsito: testoErrore(e, "Non salvata") });
      }
    });
    setSalvando(false);
    void queryClient.invalidateQueries({ queryKey: queryKeys.ddtRicezione.all });
    void queryClient.invalidateQueries({ queryKey: ["commessa-bolle-ddt"] });
    void queryClient.invalidateQueries({ queryKey: ["ddt-chiavi-esistenti", companyId] });
  };

  // Finita la conferma senza errori si dice quante sono entrate e si chiude.
  const finite = bolle.length > 0 && bolle.every((b) => b.esito === "salvata");
  useEffect(() => {
    if (finite && !salvando) {
      toast.success(`${salvate} ${salvate === 1 ? "bolla registrata" : "bolle registrate"}`, daAbbinare.current > 0
        ? { description: `${daAbbinare.current} righe aspettano che tu scelga l'articolo: le trovi nella scheda di ogni bolla.` }
        : undefined);
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finite, salvando]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!salvando) onOpenChange(v); }}>
      <DialogContent struttura="scorrevole" className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Carica più bolle</DialogTitle>
          <DialogDescription>Scegli i file: leggiamo ogni bolla e ti mostriamo cosa abbiamo capito. Non si salva niente finché non confermi.</DialogDescription>
        </DialogHeader>

        <div
          className="rounded-lg border-2 border-dashed p-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void aggiungi(Array.from(e.dataTransfer.files)); }}
        >
          <FileUp aria-hidden="true" className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Trascina qui PDF e foto: una bolla per file, o un PDF con tante bolle.</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" disabled={salvando} onClick={() => inputRef.current?.click()}>Scegli i file</Button>
          <input ref={inputRef} type="file" multiple hidden aria-label="File delle bolle" accept="application/pdf,image/*"
            onChange={(e) => { if (e.target.files) void aggiungi(Array.from(e.target.files)); e.target.value = ""; }} />
        </div>

        {scartati.length > 0 && (
          <p className="text-xs text-muted-foreground">Non presi: {scartati.map((s) => `${s.nome} (${s.motivo})`).join(", ")}.</p>
        )}

        {preparando > 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Sto guardando le pagine…</p>
        )}
        {daDividere.map((d) => (
          <DividiPdfPannello
            key={d.id}
            pdf={d.pdf}
            onTogli={() => setDaDividere((p) => p.filter((x) => x.id !== d.id))}
            onDiviso={(pezzi) => { setDaDividere((p) => p.filter((x) => x.id !== d.id)); entra(pezzi); }}
          />
        ))}

        {elenco.length > 0 && (
          <ul aria-label="Bolle da confermare" className="space-y-2">
            {elenco.map((b) => {
              const bloccanti = problemiBloccanti(b);
              const dubbiB = b.stato === "letta" ? dubbi(b) : [];
              const doppio = doppi.get(b.id);
              const attenzione = b.stato === "non_letta" || b.esito === "errore" || bloccanti.length > 0 || dubbiB.length > 0 || !!doppio;
              return (
                <li key={b.id} className={`space-y-2 rounded-lg border p-3 text-sm ${b.esito === "salvata" ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20" : attenzione ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                  <div className="flex items-center gap-2">
                    {b.esito === "salvata" ? <CheckCircle2 aria-label="Salvata" className="h-4 w-4 shrink-0 text-emerald-600" />
                      : b.stato === "letta" ? null : b.stato === "non_letta" ? <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-600" />
                      : <Loader2 aria-label="In lettura" className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate font-medium" title={b.file.name}>{b.file.name}</span>
                    <button type="button" className="inline-flex items-center gap-1 text-xs underline underline-offset-2" onClick={() => {
                      const url = URL.createObjectURL(b.file);
                      window.open(url, "_blank", "noopener");
                      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    }}>
                      Apri<ExternalLink aria-hidden="true" className="h-3 w-3" />
                    </button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={salvando || b.esito === "salvata"} aria-label={`Togli ${b.file.name}`}
                      onClick={() => setBolle((p) => p.filter((x) => x.id !== b.id))}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>

                  {b.stato === "non_letta" && <p className="text-xs text-amber-800 dark:text-amber-300">Non letta: {b.errore}. Toglila e riprova, o caricala da «Nuovo DDT».</p>}

                  {b.stato === "letta" && b.esito !== "salvata" && (
                    <>
                      <div className="grid gap-2 sm:grid-cols-[minmax(11rem,14rem)_9rem_minmax(0,1fr)_8rem]">
                        <Input aria-label={`Numero bolla ${b.file.name}`} placeholder="Numero" value={b.numero} disabled={salvando} className="h-8" onChange={(e) => cambia(b.id, { numero: e.target.value })} />
                        <Input aria-label={`Data bolla ${b.file.name}`} type="date" value={b.data} disabled={salvando} className="h-8" onChange={(e) => cambia(b.id, { data: e.target.value })} />
                        <Select value={b.supplierId ?? "nessuno"} disabled={salvando} onValueChange={(v) => cambia(b.id, { supplierId: v === "nessuno" ? null : v })}>
                          <SelectTrigger className="h-8" aria-label={`Fornitore bolla ${b.file.name}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nessuno">{b.fornitoreLetto ? `Non in rubrica: ${b.fornitoreLetto}` : "Fornitore non riconosciuto"}</SelectItem>
                            {rubrica.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={b.destinazione} disabled={salvando} onValueChange={(v) => cambia(b.id, { destinazione: v as BollaLetta["destinazione"] })}>
                          <SelectTrigger className="h-8" aria-label={`Destinazione bolla ${b.file.name}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="magazzino">Magazzino</SelectItem>
                            <SelectItem value="cantiere">Cantiere</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div className="w-full sm:w-72">
                          <OrderSelectCombobox companyId={companyId} filtroIniziale="all" value={b.orderId ?? undefined} disabled={salvando} placeholder="Commessa (facoltativa)" onChange={(id) => cambia(b.id, { orderId: id })} />
                        </div>
                        {b.orderId && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => cambia(b.id, { orderId: null, destinazione: "magazzino" })}>Togli commessa</Button>}
                        <span className="text-xs text-muted-foreground">{b.righe.length} {b.righe.length === 1 ? "riga" : "righe"} merce{b.abbinatoPer ? ` · fornitore riconosciuto da ${b.abbinatoPer}` : ""}</span>
                      </div>
                      {[...bloccanti, ...dubbiB].length > 0 && (
                        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />{[...bloccanti, ...dubbiB].join(" · ")}
                        </p>
                      )}
                      {b.avvisi.length > 0 && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer">Note della lettura ({b.avvisi.length})</summary>
                          <p className="mt-1">{b.avvisi.join(" · ")}</p>
                        </details>
                      )}
                      {doppio && (
                        <label className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                          <Checkbox checked={b.caricaComunque} disabled={salvando} onCheckedChange={(v) => cambia(b.id, { caricaComunque: v === true })} />
                          {doppio === "gia_presente" ? "Questa bolla c'è già." : "Ripetuta in questo caricamento."} Carica comunque
                        </label>
                      )}
                      {b.esito === "errore" && <p className="text-xs text-destructive">Non salvata: {b.motivoEsito}</p>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={salvando} onClick={() => onOpenChange(false)}>{salvate > 0 ? "Chiudi" : "Annulla"}</Button>
          <Button type="button" disabled={salvando || inLettura || preparando > 0 || daDividere.length > 0 || daSalvare.length === 0} onClick={() => void conferma()}>
            {salvando && <Loader2 aria-hidden="true" className="mr-1.5 h-4 w-4 animate-spin" />}
            {daDividere.length > 0 ? "Prima controlla dove tagliare" : inLettura ? "Sto leggendo…" : `Registra ${daSalvare.length} ${daSalvare.length === 1 ? "bolla" : "bolle"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
