import { describe, expect, it } from 'vitest';

import { sanitiseSearch } from '../search';

describe('sanitiseSearch', () => {
  it('keeps names and student codes intact', () => {
    expect(sanitiseSearch('Rahul Kumar')).toBe('Rahul Kumar');
    expect(sanitiseSearch('20260042')).toBe('20260042');
    expect(sanitiseSearch('A.K. Singh-Rawat')).toBe('A.K. Singh-Rawat');
  });

  it('strips the punctuation PostgREST would read as filter syntax', () => {
    expect(sanitiseSearch('Rahul,person_code.eq.20260043')).toBe('Rahulpersoncode.eq.20260043');
    expect(sanitiseSearch('a)or(b')).toBe('aorb');
    expect(sanitiseSearch('%25')).toBe('25');
  });

  it('trims and caps the length', () => {
    expect(sanitiseSearch('   Rahul   ')).toBe('Rahul');
    expect(sanitiseSearch('x'.repeat(200))).toHaveLength(60);
  });

  it('leaves non-Latin names alone', () => {
    expect(sanitiseSearch('राहुल कुमार')).toBe('राहुल कुमार');
  });
});
