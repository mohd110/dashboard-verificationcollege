/**
 * PostgREST reads an `or` filter as a small expression language, so a comma or
 * a bracket typed into a search box would change the shape of the query rather
 * than be searched for. Stripping the punctuation is enough here, because names
 * and student codes contain none of it.
 *
 * Combining marks are kept alongside letters. Without them a Devanagari name
 * loses its vowel signs and stops matching anything.
 */
export function sanitiseSearch(value: string): string {
  return value
    .replace(/[^\p{L}\p{M}\p{N} .-]/gu, '')
    .trim()
    .slice(0, 60);
}
