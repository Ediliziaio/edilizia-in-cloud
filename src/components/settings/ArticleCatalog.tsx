import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import {
  Plus, Pencil, Trash2, Search, Package, Upload, Download, Copy,
  Image, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────────────────────
type Modalita = "pz" | "mq" | "misura_libera" | "griglia";
type UM = "ml" | "h" | "mc" | "kg" | "corpo";
type GrigliaCell = { pv: number; pa: number };

interface ArticleRow {
  id: string;
  name: string;
  sku?: string;
  marca?: string;
  modello?: string;
  category?: string;
  categoria_id?: string;
  modalita_prezzo?: Modalita;
  prezzo_vendita?: number;
  prezzo_acquisto_netto?: number;
  margine_minimo_percentuale?: number;
  sconto_max_cliente_percentuale?: number;
  ha_montaggio?: boolean;
  montaggio_tipo?: string;
  montaggio_tariffa_id?: string;
  attivo?: boolean;
  immagine_url?: string;
  pdf_scheda_url?: string;
  description?: string;
  vat_rate?: number;
  unit_of_measure?: UM;
  sort_order?: number;
}

interface Categoria { id: string; nome: string; colore?: string; }
interface Tariffa { id: string; nome: string; tipo: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ModalitaBadge({ m }: { m?: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pz: { label: "A pezzo", className: "bg-gray-100 text-gray-700" },
    mq: { label: "Al mq", className: "bg-blue-100 text-blue-700" },
    misura_libera: { label: "Misura libera", className: "bg-purple-100 text-purple-700" },
    griglia: { label: "Griglia prezzi", className: "bg-orange-100 text-orange-700" },
  };
  const v = map[m ?? "pz"] ?? map.pz;
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${v.className}`}>{v.label}</span>;
}

function MargineSemaforo({ pct }: { pct: number }) {
  const color = pct >= 25 ? "bg-green-500" : pct >= 15 ? "bg-yellow-400" : "bg-red-500";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{pct.toFixed(1)}%</span>
    </span>
  );
}

function calcMargine(pv: number, pa: number): number {
  if (!pv || pv === 0) return 0;
  return ((pv - pa) / pv) * 100;
}

// ─── CSV Import Dialog ────────────────────────────────────────────────────────
function CsvImportDialog({
  open, onClose, companyId, categorie, onDone,
}: {
  open: boolean; onClose: () => void; companyId: string;
  categorie: Categoria[]; onDone: () => void;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [fileName, setFileName] = useState("");
  const [modalitaDefault, setModalitaDefault] = useState<Modalita>("pz");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);


  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error("Errore lettura file"));
      reader.readAsText(file);
    });


  const parseFile = async (file: File) => {
    setFileName(file.name);
    try {
      const text = await readFile(file);
      const lines = text.split("\n").filter(Boolean);
      if (lines.length === 0) throw new Error("File CSV vuoto.");
      const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
      const dataLines = lines.slice(1);
      setTotalRows(dataLines.length);
      const parsed = dataLines.slice(0, 5).map((line) => {
        const vals = line.split(",").map((v) => v.trim().replace(/"/g, ""));
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
      });
      setRows(parsed);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const downloadTemplate = () => {
    const csv = "nome,sku,categoria,prezzo_vendita,prezzo_acquisto,descrizione\nFinestra PVC 100x120,FIN-001,Serramenti/Infissi,450,280,Finestra PVC doppio vetro";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "template_listino.csv"; a.click();
  };


  const doImport = async () => {
    if (!rows.length) return;
    const fileEl = fileRef.current;
    if (!fileEl?.files?.[0]) return;
    setImporting(true);
    try {
      const text = await readFile(fileEl.files[0]);
      const lines = text.split("\n").filter(Boolean);
      if (lines.length === 0) throw new Error("File CSV vuoto.");
      const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
      const allRows = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim().replace(/"/g, ""));
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
      });
      const toInsert = allRows.map((r) => {
        const catName = r.categoria || r.category || null;
        let categoriaId: string | null = null;
        if (catName) {
          const match = categorie.find((c) => c.nome.toLowerCase() === catName.toLowerCase());
          categoriaId = match?.id ?? null;
        }
        return {
          company_id: companyId,
          name: r.nome ?? r.name ?? "",
          sku: r.sku || null,
          categoria_id: categoriaId,
          modalita_prezzo: modalitaDefault,
          prezzo_vendita: parseFloat(r.prezzo_vendita ?? r.prezzo ?? "0") || 0,
          prezzo_acquisto_netto: (r.prezzo_acquisto ?? "").trim() !== "" ? parseFloat(r.prezzo_acquisto) : null,
          description: r.descrizione || r.description || null,
        };
      });
      // Rows with SKU: upsert on (company_id, sku); rows without SKU: plain insert
      const rowsWithSku = toInsert.filter((r) => r.sku);
      const rowsWithoutSku = toInsert.filter((r) => !r.sku);
      if (rowsWithSku.length) {
        const { error } = await (supabase.from("article_templates") as any)
          .upsert(rowsWithSku, { onConflict: "company_id,sku" });
        if (error) throw error;
      }
      if (rowsWithoutSku.length) {
        const { error } = await (supabase.from("article_templates") as any)
          .insert(rowsWithoutSku);
        if (error) throw error;
      }
      toast.success(`${toInsert.length} prodotti importati`);
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Importa CSV Listino</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />Scarica template CSV
          </Button>
          <div>
            <Label>Modalità prezzo default</Label>
            <Select value={modalitaDefault} onValueChange={(v) => setModalitaDefault(v as Modalita)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pz">A pezzo</SelectItem>
                <SelectItem value="mq">Al mq</SelectItem>
                <SelectItem value="misura_libera">Misura libera</SelectItem>
                <SelectItem value="griglia">Griglia prezzi</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-amber-600 mt-1">La modalità verrà applicata a tutti i prodotti importati senza modalità specificata.</p>
          </div>
          <div>
            <Label>File CSV</Label>
            <input ref={fileRef} type="file" accept=".csv" className="mt-1 block w-full text-sm"
              onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])} />
          </div>
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <p className="text-xs text-muted-foreground mb-1">Anteprima (prime 5 righe) — {fileName}</p>
              <table className="min-w-full text-xs border">
                <thead><tr>{Object.keys(rows[0]).map((k) => <th key={k} className="border px-2 py-1">{k}</th>)}</tr></thead>
                <tbody>{rows.map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="border px-2 py-1">{v}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={doImport} disabled={!rows.length || importing}>
            Importa {totalRows > 0 ? `${totalRows}` : ""} prodotti
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Griglia Editor ───────────────────────────────────────────────────────────
function GrigliaEditor({
  valoriX, setValoriX, valoriY, setValoriY,
  celle, setCelle, showPA, setShowPA,
}: {
  valoriX: number[]; setValoriX: (v: number[]) => void;
  valoriY: number[]; setValoriY: (v: number[]) => void;
  celle: Map<string, GrigliaCell>;
  setCelle: (m: Map<string, GrigliaCell>) => void;
  showPA: boolean; setShowPA: (v: boolean) => void;
}) {
  const getCell = (x: number, y: number) => celle.get(`${x}_${y}`) ?? { pv: 0, pa: 0 };
  const setCell = (x: number, y: number, val: Partial<GrigliaCell>) => {
    const next = new Map(celle);
    next.set(`${x}_${y}`, { ...getCell(x, y), ...val });
    setCelle(next);
  };

  const importGrigliaCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter(Boolean).slice(1);
      const nextMap = new Map(celle);
      const newX = new Set(valoriX);
      const newY = new Set(valoriY);
      lines.forEach((line) => {
        const [lw, lh, pv, pa] = line.split(",").map((v) => parseFloat(v.trim()));
        if (!isNaN(lw) && !isNaN(lh)) {
          newX.add(lw); newY.add(lh);
          nextMap.set(`${lw}_${lh}`, { pv: pv || 0, pa: pa || 0 });
        }
      });
      setValoriX(Array.from(newX).sort((a, b) => a - b));
      setValoriY(Array.from(newY).sort((a, b) => a - b));
      setCelle(nextMap);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline"
            onClick={() => setValoriX([...valoriX, (valoriX[valoriX.length - 1] ?? 0) + 100])}>
            + Aggiungi larghezza
          </Button>
          <Button type="button" size="sm" variant="outline"
            onClick={() => setValoriY([...valoriY, (valoriY[valoriY.length - 1] ?? 0) + 100])}>
            + Aggiungi altezza
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={showPA} onCheckedChange={setShowPA} id="show-pa" />
          <label htmlFor="show-pa" className="text-sm">Mostra prezzi acquisto</label>
          <label className="cursor-pointer">
            <Button type="button" size="sm" variant="outline" asChild>
              <span><Upload className="h-3 w-3 mr-1" />Importa CSV</span>
            </Button>
            <input type="file" accept=".csv" className="hidden"
              onChange={(e) => e.target.files?.[0] && importGrigliaCsv(e.target.files[0])} />
          </label>
        </div>
      </div>
      {valoriX.length > 0 && valoriY.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="border p-1 bg-muted">Alt\Larg</th>
                {valoriX.map((x, xi) => (
                  <th key={xi} className="border p-1 bg-muted min-w-[80px]">
                    <Input type="number" value={x} className="h-6 text-xs w-20"
                      onChange={(e) => {
                        const nv = [...valoriX]; nv[xi] = parseFloat(e.target.value) || 0;
                        setValoriX(nv);
                      }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {valoriY.map((y, yi) => (
                <tr key={yi}>
                  <td className="border p-1 bg-muted">
                    <Input type="number" value={y} className="h-6 text-xs w-20"
                      onChange={(e) => {
                        const nv = [...valoriY]; nv[yi] = parseFloat(e.target.value) || 0;
                        setValoriY(nv);
                      }} />
                  </td>
                  {valoriX.map((x, xi) => {
                    const c = getCell(x, y);
                    return (
                      <td key={xi} className="border p-1">
                        <Input type="number" placeholder="PV €" value={c.pv || ""}
                          className="h-6 text-xs w-20 mb-0.5"
                          onChange={(e) => setCell(x, y, { pv: parseFloat(e.target.value) || 0 })} />
                        {showPA && (
                          <Input type="number" placeholder="PA €" value={c.pa || ""}
                            className="h-6 text-xs w-20 bg-orange-50"
                            onChange={(e) => setCell(x, y, { pa: parseFloat(e.target.value) || 0 })} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">Aggiungi larghezze e altezze per creare la griglia.</p>
      )}
    </div>
  );
}

// ─── Article Dialog ───────────────────────────────────────────────────────────
function ArticleDialog({
  open, onClose, editingArticle, companyId, isAdmin,
  categorie, tariffe, onSaved,
}: {
  open: boolean; onClose: () => void; editingArticle: ArticleRow | null;
  companyId: string; isAdmin: boolean;
  categorie: Categoria[]; tariffe: Tariffa[]; onSaved: () => void;
}) {
  const isNew = !editingArticle?.id;

  // Tab 1 — Anagrafica
  const [name, setName] = useState(editingArticle?.name ?? "");
  const [sku, setSku] = useState(editingArticle?.sku ?? "");
  const [marca, setMarca] = useState(editingArticle?.marca ?? "");
  const [modello, setModello] = useState(editingArticle?.modello ?? "");
  const [descrizione, setDescrizione] = useState(editingArticle?.description ?? "");
  const [vatRate, setVatRate] = useState<number>(editingArticle?.vat_rate ?? 22);
  const [categoriaId, setCategoriaId] = useState(editingArticle?.categoria_id ?? "");

  // Tab 2 — Modalità
  const [modalita, setModalita] = useState<Modalita>(editingArticle?.modalita_prezzo ?? "pz");
  const [prezzoVendita, setPrezzoVendita] = useState(String(editingArticle?.prezzo_vendita ?? ""));
  const [unitMisura, setUnitMisura] = useState<UM>((editingArticle?.unit_of_measure as UM) ?? "pz");
  const [valoriX, setValoriX] = useState<number[]>([]);
  const [valoriY, setValoriY] = useState<number[]>([]);
  const [celle, setCelle] = useState<Map<string, GrigliaCell>>(new Map());
  const [showPA, setShowPA] = useState(false);

  // Tab 3 — Prezzi (admin)
  const [prezzoListino, setPrezzoListino] = useState("");
  const [scontoFornitore, setScontoFornitore] = useState("");
  const [prezzoAcquisto, setPrezzoAcquisto] = useState(String(editingArticle?.prezzo_acquisto_netto ?? ""));
  const [scontoMax, setScontoMax] = useState(String(editingArticle?.sconto_max_cliente_percentuale ?? ""));
  const [margineMin, setMargineMin] = useState(String(editingArticle?.margine_minimo_percentuale ?? ""));

  // Tab 4 — Montaggio
  const [haMontaggio, setHaMontaggio] = useState(editingArticle?.ha_montaggio ?? false);
  const [montaggioTipo, setMontaggioTipo] = useState(editingArticle?.montaggio_tipo ?? "incluso");
  const [montaggioTariffaId, setMontaggioTariffaId] = useState(editingArticle?.montaggio_tariffa_id ?? "");

  // Tab 5 — Media
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [imgUrl, setImgUrl] = useState(editingArticle?.immagine_url ?? "");
  const [pdfUrl, setPdfUrl] = useState((editingArticle as any)?.pdf_scheda_url ?? "");

  // Load griglia when editing a griglia product
  useQuery({
    queryKey: ["listino-griglia-edit", editingArticle?.id],
    enabled: !!editingArticle?.id && editingArticle.modalita_prezzo === "griglia",
    queryFn: async () => {
      const { data } = await (supabase.from("listino_griglia") as any)
        .select("*")
        .eq("prodotto_id", editingArticle!.id);
      if (data?.length) {
        const xs = Array.from(new Set(data.map((r: any) => r.valore_x))).sort((a: any, b: any) => a - b) as number[];
        const ys = Array.from(new Set(data.map((r: any) => r.valore_y))).sort((a: any, b: any) => a - b) as number[];
        const map = new Map<string, GrigliaCell>();
        data.forEach((r: any) => map.set(`${r.valore_x}_${r.valore_y}`, { pv: r.prezzo_vendita, pa: r.prezzo_acquisto_netto ?? 0 }));
        setValoriX(xs); setValoriY(ys); setCelle(map);
      }
      return data;
    },
  });

  const pv = prezzoVendita.trim() !== "" ? parseFloat(prezzoVendita) : 0;
  const pa = prezzoAcquisto.trim() !== "" ? parseFloat(prezzoAcquisto) : 0;
  const margineCalc = calcMargine(pv, pa);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Il nome è obbligatorio"); return; }
    setSaving(true);
    try {
      const payload: any = {
        company_id: companyId,
        name: name.trim(),
        sku: sku || null,
        marca: marca || null,
        modello: modello || null,
        description: descrizione || null,
        vat_rate: vatRate,
        categoria_id: categoriaId || null,
        modalita_prezzo: modalita,
        prezzo_vendita: prezzoVendita.trim() !== "" ? parseFloat(prezzoVendita) : null,
        unit_of_measure: unitMisura,
        ha_montaggio: haMontaggio,
        montaggio_tipo: haMontaggio ? montaggioTipo : null,
        montaggio_tariffa_id: (haMontaggio && montaggioTipo === "separato" && montaggioTariffaId) ? montaggioTariffaId : null,
        immagine_url: imgUrl || null,
        pdf_scheda_url: pdfUrl || null,
      };
      if (isAdmin) {
        payload.prezzo_acquisto_netto = prezzoAcquisto.trim() !== "" ? parseFloat(prezzoAcquisto) : null;
        payload.sconto_max_cliente_percentuale = scontoMax.trim() !== "" ? parseFloat(scontoMax) : null;
        payload.margine_minimo_percentuale = margineMin.trim() !== "" ? parseFloat(margineMin) : null;
      }

      let prodottoId = editingArticle?.id;
      if (prodottoId) {
        const { error } = await (supabase.from("article_templates") as any).update(payload).eq("id", prodottoId).eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase.from("article_templates") as any).insert(payload).select("id").single();
        if (error) throw error;
        prodottoId = data.id;
      }

      if (modalita === "griglia" && prodottoId && valoriX.length > 0 && valoriY.length > 0) {
        const toUpsert: any[] = [];
        valoriX.forEach((x) => {
          valoriY.forEach((y) => {
            const c = celle.get(`${x}_${y}`);
            if (c) {
              toUpsert.push({ company_id: companyId, prodotto_id: prodottoId, valore_x: x, valore_y: y, prezzo_vendita: c.pv, prezzo_acquisto_netto: c.pa });
            }
          });
        });
        if (toUpsert.length) {
          const { error: grigliaError } = await (supabase.from("listino_griglia") as any)
            .upsert(toUpsert, { onConflict: "prodotto_id,valore_x,valore_y" });
          if (grigliaError) throw grigliaError;
        }
      }

      toast.success(editingArticle ? "Prodotto aggiornato" : "Prodotto creato");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadMedia = async (file: File, type: "img" | "pdf") => {
    if (!editingArticle?.id) { toast.error("Salva prima il prodotto per caricare media"); return; }
    const path = `${companyId}/${editingArticle.id}/${type === "img" ? "immagine" : "scheda.pdf"}`;
    const setter = type === "img" ? setUploadingImg : setUploadingPdf;
    setter(true);
    try {
      const { error } = await supabase.storage.from("listino-media").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("listino-media").getPublicUrl(path);
      if (type === "img") setImgUrl(publicUrl);
      else setPdfUrl(publicUrl);
      toast.success("File caricato");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setter(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingArticle ? "Modifica prodotto" : "Nuovo prodotto"}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="anagrafica">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
            <TabsTrigger value="modalita">Modalità</TabsTrigger>
            <TabsTrigger value="prezzi">Prezzi</TabsTrigger>
            <TabsTrigger value="montaggio">Montaggio</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
          </TabsList>

          {/* TAB 1 — Anagrafica */}
          <TabsContent value="anagrafica" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome prodotto" />
              </div>
              <div>
                <Label>SKU / Codice</Label>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="FIN-001" />
              </div>
              <div>
                <Label>Marca</Label>
                <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="es. Schüco, Reynaers" />
              </div>
              <div>
                <Label>Modello</Label>
                <Input value={modello} onChange={(e) => setModello(e.target.value)} placeholder="es. AWS 75, CS 77" />
              </div>
              <div>
                <Label>IVA</Label>
                <RadioGroup value={String(vatRate)} onValueChange={(v) => setVatRate(Number(v))}
                  className="flex gap-4 mt-2">
                  {[4, 10, 22].map((r) => (
                    <div key={r} className="flex items-center gap-1.5">
                      <RadioGroupItem value={String(r)} id={`iva-${r}`} />
                      <label htmlFor={`iva-${r}`} className="text-sm">{r}%</label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="col-span-2">
                <Label>Categoria</Label>
                {categorie.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessuna categoria. Creane una in <b>Preventivi & Margini</b>.</p>
                ) : (
                  <Select value={categoriaId} onValueChange={setCategoriaId}>
                    <SelectTrigger><SelectValue placeholder="Seleziona categoria" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nessuna</SelectItem>
                      {categorie.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="col-span-2">
                <Label>Descrizione</Label>
                <Textarea value={descrizione} onChange={(e) => setDescrizione(e.target.value)} rows={2} />
              </div>
            </div>
          </TabsContent>

          {/* TAB 2 — Modalità Prezzo */}
          <TabsContent value="modalita" className="space-y-4 pt-4">
            {editingArticle && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                ⚠️ La modalità non può essere cambiata dopo uso in preventivo.
              </p>
            )}
            <RadioGroup value={modalita} onValueChange={(v) => setModalita(v as Modalita)}>
              <div className="grid grid-cols-2 gap-3">
                {(["pz", "mq", "misura_libera", "griglia"] as Modalita[]).map((m) => {
                  const labels: Record<Modalita, { title: string; desc: string }> = {
                    pz: { title: "A pezzo (pz)", desc: "Prezzo fisso per unità/pezzo" },
                    mq: { title: "Al metro quadro (mq)", desc: "Prezzo per mq — base = largh × alt" },
                    misura_libera: { title: "Misura libera", desc: "UM personalizzata (ml, h, mc, kg...)" },
                    griglia: { title: "Griglia prezzi", desc: "Matrice larghezza × altezza con prezzi" },
                  };
                  return (
                    <Card key={m} className={`cursor-pointer border-2 transition-colors ${modalita === m ? "border-primary" : "border-muted"}`}
                      onClick={() => setModalita(m)}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <RadioGroupItem value={m} className="mt-0.5" />
                          <div>
                            <p className="font-medium text-sm">{labels[m].title}</p>
                            <p className="text-xs text-muted-foreground">{labels[m].desc}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </RadioGroup>

            <div className="space-y-3 mt-2">
              {(modalita === "pz" || modalita === "mq") && (
                <div>
                  <Label>Prezzo vendita €/{modalita === "mq" ? "mq" : "pz"}</Label>
                  <Input type="number" value={prezzoVendita} onChange={(e) => setPrezzoVendita(e.target.value)}
                    placeholder="0.00" />
                  {modalita === "mq" && <p className="text-xs text-muted-foreground mt-1">base = larghezza × altezza</p>}
                </div>
              )}
              {modalita === "misura_libera" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Unità di misura</Label>
                    <Select value={unitMisura} onValueChange={(v) => setUnitMisura(v as UM)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["ml", "h", "mc", "kg", "corpo"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prezzo vendita €/{unitMisura}</Label>
                    <Input type="number" value={prezzoVendita} onChange={(e) => setPrezzoVendita(e.target.value)} />
                  </div>
                </div>
              )}
              {modalita === "griglia" && (
                <div className="space-y-3">
                  <GrigliaEditor
                    valoriX={valoriX} setValoriX={setValoriX}
                    valoriY={valoriY} setValoriY={setValoriY}
                    celle={celle} setCelle={setCelle}
                    showPA={showPA} setShowPA={setShowPA}
                  />
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 3 — Prezzi e Costi */}
          <TabsContent value="prezzi" className="space-y-4 pt-4">
            {!isAdmin ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Visibile solo agli amministratori</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Prezzo listino fornitore €</Label>
                    <Input type="number" value={prezzoListino}
                      onChange={(e) => {
                        const pl = parseFloat(e.target.value);
                        const sc = parseFloat(scontoFornitore);
                        setPrezzoListino(e.target.value);
                        if (!isNaN(pl) && !isNaN(sc)) setPrezzoAcquisto(String((pl * (1 - sc / 100)).toFixed(2)));
                      }} />
                  </div>
                  <div>
                    <Label>Sconto fornitore %</Label>
                    <Input type="number" value={scontoFornitore}
                      onChange={(e) => {
                        const pl = parseFloat(prezzoListino);
                        const sc = parseFloat(e.target.value);
                        setScontoFornitore(e.target.value);
                        if (!isNaN(pl) && !isNaN(sc)) setPrezzoAcquisto(String((pl * (1 - sc / 100)).toFixed(2)));
                      }} />
                  </div>
                  <div>
                    <Label>Prezzo acquisto netto €</Label>
                    <Input type="number" value={prezzoAcquisto} onChange={(e) => setPrezzoAcquisto(e.target.value)} />
                  </div>
                </div>
                <hr />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Prezzo vendita €</Label>
                    <Input type="number" value={prezzoVendita} readOnly className="bg-muted" />
                  </div>
                  <div>
                    <Label>Margine %</Label>
                    <div className="h-10 flex items-center">
                      <MargineSemaforo pct={margineCalc} />
                    </div>
                  </div>
                  <div>
                    <Label>Sconto massimo al cliente %</Label>
                    <Input type="number" value={scontoMax} onChange={(e) => setScontoMax(e.target.value)} />
                  </div>
                  <div>
                    <Label>Margine minimo %</Label>
                    <Input type="number" value={margineMin} onChange={(e) => setMargineMin(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* TAB 4 — Montaggio */}
          <TabsContent value="montaggio" className="space-y-4 pt-4">
            <div className="flex items-center gap-2">
              <Switch checked={haMontaggio} onCheckedChange={setHaMontaggio} id="ha-montaggio" />
              <label htmlFor="ha-montaggio" className="font-medium">Richiede installazione/montaggio</label>
            </div>
            {haMontaggio && (
              <div className="space-y-3 ml-4">
                <div>
                  <Label>Tipo montaggio</Label>
                  <RadioGroup value={montaggioTipo} onValueChange={setMontaggioTipo} className="flex gap-4 mt-2">
                    {[
                      { v: "incluso", l: "Incluso nel prezzo" },
                      { v: "separato", l: "Voce separata" },
                      { v: "escluso", l: "Escluso (da concordare)" },
                    ].map(({ v, l }) => (
                      <div key={v} className="flex items-center gap-1.5">
                        <RadioGroupItem value={v} id={`mont-${v}`} />
                        <label htmlFor={`mont-${v}`} className="text-sm">{l}</label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                {montaggioTipo === "separato" && (
                  <div>
                    <Label>Tariffa di posa</Label>
                    <Select value={montaggioTariffaId} onValueChange={setMontaggioTariffaId}>
                      <SelectTrigger><SelectValue placeholder="Seleziona tariffa" /></SelectTrigger>
                      <SelectContent>
                        {tariffe.filter((t) => t.tipo === "posa").map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* TAB 5 — Media */}
          <TabsContent value="media" className="space-y-4 pt-4">
            {isNew ? (
              <p className="text-muted-foreground text-sm">Salva prima il prodotto per caricare media.</p>
            ) : (
              <div className="space-y-6">
                <div>
                  <Label>Immagine prodotto</Label>
                  {imgUrl && <img src={imgUrl} alt="Immagine" className="h-24 object-contain rounded border mt-2 mb-2" loading="lazy" />}
                  <label className="cursor-pointer">
                    <Button type="button" variant="outline" size="sm" asChild>
                      <span><Image className="h-4 w-4 mr-2" />{uploadingImg ? "Caricamento..." : "Carica immagine"}</span>
                    </Button>
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingImg}
                      onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], "img")} />
                  </label>
                </div>
                <div>
                  <Label>Scheda tecnica PDF</Label>
                  {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 underline mt-1 mb-2">Apri PDF</a>}
                  <label className="cursor-pointer">
                    <Button type="button" variant="outline" size="sm" asChild>
                      <span><FileText className="h-4 w-4 mr-2" />{uploadingPdf ? "Caricamento..." : "Carica PDF"}</span>
                    </Button>
                    <input type="file" accept=".pdf" className="hidden" disabled={uploadingPdf}
                      onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], "pdf")} />
                  </label>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvataggio..." : "Salva"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function ArticleCatalog() {
  const { effectiveCompany, role } = useAuth() as any;
  const isAdmin = role === "company_admin" || role === "super_admin";
  const companyId = effectiveCompany?.id as string | undefined;
  const queryClient = useQueryClient();

  // Hooks must be declared before any early return (Rules of Hooks)
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterModalita, setFilterModalita] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<ArticleRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["article-templates-pro", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("article_templates") as any)
        .select("*")
        .eq("company_id", companyId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ArticleRow[];
    },
  });

  const { data: categorie = [] } = useQuery({
    queryKey: ["listino-categorie", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase.from("listino_categorie") as any)
        .select("id, nome, colore").eq("company_id", companyId).order("nome");
      return (data ?? []) as Categoria[];
    },
  });

  const { data: tariffe = [] } = useQuery({
    queryKey: ["tariffe-aziendali", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase.from("tariffe_aziendali") as any)
        .select("id, nome, tipo").eq("company_id", companyId).order("nome");
      return (data ?? []) as Tariffa[];
    },
  });

  const toggleAttivoMutation = useMutation({
    mutationFn: async ({ id, attivo }: { id: string; attivo: boolean }) => {
      const { error } = await (supabase.from("article_templates") as any).update({ attivo }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, attivo }) => {
      await queryClient.cancelQueries({ queryKey: ["article-templates-pro", companyId] });
      const prev = queryClient.getQueryData(["article-templates-pro", companyId]);
      queryClient.setQueryData(["article-templates-pro", companyId], (old: ArticleRow[]) =>
        old.map((a) => a.id === id ? { ...a, attivo } : a)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(["article-templates-pro", companyId], ctx?.prev);
      toast.error("Errore nell'aggiornamento");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("article_templates") as any).delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["article-templates-pro", companyId] });
      toast.success("Prodotto eliminato");
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (article: ArticleRow) => {
      const { id, ...rest } = article;
      const { error } = await (supabase.from("article_templates") as any).insert({
        ...rest, name: `${article.name} (copia)`, sku: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["article-templates-pro", companyId] });
      toast.success("Prodotto duplicato");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Early return after all hooks
  if (!companyId) return null;

  const filtered = articles.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      a.name.toLowerCase().includes(q) ||
      (a.sku ?? "").toLowerCase().includes(q) ||
      (a.marca ?? "").toLowerCase().includes(q) ||
      (a.modello ?? "").toLowerCase().includes(q) ||
      (a.description ?? "").toLowerCase().includes(q);
    const matchCat = filterCat === "all" || a.categoria_id === filterCat;
    const matchMod = filterModalita === "all" || a.modalita_prezzo === filterModalita;
    return matchSearch && matchCat && matchMod;
  });

  const kpiConGriglia = articles.filter((a) => a.modalita_prezzo === "griglia").length;
  const kpiConMontaggio = articles.filter((a) => a.ha_montaggio && a.montaggio_tipo === "separato").length;
  const kpiInattivi = articles.filter((a) => !a.attivo).length;

  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const sheet1Data = articles.map((a) => ({
      Nome: a.name,
      SKU: a.sku ?? "",
      Categoria: categorie.find((c) => c.id === a.categoria_id)?.nome ?? "",
      Modalita: a.modalita_prezzo ?? "",
      PrezzoVendita: a.prezzo_vendita ?? "",
      PrezzoAcquisto: isAdmin ? (a.prezzo_acquisto_netto ?? "") : "",
      Attivo: a.attivo ? "Sì" : "No",
    }));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Prodotti");
    if (sheet1Data.length > 0) {
      ws.columns = Object.keys(sheet1Data[0]).map((key) => ({ header: key, key }));
      ws.addRows(sheet1Data);
    }
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().split("T")[0];
    const companyName = (effectiveCompany?.name ?? "azienda").replace(/\s+/g, "_");
    a.download = `listino_${companyName}_${today}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openNew = () => { setEditingArticle(null); setDialogOpen(true); };
  const openEdit = (a: ArticleRow) => { setEditingArticle(a); setDialogOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Listino Prodotti Pro</h1>
          <p className="text-muted-foreground text-sm">Gestisci il catalogo prodotti e servizi</p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Totale prodotti", value: articles.length },
          { label: "Con griglia prezzi", value: kpiConGriglia },
          { label: "Montaggio separato", value: kpiConMontaggio },
          { label: "Inattivi", value: kpiInattivi },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cerca nome o SKU..." className="pl-9"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le categorie</SelectItem>
            {categorie.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterModalita} onValueChange={setFilterModalita}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Modalità" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le modalità</SelectItem>
            <SelectItem value="pz">A pezzo</SelectItem>
            <SelectItem value="mq">Al mq</SelectItem>
            <SelectItem value="misura_libera">Misura libera</SelectItem>
            <SelectItem value="griglia">Griglia prezzi</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />Importa CSV
        </Button>
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <Download className="h-4 w-4 mr-2" />Esporta Excel
        </Button>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />Nuovo
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Nome / SKU</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Modalità</TableHead>
              <TableHead>Prezzo Vendita</TableHead>
              {isAdmin && <TableHead>Margine %</TableHead>}
              <TableHead>Montaggio</TableHead>
              <TableHead>Attivo</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-8">Caricamento...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-muted-foreground">
                Nessun prodotto trovato.
              </TableCell></TableRow>
            ) : filtered.map((a) => {
              const cat = categorie.find((c) => c.id === a.categoria_id);
              const pv = a.prezzo_vendita ?? 0;
              const pa = a.prezzo_acquisto_netto ?? 0;
              const margine = calcMargine(pv, pa);
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    {a.immagine_url ? (
                      <img src={a.immagine_url} alt="" className="h-8 w-8 object-cover rounded" loading="lazy" />
                    ) : (
                      <div className="h-8 w-8 bg-muted rounded flex items-center justify-center">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{a.name}</p>
                    {a.sku && <p className="text-xs text-muted-foreground">{a.sku}</p>}
                  </TableCell>
                  <TableCell>
                    {cat ? (
                      <Badge variant="outline" style={{ borderColor: cat.colore ?? undefined }}>
                        {cat.nome}
                      </Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell><ModalitaBadge m={a.modalita_prezzo} /></TableCell>
                  <TableCell>{pv ? formatCurrency(pv) : "—"}</TableCell>
                  {isAdmin && <TableCell>{pa && pv ? <MargineSemaforo pct={margine} /> : "—"}</TableCell>}
                  <TableCell>
                    {a.ha_montaggio ? (
                      <Badge variant="outline" className="text-xs">
                        {a.montaggio_tipo === "separato" ? "Separato" : a.montaggio_tipo === "incluso" ? "Incluso" : "Escluso"}
                      </Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell>
                    <Switch checked={!!a.attivo}
                      onCheckedChange={(v) => toggleAttivoMutation.mutate({ id: a.id, attivo: v })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => duplicateMutation.mutate(a)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive"
                        onClick={() => setDeleteId(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Article Dialog */}
      {dialogOpen && (
        <ArticleDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          editingArticle={editingArticle}
          companyId={companyId}
          isAdmin={isAdmin}
          categorie={categorie}
          tariffe={tariffe}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["article-templates-pro", companyId] })}
        />
      )}

      {/* CSV Import */}
      <CsvImportDialog
        open={csvOpen} onClose={() => setCsvOpen(false)}
        companyId={companyId} categorie={categorie}
        onDone={() => queryClient.invalidateQueries({ queryKey: ["article-templates-pro", companyId] })}
      />

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina prodotto</AlertDialogTitle>
            <AlertDialogDescription>Questa azione è irreversibile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
