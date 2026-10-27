// Expands a set of category IDs to include every descendant category, using
// the same parent/child rules as the storefront catalog. Only category rows
// ({id,slug,parentSlug}) are needed, so callers control the query.
export function descendantCategoryIds(rows, selectedIds) {
  const ids = new Set(selectedIds);
  const slugs = new Set(rows.filter((c) => ids.has(c.id)).map((c) => c.slug));
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of rows)
      if (c.parentSlug && slugs.has(c.parentSlug) && !slugs.has(c.slug)) {
        slugs.add(c.slug);
        ids.add(c.id);
        changed = true;
      }
  }
  return ids;
}
