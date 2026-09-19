/** Una riga del cestino delle automazioni, già pronta per la schermata. */
export interface AutomazioneNelCestino {
  id: string;
  nome: string;
  eliminataIl: string;
  eliminataDa: string | null;
  /** Lo stato che aveva prima del cestino: quello che torna al ripristino. */
  statoPrima: string | null;
}

/** Filtra per nome o per chi l'ha eliminata, senza badare a maiuscole e accenti. */
export function filtraCestinoAutomazioni(righe: AutomazioneNelCestino[], cerca: string): AutomazioneNelCestino[] {
  const normalizza = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const q = normalizza(cerca);
  if (!q) return righe;
  return righe.filter((r) => normalizza(`${r.nome} ${r.eliminataDa ?? ""}`).includes(q));
}

/** «pubblicata», «in bozza», «archiviata»: come si legge lo stato di prima. */
export function statoPrimaLeggibile(stato: string | null | undefined): string {
  switch (stato) {
    case "published": return "pubblicata";
    case "archived": return "archiviata";
    case "draft":
    default: return "in bozza";
  }
}
