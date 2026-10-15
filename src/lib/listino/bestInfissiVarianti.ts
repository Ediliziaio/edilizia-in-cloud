import type { FamilyWithAxes } from '@/types/articleFamily';
import type { VarianteTecnicaConfermata } from './variantiTecnicheConfermate';
import { verificaVarianti } from './verificaVarianti';

const BEST_INFISSI = '421f4929-04bc-406d-b0fd-3ff4d57a64ee';
const QFORT = 'https://qfort.it/finestre/';
const ANGER = 'https://www.portefinestreanger.it/prodotti/infissi-in-legno-alluminio/';
const MODELLI: Record<string, string> = {
  'a1405c07-659d-45a5-bd00-584f0e4f6ed0':'4Stars',
  '5066bc5e-0bc7-4826-8c27-dd81e014767d':'Epiq',
  '2fffb7ed-e5ee-457d-9de0-f950b23eff0e':'Arrogance',
  '27fce4ed-2e45-4834-8348-0973a49a0089':'5Stars',
  'f23795ea-5821-4259-b854-61c59360f817':'Legno-Alluminio',
  '8db9814d-c202-42a0-922c-c24272d633c6':'Agreen Home',
};
export function modelloBestInfissi(famiglia: FamilyWithAxes): string | null {
  return famiglia.company_id === BEST_INFISSI ? MODELLI[famiglia.macrocategoria_id ?? ''] ?? null : null;
}
const variante = (codice: string, nome: string, fonte: string, nomi: readonly string[]): VarianteTecnicaConfermata => ({
  codice, nome, fonte, valori: nomi.map((nome, i) => ({codice: `${codice}_${i + 1}`, nome})),
});

/** Disponibilità documentata il 15/10/2026. Non contiene prezzi o regole di compatibilità desunte. */
export function variantiBestInfissi(famiglia: FamilyWithAxes, modello = modelloBestInfissi(famiglia) ?? ''): VarianteTecnicaConfermata[] {
  if (famiglia.company_id !== BEST_INFISSI) return [];
  const anger = /^(?:Finestra|Porta finestra) legno-alluminio Anger (Social Plus|Mini Social|Social)$/i.exec(famiglia.nome);
  if (anger) {
    const serie = anger[1].toLowerCase().replaceAll(' ', '-');
    const fonte = `${ANGER}${serie}/`;
    const condizione = {asse:'apertura', valori:['1_anta','2_ante','2_ante_fissa','oscillo_battente']};
    return [
      {...variante('profilo','Profilo interno',fonte,['Recta','Modern','Classic','Epoca']),applicabileSe:condizione},
      ...(serie !== 'social-plus' ? [{...variante('finitura_legno_interno','Finitura legno interno',fonte,['Mordenzato','Laccato RAL']),applicabileSe:condizione}] : []),
    ];
  }
  // Le fonti della finestra non certificano i sistemi scorrevoli, le forme speciali o le porte d'ingresso.
  if (!/^(?:Finestra [12] Ant[ae]|Porta Finestra [12] Ant[ae])$/.test(famiglia.nome)) return [];
  if (modello === 'Epiq') {
    const fonte = `${QFORT}finestre-pvc/epiq-6stars/`;
    return [variante('profilo','Forma anta',fonte,['Anta dritta','Anta complanare']),variante('composizione_vetrocamera','Composizione vetrocamera',fonte,['Triplo vetro · 44 mm · canalina calda'])];
  }
  if (modello === '4Stars' || modello === '5Stars') {
    const fonte = modello === '4Stars' ? `${QFORT}finestre-pvc/4stars/` : `${QFORT}finestre-alluminio/5stars/`;
    return [variante('composizione_vetrocamera','Composizione vetrocamera',fonte,['Doppio vetro','Triplo vetro'])];
  }
  // Per Arrogance, Agreen e i prodotti generici: le combinazioni non accertate rimangono segnalate.
  return [];
}

export function avvisiVariantiBestInfissi(famiglia: FamilyWithAxes): string[] {
  if (famiglia.company_id !== BEST_INFISSI || !['serramenti', 'serramentista'].includes(famiglia.vertical)) return [];
  const avvisi = verificaVarianti(famiglia).map(p => p.messaggio);
  if (/slide|scorrevole|traslante|portoncino|^COSTRUZIONE /i.test(famiglia.nome)) {
    avvisi.push('Sistema specifico, schema di apertura e limiti dimensionali da confermare con il fornitore. Le varianti documentate per le finestre non sono estese automaticamente a questo prodotto.');
  }
  if (modelloBestInfissi(famiglia) === 'Legno-Alluminio' && !/anger/i.test(famiglia.nome)) {
    avvisi.push('Serie del produttore da identificare: questi articoli generici non sono attribuiti automaticamente a Social, Mini Social o Social Plus.');
  }
  avvisi.push('Codici colore, composizione completa del vetro, maniglie, telaio e condizioni degli accessori restano da verificare per la singola costruzione. I supplementi a zero non attestano che siano inclusi.');
  return avvisi;
}
