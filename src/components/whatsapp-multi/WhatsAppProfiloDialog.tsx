// Profilo WhatsApp del numero (24/09/2026): quello che il cliente vede aprendo
// la chat — foto, info, descrizione, indirizzo, email, siti, categoria.
// Si legge e si salva direttamente su WhatsApp (funzione whatsapp-profilo);
// le regole dei campi sono le stesse del server (_shared/profiloWhatsApp.ts).
// Il nome visualizzato si mostra soltanto: lo cambia Meta, dopo una revisione.

import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, Loader2, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CATEGORIE_WHATSAPP,
  LIMITI_PROFILO,
  corpoPerMeta,
  erroriProfilo,
  normalizzaProfilo,
  type ErroriProfilo,
  type ProfiloWhatsApp,
} from "../../../supabase/functions/_shared/profiloWhatsApp";
import {
  ErroreProfiloWhatsApp,
  useFotoProfiloWhatsApp,
  useProfiloWhatsApp,
  useSalvaProfiloWhatsApp,
} from "@/hooks/whatsapp/useProfiloWhatsApp";
import { preparaFotoProfilo } from "@/lib/whatsapp/fotoProfiloWhatsApp";
import type { WANumber } from "@/hooks/whatsapp/useWhatsAppNumbers";

interface Props {
  number: WANumber;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Modulo {
  info: string;
  descrizione: string;
  indirizzo: string;
  email: string;
  sito1: string;
  sito2: string;
  categoria: string;
}

function moduloDa(profilo: ProfiloWhatsApp): Modulo {
  return {
    info: profilo.info,
    descrizione: profilo.descrizione,
    indirizzo: profilo.indirizzo,
    email: profilo.email,
    sito1: profilo.siti[0] ?? "",
    sito2: profilo.siti[1] ?? "",
    categoria: profilo.categoria,
  };
}

const STATO_NOME: Record<string, string> = {
  APPROVED: "approvato da Meta",
  AVAILABLE_WITHOUT_REVIEW: "approvato da Meta",
  PENDING_REVIEW: "in revisione da Meta",
  DECLINED: "rifiutato da Meta",
  EXPIRED: "scaduto",
};

function Contatore({ valore, massimo }: { valore: string; massimo: number }) {
  const oltre = valore.trim().length > massimo;
  return (
    <span className={`text-xs tabular-nums ${oltre ? "text-destructive" : "text-muted-foreground"}`}>
      {valore.trim().length}/{massimo}
    </span>
  );
}

function Errore({ testo }: { testo?: string }) {
  if (!testo) return null;
  return <p className="text-xs text-destructive">{testo}</p>;
}

export function WhatsAppProfiloDialog({ number, open, onOpenChange }: Props) {
  const companyId = number.company_id ?? null;
  const lettura = useProfiloWhatsApp(companyId, number.id, open);
  const salva = useSalvaProfiloWhatsApp(companyId, number.id);
  const foto = useFotoProfiloWhatsApp(companyId, number.id);
  const inputFoto = useRef<HTMLInputElement>(null);
  // La bozza esiste solo dopo la prima modifica: fino ad allora il modulo è il
  // profilo com'è su WhatsApp, e dopo un salvataggio torna a esserlo.
  const [bozza, setBozza] = useState<Modulo | null>(null);
  const [erroriServer, setErroriServer] = useState<ErroriProfilo>({});

  const originale = lettura.data?.profilo ?? null;
  const nome = lettura.data?.nome ?? null;
  const modulo = bozza ?? (originale ? moduloDa(originale) : null);

  const cambiaApertura = (aperta: boolean) => {
    if (!aperta) {
      setBozza(null);
      setErroriServer({});
    }
    onOpenChange(aperta);
  };

  const proposto = modulo
    ? normalizzaProfilo({
        info: modulo.info,
        descrizione: modulo.descrizione,
        indirizzo: modulo.indirizzo,
        email: modulo.email,
        siti: [modulo.sito1, modulo.sito2],
        categoria: modulo.categoria,
        fotoUrl: originale?.fotoUrl ?? null,
      })
    : null;
  const errori: ErroriProfilo = { ...(proposto ? erroriProfilo(proposto, originale) : {}), ...erroriServer };
  const cambiato = !!(proposto && originale && corpoPerMeta(proposto, originale));
  const puoSalvare = cambiato && Object.keys(errori).length === 0 && !salva.isPending;

  const cambia = (campo: keyof Modulo, valore: string) => {
    if (!modulo) return;
    setBozza({ ...modulo, [campo]: valore });
    setErroriServer({});
  };

  const salvaProfilo = () => {
    if (!proposto || !puoSalvare) return;
    salva.mutate(proposto, {
      onSuccess: () => {
        setBozza(null);
        toast.success("Profilo aggiornato su WhatsApp", {
          description: "I clienti lo vedono aggiornato entro pochi minuti.",
        });
      },
      onError: (err) => {
        if (err instanceof ErroreProfiloWhatsApp) setErroriServer(err.errori);
        toast.error("Profilo non salvato", { description: err.message });
      },
    });
  };

  const scegliFoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const pronta = await preparaFotoProfilo(file);
      foto.mutate(pronta, {
        onSuccess: () => toast.success("Foto aggiornata su WhatsApp"),
        onError: (err) => toast.error("Foto non aggiornata", { description: err.message }),
      });
    } catch (err) {
      toast.error("Foto non valida", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      if (inputFoto.current) inputFoto.current.value = "";
    }
  };

