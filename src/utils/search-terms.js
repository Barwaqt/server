export function normalizeSearch(term) {
  return term.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
export function popularTerms(manual, ranked, limit) {
  return [
    ...new Set([...manual, ...ranked].map(normalizeSearch).filter(Boolean)),
  ].slice(0, limit);
}
