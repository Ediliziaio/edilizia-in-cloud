import { describe, expect, it } from 'vitest';
import { dossierBreakdown, requirementBreakdown } from './visual-metrics';
import type { DocumentRequest, GareDocument, Requirement } from '../types';

describe('indicatori dei fascicoli operativi', () => {
  it('non presenta un requisito compatibile senza revisione come verifica chiusa', () => {
    const rows = requirementBreakdown([
      { status: 'compatibile', reviewed_by: null },
      { status: 'compatibile', reviewed_by: 'r' },
      { status: 'non_applicabile', reviewed_by: 'r' },
      { status: 'evidenza_mancante', reviewed_by: 'r' },
      { status: 'incompatibilita', reviewed_by: 'r' },
      { status: 'da_verificare', reviewed_by: 'r' },
    ] as Requirement[]);
    expect(rows.map(row => row.value)).toEqual([2, 2, 1, 1]);
    expect(rows.reduce((sum, row) => sum + row.value, 0)).toBe(6);
  });

  it('distingue assenza di requisiti e richieste da una preparazione completata', () => {
    expect(requirementBreakdown([]).every(row => row.value === 0)).toBe(true);
    expect(dossierBreakdown([], []).every(row => row.total === 0 && row.done === 0)).toBe(true);
  });

  it('esclude file superati e archiviati dai conteggi e dalle richieste soddisfatte', () => {
    const requests = [{ category: 'tecnica', fulfilled_by: 'old' }, { category: 'tecnica', fulfilled_by: 'archived' }] as DocumentRequest[];
    const documents = [
      { id: 'old', category: 'tecnica', status: 'approvato' },
      { id: 'new', previous_id: 'old', category: 'tecnica', status: 'bozza' },
      { id: 'archived', category: 'tecnica', status: 'approvato', archived: true },
    ] as GareDocument[];
    expect(dossierBreakdown(requests, documents)[1]).toMatchObject({ total: 2, done: 0, files: 1 });
  });

  it('mantiene aperte le richieste con dati incompleti o firma richiesta non dichiarata', () => {
    const requests = [
      { category: 'economica', fulfilled_by: 'draft', signature_required: true },
      { category: 'economica', fulfilled_by: 'unsigned', signature_required: true },
      { category: 'economica', fulfilled_by: 'complete', signature_required: true },
    ] as DocumentRequest[];
    const documents = [
      { id: 'draft', category: 'economica', status: 'approvato', signature_declared: true, unresolved_fields: 2 },
      { id: 'unsigned', category: 'economica', status: 'approvato', signature_declared: false },
      { id: 'complete', category: 'economica', status: 'approvato', signature_declared: true },
    ] as GareDocument[];
    expect(dossierBreakdown(requests, documents)[2]).toMatchObject({ total: 3, done: 1, files: 3 });
  });

  it('separa richieste e file per busta senza contare le fonti come offerta', () => {
    const requests = [{ category: 'amministrativa', fulfilled_by: 'technical' }] as DocumentRequest[];
    const documents = [{ id: 'source', category: 'fonte', status: 'approvato' }, { id: 'technical', category: 'tecnica', status: 'approvato' }] as GareDocument[];
    const result = dossierBreakdown(requests, documents);
    expect(result[0]).toMatchObject({ total: 1, done: 0, files: 0 });
    expect(result[1]).toMatchObject({ total: 0, done: 0, files: 1 });
    expect(result.reduce((sum, row) => sum + row.files, 0)).toBe(1);
  });
});
