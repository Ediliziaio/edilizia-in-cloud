import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, FileText, Search } from "lucide-react";
import { toast } from "sonner";

/**
 * Ordina un documento ufficiale openapi (DocuEngine o Visengine/Visure Camerali)
 * per un contatto/opportunità. Il file scaricato viene collegato via marketing_documents
 * (contact_id + opportunity_id) → compare nel Contatto e nell'Opportunità, stesso file.
 * Flusso: catalogo → ordine → polling stato → alla fine invalida i documenti CRM.
 */

type Provider = "docuengine" | "visengine";

interface DocuDoc { id: string; name?: string; nameIT?: string; category?: string; price?: number; isSync?: boolean; }
interface VisuraDoc { hash_visura: string; nome_visura: string; nome_categoria?: string; }

async function invoke<T = any>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("lead-scraper", { body: { action, ...extra } });
  if (error) throw new Error(error.message);
  if (data?.ok === false) throw new Error(data.error || "Errore openapi");
  return data as T;
}

export function OpenapiDocRequestDialog({
  open, onOpenChange, contactId, opportunityId, companyId, defaultVat,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contactId: string;
  opportunityId?: string;
  companyId: string;
  defaultVat?: string;
}) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState<Provider>("visengine");
  const [loadingCat, setLoadingCat] = useState(false);
  const [docuDocs, setDocuDocs] = useState<DocuDoc[]>([]);
  const [visure, setVisure] = useState<VisuraDoc[]>([]);
  const [catErr, setCatErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [vat, setVat] = useState(defaultVat ?? "");
  const [ordering, setOrdering] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);

  // Carica il catalogo alla prima apertura per provider
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setCatErr(null);
    let active = true;
    (async () => {
      try {
        setLoadingCat(true);
        if (provider === "docuengine") {
          if (docuDocs.length) return;
          const r = await invoke<{ documents: any[] }>("docuengine_documents");
          if (active) setDocuDocs((r.documents ?? []).map((d) => ({ id: d.id, name: d.name ?? d.nameIT, nameIT: d.nameIT, category: d.category, price: d.price, isSync: d.isSync })));
        } else {
          if (visure.length) return;
          const r = await invoke<{ visure: any[] }>("visengine_catalog");
          if (active) setVisure((r.visure ?? []).map((v) => ({ hash_visura: v.hash_visura, nome_visura: v.nome_visura, nome_categoria: v.nome_categoria })));
        }
      } catch (e) {
        if (active) setCatErr((e as Error).message);
      } finally {
        if (active) setLoadingCat(false);
      }
    })();
    return () => { active = false; };
  }, [open, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open) setVat(defaultVat ?? ""); }, [open, defaultVat]);

  async function order() {
    if (!selected) { toast.error("Seleziona un documento"); return; }
    const idc = vat.replace(/\s/g, "");
    if (!idc) { toast.error("Inserisci P.IVA o Codice Fiscale"); return; }
    setOrdering(true);
    setPhase("Invio ordine…");
    try {
      let requestId: string | null = null;
      if (provider === "docuengine") {
        const r = await invoke<{ request_id: string }>("docuengine_request", {
          documentId: selected,
          documentName: docuDocs.find((d) => d.id === selected)?.name,
          search: { taxCode: idc, vatCode: idc, value: idc },
          contact_id: contactId, opportunity_id: opportunityId, company_id: companyId,
        });
        requestId = r.request_id;
      } else {
        const v = visure.find((x) => x.hash_visura === selected);
        const r = await invoke<{ request_id: string }>("visengine_request", {
          hash: selected, documentName: v?.nome_visura,
          ricerca: { piva: idc, cf: idc },
          contact_id: contactId, opportunity_id: opportunityId, company_id: companyId,
        });
        requestId = r.request_id;
      }
      if (!requestId) throw new Error("Nessun id richiesta restituito da openapi");

      // Polling stato (max ~2 min)
      const statusAction = provider === "docuengine" ? "docuengine_status" : "visengine_status";
      for (let i = 0; i < 30; i++) {
        setPhase(`Elaborazione documento… (${i * 4}s)`);
        await new Promise((res) => setTimeout(res, 4000));
        const s = await invoke<{ done: boolean; state: string; marketing_document_id: string | null }>(statusAction, { request_id: requestId });
        if (s.done) {
          setPhase(null);
          qc.invalidateQueries({ queryKey: ["marketing_documents"] });
          toast.success("Documento pronto e allegato al contatto/opportunità");
          onOpenChange(false);
          return;
        }
      }
      // Non pronto entro il timeout: resta in coda lato openapi, comparirà dopo
      qc.invalidateQueries({ queryKey: ["openapi_document_requests"] });
      toast.info("Ordine inviato. Il documento arriverà a breve — comparirà nei documenti appena pronto.");
      onOpenChange(false);
    } catch (e) {
      toast.error("Errore ordine", { description: (e as Error).message });
    } finally {
      setOrdering(false);
      setPhase(null);
    }
  }

  const docuFiltered = docuDocs.filter((d) => !filter || (d.name ?? "").toLowerCase().includes(filter.toLowerCase()));
  const visFiltered = visure.filter((v) => !filter || v.nome_visura.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(v) => !ordering && onOpenChange(v)}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Richiedi documento ufficiale</DialogTitle>
          <DialogDescription>
            Visure camerali e documenti ufficiali (Registro Imprese, AdE, INPS) via openapi.
            Il file viene allegato al contatto{opportunityId ? " e all'opportunità" : ""}.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={provider} onValueChange={(v) => { setProvider(v as Provider); setFilter(""); setSelected(null); }}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="visengine">Visure Camerali</TabsTrigger>
            <TabsTrigger value="docuengine">Documenti ufficiali</TabsTrigger>
          </TabsList>

          <div className="mt-3 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-7 h-8 text-sm" placeholder="Cerca…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>

          <div className="mt-2 border rounded-lg overflow-y-auto" style={{ maxHeight: "34vh" }}>
            {loadingCat ? (
              <div className="p-2 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : catErr ? (
              <p className="text-xs text-destructive p-3">{catErr}</p>
            ) : (
              <TabsContent value="docuengine" className="m-0">
                {docuFiltered.map((d) => (
                  <button key={d.id} onClick={() => setSelected(d.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 border-b last:border-0 hover:bg-muted/40 ${selected === d.id ? "bg-orange-50" : ""}`}>
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{d.name}</span>
                    {typeof d.price === "number" && <span className="text-[11px] text-muted-foreground">€{d.price.toFixed(2)}</span>}
                  </button>
                ))}
                {!docuFiltered.length && <p className="text-xs text-muted-foreground p-3 text-center">Nessun documento</p>}
              </TabsContent>
            )}
            {!loadingCat && !catErr && (
              <TabsContent value="visengine" className="m-0">
                {visFiltered.map((v) => (
                  <button key={v.hash_visura} onClick={() => setSelected(v.hash_visura)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 border-b last:border-0 hover:bg-muted/40 ${selected === v.hash_visura ? "bg-orange-50" : ""}`}>
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{v.nome_visura}</span>
                    {v.nome_categoria && <span className="text-[10px] text-muted-foreground">{v.nome_categoria}</span>}
                  </button>
                ))}
                {!visFiltered.length && <p className="text-xs text-muted-foreground p-3 text-center">Nessuna visura</p>}
              </TabsContent>
            )}
          </div>
        </Tabs>

        <div className="mt-1">
          <Label className="text-xs">P.IVA / Codice Fiscale dell'azienda *</Label>
          <Input value={vat} onChange={(e) => setVat(e.target.value)} placeholder="es. 12345678901" inputMode="numeric" />
        </div>

        {phase && (
          <div className="flex items-center gap-2 text-sm text-orange-700 bg-orange-50 rounded-md px-3 py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {phase}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={ordering}>Annulla</Button>
          <Button onClick={order} disabled={ordering || !selected}>
            {ordering ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Richiedi documento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
