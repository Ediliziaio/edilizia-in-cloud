import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuickContactSendDialog } from "@/components/contacts/QuickContactSendDialog";
import { useAuth } from "@/contexts/AuthContext";
import { chiamaServerPos } from "@/hooks/usePos";
import { supabase } from "@/integrations/supabase/client";
import { oggiRoma } from "../../../../supabase/functions/_shared/posData";

export type DestinatarioPos = "cse" | "affidataria";

/** Giorni entro cui chi riceve il POS deve verificarlo (art. 101 comma 3 del D.Lgs 81/2008). */
export const GIORNI_VERIFICA_POS = 15;
/** Il promemoria scatta due giorni prima della scadenza: le notifiche partono il giorno della data, non prima. */
const GIORNI_ANTICIPO_PROMEMORIA = 2;
const LIMITE_ALLEGATO = 15 * 1024 * 1024;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nomeSicuro = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);

/** Aggiunge giorni a una data aaaa-mm-gg senza passare dai fusi orari. */
export function piuGiorni(iso: string, giorni: number): string {
  const [a, m, g] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, g + giorni));
  return d.toISOString().slice(0, 10);
}

export function testiInvioPos(tipo: DestinatarioPos, d: { codice: string; revisione: number; impresa: string; cantiere: string }) {
  const oggetto = `POS ${d.codice} — revisione ${d.revisione}${d.impresa ? ` — ${d.impresa}` : ""}`;
  const dove = d.cantiere ? ` per il cantiere ${d.cantiere}` : "";
  const verifica = tipo === "cse"
    ? "per la verifica di idoneità e coerenza con il PSC"
    : "per la verifica di congruenza con il vostro POS";
  const corpo = `Buongiorno,\nin allegato il Piano Operativo di Sicurezza dell'impresa ${d.impresa || "—"}${dove} (revisione ${d.revisione}), ${verifica}.\n`
    + `La verifica va effettuata entro ${GIORNI_VERIFICA_POS} giorni dalla ricezione (art. 101, comma 3, D.Lgs 81/2008). Vi chiedo un riscontro scritto.\nCordiali saluti`;
  return { oggetto, corpo };
}

