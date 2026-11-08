import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useControlloDocumento } from "@/hooks/useControlloDocumento";
import { EmailComposeDialog } from "@/pages/azienda/email/components/EmailComposeDialog";
import {
  ESITO_CLASSI, ESITO_LABEL, etichettaConteggio, confermaPossibile, contaEsiti, emailCorrezione, motivoObbligatorio, righeDaCorreggere,
  type RigaConfronto,
} from "@/lib/acquisti/controlloDocumento";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Riferimento {
  numero: string;
  fornitore: string | null;
  email: string | null;
  status: string | null;
  torna: string;
}

function Differenze({ riga, canViewCosts }: { riga: RigaConfronto; canViewCosts: boolean }) {
  const campi = riga.campi.filter((c) => c.esito !== "verde" && (canViewCosts || c.campo !== "Prezzo"));
  if (!campi.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
      {campi.map((c, i) => (
        <li key={i}><strong>{c.campo}:</strong> {c.nota ?? `${c.chiesto ?? "—"} → ${c.letto ?? "—"}`}{c.nota && c.chiesto && c.letto ? ` (${c.chiesto} → ${c.letto})` : ""}</li>
      ))}
    </ul>
  );
}

export default function ControlloDocumentoFornitore() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const { canViewCosts } = usePermissions();
  const { controllo, caricamento, decidi, accetta } = useControlloDocumento(id);
  const [accetto, setAccetto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [emailAperta, setEmailAperta] = useState(false);
  const [conferma, setConferma] = useState(false);
  const confermaInCorso = useRef(false);

  const riferimento = useQuery({
    queryKey: ["controllo-documento", "riferimento", controllo?.purchase_order_id, controllo?.rfq_supplier_id],
    enabled: !!controllo,
    queryFn: async (): Promise<Riferimento> => {
      if (controllo!.purchase_order_id) {
        const { data, error } = await db.from("purchase_orders").select("id, oda_number, status, suppliers(name, email)").eq("id", controllo!.purchase_order_id).single();
        if (error) throw error;
        return { numero: data.oda_number, fornitore: data.suppliers?.name ?? null, email: data.suppliers?.email ?? null, status: data.status, torna: `/azienda/ordini-acquisto/${data.id}` };
      }
      const { data, error } = await db.from("supplier_rfq_suppliers").select("rfq_id, suppliers(name, email), supplier_rfqs(rfq_number)").eq("id", controllo!.rfq_supplier_id).single();
      if (error) throw error;
      return { numero: data.supplier_rfqs?.rfq_number ?? "offerta", fornitore: data.suppliers?.name ?? null, email: data.suppliers?.email ?? null, status: null, torna: `/azienda/richieste-offerta/${data.rfq_id}` };
    },
  });

  if (caricamento) return <p role="status" className="p-6 text-sm text-muted-foreground">Caricamento…</p>;
  if (!controllo) return <p role="status" className="p-6 text-sm text-muted-foreground">Controllo non trovato.</p>;

  const righe = controllo.righe ?? [];
  const conti = contaEsiti(righe);
  const rif = riferimento.data;
  const daCorreggere = righeDaCorreggere(righe);
  const accettabile = controllo.stato === "letto" && !controllo.accettato_il && controllo.esito !== "verde";
  const obbligo = motivoObbligatorio(controllo.esito);
  const puoConfermare = controllo.tipo === "conferma" && rif?.status === "inviato" && confermaPossibile(controllo);
  const email = rif ? emailCorrezione({ numero: rif.numero, fornitore: rif.fornitore, azienda: effectiveCompany?.name, righe }) : null;

  const apriDocumento = async () => {
    if (!controllo.file_path) return;
    const [bucket, ...percorso] = controllo.file_path.split("/");
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(percorso.join("/"), 600);
    if (error || !data?.signedUrl) { toast.error("Documento non disponibile"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const segnaConfermato = async () => {
    if (confermaInCorso.current || !controllo.purchase_order_id) return;
    confermaInCorso.current = true;
    setConferma(true);
    try {
      const { error } = await db.from("purchase_orders").update({ status: "confermato", confirmed_at: new Date().toISOString() }).eq("id", controllo.purchase_order_id);
      if (error) throw new Error(error.message);
      toast.success("Ordine confermato");
      qc.invalidateQueries({ queryKey: ["controllo-documento"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    } catch (e) {
      toast.error("Ordine non confermato", { description: e instanceof Error ? e.message : "Riprova." });
    } finally {
      confermaInCorso.current = false;
      setConferma(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => rif ? navigate(rif.torna) : navigate(-1)}><ArrowLeft className="mr-1 h-4 w-4" />Torna {rif ? `a ${rif.numero}` : "indietro"}</Button>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-white p-4">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">Controllo {controllo.tipo === "conferma" ? "conferma d'ordine" : "offerta"}{rif ? ` · ${rif.numero}` : ""}</h1>
          <p className="text-sm text-muted-foreground">{rif?.fornitore ?? "Fornitore"} · {controllo.file_nome ?? "Documento"}</p>
          <p className="mt-2 flex flex-wrap gap-1.5 text-xs" aria-label="Riepilogo esiti">
            {(["rosso", "da_controllare", "giallo", "verde"] as const).filter((e) => conti[e] > 0).map((e) => (
              <span key={e} className={`rounded-full px-2 py-0.5 font-semibold ${ESITO_CLASSI[e]}`}>{etichettaConteggio(e, conti[e])}</span>
            ))}
          </p>
          {controllo.accettato_il && (
            <p className="mt-2 text-sm text-emerald-800">Accettato{controllo.accettato_motivo ? `: ${controllo.accettato_motivo}` : ""}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {controllo.file_path && <Button variant="outline" size="sm" onClick={apriDocumento}><ExternalLink className="mr-1.5 h-4 w-4" />Apri documento</Button>}
          {daCorreggere.length > 0 && rif && <Button variant="outline" size="sm" onClick={() => setEmailAperta(true)}><Mail className="mr-1.5 h-4 w-4" />Prepara email di correzione</Button>}
          {accettabile && <Button variant="outline" size="sm" onClick={() => setAccetto(true)}>Accetto</Button>}
          {puoConfermare && <Button size="sm" disabled={conferma} onClick={segnaConfermato}>{conferma ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}Segna confermato</Button>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-600">
            <th className="p-2 pl-3">Posizione</th>
            <th className="p-2">{controllo.tipo === "conferma" ? "Ordinato" : "Chiesto"}</th>
            <th className="p-2">{controllo.tipo === "conferma" ? "Confermato" : "Offerto"}</th>
            <th className="p-2 pr-3">Esito</th>
          </tr></thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.chiave} className="border-b align-top last:border-0">
                <td className="p-2 pl-3"><span className="font-medium">{r.riferimento ?? r.descrizione}</span>{r.riferimento && <span className="block text-xs text-muted-foreground">{r.descrizione}</span>}</td>
                <td className="p-2">{r.chiesto}</td>
                <td className="p-2">{r.letto}<Differenze riga={r} canViewCosts={canViewCosts} />{r.da_offerta && <span className="mt-1 block text-xs text-slate-500">Uguale all'offerta già controllata</span>}</td>
                <td className="p-2 pr-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESITO_CLASSI[r.esito]}`}>{r.deciso_da_persona ? `${ESITO_LABEL[r.esito]} (a mano)` : ESITO_LABEL[r.esito]}</span>
                  {r.esito === "da_controllare" && (
                    <span className="mt-1.5 flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={decidi.isPending} onClick={() => decidi.mutate({ chiave: r.chiave, esito: "verde" })}>È giusta</Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={decidi.isPending} onClick={() => decidi.mutate({ chiave: r.chiave, esito: "rosso" })}>È sbagliata</Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={accetto} onOpenChange={setAccetto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accetti il documento così com'è?</DialogTitle>
            <DialogDescription>{obbligo ? "Ci sono errori o letture incerte: scrivi perché vanno bene lo stesso." : "Differenze di prezzo o consegna: un motivo è facoltativo."}</DialogDescription>
          </DialogHeader>
          <Textarea aria-label="Motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Es. differenza concordata al telefono con il fornitore" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAccetto(false)}>Torno indietro</Button>
            <Button disabled={accetta.isPending || (obbligo && motivo.trim().length < 5)} onClick={() => accetta.mutate(motivo.trim(), { onSuccess: () => setAccetto(false) })}>Accetto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {email && (
        <EmailComposeDialog open={emailAperta} onOpenChange={setEmailAperta}
          context={{ mode: "new", initialTo: rif?.email ? [rif.email] : [], initialSubject: email.oggetto, initialBodyHtml: email.corpo }} />
      )}
    </div>
  );
}
