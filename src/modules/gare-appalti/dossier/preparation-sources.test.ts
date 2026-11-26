import { expect, it } from 'vitest';
import type { GareDocument } from '../types';
import { preparationSourceChanges, preparationSources } from './preparation-sources';

it('riconosce gli atti sostituiti e le nuove acquisizioni e ignora documenti estranei alla gara', () => {
 const old = { id: 'old', name: 'Disciplinare', category: 'fonte', tender_id: 'gara', sha256: 'v1' } as GareDocument;
 const current = { ...old, id: 'new', previous_id: old.id, sha256: 'v2' };
 const extra = { ...old, id: 'extra', name: 'Chiarimento', sha256: 'extra' };
 const other = { ...old, id: 'other', tender_id: 'altra-gara' };
 expect(preparationSourceChanges([old], preparationSources([old, other], 'gara'))).toEqual({ added: [], removed: [] });
 expect(preparationSourceChanges([old], preparationSources([old, current, extra, other], 'gara'))).toEqual({ added: [current, extra], removed: [old] });
});
