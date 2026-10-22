/**
 * Firma elettronica avanzata: al primo documento con un'azienda chi firma si
 * identifica con un documento di riconoscimento valido e accetta le condizioni
 * del servizio (DPCM 22/02/2013 art. 57). Si fa una volta sola: ai documenti
 * successivi della stessa azienda basta il codice.
 *
 * Se l'azienda ha già identificato il firmatario (vedendo il documento di
 * persona) qui resta solo da accettare le condizioni: `soloDichiarazione`.
 *
 * Il testo delle condizioni arriva dal server (fea-documento-pubblico), lo
 * stesso di cui il server registra l'impronta.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IdCard, Loader2 } from "lucide-react";
import { corpoErroreEdge } from "@/lib/fea/erroreEdge";

const TIPI = [
  { value: "carta_identita", label: "Carta d'identità" },
  { value: "passaporto", label: "Passaporto" },
  { value: "patente", label: "Patente di guida" },
];
const MAX_FILE = 10 * 1024 * 1024;

interface Props {
  token: string;
  sessioneFirma: string;
  nomeFirmatario: string;
  aziendaNome: string;
  dichiarazione: { versione: string; testo: string };
  soloDichiarazione?: boolean;
  onFatto: () => void;
  onSessioneScaduta: () => void;
}

export function IdentificazioneFirmatario({ token, sessioneFirma, nomeFirmatario, aziendaNome, dichiarazione, soloDichiarazione = false, onFatto, onSessioneScaduta }: Props) {
  const [primo, ...resto] = nomeFirmatario.trim().split(/\s+/);
  const [nome, setNome] = useState(primo ?? "");
  const [cognome, setCognome] = useState(resto.join(" "));
  const [codiceFiscale, setCodiceFiscale] = useState("");
  const [tipo, setTipo] = useState("carta_identita");
  const [numero, setNumero] = useState("");
  const [rilasciatoDa, setRilasciatoDa] = useState("");
  const [scadenza, setScadenza] = useState("");
  const [fronte, setFronte] = useState<File | null>(null);
  const [retro, setRetro] = useState<File | null>(null);
  const [accetto, setAccetto] = useState(false);
  const [errore, setErrore] = useState("");
  const [invio, setInvio] = useState(false);

  const serveRetro = tipo !== "passaporto";
  const pronto = soloDichiarazione ? accetto : nome.trim() && cognome.trim() && numero.trim() && scadenza && fronte && (!serveRetro || retro) && accetto;

  const scegliFile = (f: File | null, set: (f: File | null) => void) => {
    setErrore("");
    if (f && f.size > MAX_FILE) { setErrore("La foto supera 10 MB: scattane una più leggera."); return; }
    set(f);
  };

  const invia = async () => {
    if (!pronto || (!soloDichiarazione && !fronte)) return;
    setInvio(true);
    setErrore("");
    try {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("sessione_firma", sessioneFirma);
      fd.append("dichiarazione_versione", dichiarazione.versione);
      fd.append("accetto", "true");
      if (!soloDichiarazione && fronte) {
      fd.append("nome", nome.trim());
      fd.append("cognome", cognome.trim());
      fd.append("codice_fiscale", codiceFiscale.trim());
      fd.append("documento_tipo", tipo);
      fd.append("documento_numero", numero.trim());
      fd.append("documento_rilasciato_da", rilasciatoDa.trim());
      fd.append("documento_scadenza", scadenza);
      fd.append("fronte", fronte);
      if (retro && serveRetro) fd.append("retro", retro);
      }
      const { data, error } = await supabase.functions.invoke("fea-identifica", { body: fd });
      if (error) {
        const corpo = await corpoErroreEdge(error);
        if (corpo.code === "sessione_scaduta") { onSessioneScaduta(); return; }
        throw new Error(corpo.error ?? "Identificazione non riuscita. Riprova.");
      }
      if (data?.success !== true) throw new Error(data?.error ?? "Identificazione non confermata. Riprova.");
      onFatto();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Identificazione non riuscita. Riprova.");
    } finally {
      setInvio(false);
    }
  };

  const campoFile = (etichetta: string, file: File | null, set: (f: File | null) => void) => (
    <div className="space-y-1">
      <Label>{etichetta}</Label>
      <Input type="file" accept="image/*,application/pdf" capture="environment"
        onChange={(e) => scegliFile(e.target.files?.[0] ?? null, set)} />
      {file && <p className="text-xs text-slate-500 truncate">{file.name}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <IdCard className="h-6 w-6 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-xl font-bold text-slate-800">{soloDichiarazione ? "Condizioni della firma" : "Chi sei"}</h2>
          <p className="text-slate-500 text-sm mt-1">
            {soloDichiarazione
              ? `${aziendaNome} ha già registrato il tuo documento d'identità. È il primo documento che firmi: leggi e accetta le condizioni. Lo fai una volta sola.`
              : `È il primo documento che firmi con ${aziendaNome}: serve un documento d'identità valido. Lo fai una volta sola.`}
          </p>
        </div>
      </div>

      {!soloDichiarazione && <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="given-name" /></div>
        <div className="space-y-1"><Label>Cognome</Label><Input value={cognome} onChange={(e) => setCognome(e.target.value)} autoComplete="family-name" /></div>
      </div>
      <div className="space-y-1">
        <Label>Codice fiscale <span className="text-slate-400 font-normal">(facoltativo)</span></Label>
        <Input value={codiceFiscale} onChange={(e) => setCodiceFiscale(e.target.value.toUpperCase())} maxLength={16} />
      </div>
      <div className="space-y-1">
        <Label>Documento</Label>
        <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Numero del documento</Label><Input value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase())} maxLength={30} /></div>
        <div className="space-y-1"><Label>Scade il</Label><Input type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} /></div>
      </div>
      <div className="space-y-1">
        <Label>Rilasciato da <span className="text-slate-400 font-normal">(facoltativo)</span></Label>
        <Input value={rilasciatoDa} onChange={(e) => setRilasciatoDa(e.target.value)} placeholder="Es. Comune di Milano" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {campoFile(serveRetro ? "Foto del fronte" : "Foto della pagina con i dati", fronte, setFronte)}
        {serveRetro && campoFile("Foto del retro", retro, setRetro)}
      </div>
      </>}

      <div className="space-y-2">
        <Label>Condizioni del servizio di firma</Label>
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
          {dichiarazione.testo}
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
          <Checkbox checked={accetto} onCheckedChange={(v) => setAccetto(v === true)} className="mt-0.5" />
          <span>Ho letto e accetto le condizioni. Ne ricevo una copia per email.</span>
        </label>
      </div>

      {errore && <p className="text-sm text-red-600">{errore}</p>}
      <Button className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600 text-white font-bold" disabled={!pronto || invio} onClick={() => void invia()}>
        {invio ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Invio in corso...</> : "Conferma e continua"}
      </Button>
    </div>
  );
}
