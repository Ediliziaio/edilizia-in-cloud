import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { useAllHrProfili } from "@/hooks/useOrganigramma";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  allegaLibretto, caricaFileMezzo, leggiDocumentoConAI, rimuoviFileMezzo, useMezzi, useMezziCategorie, useSalvaMezzo,
  type MezzoInput,
} from "@/hooks/useMezzi";
import {
  ESEMPI_A_QUANTITA, POSSESSI, STATI_MEZZO, TIPI_VEICOLO, UNITA_QUANTITA, classeDi, dataLetta, numeroLetto, oggiIso,
  testoLetto, unitaBreve,
  type ContatoreUnita, type MezzoClasse, type MezzoConAssegnazione, type MezzoTipo, type UnitaQuantita,
} from "@/types/mezzi";
import { cn } from "@/lib/utils";

const NESSUNO = "__nessuno__";

// Macchine d'opera, gru e attrezzi si misurano a ore di lavoro, i veicoli a km.
const TIPI_A_ORE: MezzoTipo[] = ["macchina_movimento_terra", "sollevamento", "attrezzatura"];

const VUOTO_MEZZO: MezzoInput = {
  nome: "",
  tipo: "furgone",
  contatore_unita: "km",
  possesso: "proprieta",
  stato: "in_servizio",
  gestione: "singola",
};

const VUOTO_ATTREZZO: MezzoInput = {
  nome: "",
  tipo: "attrezzatura",
  contatore_unita: "ore",
  possesso: "proprieta",
  stato: "in_servizio",
  gestione: "singola",
};

const MIME_DA_ESTENSIONE: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", webp: "image/webp",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mezzo?: MezzoConAssegnazione | null;
  onSalvato?: (id: string) => void;
  /** Per un nuovo: da quale elenco si arriva (Mezzi o Attrezzature). */
  classe?: MezzoClasse;
  /** Codice di un'etichetta già stampata (letta con lo scanner). */
  codiceIniziale?: string | null;
}

function daMezzo(mezzo: MezzoConAssegnazione): MezzoInput {
  return {
    id: mezzo.id, nome: mezzo.nome, tipo: mezzo.tipo, targa: mezzo.targa, marca: mezzo.marca,
    modello: mezzo.modello, matricola: mezzo.matricola, anno: mezzo.anno, contatore: mezzo.contatore,
    contatore_unita: mezzo.contatore_unita, possesso: mezzo.possesso, stato: mezzo.stato,
    assegnato_hr_profilo_id: mezzo.assegnato_hr_profilo_id, assegnato_order_id: mezzo.assegnato_order_id,
    su_mezzo_id: mezzo.su_mezzo_id, valore_acquisto: mezzo.valore_acquisto, data_acquisto: mezzo.data_acquisto,
    rata_mensile: mezzo.rata_mensile, note: mezzo.note,
    codice: mezzo.codice ?? null, categoria_id: mezzo.categoria_id ?? null, gestione: mezzo.gestione ?? "singola",
    unita_misura: mezzo.unita_misura ?? null, quantita_totale: mezzo.quantita_totale ?? null,
  };
}

export function MezzoFormDialog({ open, onOpenChange, mezzo, onSalvato, classe, codiceIniziale }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Montato solo da aperto: a ogni apertura il modulo riparte dai dati del mezzo. */}
      {open && (
        <MezzoForm
          key={mezzo?.id ?? `nuovo-${classe ?? "mezzo"}-${codiceIniziale ?? ""}`}
          mezzo={mezzo}
          onOpenChange={onOpenChange}
          onSalvato={onSalvato}
          classe={classe}
          codiceIniziale={codiceIniziale}
        />
      )}
    </Dialog>
  );
}

interface LibrettoLetto {
  path: string;
  fileName: string;
  immatricolazione: string | null;
  prossimaRevisione: string | null;
}

