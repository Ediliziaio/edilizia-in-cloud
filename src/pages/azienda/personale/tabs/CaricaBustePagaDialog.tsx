/**
 * «Carica dal consulente»: il titolare trascina il PDF del mese (o più file, o
 * uno ZIP), il gestionale lo divide per persona e mostra un'anteprima — chi,
 * che mese, che documento, se va al dipendente — e con un clic salva e pubblica.
 * Busta paga e CU vanno al dipendente; foglio presenze, riepilogo, F24 e Cassa
 * Edile restano all'azienda. Ogni riga si può correggere prima di salvare.
 */
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Eye, FileUp, Loader2, Send, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { abbinaProfilo, NOMI_MESI, periodoPrevalente, TIPI_DOCUMENTO, type ProfiloPerAbbinamento, type TipoDocumentoPaghe } from "@/lib/paghe/lettoreBustePaga";
import { espandiFile, leggiFile, ritagliaPdf, type DocumentoDaFile } from "@/lib/paghe/pdfBustePaga";

interface RigaAnteprima extends DocumentoDaFile {
  profiloId: string | null;
  abbinatoPer: "codice_fiscale" | "nome" | "scelto" | null;
  alDipendente: boolean;
}

interface Profilo extends ProfiloPerAbbinamento { attivo: boolean | null }

const NESSUNO = "__nessuno__";
// Come nel database (paghe_salva_caricamento): il resto resta sempre all'ufficio.
const PUO_ANDARE_AL_DIPENDENTE: TipoDocumentoPaghe[] = ["cedolino", "cu", "presenze"];
const SENZA_PERSONA: TipoDocumentoPaghe[] = ["riepilogo", "f24"];
const periodoTesto = (anno: number | null, mese: number | null) => (anno && mese ? `${NOMI_MESI[mese - 1]} ${anno}` : "—");