  const categorie = originale?.categoria && !CATEGORIE_WHATSAPP.some((c) => c.valore === originale.categoria)
    ? [...CATEGORIE_WHATSAPP, { valore: originale.categoria, etichetta: originale.categoria }]
    : CATEGORIE_WHATSAPP;
  const idCampo = (campo: string) => `wa-profilo-${campo}-${number.id}`;

  return (
    <Dialog open={open} onOpenChange={cambiaApertura}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Profilo WhatsApp</DialogTitle>
          <DialogDescription>
            Quello che i clienti vedono aprendo la chat con {number.numero || "questo numero"}.
            Le modifiche vanno direttamente su WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {lettura.isLoading && (
          <div className="space-y-3" aria-label="Leggo il profilo da WhatsApp">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}

        {lettura.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>Non riesco a leggere il profilo da WhatsApp: {lettura.error?.message}</p>
              <Button variant="outline" size="sm" onClick={() => lettura.refetch()}>
                <RefreshCw className="mr-1 h-4 w-4" /> Riprova
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {modulo && originale && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border bg-muted">
                {originale.fotoUrl ? (
                  <img src={originale.fotoUrl} alt="Foto del profilo WhatsApp" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="absolute inset-0 m-auto h-6 w-6 text-muted-foreground" />
                )}
                {foto.isPending && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inputFoto.current?.click()}
                  disabled={foto.isPending}
                >
                  <Camera className="mr-1 h-4 w-4" />
                  {foto.isPending ? "Carico la foto…" : originale.fotoUrl ? "Cambia foto" : "Aggiungi foto"}
                </Button>
                <p className="text-xs text-muted-foreground">JPG o PNG: la ritagliamo quadrata.</p>
                <input
                  ref={inputFoto}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  aria-label="Scegli la foto del profilo"
                  onChange={(e) => scegliFoto(e.target.files?.[0])}
                />
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <span className="text-muted-foreground">Nome visualizzato: </span>
              <span className="font-medium">{nome?.verificato || number.display_name || "—"}</span>
              {nome?.stato && STATO_NOME[nome.stato] && (
                <span className="text-muted-foreground"> · {STATO_NOME[nome.stato]}</span>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Il nome si cambia da Meta (WhatsApp Manager), perché passa da una loro revisione.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor={idCampo("info")}>Info</Label>
                <Contatore valore={modulo.info} massimo={LIMITI_PROFILO.info} />
              </div>
              <Input
                id={idCampo("info")}
                value={modulo.info}
                onChange={(e) => cambia("info", e.target.value)}
                placeholder="Es. Impianti fotovoltaici chiavi in mano"
              />
              <Errore testo={errori.info} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor={idCampo("descrizione")}>Descrizione</Label>
                <Contatore valore={modulo.descrizione} massimo={LIMITI_PROFILO.descrizione} />
              </div>
              <Textarea
                id={idCampo("descrizione")}
                value={modulo.descrizione}
                onChange={(e) => cambia("descrizione", e.target.value)}
                rows={3}
                placeholder="Chi siete e cosa fate"
              />
              <Errore testo={errori.descrizione} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor={idCampo("indirizzo")}>Indirizzo</Label>
                <Contatore valore={modulo.indirizzo} massimo={LIMITI_PROFILO.indirizzo} />
              </div>
              <Input
                id={idCampo("indirizzo")}
                value={modulo.indirizzo}
                onChange={(e) => cambia("indirizzo", e.target.value)}
                placeholder="Via, numero, città"
              />
              <Errore testo={errori.indirizzo} />
            </div>

            <div className="space-y-1">
              <Label htmlFor={idCampo("email")}>Email</Label>
              <Input
                id={idCampo("email")}
                type="email"
                value={modulo.email}
                onChange={(e) => cambia("email", e.target.value)}
                placeholder="info@azienda.it"
              />
              <Errore testo={errori.email} />
            </div>

            <div className="space-y-1">
              <Label htmlFor={idCampo("sito1")}>Siti web (al massimo 2)</Label>
              <Input
                id={idCampo("sito1")}
                value={modulo.sito1}
                onChange={(e) => cambia("sito1", e.target.value)}
                placeholder="www.azienda.it"
              />
              <Input
                aria-label="Secondo sito web"
                value={modulo.sito2}
                onChange={(e) => cambia("sito2", e.target.value)}
                placeholder="Secondo sito (facoltativo)"
              />
              <Errore testo={errori.siti} />
            </div>

            <div className="space-y-1">
              <Label htmlFor={idCampo("categoria")}>Categoria</Label>
              <Select value={modulo.categoria || undefined} onValueChange={(v) => cambia("categoria", v)}>
                <SelectTrigger id={idCampo("categoria")}>
                  <SelectValue placeholder="Scegli la categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categorie.map((c) => (
                    <SelectItem key={c.valore} value={c.valore}>
                      {c.etichetta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Errore testo={errori.categoria} />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => cambiaApertura(false)}>
            Chiudi
          </Button>
          <Button onClick={salvaProfilo} disabled={!puoSalvare}>
            {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva su WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
