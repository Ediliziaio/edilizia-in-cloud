export type PipelineKind = "survey" | "rfq" | "ddt" | "oda";
export interface PipelineDocument {
  id: string;
  label: string;
  status: string;
  stage: string;
  href: string;
  scheduled?: string | null;
  linked?: boolean;
  responses?: number;
  waiting?: number;
  damages?: boolean;
  quantity?: number;
  started_at?: string | null;
  completed_at?: string | null;
}
export interface PipelineTransition {
  kind: PipelineKind;
  document: PipelineDocument;
  target: string;
  title: string;
  description: string;
  action: "save" | "detail" | "plan";
  status?: string;
}
export function planPipelineTransition(
  kind: PipelineKind,
  document: PipelineDocument,
  target: string,
): PipelineTransition | null {
  if (document.stage === target) return null;
  const plan = (
    action: PipelineTransition["action"],
    title: string,
    description: string,
    status?: string,
  ): PipelineTransition => ({
    kind,
    document,
    target,
    action,
    title,
    description,
    status,
  });
  if (kind === "survey") {
    if (
      document.linked ||
      ["signed", "converted", "archived", "cancelled"].includes(document.status)
    )
      return plan(
        "detail",
        "Pratica già firmata o collegata",
        "Apri il sopralluogo per gestire la firma o il documento collegato. Lo spostamento non li rimuove.",
      );
    if (target === "pianificato")
      return ["draft"].includes(document.status)
        ? plan(
            "plan",
            "Pianifica il sopralluogo",
            "Scegli data, ora e tecnico: verrà aggiornato anche il calendario.",
          )
        : plan(
            "detail",
            "Rivedi la pianificazione",
            "Apri il sopralluogo per rivedere rilievo e appuntamento insieme.",
          );
    if (target === "in_corso")
      return plan(
        "save",
        "Porta il sopralluogo in corso",
        "Conferma l’avvio o la riapertura del rilievo.",
        "in_progress",
      );
    if (target === "completato")
      return plan(
        "save",
        "Completa il sopralluogo",
        "Confermi di aver completato il rilievo? La firma del cliente resta un passaggio distinto.",
        "completed",
      );
    if (target === "firmato")
      return plan(
        "detail",
        "Raccogli la firma del cliente",
        "La fase Firmato si raggiunge dopo la firma effettiva. Apri il sopralluogo per raccoglierla.",
      );
    if (target === "preventivo")
      return plan(
        "detail",
        "Crea o collega il preventivo",
        "Apri il sopralluogo e crea il preventivo: la pratica passerà di fase quando il documento sarà collegato.",
      );
    if (target === "da_pianificare")
      return plan(
        "detail",
        "Rivedi appuntamento e rilievo",
        "Apri il sopralluogo per annullare o modificare l’appuntamento e rivedere lo stato senza lasciare un evento scollegato in calendario.",
      );
  }
  if (kind === "rfq") {
    if (["aggiudicata", "chiusa", "annullata"].includes(document.status))
      return plan(
        "detail",
        "Richiesta già conclusa",
        "Apri la richiesta per verificare aggiudicazione e ordine collegato prima di modificarla.",
      );
    if (target === "in_valutazione" && (document.responses ?? 0) > 0)
      return plan(
        "save",
        "Valuta le offerte ricevute",
        "La richiesta passerà in valutazione. Le offerte e i fornitori invitati restano collegati.",
        "in_valutazione",
      );
    if (target === "chiusa")
      return plan(
        "save",
        "Chiudi la richiesta",
        "Confermi di concludere la richiesta senza aggiudicarla a un fornitore? Le offerte ricevute restano consultabili.",
        "chiusa",
      );
    if (target === "aggiudicata")
      return plan(
        "detail",
        "Scegli il fornitore",
        "Confronta le offerte e scegli il fornitore dalla richiesta. L’aggiudicazione genererà l’ordine d’acquisto corretto.",
      );
    return plan(
      "detail",
      "Completa il passaggio nella richiesta",
      target === "in_valutazione"
        ? "Prima di valutare occorre registrare almeno una risposta del fornitore."
        : target === "inviata"
          ? "Invita i fornitori o registra come e quando hai chiesto l’offerta: lo stato seguirà l’invio effettivo."
          : "Verifica inviti e risposte prima di riportare la richiesta in bozza.",
    );
  }
  if (kind === "ddt") {
    if (
      target === "verificato" &&
      document.status === "ricevuto" &&
      !document.damages &&
      (document.quantity ?? 0) > 0
    )
      return plan(
        "save",
        "Conferma la verifica della merce",
        "Confermi di aver controllato la merce ricevuta e che sia conforme? Questo passaggio non registra altre quantità in magazzino.",
        "verificato",
      );
    if (
      target === "ricevuto" &&
      document.status === "verificato" &&
      !document.damages
    )
      return plan(
        "save",
        "Riapri il controllo del DDT",
        "Il DDT tornerà tra quelli da verificare. Le quantità già ricevute non cambiano.",
        "ricevuto",
      );
    return plan(
      "detail",
      target === "non_conforme"
        ? "Registra la non conformità"
        : "Completa ricezione o controllo",
      target === "non_conforme"
        ? "Apri il DDT per descrivere il danno o la difformità e allegare le prove."
        : "Controlla le quantità, il magazzino e gli eventuali danni nel DDT. Lo spostamento non crea o annulla movimenti di merce automaticamente.",
    );
  }
  if (kind === "oda") {
    if (target === "ordinato" && document.status === "bozza")
      return plan(
        "save",
        "Segna l’OdA come inviato",
        "Confermi di aver già trasmesso questo ordine al fornitore? Verrà registrato come inviato; questa azione non spedisce email.",
        "inviato",
      );
    return plan(
      "detail",
      target === "consegnato" || target === "in_consegna"
        ? "Registra l’arrivo della merce"
        : "Gestisci l’ordine d’acquisto",
      target === "consegnato" || target === "in_consegna"
        ? "Apri l’ordine e registra le quantità arrivate e il DDT. Magazzino, commessa e costi si aggiorneranno attraverso la ricezione effettiva."
        : "Apri l’ordine per verificare invii, ricezioni e impegni prima di cambiare fase.",
    );
  }
  return null;
}
