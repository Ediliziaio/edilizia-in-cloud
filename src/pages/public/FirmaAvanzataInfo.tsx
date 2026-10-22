/**
 * Caratteristiche del servizio di firma elettronica avanzata: la pagina che il
 * DPCM 22/02/2013 art. 57 c.1 e-g chiede di pubblicare (come funziona, quali
 * tecnologie, come si chiede copia della dichiarazione, come si revoca).
 * La cita la dichiarazione che chi firma accetta (`_shared/firmaAvanzata.ts`).
 */
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

const SEZIONI: { titolo: string; testo: string[] }[] = [
  {
    titolo: "Chi offre la firma",
    testo: [
      "La firma elettronica avanzata è offerta dall'azienda che ti manda il documento da firmare (l'impresa, il serramentista, l'installatore…), attraverso la piattaforma Edilizia in Cloud. La firma vale solo nei rapporti tra te e quell'azienda (art. 60 del DPCM 22 febbraio 2013).",
    ],
  },
  {
    titolo: "Come vieni identificato",
    testo: [
      "Al primo documento con un'azienda carichi la foto di un documento di riconoscimento valido (carta d'identità, passaporto o patente), scrivi i tuoi dati e accetti le condizioni del servizio. Ricevi subito per email una copia gratuita della dichiarazione accettata.",
      "Ai documenti successivi della stessa azienda basta il codice. Quando il documento d'identità scade, al documento successivo ti viene chiesto di nuovo.",
    ],
  },
  {
    titolo: "Come firmi",
    testo: [
      "Ricevi per email un link personale. Apri il documento, lo leggi, e ricevi un codice di 6 cifre via email e, se l'azienda ha il tuo cellulare, via SMS. Il codice vale 10 minuti; dopo 5 errori ne serve uno nuovo, e per ogni documento ci sono al massimo 10 codici e 15 errori in tutto.",
      "Inserito il codice giusto, il tuo browser riceve una chiave segreta valida 15 minuti: solo con quella si firma. Il codice si usa una volta sola.",
    ],
  },
  {
    titolo: "Come si garantisce che il documento non cambi",
    testo: [
      "Al momento dell'invio si salva una copia del documento e se ne calcola l'impronta informatica (SHA-256). È quella copia che vedi e che firmi. Al momento della firma l'impronta si ricalcola: se il documento fosse cambiato, la firma non si fa.",
      "Il documento firmato porta un timbro su ogni pagina e, in fondo, il certificato di firma: chi ha firmato, quando, da dove, come è stato identificato, l'impronta del documento e un codice di verifica.",
    ],
  },
  {
    titolo: "Cosa si registra e per quanto tempo",
    testo: [
      "Ogni passaggio (apertura del link, invio e verifica del codice, identificazione, firma) è registrato con data e ora, indirizzo di rete e dispositivo. Ogni riga del registro contiene l'impronta della precedente: togliere o cambiare una riga si vede.",
      "A firma fatta, il documento firmato, la copia inviata, i dati di identificazione e il registro vengono raccolti in un archivio che non si può modificare e si conservano per almeno 20 anni (art. 57 c.1 b del DPCM).",
    ],
  },
  {
    titolo: "Tecnologie usate",
    testo: [
      "Collegamenti cifrati (HTTPS). Codici monouso generati con un generatore crittografico e salvati solo come impronta. Impronte SHA-256 per documenti, dichiarazioni e registro. Documenti d'identità in un archivio privato, accessibile solo al sistema. PDF firmato prodotto dal sistema con timbro e certificato.",
    ],
  },
  {
    titolo: "Copia della dichiarazione e revoca",
    testo: [
      "Puoi chiedere in ogni momento, gratis, all'azienda con cui firmi una copia della dichiarazione che hai accettato e delle informazioni sul servizio (art. 57 c.1 c-d del DPCM).",
      "Puoi revocare l'adesione al servizio chiedendolo alla stessa azienda: la revoca vale per le firme successive. I documenti già firmati restano validi.",
    ],
  },
  {
    titolo: "Verificare un documento firmato",
    testo: [
      "Chiunque riceva un documento firmato può controllarlo con il codice di verifica stampato sul certificato.",
    ],
  },
];

export default function FirmaAvanzataInfo() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white shadow-lg">
        <div className="flex items-center gap-3 bg-gradient-to-r from-slate-800 to-slate-700 p-6">
          <Shield className="h-7 w-7 text-orange-400" />
          <div>
            <h1 className="text-lg font-bold leading-tight text-white">Firma elettronica avanzata</h1>
            <p className="text-xs text-slate-400">Caratteristiche del servizio · Edilizia in Cloud</p>
          </div>
        </div>
        <div className="space-y-6 p-6">
          {SEZIONI.map((s) => (
            <section key={s.titolo} className="space-y-2">
              <h2 className="text-base font-semibold text-slate-800">{s.titolo}</h2>
              {s.testo.map((t) => <p key={t} className="text-sm leading-relaxed text-slate-600">{t}</p>)}
            </section>
          ))}
          <Link to="/verifica-firma" className="inline-block rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
            Verifica un documento firmato
          </Link>
          <p className="text-xs text-slate-400">Riferimenti: Regolamento UE 910/2014 art. 26; D.Lgs. 82/2005 artt. 20-21; DPCM 22 febbraio 2013 artt. 55-61.</p>
        </div>
      </div>
    </div>
  );
}
