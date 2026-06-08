// Pure helpers for a master "Select all" control over a list with per-row
// checkboxes. Kept side-effect-free so the all/indeterminate logic is testable
// without the React tree.

export interface SelectAllState {
  allSelected: boolean;
  indeterminate: boolean;
}

/**
 * Given the ids currently listed (respecting any active filter) and the current
 * selection set, report whether all listed items are selected and whether the
 * control should show the indeterminate (some-but-not-all) state.
 */
export function selectAllState(allIds: string[], selected: Set<string>): SelectAllState {
  const total = allIds.length;
  if (total === 0) return { allSelected: false, indeterminate: false };
  let count = 0;
  for (const id of allIds) if (selected.has(id)) count++;
  const allSelected = count === total;
  return { allSelected, indeterminate: count > 0 && !allSelected };
}

/**
 * Next selection set when toggling the master control: if everything listed is
 * already selected, clear the selection; otherwise select all listed ids.
 */
export function toggleSelectAll(allIds: string[], selected: Set<string>): Set<string> {
  return selectAllState(allIds, selected).allSelected ? new Set() : new Set(allIds);
}
