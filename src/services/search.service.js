import { db } from "../config/database.js";
import { normalizeSearch, popularTerms } from "../utils/search-terms.js";
export async function recordSearch(value) {
  const term = normalizeSearch(value);
  if (term.length < 2 || term.length > 100) return;
  await db.searchTerm.upsert({
    where: { term },
    create: { term },
    update: { count: { increment: 1 } },
  });
}
export async function searchSuggestions(settings) {
  const rows =
    settings.dynamic === false
      ? []
      : await db.searchTerm.findMany({
          orderBy: [{ count: "desc" }, { term: "asc" }],
          take: 100,
        });
  return popularTerms(
    settings.terms,
    rows.map((row) => row.term),
    settings.limit ?? 10,
  );
}
