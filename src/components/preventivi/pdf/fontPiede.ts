/** Il carattere del piè di pagina personalizzato, per react-pdf (09/11/2026). */
import { Font } from "@react-pdf/renderer";
import { urlFontPiede } from "../../../../supabase/functions/_shared/personalizzazioneDocumenti";

const RIPIEGO = "Times-Roman";
const ATTESA_MS = 8000;
const registrati = new Set<string>();

interface SorgenteFont { data: unknown; loadResultPromise: Promise<void> | null; load: () => Promise<void> }

const sorgenteDi = (fontFamily: string) =>
  Font.getFont({ fontFamily, fontStyle: "normal", fontWeight: 400 }) as unknown as SorgenteFont;

/**
 * Registra il carattere una sola volta e ne restituisce il nome. react-pdf fa fallire tutto il documento se un
 * carattere non si scarica: qui il caricamento non lancia mai, e al suo posto va il Times.
 */
export function fontPiedeRegistrato(nome: string): string {
  if (registrati.has(nome)) return nome;
  try {
    Font.register({ family: nome, src: urlFontPiede() });
    const sorgente = sorgenteDi(nome);
    const caricaVero = sorgente.load.bind(sorgente);
    sorgente.load = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          caricaVero(),
          new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error("font: tempo scaduto")), ATTESA_MS); }),
        ]);
      } catch {
        sorgente.loadResultPromise = null; // il prossimo documento riprova
        const riserva = sorgenteDi(RIPIEGO);
        await riserva.load();
        sorgente.data = riserva.data;
      } finally {
        clearTimeout(timer);
      }
    };
    registrati.add(nome);
    return nome;
  } catch {
    return RIPIEGO;
  }
}