/** Il coordinatore per l'esecuzione (CSE) nominato sulla commessa, se c'è: nome ed e-mail per precompilare l'invio. */
export function useIncaricoCse(companyId: string, orderId: string, abilitato: boolean) {
  return useQuery({
    queryKey: ["pos", "incarico-cse", companyId, orderId], enabled: abilitato && !!companyId && !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sicurezza_incarichi" as never).select("nominativo,email,stato")
        .eq("company_id", companyId).eq("order_id", orderId).eq("ruolo", "cse").neq("stato", "cessato").order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      const riga = ((data ?? []) as Array<{ nominativo: string; email: string | null }>)[0];
      return riga ? { nome: riga.nominativo, email: riga.email ?? "" } : null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

interface Props {
  tipo: DestinatarioPos;
  companyId: string;
  orderId: string;
  /** L'emissione completata della revisione corrente: è il PDF che si invia. */
  emissioneId: string | null;
  codice: string;
  revisione: number;
  impresa: string;
  cantiere: string;
  nomeIniziale: string;
  emailIniziale: string;
  /** Non si invia con modifiche non salvate: la data registrata dev'essere quella vera. */
  disabilitato: boolean;
  /** Registra l'invio nelle date della consegna (e le salva). */
  onInviato: (tipo: DestinatarioPos, quando: string) => void;
}

/**
 * «Invia per e-mail» accanto alla consegna del POS al CSE o all'impresa affidataria. L'e-mail parte dalla casella collegata
 * dell'utente (resta nella sua posta come prova) col PDF approvato in allegato; a invio riuscito si registra la data e parte il
 * conto dei 15 giorni, con un promemoria nelle attività. Nulla parte senza che l'utente prema «Invia» nel compositore.
 */
export function InvioPos({ tipo, companyId, orderId, emissioneId, codice, revisione, impresa, cantiere, nomeIniziale, emailIniziale, disabilitato, onInviato }: Props) {
  const { user } = useAuth();
  const [destinatario, setDestinatario] = useState(false);
  const [nome, setNome] = useState(nomeIniziale);
  const [email, setEmail] = useState(emailIniziale);
  const [inCorso, setInCorso] = useState(false);
  const [compositore, setCompositore] = useState<null | { allegato: { name: string; size: number; mime: string; storage_path: string } }>(null);
  const etichetta = tipo === "cse" ? "Invia al CSE" : "Invia all’impresa affidataria";
  const motivo = !emissioneId ? "Approva il POS: l’invio parte dal PDF approvato" : disabilitato ? "Salva prima le modifiche" : undefined;

  const apri = () => { setNome(nomeIniziale); setEmail(emailIniziale); setDestinatario(true); };

  const preparaAllegato = async () => {
    if (!user?.id || !emissioneId) return;
    if (!EMAIL.test(email.trim())) { toast.error("Scrivi un indirizzo e-mail valido"); return; }
    setInCorso(true);
    try {
      const { url } = await chiamaServerPos<{ url: string }>({ azione: "scarica_emissione", company_id: companyId, emissione_id: emissioneId, tipo: "pdf" });
      const risposta = await fetch(url);
      if (!risposta.ok) throw new Error("Il PDF approvato non è scaricabile in questo momento");
      const blob = await risposta.blob();
      if (blob.size === 0 || blob.size > LIMITE_ALLEGATO) throw new Error("Il PDF approvato è troppo grande per l’e-mail: scaricalo e invialo a mano");
      const intestazione = new TextDecoder().decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
      if (intestazione !== "%PDF-") throw new Error("Il file scaricato non è un PDF");
      const nomeFile = `POS-${nomeSicuro(codice)}-rev${revisione}.pdf`;
      const percorso = `${user.id}/pos/${crypto.randomUUID()}-${nomeFile}`;
      const { error } = await supabase.storage.from("email-attachments").upload(percorso, blob, { contentType: "application/pdf", upsert: false });
      if (error) throw new Error("Caricamento del PDF fallito");
      setDestinatario(false);
      setCompositore({ allegato: { name: nomeFile, size: blob.size, mime: "application/pdf", storage_path: percorso } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Non riesco a preparare l’e-mail");
    } finally { setInCorso(false); }
  };

  const dopoInvio = async () => {
    const oggi = oggiRoma();
    onInviato(tipo, oggi);
    // Promemoria: due giorni prima della scadenza dei 15 giorni. Se non si crea, l'invio è comunque registrato.
    if (user?.id) {
      const { error } = await supabase.from("tasks").insert({
        company_id: companyId, created_by: user.id, assigned_to: user.id, order_id: orderId, priority: "alta",
        title: `Verifica del POS ${codice} (${tipo === "cse" ? "CSE" : "impresa affidataria"}): scade il ${piuGiorni(oggi, GIORNI_VERIFICA_POS).split("-").reverse().join("/")}`,
        notes: `POS ${codice}, revisione ${revisione}, inviato il ${oggi.split("-").reverse().join("/")} a ${nome.trim() || email.trim()}. Chi lo riceve deve verificarlo entro ${GIORNI_VERIFICA_POS} giorni (art. 101, comma 3, D.Lgs 81/2008): senza riscontro, sollecita.`,
        due_date: piuGiorni(oggi, GIORNI_VERIFICA_POS - GIORNI_ANTICIPO_PROMEMORIA),
      } as never);
      if (error) toast.warning("Invio registrato, ma il promemoria non è stato creato: segnati tu la scadenza dei 15 giorni");
    }
    setCompositore(null);
  };

  const testi = testiInvioPos(tipo, { codice, revisione, impresa, cantiere });
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="tap-compact gap-1" disabled={!emissioneId || disabilitato} title={motivo} onClick={apri}>
        <Send className="h-4 w-4" aria-hidden="true" />{etichetta}
      </Button>
      <Dialog open={destinatario} onOpenChange={(o) => !inCorso && setDestinatario(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{etichetta}</DialogTitle>
            <DialogDescription>Il PDF approvato (revisione {revisione}) parte dalla tua casella e-mail. Nel passo dopo puoi rivedere il testo: l’e-mail parte solo quando premi «Invia».</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={`invio-pos-nome-${tipo}`} className="text-xs font-medium text-slate-700">Nome del destinatario</Label>
              <Input id={`invio-pos-nome-${tipo}`} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={tipo === "cse" ? "Coordinatore per l’esecuzione" : "Impresa affidataria"} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`invio-pos-email-${tipo}`} className="text-xs font-medium text-slate-700">E-mail del destinatario</Label>
              <Input id={`invio-pos-email-${tipo}`} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@esempio.it" />
              {tipo === "cse" && !emailIniziale && <p className="text-[11px] text-muted-foreground">Il CSE della commessa non ha un’e-mail registrata: scrivila qui.</p>}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={inCorso} onClick={() => setDestinatario(false)}>Annulla</Button>
            <Button type="button" disabled={inCorso || !EMAIL.test(email.trim())} onClick={() => void preparaAllegato()}>
              {inCorso ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}Prepara l’e-mail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {compositore && (
        <QuickContactSendDialog open onOpenChange={(o) => { if (!o) setCompositore(null); }} defaultChannel="email" email={email.trim()} name={nome.trim() || null}
          prefill={{ emailSubject: testi.oggetto, emailBody: testi.corpo }} initialAttachments={[compositore.allegato]} orderId={orderId} onSent={() => void dopoInvio()} />
      )}
    </>
  );
}
