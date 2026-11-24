import { requirementOpen, requestComplete, activeTenderDocuments } from '../tender-ux';
import type { DocumentRequest, GareDocument, Requirement } from '../types';

export const chartColors = { blue: '#314e86', teal: '#287b68', sky: '#3a99cf', amber: '#c78315', rose: '#c83b58', gray: '#9aa9bb' };

// Categories are mutually exclusive and preserve the existing definition of an open check.
export function requirementBreakdown(requirements: Requirement[]) {
  const rows = [
    { id: 'chiusi', label: 'Verifiche chiuse', value: 0, color: chartColors.teal },
    { id: 'da_verificare', label: 'Da verificare', value: 0, color: chartColors.amber },
    { id: 'evidenza_mancante', label: 'Evidenza mancante', value: 0, color: chartColors.sky },
    { id: 'incompatibilita', label: 'Possibile incompatibilità', value: 0, color: chartColors.rose },
  ];
  for (const requirement of requirements) {
    const index = !requirementOpen(requirement) ? 0 : requirement.status === 'incompatibilita' ? 3 : requirement.status === 'evidenza_mancante' ? 2 : 1;
    rows[index].value++;
  }
  return rows;
}

export function dossierBreakdown(requests: DocumentRequest[], documents: GareDocument[]) {
  const current = activeTenderDocuments(documents);
  return (['amministrativa', 'tecnica', 'economica'] as const).map((category, index) => {
    const expected = requests.filter(request => request.category === category);
    return {
      category, label: ['Amministrativa', 'Tecnica', 'Economica'][index],
      total: expected.length, done: expected.filter(request => requestComplete(request, current)).length,
      files: current.filter(document => document.category === category).length,
      color: [chartColors.blue, chartColors.teal, chartColors.sky][index],
    };
  });
}