export function CaricaBustePagaDialog({ companyId, open, onOpenChange }: { companyId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [righe, setRighe] = useState<RigaAnteprima[]>([]);
  const [nomiFile, setNomiFile] = useState<string[]>([]);
  // Nome + dimensione: lo stesso file trascinato due volte si riconosce, due file
  // diversi con lo stesso nome (cartelle diverse dello ZIP) no.
  const [firme, setFirme] = useState<string[]>([]);
  const [pagineTot, setPagineTot] = useState(0);
  const [programma, setProgramma] = useState<string | null>(null);
  const [lettura, setLettura] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState<null | "bozza" | "pubblica">(null);

  const { data: profili = [], isLoading: caricoProfili, isError: erroreProfili } = useQuery({
    queryKey: ["paghe-profili", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_profili")
        .select("id, nome, cognome, codice_fiscale, employee_id, user_id, attivo")
        .eq("company_id", companyId)
        .order("cognome");
      if (error) throw error;
      return (data ?? []) as Profilo[];
    },
    enabled: open,
  });

  const azzera = () => { setRighe([]); setNomiFile([]); setFirme([]); setPagineTot(0); setProgramma(null); };
  // Durante lettura o salvataggio la finestra resta aperta: chiudendo a metà, la
  // lettura in corso avrebbe riempito l'anteprima della prossima apertura.
  const chiudi = (v: boolean) => { if (!v && !salvataggio && !lettura) { azzera(); onOpenChange(false); } };

  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setLettura("Apro i file…");
    try {
      const { pdf, scartati } = await espandiFile(files);
      if (scartati.length) toast.info(`${scartati.length} file non sono PDF e sono stati lasciati fuori`, { description: scartati.slice(0, 5).join(", ") });
      const nuove: RigaAnteprima[] = [];
      let pagine = 0;
      // Lo stesso file trascinato due volte non raddoppia le righe.
      const firma = (f: { nome: string; byte: Uint8Array }) => `${f.nome}:${f.byte.length}`;
      const giaCaricati = new Set(firme);
      const doppi = pdf.filter((f) => giaCaricati.has(firma(f)));
      if (doppi.length) toast.info(`${doppi.map((f) => f.nome).join(", ")} è già nell'elenco`);
      const daLeggere = pdf.filter((f) => !giaCaricati.has(firma(f)));
      for (const [i, f] of daLeggere.entries()) {
        setLettura(`Leggo ${f.nome} (${i + 1} di ${daLeggere.length})…`);
        const letto = await leggiFile(f);
        pagine += letto.pagine;
        if (letto.programma) setProgramma(letto.programma);
        for (const d of letto.documenti) {
          const abb = abbinaProfilo(d, profili);
          nuove.push({ ...d, chiave: crypto.randomUUID(), profiloId: abb?.profilo.id ?? null, abbinatoPer: abb?.per ?? null, alDipendente: TIPI_DOCUMENTO[d.tipo].alDipendente });
        }
      }
      setRighe((r) => [...r, ...nuove]);
      setNomiFile((n) => [...n, ...daLeggere.map((f) => f.nome)]);
      setFirme((x) => [...x, ...daLeggere.map(firma)]);
      setPagineTot((p) => p + pagine);
      if (!nuove.length) toast.error("In questi file non ho trovato pagine leggibili", { description: "Se sono scansioni (foto), chiedi al consulente il PDF originale del programma paghe." });
    } catch (e) {
      logger.warn("[buste-paga] lettura dei file non riuscita", e);
      toast.error("Non riesco ad aprire questi file", { description: "Controlla che siano PDF non protetti da password." });
    } finally {
      setLettura(null);
    }
  }, [profili, firme]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    // Senza l'elenco dei dipendenti l'aggancio non si può fare: si aspetta che arrivi.
    onDrop, disabled: !!lettura || !!salvataggio || caricoProfili || erroreProfili,
    accept: { "application/pdf": [".pdf"], "application/zip": [".zip"], "application/x-zip-compressed": [".zip"] },
  });

  const periodo = useMemo(() => periodoPrevalente(righe), [righe]);
  const profiliPerId = useMemo(() => new Map(profili.map((p) => [p.id, p])), [profili]);
  const cambia = (chiave: string, patch: Partial<RigaAnteprima>) => setRighe((r) => r.map((x) => (x.chiave === chiave ? { ...x, ...patch } : x)));

  const conteggio = useMemo(() => {
    const perTipo = new Map<TipoDocumentoPaghe, number>();
    for (const r of righe) perTipo.set(r.tipo, (perTipo.get(r.tipo) ?? 0) + 1);
    const alDipendente = righe.filter((r) => r.alDipendente && r.profiloId).length;
    // Problemi che fermano la consegna di una busta: senza persona, o persona senza anagrafica.
    const senzaPersona = righe.filter((r) => r.alDipendente && !r.profiloId).length;
    const senzaAnagrafica = righe.filter((r) => r.tipo === "cedolino" && r.profiloId && !profiliPerId.get(r.profiloId)?.employee_id).length;
    const senzaAccesso = righe.filter((r) => r.alDipendente && r.profiloId && !profiliPerId.get(r.profiloId)?.user_id).length;
    return { perTipo, alDipendente, senzaPersona, senzaAnagrafica, senzaAccesso };
  }, [righe, profiliPerId]);

  const anteprima = async (r: RigaAnteprima) => {
    const byte = await ritagliaPdf(r.file, r.pagine);
    const url = URL.createObjectURL(new Blob([byte as BlobPart], { type: "application/pdf" }));
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const salva = async (pubblica: boolean) => {
    setSalvataggio(pubblica ? "pubblica" : "bozza");
    const caricati: string[] = [];
    try {
      const documenti = [];
      for (const r of righe) {
        const anno = r.anno ?? periodo?.anno ?? null;
        const mese = r.mese ?? periodo?.mese ?? null;
        const percorso = `${companyId}/${anno ?? "senza-data"}-${String(mese ?? 0).padStart(2, "0")}/${crypto.randomUUID()}.pdf`;
        const byte = await ritagliaPdf(r.file, r.pagine);
        const { error } = await supabase.storage.from("buste-paga").upload(percorso, new Blob([byte as BlobPart], { type: "application/pdf" }), { contentType: "application/pdf" });
        if (error) throw new Error("Non riesco a salvare i file. Riprova tra poco.");
        caricati.push(percorso);
        const persona = r.profiloId && !SENZA_PERSONA.includes(r.tipo) ? profiliPerId.get(r.profiloId) : null;
        const chi = persona ? `${persona.cognome ?? ""} ${persona.nome ?? ""}`.trim() : r.nome;
        documenti.push({
          tipo: r.tipo,
          per_dipendente: r.alDipendente,
          hr_profilo_id: SENZA_PERSONA.includes(r.tipo) ? null : r.profiloId,
          anno, mese,
          titolo: [TIPI_DOCUMENTO[r.tipo].label, periodoTesto(anno, mese), chi].filter((x) => x && x !== "—").join(" · "),
          file_path: percorso,
          pagine: r.pagine.length,
          nome_letto: r.nome,
          codice_fiscale_letto: r.codiceFiscale,
          cedolino: r.tipo === "cedolino"
            ? { lordo: r.lordo, netto: r.netto, contributi_dipendente: r.contributi_dipendente, ritenute_irpef: r.ritenute_irpef }
            : null,
        });
      }
      const { data, error } = await supabase.rpc("paghe_salva_caricamento" as never, {
        p_dati: { company_id: companyId, nomi_file: nomiFile, anno: periodo?.anno, mese: periodo?.mese, pagine: pagineTot, programma, pubblica, documenti },
      } as never);
      if (error) {
        logger.warn("[buste-paga] salvataggio non riuscito", error);
        // I messaggi P0001 sono frasi scritte per l'utente; il resto no.
        throw new Error(error.code === "P0001" ? error.message : "Salvataggio non riuscito. Riprova tra poco: niente è stato pubblicato.");
      }
      const esito = data as unknown as { cedolini: number; documenti_azienda: number; codici_fiscali_imparati: number; senza_anagrafica: string[] };
      toast.success(pubblica ? `Pubblicate ${esito.cedolini} buste paga` : `Salvate ${esito.cedolini} buste paga, non ancora pubblicate`, {
        description: [
          esito.documenti_azienda ? `${esito.documenti_azienda} documenti restano all'azienda.` : "",
          esito.codici_fiscali_imparati ? `Codice fiscale aggiunto a ${esito.codici_fiscali_imparati} profili: dal prossimo mese l'aggancio è automatico.` : "",
          esito.senza_anagrafica?.length ? `Non arrivano nell'area personale di: ${esito.senza_anagrafica.join(", ")} (scheda dipendente da completare).` : "",
        ].filter(Boolean).join(" "),
      });
      for (const k of ["cedolini", "paghe-documenti", "my-cedolini", "my-documenti-paghe", "paghe-profili"]) queryClient.invalidateQueries({ queryKey: [k] });
      azzera();
      onOpenChange(false);
    } catch (e) {
      // Niente file orfani: se il salvataggio non va in fondo, si tolgono quelli già caricati.
      if (caricati.length) await supabase.storage.from("buste-paga").remove(caricati);
      toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setSalvataggio(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={chiudi}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carica le buste paga dal consulente</DialogTitle>
          <DialogDescription>
            Trascina il PDF del mese (il Libro Unico), anche più file o uno ZIP. Il gestionale lo divide per persona:
            la busta va al dipendente, il resto resta all'azienda. Controlli e poi pubblichi.
          </DialogDescription>
        </DialogHeader>

        <div {...getRootProps()} className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 text-center transition",
          righe.length ? "py-3" : "py-10", isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:bg-muted/40",
        )}>
          <input {...getInputProps()} />
          {erroreProfili ? (
            <p className="text-sm text-destructive">Non riesco a leggere l'elenco dei dipendenti. Chiudi e riapri la finestra.</p>
          ) : lettura || caricoProfili ? (
            <><Loader2 className="h-6 w-6 animate-spin text-primary" /><p className="text-sm">{lettura ?? "Preparo l'elenco dei dipendenti…"}</p></>
          ) : (
            <>
              <FileUp className="h-6 w-6 text-primary" aria-hidden="true" />
              <p className="text-sm font-medium">{righe.length ? "Aggiungi altri file" : "Trascina qui i file del consulente, o clicca per sceglierli"}</p>
              {!righe.length && <p className="text-xs text-muted-foreground">PDF o ZIP · buste paga, foglio presenze, riepilogo, F24, Cassa Edile, CU</p>}
            </>
          )}
        </div>

        {righe.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{periodo ? periodoTesto(periodo.anno, periodo.mese) : "Mese non riconosciuto"}</span>
              {programma && <Badge variant="secondary">{programma}</Badge>}
              <span className="text-muted-foreground">· {pagineTot} pagine ·</span>
              {[...conteggio.perTipo.entries()].map(([tipo, n]) => (
                <Badge key={tipo} variant="outline">{n} {n === 1 ? TIPI_DOCUMENTO[tipo].label.toLowerCase() : TIPI_DOCUMENTO[tipo].plurale}</Badge>
              ))}
            </div>

            {(conteggio.senzaPersona > 0 || conteggio.senzaAnagrafica > 0 || conteggio.senzaAccesso > 0) && (
              <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {conteggio.senzaPersona > 0 && <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{conteggio.senzaPersona} documenti per i dipendenti non hanno ancora una persona: sceglila nella riga, altrimenti non arrivano a nessuno.</p>}
                {conteggio.senzaAnagrafica > 0 && <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{conteggio.senzaAnagrafica} buste sono di persone con la scheda dipendente incompleta: il PDF si archivia, ma gli importi non entrano nei cedolini.</p>}
                {conteggio.senzaAccesso > 0 && <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{conteggio.senzaAccesso === 1 ? "1 persona non ha" : `${conteggio.senzaAccesso} persone non hanno`} ancora l'accesso all'app: la busta è pronta e la vedrà al primo accesso.</p>}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Documento</th>
                    <th className="px-3 py-2 font-medium">Persona</th>
                    <th className="px-3 py-2 font-medium">Mese</th>
                    <th className="px-3 py-2 text-right font-medium">Netto</th>
                    <th className="px-3 py-2 font-medium">Al dipendente</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => (
                    <tr key={r.chiave} className="border-t align-middle">
                      <td className="px-3 py-2">
                        <Select value={r.tipo} onValueChange={(v) => cambia(r.chiave, {
                          tipo: v as TipoDocumentoPaghe,
                          alDipendente: TIPI_DOCUMENTO[v as TipoDocumentoPaghe].alDipendente,
                          // Riepilogo e F24 sono di tutta l'azienda: niente persona.
                          ...(SENZA_PERSONA.includes(v as TipoDocumentoPaghe) ? { profiloId: null, abbinatoPer: null } : {}),
                        })}>
                          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(TIPI_DOCUMENTO) as TipoDocumentoPaghe[]).map((t) => <SelectItem key={t} value={t}>{TIPI_DOCUMENTO[t].label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{r.file.nome} · pag. {r.pagine.map((p) => p + 1).join("–")}</p>
                      </td>
                      <td className="px-3 py-2">
                        {SENZA_PERSONA.includes(r.tipo) ? (
                          <span className="text-xs text-muted-foreground">Tutta l'azienda</span>
                        ) : (
                          <>
                            <Select value={r.profiloId ?? NESSUNO} onValueChange={(v) => cambia(r.chiave, { profiloId: v === NESSUNO ? null : v, abbinatoPer: v === NESSUNO ? null : "scelto" })}>
                              <SelectTrigger className={cn("h-8 w-52", !r.profiloId && r.alDipendente && "border-amber-400")}><SelectValue placeholder="Scegli la persona" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NESSUNO}>Nessuno</SelectItem>
                                {profili.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{`${p.cognome ?? ""} ${p.nome ?? ""}`.trim()}{p.attivo === false ? " (cessato)" : ""}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {r.abbinatoPer === "codice_fiscale" ? <span className="text-green-700">Riconosciuto dal codice fiscale</span>
                                : r.abbinatoPer === "nome" ? <span className="text-green-700">Riconosciuto dal nome</span>
                                : r.abbinatoPer === "scelto" ? "Scelto a mano"
                                : r.nome ? `Sulla busta: ${r.nome}` : "Nome non trovato sulla pagina"}
                            </p>
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {periodoTesto(r.anno ?? periodo?.anno ?? null, r.mese ?? periodo?.mese ?? null)}
                        {periodo && r.mese && r.anno && (r.mese !== periodo.mese || r.anno !== periodo.anno) && (
                          <p className="text-[11px] text-amber-700">Mese diverso dagli altri: controlla</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{r.tipo === "cedolino" && r.netto != null ? formatCurrency(r.netto) : ""}</td>
                      <td className="px-3 py-2">
                        <Switch checked={r.alDipendente} onCheckedChange={(v) => cambia(r.chiave, { alDipendente: v })} aria-label="Al dipendente" disabled={!PUO_ANDARE_AL_DIPENDENTE.includes(r.tipo)} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => anteprima(r)}><Eye className="h-3.5 w-3.5" />Vedi</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {righe.length > 0 && <><CheckCircle2 className="h-3.5 w-3.5 text-green-600" />{conteggio.alDipendente} documenti arriveranno ai dipendenti, con un avviso</>}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!righe.length || !!salvataggio} onClick={() => salva(false)}>
              {salvataggio === "bozza" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Salva senza pubblicare
            </Button>
            <Button disabled={!righe.length || !!salvataggio} onClick={() => salva(true)}>
              {salvataggio === "pubblica" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}Salva e pubblica ai dipendenti
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