function MezzoForm({ mezzo, onOpenChange, onSalvato, classe: classeIniziale, codiceIniziale }: Omit<Props, "open">) {
  // Mobile: niente tastiera aperta appena si apre il foglio (copre metà form).
  const isMobile = useIsMobile();
  const companyId = useEffectiveCompanyId();
  const salva = useSalvaMezzo();
  const { data: profili = [] } = useAllHrProfili();
  const { data: tuttiIMezzi = [] } = useMezzi();
  const { data: categorie = [] } = useMezziCategorie();
  const [form, setForm] = useState<MezzoInput>(() => {
    if (mezzo) return daMezzo(mezzo);
    // Un'etichetta ATT-… è di un attrezzo, MZ-… di un mezzo, qualunque elenco fosse aperto.
    const daCodice: MezzoClasse | undefined = codiceIniziale?.startsWith("ATT") ? "attrezzatura" : codiceIniziale?.startsWith("MZ") ? "mezzo" : undefined;
    const base = (daCodice ?? classeIniziale) === "attrezzatura" ? VUOTO_ATTREZZO : VUOTO_MEZZO;
    return { ...base, codice: codiceIniziale ?? null };
  });
  const [libretto, setLibretto] = useState<LibrettoLetto | null>(null);
  const [leggendo, setLeggendo] = useState(false);
  const [totaleTesto, setTotaleTesto] = useState(() =>
    mezzo?.quantita_totale != null ? String(mezzo.quantita_totale).replace(".", ",") : "",
  );
  const inputLibretto = useRef<HTMLInputElement>(null);

  // Libretto caricato per la lettura ma mezzo mai salvato (Annulla, X, Esc):
  // alla chiusura il file non serve più e si toglie.
  const librettoDaTogliere = useRef<string | null>(null);
  useEffect(() => {
    librettoDaTogliere.current = libretto?.path ?? null;
  }, [libretto]);
  useEffect(() => () => {
    if (librettoDaTogliere.current) void rimuoviFileMezzo(librettoDaTogliere.current);
  }, []);

  const set = <K extends keyof MezzoInput>(k: K, v: MezzoInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const classe = classeDi(form.tipo ?? "furgone");
  const attrezzo = classe === "attrezzatura";
  const aQuantita = attrezzo && form.gestione === "quantita";
  const categorieAttrezzi = categorie.filter((c) => c.classe === "attrezzatura");

  const cambiaTipo = (tipo: MezzoTipo) =>
    setForm((f) => ({
      ...f,
      tipo,
      // Solo finché il contatore è vuoto: se ci sono già dei km non li si reinterpreta come ore.
      contatore_unita: f.contatore == null ? (TIPI_A_ORE.includes(tipo) ? "ore" : "km") : f.contatore_unita,
      // Le quantità valgono solo per gli attrezzi.
      ...(tipo !== "attrezzatura" ? { gestione: "singola" as const, unita_misura: null, quantita_totale: null } : {}),
    }));

  const cambiaClasse = (nuova: MezzoClasse) => {
    if (nuova === classe) return;
    cambiaTipo(nuova === "attrezzatura" ? "attrezzatura" : "furgone");
  };

  const cambiaGestione = (gestione: "singola" | "quantita") =>
    setForm((f) => ({
      ...f,
      gestione,
      // A quantità si ripartisce sui cantieri coi montaggi: niente cantiere, persona o furgone singoli.
      ...(gestione === "quantita"
        ? { assegnato_order_id: null, su_mezzo_id: null, assegnato_hr_profilo_id: null, unita_misura: f.unita_misura ?? "mq", contatore: null }
        : { unita_misura: null, quantita_totale: null }),
    }));

  const usaEsempio = (nome: string, unita: UnitaQuantita) => {
    setForm((f) => ({
      ...f, nome: f.nome.trim() ? f.nome : nome, gestione: "quantita", unita_misura: unita,
      assegnato_order_id: null, su_mezzo_id: null, assegnato_hr_profilo_id: null, contatore: null,
      categoria_id: f.categoria_id ?? categoriaPerEsempio(nome),
    }));
  };

  // «Ponteggio…» va nei ponteggi, «Transenne» nelle transenne: si propone, non si impone.
  const categoriaPerEsempio = (nome: string) => {
    const cerca = /ponteggi/i.test(nome) ? /ponteggi/i : /transenn|rete/i.test(nome) ? /transenn/i : /puntell|casser/i.test(nome) ? /cassefor/i : null;
    return cerca ? categorieAttrezzi.find((c) => cerca.test(c.nome))?.id ?? null : null;
  };

  const persone = profili.filter((p) => p.attivo !== false && !p.data_cessazione);
  const totale = numeroLetto(totaleTesto);
  const nomeValido = form.nome.trim().length > 0;
  const quantitaValida = !aQuantita || (!!form.unita_misura && totale != null && totale > 0);

  // Si carica su un mezzo che non è a sua volta caricato su un altro; un mezzo
  // con degli attrezzi sopra non si carica su niente (un livello solo).
  const haAttrezziSopra = !!mezzo && tuttiIMezzi.some((m) => m.su_mezzo_id === mezzo.id);
  const suCuiCaricare = useMemo(
    () => tuttiIMezzi.filter((m) => m.id !== mezzo?.id && !m.su_mezzo_id && m.classe !== "attrezzatura"),
    [tuttiIMezzi, mezzo?.id],
  );

  const leggiLibretto = async (file: File | undefined) => {
    if (!file || !companyId) return;
    setLeggendo(true);
    try {
      const up = await caricaFileMezzo(companyId, mezzo?.id ?? "nuovo", file);
      if (libretto) void rimuoviFileMezzo(libretto.path);
      setLibretto({ path: up.path, fileName: up.name, immatricolazione: null, prossimaRevisione: null });
      const estensione = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const letto = await leggiDocumentoConAI({
        companyId, path: up.path, fileName: up.name, mime: file.type || MIME_DA_ESTENSIONE[estensione] || "application/pdf",
        tipo: "libretto_circolazione",
      });
      const immatricolazione = dataLetta(letto.data_prima_immatricolazione);
      const targa = testoLetto(letto.targa)?.replace(/\s+/g, "").toUpperCase() ?? null;
      const marca = testoLetto(letto.marca);
      const modello = testoLetto(letto.modello);
      setLibretto({ path: up.path, fileName: up.name, immatricolazione, prossimaRevisione: dataLetta(letto.prossima_revisione) });
      setForm((f) => ({
        ...f,
        targa: targa ?? f.targa,
        marca: marca ?? f.marca,
        modello: modello ?? f.modello,
        matricola: testoLetto(letto.telaio) ?? f.matricola,
        anno: immatricolazione ? Number(immatricolazione.slice(0, 4)) : f.anno,
        nome: f.nome.trim() ? f.nome : [marca, modello].filter(Boolean).join(" ") || f.nome,
      }));
      toast.success(targa ? `Libretto letto: targa ${targa}. Controlla i campi prima di salvare.` : "Libretto letto: controlla i campi prima di salvare.");
    } catch (e) {
      toast.error(e instanceof Error ? `Lettura automatica non riuscita: ${e.message}. Compila a mano.` : "Lettura automatica non riuscita. Compila a mano.");
    } finally {
      setLeggendo(false);
      if (inputLibretto.current) inputLibretto.current.value = "";
    }
  };

  const invia = async () => {
    if (!nomeValido || !quantitaValida || !companyId) return;
    const contatoreCambiato = (form.contatore ?? null) !== (mezzo?.contatore ?? null);
    let id: string;
    try {
      id = await salva.mutateAsync({
        ...form,
        nome: form.nome.trim(),
        // Un attrezzo non ha targa; un mezzo non ha categoria degli attrezzi.
        ...(attrezzo ? { targa: null } : { categoria_id: null }),
        quantita_totale: aQuantita ? totale : null,
        unita_misura: aQuantita ? form.unita_misura ?? null : null,
        gestione: aQuantita ? "quantita" : "singola",
        // Le rate hanno senso solo per leasing e noleggio.
        rata_mensile: form.possesso === "proprieta" ? null : form.rata_mensile ?? null,
        ...(contatoreCambiato && form.contatore != null ? { contatore_aggiornato_il: oggiIso() } : {}),
      });
    } catch {
      return; // l'errore lo mostra la mutation; la finestra resta aperta con i dati
    }
    if (libretto && !attrezzo) {
      // Da qui il file è del mezzo: non va tolto alla chiusura.
      librettoDaTogliere.current = null;
      try {
        await allegaLibretto({ companyId, mezzoId: id, ...libretto });
      } catch (e) {
        toast.error(e instanceof Error ? `Mezzo salvato, ma non ho allegato il libretto: ${e.message}` : "Mezzo salvato, ma non ho allegato il libretto");
      }
    }
    onOpenChange(false);
    onSalvato?.(id);
  };

  const titolo = mezzo
    ? attrezzo ? "Modifica attrezzatura" : "Modifica mezzo"
    : attrezzo ? "Nuova attrezzatura" : "Nuovo mezzo";

  return (
    <DialogContent
      className="max-h-[90vh] max-w-lg overflow-y-auto"
      // Un clic fuori per sbaglio non deve buttare via i dati scritti: si chiude con Annulla, X o Esc.
      onInteractOutside={(e) => e.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{titolo}</DialogTitle>
        <DialogDescription className="max-sm:sr-only">
          {attrezzo
            ? "Basta il nome per iniziare. Ponteggi, transenne e reti si registrano a quantità (m², pezzi, metri)."
            : "Basta il nome per iniziare: documenti, scadenze e tagliandi si aggiungono dalla scheda."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 max-sm:space-y-3">
        {/* Mezzo o attrezzatura: decide quali campi servono. */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Mezzo o attrezzatura">
          {(["mezzo", "attrezzatura"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={classe === c}
              disabled={c === "mezzo" && mezzo?.gestione === "quantita"}
              onClick={() => cambiaClasse(c)}
              className={cn(
                "h-8 rounded-md text-sm font-medium transition-colors disabled:opacity-50",
                classe === c ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c === "mezzo" ? "Mezzo" : "Attrezzatura"}
            </button>
          ))}
        </div>

        {!attrezzo && (
          <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/50 p-3 max-sm:p-2.5">
            <input
              ref={inputLibretto}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => leggiLibretto(e.target.files?.[0])}
              aria-label="Carica il libretto di circolazione"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-700 max-sm:text-xs">
                {libretto
                  ? "Libretto caricato: lo allego al mezzo quando salvi."
                  : <><span className="max-sm:hidden">Hai il libretto? Carica una foto o il PDF e compilo io targa, marca, modello e telaio.</span><span className="sm:hidden">Fotografa il libretto: compilo io i dati.</span></>}
              </p>
              <Button type="button" size="sm" variant="outline" className="shrink-0 bg-white max-sm:h-8 max-sm:text-xs" onClick={() => inputLibretto.current?.click()} disabled={leggendo}>
                {leggendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanLine className="mr-1 h-4 w-4 text-orange-500" />}
                {leggendo ? "Leggo…" : libretto ? "Cambia" : "Leggi il libretto"}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="mezzo-nome">Nome</Label>
          <Input
            id="mezzo-nome"
            value={form.nome}
            onChange={(e) => set("nome", e.target.value)}
            placeholder={attrezzo ? "es. Demolitore Hilti, Ponteggio a telai" : "es. Ducato bianco, Miniescavatore Kubota"}
            autoFocus={!isMobile}
          />
        </div>

        {attrezzo && (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-background p-1" role="radiogroup" aria-label="Come si conta">
              {(["singola", "quantita"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={(form.gestione ?? "singola") === g}
                  onClick={() => cambiaGestione(g)}
                  className={cn(
                    "h-9 rounded-md px-2 text-sm font-medium transition-colors",
                    (form.gestione ?? "singola") === g ? "bg-orange-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {g === "singola" ? "Un pezzo" : "A quantità"}
                </button>
              ))}
            </div>
            {aQuantita ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="mezzo-totale">Quanto ne avete</Label>
                    <Input
                      id="mezzo-totale"
                      inputMode="decimal"
                      value={totaleTesto}
                      onChange={(e) => setTotaleTesto(e.target.value)}
                      placeholder="es. 800"
                      aria-invalid={totaleTesto !== "" && (totale == null || totale <= 0)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mezzo-unita">Unità</Label>
                    <Select value={form.unita_misura ?? "mq"} onValueChange={(v) => set("unita_misura", v as UnitaQuantita)}>
                      <SelectTrigger id="mezzo-unita"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNITA_QUANTITA.map((u) => (
                          <SelectItem key={u.value} value={u.value}>{u.label} ({u.breve})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground max-sm:hidden">
                  {UNITA_QUANTITA.find((u) => u.value === (form.unita_misura ?? "mq"))?.esempio}. Dalla scheda segni quanto ne monti su ogni cantiere: il resto è in magazzino.
                </p>
              </>
            ) : (
              !mezzo && (
                <div className="flex flex-wrap gap-1.5 max-sm:hidden">
                  <span className="text-xs text-muted-foreground">A quantità:</span>
                  {ESEMPI_A_QUANTITA.map((e) => (
                    <button
                      key={e.nome}
                      type="button"
                      onClick={() => usaEsempio(e.nome, e.unita)}
                      className="rounded-full border bg-background px-2 py-0.5 text-xs hover:border-orange-300 hover:bg-orange-50"
                    >
                      {e.nome} ({unitaBreve(e.unita)})
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-sm:grid-cols-2">
          {attrezzo ? (
            <div className="space-y-1.5">
              <Label htmlFor="mezzo-categoria">Categoria</Label>
              <Select value={form.categoria_id ?? NESSUNO} onValueChange={(v) => set("categoria_id", v === NESSUNO ? null : v)}>
                <SelectTrigger id="mezzo-categoria"><SelectValue placeholder="Senza categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNO}>Senza categoria</SelectItem>
                  {categorieAttrezzi.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="mezzo-tipo">Tipo</Label>
              <Select value={form.tipo ?? "furgone"} onValueChange={(v) => cambiaTipo(v as MezzoTipo)}>
                <SelectTrigger id="mezzo-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPI_VEICOLO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {attrezzo ? (
            <div className="space-y-1.5">
              <Label htmlFor="mezzo-codice">Codice etichetta</Label>
              <Input
                id="mezzo-codice"
                value={form.codice ?? ""}
                onChange={(e) => set("codice", e.target.value)}
                placeholder={mezzo ? "" : "automatico"}
                className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
                autoCapitalize="characters"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="mezzo-targa">Targa</Label>
              <Input
                id="mezzo-targa"
                value={form.targa ?? ""}
                onChange={(e) => set("targa", e.target.value)}
                placeholder="es. GA123BC"
                className="uppercase placeholder:normal-case"
                autoCapitalize="characters"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="mezzo-marca">Marca</Label>
            <Input id="mezzo-marca" value={form.marca ?? ""} onChange={(e) => set("marca", e.target.value)} placeholder={attrezzo ? "es. Hilti" : "es. Fiat"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mezzo-modello">Modello</Label>
            <Input id="mezzo-modello" value={form.modello ?? ""} onChange={(e) => set("modello", e.target.value)} placeholder={attrezzo ? "es. TE 1000" : "es. Ducato 2.3"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mezzo-matricola">{attrezzo ? "N° di serie" : "Telaio / matricola"}</Label>
            <Input id="mezzo-matricola" value={form.matricola ?? ""} onChange={(e) => set("matricola", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mezzo-anno">Anno</Label>
            <Input
              id="mezzo-anno"
              type="number"
              inputMode="numeric"
              min={1950}
              max={2100}
              value={form.anno ?? ""}
              onChange={(e) => set("anno", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          {!attrezzo && (
            <div className="space-y-1.5 max-sm:hidden">
              <Label htmlFor="mezzo-codice">Codice etichetta</Label>
              <Input
                id="mezzo-codice"
                value={form.codice ?? ""}
                onChange={(e) => set("codice", e.target.value)}
                placeholder={mezzo ? "" : "automatico"}
                className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
                autoCapitalize="characters"
              />
            </div>
          )}
        </div>

        {!aQuantita && (
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mezzo-contatore">
                {attrezzo ? "Ore di lavoro (se ha il contaore)" : form.contatore_unita === "ore" ? "Ore di lavoro attuali" : "Km attuali"}
              </Label>
              <Input
                id="mezzo-contatore"
                type="number"
                inputMode="decimal"
                min={0}
                value={form.contatore ?? ""}
                onChange={(e) => set("contatore", e.target.value === "" ? null : Number(e.target.value))}
                placeholder={attrezzo ? "" : "Si aggiornano da soli con tagliandi e segnalazioni"}
              />
            </div>
            <Select value={form.contatore_unita ?? "km"} onValueChange={(v) => set("contatore_unita", v as ContatoreUnita)}>
              <SelectTrigger className="w-24" aria-label="Unità del contatore"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="km">km</SelectItem>
                <SelectItem value="ore">ore</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mezzo-possesso">Possesso</Label>
            <Select value={form.possesso ?? "proprieta"} onValueChange={(v) => set("possesso", v as MezzoInput["possesso"])}>
              <SelectTrigger id="mezzo-possesso"><SelectValue /></SelectTrigger>
              <SelectContent>
                {POSSESSI.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mezzo-stato">Stato</Label>
            <Select value={form.stato ?? "in_servizio"} onValueChange={(v) => set("stato", v as MezzoInput["stato"])}>
              <SelectTrigger id="mezzo-stato"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATI_MEZZO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!aQuantita && (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
            <p className="text-sm font-medium">Chi lo ha in carico</p>
            <div className="space-y-1.5">
              <Label htmlFor="mezzo-persona">Persona</Label>
              <Select
                value={form.assegnato_hr_profilo_id ?? NESSUNO}
                onValueChange={(v) => set("assegnato_hr_profilo_id", v === NESSUNO ? null : v)}
              >
                <SelectTrigger id="mezzo-persona"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNO}>Nessuno</SelectItem>
                  {persone.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.cognome, p.nome].filter(Boolean).join(" ")}{p.mansione ? ` · ${p.mansione}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground max-sm:hidden">
                {attrezzo ? "Chi lo ha in carico lo vede dal telefono." : "Chi lo ha in carico lo vede dal telefono, con assicurazione e libretto."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Cantiere (commessa)</Label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <OrderSelectCombobox
                    companyId={companyId ?? undefined}
                    value={form.assegnato_order_id ?? undefined}
                    onChange={(orderId) => set("assegnato_order_id", orderId)}
                    placeholder="Nessun cantiere"
                  />
                </div>
                {form.assegnato_order_id && (
                  <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => set("assegnato_order_id", null)} aria-label="Togli il cantiere">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {(suCuiCaricare.length > 0 || form.su_mezzo_id) && (
              <div className="space-y-1.5">
                <Label htmlFor="mezzo-su">Caricato su</Label>
                <Select
                  value={form.su_mezzo_id ?? NESSUNO}
                  onValueChange={(v) => set("su_mezzo_id", v === NESSUNO ? null : v)}
                  disabled={haAttrezziSopra}
                >
                  <SelectTrigger id="mezzo-su"><SelectValue placeholder="Su nessun mezzo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NESSUNO}>Su nessun mezzo</SelectItem>
                    {suCuiCaricare.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}{m.targa ? ` · ${m.targa}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground max-sm:hidden">
                  {haAttrezziSopra
                    ? "Su questo mezzo sono caricati degli attrezzi: non si può caricarlo su un altro."
                    : "Per gli attrezzi che viaggiano su un furgone: così si sa cosa c'è a bordo."}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Mobile no: i costi d'acquisto e le rate si segnano al computer. */}
        <div className="space-y-3 rounded-xl border bg-muted/30 p-3 max-sm:hidden">
          <p className="text-sm font-medium">Costi</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mezzo-valore">Valore d'acquisto (€)</Label>
              <Input
                id="mezzo-valore"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.valore_acquisto ?? ""}
                onChange={(e) => set("valore_acquisto", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mezzo-data-acquisto">Acquistato il</Label>
              <Input id="mezzo-data-acquisto" type="date" value={form.data_acquisto ?? ""} onChange={(e) => set("data_acquisto", e.target.value)} />
            </div>
            {form.possesso !== "proprieta" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mezzo-rata">Rata mensile di {form.possesso === "leasing" ? "leasing" : "noleggio"} (€)</Label>
                <Input
                  id="mezzo-rata"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.rata_mensile ?? ""}
                  onChange={(e) => set("rata_mensile", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mezzo-note">Note</Label>
          <Textarea id="mezzo-note" rows={2} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" className="max-sm:hidden" onClick={() => onOpenChange(false)}>Annulla</Button>
        <Button onClick={invia} disabled={!nomeValido || !quantitaValida || salva.isPending || leggendo}>
          {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mezzo ? "Salva" : attrezzo ? "Crea attrezzatura" : "Crea mezzo"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
