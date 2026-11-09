// Il rendiconto accettato dal committente (09/11/2026): o lo segna l'ufficio, dicendo chi, quando e come,
// o firma il committente col link della firma elettronica e il rendiconto si approva da solo.
import { useEffect, useState, type ReactElement } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, Paperclip, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { useRendicontoAppaltoPDF } from "@/hooks/useRendicontoAppaltoPDF";
import { supabase } from "@/integrations/supabase/client";
import { campoWorkDay } from "@/lib/campo/workDay";

// Colonne e funzioni nuove, non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const BUCKET = "quote-pdfs";

export const COME_ACCETTATO: Record<string, string> = {
  carta: "Firmato su carta", email: "Per email", pec: "Per PEC", voce: "A voce", firma_elettronica: "Firma elettronica",
};
const dataIt = (d: string | null | undefined): string => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

export interface SalAccettazione {
  id: string;
  numero: number;
  company_id?: string | null;
  stato: string;
  accettato_da_nome?: string | null;
  accettato_il?: string | null;
  accettato_come?: string | null;
  accettato_nota?: string | null;
  accettato_allegato_path?: string | null;
}

export interface RichiestaFirma {
  id: string; appalto_sal_id: string; status: string; signer_name: string; signer_email: string;
  created_at: string; expires_at: string | null; rifiuto_motivo: string | null;
}

/** L'ultima richiesta di firma di ogni rendiconto. */
export function useRichiesteFirmaRendiconti(ids: readonly string[]): Map<string, RichiestaFirma> {
  const { data = new Map<string, RichiestaFirma>() } = useQuery({
    queryKey: ["firme-rendiconti", [...ids].sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<string, RichiestaFirma>> => {
      const { data: righe, error } = await db.from("signature_requests")
        .select("id, appalto_sal_id, status, signer_name, signer_email, created_at, expires_at, rifiuto_motivo")
        .in("appalto_sal_id", ids).order("created_at", { ascending: false });
      if (error) throw error;
      const m = new Map<string, RichiestaFirma>();
      for (const r of (righe ?? []) as RichiestaFirma[]) if (!m.has(r.appalto_sal_id)) m.set(r.appalto_sal_id, r);
      return m;
    },
  });
  return data;
}

const invalida = (qc: ReturnType<typeof useQueryClient>): void => {
  void qc.invalidateQueries({ queryKey: ["appalto-sal"] });
  void qc.invalidateQueries({ queryKey: ["appalto-rendiconto"] });
  void qc.invalidateQueries({ queryKey: ["firme-rendiconti"] });
};

/** La riga che dice a che punto è l'accettazione. */
export function StatoAccettazione({ sal, richiesta, puoModificare }: { sal: SalAccettazione; richiesta?: RichiestaFirma; puoModificare: boolean }): ReactElement | null {
  const qc = useQueryClient();
  const ritira = useMutation({
    mutationFn: async () => { const { error } = await db.rpc("appalto_sal_firma_annulla", { p_id: sal.id }); if (error) throw error; },
    onSuccess: () => { invalida(qc); toast.success("Link di firma ritirato"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const apriCopia = async (): Promise<void> => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(sal.accettato_allegato_path!, 3600);
    if (error || !data?.signedUrl) { toast.error("La copia non si apre. Riprova tra poco."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };
  if (sal.accettato_da_nome) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Accettato da <strong>{sal.accettato_da_nome}</strong> il {dataIt(sal.accettato_il)} · {COME_ACCETTATO[sal.accettato_come ?? ""] ?? sal.accettato_come}</span>
        {sal.accettato_nota && <span className="text-slate-600">«{sal.accettato_nota}»</span>}
        {sal.accettato_allegato_path && (
          <button type="button" className="tap-compact inline-flex items-center gap-1 font-medium underline" onClick={() => void apriCopia()}><Paperclip className="h-3 w-3" aria-hidden="true" />Copia firmata</button>
        )}
      </p>
    );
  }
  if (!richiesta || sal.stato !== "inviato") return null;
  if (richiesta.status === "pending" || richiesta.status === "otp_verified") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-800">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>In attesa della firma di <strong>{richiesta.signer_name}</strong> ({richiesta.signer_email}), mandato il {dataIt(richiesta.created_at)}</span>
        {puoModificare && <button type="button" className="tap-compact font-medium underline" disabled={ritira.isPending} onClick={() => ritira.mutate()}>Ritira il link</button>}
      </p>
    );
  }
  if (richiesta.status === "refused") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-red-700">
        <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span><strong>{richiesta.signer_name}</strong> ha rifiutato di firmare{richiesta.rifiuto_motivo ? `: «${richiesta.rifiuto_motivo}»` : "."}</span>
      </p>
    );
  }
  return null;
}

