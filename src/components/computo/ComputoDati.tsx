/**
 * Passo «Dati» del preventivo con computo, come il passo Cliente di
 * Ristrutturazione: il cliente si prende dal CRM (nome, email, telefono e il
 * suo indirizzo), il preventivo si può cointestare e l'indirizzo dei lavori è
 * «lo stesso del contatto» oppure si scrive. Sotto, i dati del documento.
 *
 * Prima del 29/10/2026 erano otto caselle in colonna, senza CRM e con
 * l'indirizzo in una riga sola: il PDF non sapeva a chi intestare la firma.
 */
import { type ReactNode } from "react";
import { Building2, FileBadge, Mail, Phone, User } from "lucide-react";
import { SelezionaCliente } from "@/components/preventivatore/SelezionaCliente";
import { tipoDaScelta, type ClienteScelto } from "@/lib/preventivatore/selezionaCliente";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Cointestatario } from "@/components/preventivatore/Cointestatario";
import { IndirizzoDeiLavori } from "@/components/preventivatore/IndirizzoDeiLavori";
import { useIndirizzoLavoriEdile } from "@/lib/preventivatore/useIndirizzoLavoriEdile";
import { testoIndirizzo } from "@/lib/preventivatore/indirizzoLavori";
import { datiFiscaliBozza, type BozzaComputo } from "@/lib/computo/editorNativo";
import { avvisiDatiFiscali } from "@/lib/preventivatore/datiFiscaliCliente";
import { SceltaTipoCliente } from "@/components/preventivatore/DatiFiscaliCliente";

const CANTIERE = ["cantiere_indirizzo", "cantiere_citta", "cantiere_cap", "cantiere_provincia"] as const;

/** L'indirizzo dei lavori come riga del PDF, dai quattro campi. */
export function indirizzoDaCantiere(b: BozzaComputo): string {
  const c = cantiereDellaBozza(b);
  return testoIndirizzo({ indirizzo: c.cantiere_indirizzo, citta: c.cantiere_citta, cap: c.cantiere_cap, provincia: c.cantiere_provincia }).slice(0, 300);
}

/** Una bozza di prima aveva solo `indirizzo`: si legge come via, finché non si riscrive. */
export function cantiereDellaBozza(b: BozzaComputo) {
  const vuoto = CANTIERE.every(k => !(b[k] ?? "").trim());
  return {
    cantiere_indirizzo: vuoto ? b.indirizzo || null : b.cantiere_indirizzo || null,
    cantiere_citta: b.cantiere_citta || null, cantiere_cap: b.cantiere_cap || null, cantiere_provincia: b.cantiere_provincia || null,
  };
}

