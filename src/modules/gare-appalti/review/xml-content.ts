export interface XmlSection { key: string; title: string; text: string; references: string[] }
const children = (element: Element, name: string) => [...element.children].filter(e => e.localName === name);
const direct = (element: Element, name: string) => children(element, name)[0]?.textContent?.trim() || '';
const all = (element: Element, name: string) => [...element.getElementsByTagNameNS('*', name)];

// A reading aid over the actual file, never a substitute for the original XML.
export function xmlSections(source: string): XmlSection[] {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw Error('XML non leggibile. Scarica il file originale per controllarlo.');
  const root = doc.documentElement;
  const sections: XmlSection[] = [{ key: 'identity', title: 'Dati della procedura e degli operatori', text: [
    ['Documento', direct(root, 'ID')], ['Profilo', direct(root, 'ProfileID')],
    ...['EconomicOperatorParty', 'ContractingParty', 'ProcurementProjectLot'].flatMap(name => all(root, name).map(e => [name === 'EconomicOperatorParty' ? 'Operatore' : name === 'ContractingParty' ? 'Ente' : 'Lotto', [...e.getElementsByTagName('*')].filter(node=>!node.children.length).map(node=>node.textContent?.trim()).filter(Boolean).join(' · ')]))
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('\n'), references: [] }];
  const properties = new Map<string, { label: string; criterion: string }>();
  for (const criterion of all(root, 'TenderingCriterion')) {
    const title = direct(criterion, 'Name') || 'Criterio', id = direct(criterion, 'ID');
    const fields = all(criterion, 'TenderingCriterionProperty');
    fields.forEach(field => properties.set(direct(field, 'ID'), { label: direct(field, 'Description'), criterion: title }));
    sections.push({ key: `criterion:${id}:${sections.length}`, title, text: [direct(criterion, 'Description'), ...fields.map(f => direct(f, 'Description'))].filter(Boolean).join('\n'), references: [id, ...fields.map(f => direct(f, 'ID'))].filter(Boolean) });
  }
  for (const response of all(root, 'TenderingCriterionResponse')) {
    const id = direct(response, 'ValidatedCriterionPropertyID'), property = properties.get(id);
    const values = all(response, 'ResponseValue').flatMap(e => [...e.children].map(c => `${c.localName}: ${c.textContent?.trim() || '—'}`));
    sections.push({ key: `answer:${id}:${sections.length}`, title: property?.label || `Risposta ${id || sections.length}`, text: values.join('\n') || response.textContent?.trim() || '', references: [id, direct(response, 'ID')].filter(Boolean) });
  }
  return sections.filter(s => s.text);
}