export function SegnaAccettatoDialog({ sal, onChiudi }: { sal: SalAccettazione; onChiudi: () => void }): ReactElement {
  const qc = useQueryClient();
  const oggi = campoWorkDay();
  const [nome, setNome] = useState("");
  const [giorno, setGiorno] = useState(oggi);
  const [come, setCome] = useState("carta");
  const [nota, setNota] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const salva = useMutation({
    mutationFn: async () => {
      let percorso: string | null = null;
      if (file) {
        percorso = `${sal.company_id}/rendiconti/${sal.id}/accettazione-${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error: errFile } = await supabase.storage.from(BUCKET).upload(percorso, file, { contentType: file.type || undefined });
        if (errFile) throw new Error("Non riesco a salvare la copia firmata. Riprova tra poco.");
      }
      const { error } = await db.from("appalto_sal").update({
        stato: "approvato", accettato_da_nome: nome.trim(), accettato_il: giorno, accettato_come: come,
        accettato_nota: nota.trim() || null, accettato_allegato_path: percorso,
      }).eq("id", sal.id);
      if (error) throw error;
    },
    onSuccess: () => { invalida(qc); toast.success("Rendiconto accettato"); onChiudi(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const pronto = nome.trim().length > 1 && !!giorno && giorno <= oggi;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salva.isPending) onChiudi(); }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Rendiconto n. {sal.numero} accettato</DialogTitle>
          <DialogDescription>Una volta segnato non torna indietro: resta la prova di quello che fatturi.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="acc-nome">Chi l’ha accettato</Label><Input id="acc-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome e cognome" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="acc-giorno">Quando</Label><Input id="acc-giorno" type="date" max={oggi} value={giorno} onChange={(e) => setGiorno(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Come</Label><OfficeSelect label="Come" value={come} onValueChange={setCome} options={["carta", "email", "pec", "voce"].map((v) => ({ value: v, label: COME_ACCETTATO[v] }))} /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="acc-nota">Nota (facoltativa)</Label><Textarea id="acc-nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="acc-file">Copia firmata (facoltativa)</Label><Input id="acc-file" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={salva.isPending}>Annulla</Button>
          <Button disabled={!pronto || salva.isPending} onClick={() => salva.mutate()}>{salva.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Segna accettato</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MandaFirmaDialog({ sal, committenteId, onChiudi }: { sal: SalAccettazione; committenteId: string; onChiudi: () => void }): ReactElement {
  const qc = useQueryClient();
  const { stampa } = useRendicontoAppaltoPDF();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const { data: committente } = useQuery({
    queryKey: ["firma-rendiconto-committente", committenteId],
    queryFn: async (): Promise<{ business_name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null> => {
      const { data, error } = await db.from("profiles").select("business_name, first_name, last_name, email, phone").eq("id", committenteId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!committente) return;
    setNome((n) => n || [committente.first_name, committente.last_name].filter(Boolean).join(" ") || committente.business_name || "");
    setEmail((v) => v || committente.email || "");
    setTelefono((v) => v || committente.phone || "");
  }, [committente]);
  const manda = useMutation({
    mutationFn: async () => {
      const blob = await stampa(sal.id, { soloFile: true });
      if (!blob) throw new Error("Non riesco a preparare il PDF del rendiconto.");
      const percorso = `${sal.company_id}/rendiconti/${sal.id}/${Date.now()}.pdf`;
      const { error: errFile } = await supabase.storage.from(BUCKET).upload(percorso, blob, { contentType: "application/pdf" });
      if (errFile) throw new Error("Non riesco a salvare il PDF del rendiconto. Riprova tra poco.");
      const { error: errSal } = await db.from("appalto_sal").update({ pdf_path: percorso }).eq("id", sal.id);
      if (errSal) throw new Error("Non riesco a collegare il PDF al rendiconto. Riprova tra poco.");
      // Il reinvio sostituisce il link vecchio: non restano due link validi.
      const { error: errRitiro } = await db.rpc("appalto_sal_firma_annulla", { p_id: sal.id });
      if (errRitiro) throw new Error("Non riesco a ritirare il link precedente. Riprova tra poco.");
      const { error } = await supabase.functions.invoke("fea-richiedi-firma", {
        body: {
          tipo_documento: "rendiconto", documento_id: sal.id, tipo_firmatario: "b2b",
          signer_name: nome.trim(), signer_email: email.trim(), signer_phone: telefono.trim() || undefined,
          expires_giorni: 30, note: `Rendiconto n. ${sal.numero} da accettare`,
        },
      });
      if (error) {
        let messaggio = "Invio non riuscito. Riprova tra poco.";
        try {
          const corpo = await (error as { context?: Response }).context?.json?.();
          if (typeof corpo?.error === "string" && corpo.error.length < 200) messaggio = corpo.error;
        } catch { /* messaggio generico */ }
        throw new Error(messaggio);
      }
    },
    onSuccess: () => { invalida(qc); toast.success("Rendiconto mandato da firmare", { description: "Il committente riceve il link per leggerlo e firmarlo con un codice." }); onChiudi(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const pronto = nome.trim().length > 1 && /^\S+@\S+\.\S+$/.test(email.trim());
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !manda.isPending) onChiudi(); }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Manda il rendiconto n. {sal.numero} da firmare</DialogTitle>
          <DialogDescription>Riceve un link per email, legge il PDF e firma con un codice. Quando firma, il rendiconto risulta accettato.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="fir-nome">Chi firma</Label><Input id="fir-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="fir-email">Email</Label><Input id="fir-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="fir-tel">Cellulare (facoltativo, per il codice via SMS)</Label><Input id="fir-tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={manda.isPending}>Annulla</Button>
          <Button disabled={!pronto || manda.isPending} onClick={() => manda.mutate()}>{manda.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Manda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