export default function ComputoDati({ bozza, onChange }: { bozza: BozzaComputo; onChange: (patch: Partial<BozzaComputo>) => void }) {
  const cantiere = cantiereDellaBozza(bozza);
  // Le scritture dello stesso giro (la spunta copia quattro campi) le somma l'editor; il testo per il PDF lo ricompone lui.
  const scriviCantiere = (chiave: (typeof CANTIERE)[number], valore: string | null) => onChange({ [chiave]: valore ?? "" });
  const indirizzo = useIndirizzoLavoriEdile(cantiere, scriviCantiere, { contattoId: bozza.clienteId || null, nuovo: false });

  // Contatto del CRM o cliente/committente dell'anagrafica, anche per partita IVA (14/11/2026): lo stesso
  // popup dei preventivatori. Il contatto si collega con `clienteId`, il cliente con `clienteAnagraficaId`.
  const scegli = (c: ClienteScelto) => {
    // Un contatto con ragione sociale o partita IVA è un'azienda: il preventivo si intesta a lei, con i suoi dati fiscali.
    const azienda = tipoDaScelta(c) === "azienda";
    const persona = [c.nome, c.cognome].filter(Boolean).join(" ") || c.email || "Senza nome";
    onChange({
      clienteId: c.origine === "contatto" ? c.id : "", clienteAnagraficaId: c.origine === "cliente" ? c.id : "",
      committente: (azienda && c.ragioneSociale ? c.ragioneSociale : persona).slice(0, 160),
      clienteEmail: c.email ?? "", clienteTelefono: c.telefono ?? "", clienteTipo: azienda ? "azienda" : "privato",
      clienteCodiceFiscale: (c.codiceFiscale ?? "").slice(0, 20), clientePartitaIva: (c.partitaIva ?? "").slice(0, 20),
    });
    const sede = { indirizzo: c.indirizzo, citta: c.citta, cap: c.cap, provincia: c.provincia };
    // L'indirizzo del contatto o del cliente va nei lavori, se i lavori lo seguivano.
    indirizzo.dalContatto(c.id, sede);
  };
  const tipo = bozza.clienteTipo ?? "privato";
  const avvisi = avvisiDatiFiscali(datiFiscaliBozza(bozza));
  const campo = (id: string, nome: string, Icona: typeof User, input: ReactNode, avviso?: string) =>
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="flex h-4 items-center gap-1 text-xs"><Icona className="h-3 w-3 text-slate-500" />{nome}</Label>
      {input}
      {avviso && <p role="status" className="text-[11px] text-amber-700">{avviso}</p>}
    </div>;
  const testo = (nome: string, key: "titolo" | "oggetto" | "numero" | "dataDocumento" | "revisione" | "tecnico", max: number, placeholder = "") =>
    <div className="min-w-0 space-y-1"><Label htmlFor={`native-${key}`} className="text-xs">{nome}</Label>
      <Input id={`native-${key}`} className="h-9" maxLength={max} placeholder={placeholder} value={bozza[key] ?? ""} onChange={e => onChange({ [key]: e.target.value })} /></div>;

  return <div className="space-y-4">
    <section aria-label="Cliente" className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><User className="h-4 w-4 text-slate-500" />Cliente</h2>
      </div>
      <SelezionaCliente
        collegatoId={bozza.clienteId || bozza.clienteAnagraficaId || null}
        collegatoOrigine={bozza.clienteId ? "contatto" : "cliente"}
        collegatoNome={bozza.clienteId || bozza.clienteAnagraficaId ? bozza.committente || null : null}
        etichetta="Cerca contatto o cliente"
        onScegli={scegli}
        onScollega={() => onChange({ clienteId: "", clienteAnagraficaId: "" })}
      />
      <SceltaTipoCliente valore={tipo} onChange={t => onChange({ clienteTipo: t })} />
      {/* Tutte le etichette con l'icona e la stessa altezza: prima «Committente» stava più in basso di «Email» e «Telefono». */}
      <div className="grid items-start gap-3 sm:grid-cols-3">
        {campo("native-committente", tipo === "azienda" ? "Ragione sociale" : tipo === "pa" ? "Ente" : "Nome e cognome", tipo === "privato" ? User : Building2,
          <Input id="native-committente" className="h-9" maxLength={160} placeholder={tipo === "azienda" ? "Es. Rossi Costruzioni S.r.l." : tipo === "pa" ? "Es. Comune di Torino" : "Es. Mario Rossi"} value={bozza.committente} onChange={e => onChange({ committente: e.target.value })} />)}
        {campo("native-email", "Email", Mail,
          <Input id="native-email" type="email" className="h-9" maxLength={200} value={bozza.clienteEmail} onChange={e => onChange({ clienteEmail: e.target.value })} />)}
        {campo("native-telefono", "Telefono", Phone,
          <Input id="native-telefono" type="tel" inputMode="tel" className="h-9" maxLength={60} value={bozza.clienteTelefono} onChange={e => onChange({ clienteTelefono: e.target.value })} />)}
      </div>
      <div className={`grid items-start gap-3 ${tipo !== "privato" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
        {tipo !== "privato" && campo("native-piva", tipo === "pa" ? "Partita IVA (se c'è)" : "Partita IVA", FileBadge,
          <Input id="native-piva" className="h-9 font-mono [&:not(:placeholder-shown)]:uppercase" maxLength={20} inputMode="numeric" placeholder="11 cifre" value={bozza.clientePartitaIva} onChange={e => onChange({ clientePartitaIva: e.target.value })} />, avvisi.partitaIva)}
        {campo("native-cf", tipo === "azienda" ? "Codice fiscale (se diverso)" : "Codice fiscale", FileBadge,
          <Input id="native-cf" className="h-9 font-mono [&:not(:placeholder-shown)]:uppercase" maxLength={20} placeholder={tipo === "azienda" ? "Di solito uguale alla partita IVA" : tipo === "pa" ? "11 cifre dell'ente" : "16 caratteri"} value={bozza.clienteCodiceFiscale} onChange={e => onChange({ clienteCodiceFiscale: e.target.value })} />, avvisi.codiceFiscale)}
        {tipo !== "privato" && campo("native-pec", "PEC", Mail,
          <Input id="native-pec" type="email" className="h-9" maxLength={200} value={bozza.clientePec} onChange={e => onChange({ clientePec: e.target.value })} />)}
        {tipo !== "privato" && campo("native-sdi", tipo === "pa" ? "Codice univoco ufficio" : "Codice destinatario (SDI)", FileBadge,
          <Input id="native-sdi" className="h-9 font-mono [&:not(:placeholder-shown)]:uppercase" maxLength={10} placeholder={tipo === "pa" ? "6 caratteri (IPA)" : "7 caratteri"} value={bozza.clienteSdi} onChange={e => onChange({ clienteSdi: e.target.value })} />, avvisi.codiceSdi)}
      </div>
      <Cointestatario form={bozza} onChange={(campo, valore) => onChange({ [campo]: valore ?? "" })} />
      <IndirizzoDeiLavori conSpunta={indirizzo.conSpunta} etichettaUguale="Lavori allo stesso indirizzo del contatto"
        altrove={indirizzo.altrove} onAltrove={indirizzo.scegliAltrove} lavori={indirizzo.lavori} riassunto={indirizzo.riassunto} onScrivi={indirizzo.scriviLavori} />
    </section>

    <section aria-label="Intervento" className="space-y-3 rounded-xl border bg-white p-4">
      <h2 className="text-base font-semibold">Intervento</h2>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {testo("Titolo del preventivo", "titolo", 160)}{testo("Oggetto dei lavori", "oggetto", 500, "Es. Realizzazione di un campo da tennis in resina")}
      </div>
    </section>

    <details className="group rounded-xl border bg-white p-4" open={!!(bozza.numero || bozza.revisione || bozza.tecnico || bozza.riferimentoPrezzi)}>
      <summary className="cursor-pointer text-sm font-semibold">Riferimenti del documento <span className="font-normal text-muted-foreground">· numero, data, tecnico, prezzi</span></summary>
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {testo("Numero preventivo", "numero", 80)}{testo("Data del documento", "dataDocumento", 40, "gg/mm/aaaa")}
          {testo("Revisione", "revisione", 80)}{testo("Tecnico o referente", "tecnico", 300)}
        </div>
        <div className="space-y-1"><Label htmlFor="native-prezzi" className="text-xs">Riferimenti dei prezzi</Label>
          <Textarea id="native-prezzi" rows={2} maxLength={2000} placeholder="Es. Prezzario Regione Lombardia 2026, prezzi dell'impresa" value={bozza.riferimentoPrezzi} onChange={e => onChange({ riferimentoPrezzi: e.target.value })} /></div>
      </div>
    </details>
  </div>;
}
