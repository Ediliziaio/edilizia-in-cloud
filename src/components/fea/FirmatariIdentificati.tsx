/**
 * Firmatari identificati per la firma elettronica avanzata.
 *
 * L'identificazione la può fare chi firma (dalla pagina di firma) o l'azienda,
 * che ha visto di persona il documento d'identità e ne carica qui le foto. In
 * quel caso, al primo documento, il firmatario deve solo accettare le
 * condizioni del servizio. Da qui si vedono le foto (link di un minuto) e si
 * revoca un'identificazione quando chi firma lo chiede.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { corpoErroreEdge } from "@/lib/fea/erroreEdge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, IdCard, Loader2, Plus, UserX } from "lucide-react";

interface Firmatario {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  documento_tipo: string;
  documento_scadenza: string;
  modalita: "autonoma" | "azienda";
  dichiarazione_accettata_at: string | null;
  created_at: string;
}

const TIPI: Record<string, string> = { carta_identita: "Carta d'identità", passaporto: "Passaporto", patente: "Patente" };
const dataIT = (d: string | null) => (d ? new Date(d).toLocaleDateString("it-IT") : "—");
const oggi = () => new Date().toLocaleDateString("sv-SE");

async function chiama(fd: FormData): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("fea-firmatario-azienda", { body: fd });
  if (error) throw new Error((await corpoErroreEdge(error)).error ?? "Operazione non riuscita. Riprova.");
  return (data ?? {}) as Record<string, unknown>;
}

const vuoto = { email: "", nome: "", cognome: "", codiceFiscale: "", tipo: "carta_identita", numero: "", rilasciatoDa: "", scadenza: "" };

export function FirmatariIdentificati() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const [dati, setDati] = useState(vuoto);
  const [fronte, setFronte] = useState<File | null>(null);
  const [retro, setRetro] = useState<File | null>(null);
  const [visto, setVisto] = useState(false);

  const { data: firmatari = [], isLoading } = useQuery({
    queryKey: ["fea-firmatari", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Firmatario[]> => {
      // fea_firmatari è nuova (22/10/2026) e non è ancora nei tipi generati.
      const { data, error } = await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
        .from("fea_firmatari")
        .select("id, email, nome, cognome, documento_tipo, documento_scadenza, modalita, dichiarazione_accettata_at, created_at")
        .eq("company_id", companyId!).is("revocato_at", null).order("cognome");
      if (error) throw error;
      return (data ?? []) as unknown as Firmatario[];
    },
  });

  const serveRetro = dati.tipo !== "passaporto";
  const pronto = dati.email.includes("@") && dati.nome.trim() && dati.cognome.trim() && dati.numero.trim() && dati.scadenza && fronte && (!serveRetro || retro) && visto;

  const salva = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("azione", "identifica");
      fd.append("company_id", companyId!);
      fd.append("email", dati.email.trim());
      fd.append("nome", dati.nome.trim());
      fd.append("cognome", dati.cognome.trim());
      fd.append("codice_fiscale", dati.codiceFiscale.trim());
      fd.append("documento_tipo", dati.tipo);
      fd.append("documento_numero", dati.numero.trim());
      fd.append("documento_rilasciato_da", dati.rilasciatoDa.trim());
      fd.append("documento_scadenza", dati.scadenza);
      fd.append("visto", "true");
      fd.append("fronte", fronte!);
      if (retro && serveRetro) fd.append("retro", retro);
      return chiama(fd);
    },
    onSuccess: () => {
      toast.success("Documento registrato: al primo documento la persona dovrà solo accettare le condizioni.");
      qc.invalidateQueries({ queryKey: ["fea-firmatari", companyId] });
      setAperto(false); setDati(vuoto); setFronte(null); setRetro(null); setVisto(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Operazione non riuscita"),
  });

  const azione = useMutation({
    mutationFn: async ({ tipo, id }: { tipo: "vedi" | "revoca"; id: string }) => {
      const fd = new FormData();
      fd.append("azione", tipo);
      fd.append("company_id", companyId!);
      fd.append("firmatario_id", id);
      return { tipo, esito: await chiama(fd) };
    },
    onSuccess: ({ tipo, esito }) => {
      if (tipo === "revoca") {
        toast.success("Identificazione revocata: per firmare con firma avanzata servirà di nuovo il documento.");
        qc.invalidateQueries({ queryKey: ["fea-firmatari", companyId] });
        return;
      }
      for (const url of [esito.fronte, esito.retro]) if (typeof url === "string") window.open(url, "_blank", "noopener");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Operazione non riuscita"),
  });

  const campo = (k: keyof typeof vuoto, etichetta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1">
      <Label>{etichetta}</Label>
      <Input value={dati[k]} onChange={(e) => setDati({ ...dati, [k]: e.target.value })} {...extra} />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-white p-4">
        <div className="max-w-2xl">
          <p className="font-semibold text-slate-900">Chi può firmare con firma avanzata</p>
          <p className="text-sm text-slate-600">
            Se hai visto di persona il documento d'identità di un cliente o di un subappaltatore, caricalo qui: al primo
            documento dovrà solo accettare le condizioni. Altrimenti lo carica lui dalla pagina di firma.
          </p>
        </div>
        <Button className="gap-1" onClick={() => setAperto(true)}><Plus className="h-4 w-4" />Carica documento d'identità</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : firmatari.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-slate-500">Nessuno è ancora identificato.</p>
      ) : (
        <div className="divide-y rounded-xl border bg-white">
          {firmatari.map((f) => {
            const scaduto = f.documento_scadenza < oggi();
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-3 p-3">
                <IdCard className="h-5 w-5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{f.cognome} {f.nome}</p>
                  <p className="truncate text-xs text-slate-500">
                    {f.email} · {TIPI[f.documento_tipo] ?? "Documento"} valido fino al {dataIT(f.documento_scadenza)}
                  </p>
                </div>
                <Badge variant="outline">{f.modalita === "azienda" ? "Caricato dall'azienda" : "Caricato dal firmatario"}</Badge>
                {scaduto ? <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Documento scaduto</Badge>
                  : f.dichiarazione_accettata_at ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Condizioni accettate il {dataIT(f.dichiarazione_accettata_at)}</Badge>
                  : <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Accetterà le condizioni al primo documento</Badge>}
                <Button size="sm" variant="ghost" className="gap-1" disabled={azione.isPending} onClick={() => azione.mutate({ tipo: "vedi", id: f.id })}>
                  <Eye className="h-3.5 w-3.5" />Foto
                </Button>
                <Button size="sm" variant="ghost" className="gap-1 text-red-600" disabled={azione.isPending}
                  onClick={() => { if (window.confirm(`Revocare l'identificazione di ${f.nome} ${f.cognome}?`)) azione.mutate({ tipo: "revoca", id: f.id }); }}>
                  <UserX className="h-3.5 w-3.5" />Revoca
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={aperto} onOpenChange={(v) => { if (!salva.isPending) setAperto(v); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Carica un documento d'identità</DialogTitle>
            <DialogDescription>
              Per chi hai identificato di persona. L'email deve essere quella a cui mandi i documenti da firmare.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {campo("email", "Email di chi firma", { type: "email" })}
            <div className="grid grid-cols-2 gap-3">{campo("nome", "Nome")}{campo("cognome", "Cognome")}</div>
            {campo("codiceFiscale", "Codice fiscale (facoltativo)", { maxLength: 16 })}
            <div className="space-y-1">
              <Label>Documento</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={dati.tipo} onChange={(e) => setDati({ ...dati, tipo: e.target.value })}>
                {Object.entries(TIPI).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">{campo("numero", "Numero")}{campo("scadenza", "Scade il", { type: "date" })}</div>
            {campo("rilasciatoDa", "Rilasciato da (facoltativo)")}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>{serveRetro ? "Foto del fronte" : "Pagina con i dati"}</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFronte(e.target.files?.[0] ?? null)} /></div>
              {serveRetro && <div className="space-y-1"><Label>Foto del retro</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(e) => setRetro(e.target.files?.[0] ?? null)} /></div>}
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <Checkbox checked={visto} onCheckedChange={(v) => setVisto(v === true)} className="mt-0.5" />
              <span>Ho visto il documento originale e la persona corrisponde alla foto.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAperto(false)} disabled={salva.isPending}>Annulla</Button>
            <Button onClick={() => salva.mutate()} disabled={!pronto || salva.isPending}>
              {salva.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Registra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
