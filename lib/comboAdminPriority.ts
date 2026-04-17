/**
 * Auto-rank combo packages for persisted `priority` (higher = matched first in engine).
 * Pure functions + deterministic tie-breaks.
 */

export type RankPackageInput = {
  id: string;
  name: string;
  package_price: number;
  is_active: boolean;
  is_configured: boolean;
};

export type RankSlotInput = {
  package_id: string;
  group_id: string;
  quantity: number;
  sort_order: number;
};

export type RankMemberInput = {
  group_id: string;
  menu_item_id: string;
};

/** Packages that participate in the matcher (same spirit as engine filter). */
export function packagesForMatcherDisplay(
  packages: RankPackageInput[],
  slots: RankSlotInput[]
): RankPackageInput[] {
  const slotCountByPkg = new Map<string, number>();
  for (const s of slots) {
    slotCountByPkg.set(s.package_id, (slotCountByPkg.get(s.package_id) ?? 0) + 1);
  }
  return packages.filter(
    (p) => p.is_active && p.is_configured && (slotCountByPkg.get(p.id) ?? 0) > 0
  );
}

function maxPriceForGroup(
  groupId: string,
  membersByGroup: Map<string, string[]>,
  menuPriceById: Map<string, number>
): number {
  const ids = membersByGroup.get(groupId) ?? [];
  let max = 0;
  for (const id of ids) {
    max = Math.max(max, menuPriceById.get(id) ?? 0);
  }
  return max;
}

export type ScoredPackage = RankPackageInput & {
  total_units: number;
  estimated_saving: number;
};

export function scorePackages(
  packages: RankPackageInput[],
  slots: RankSlotInput[],
  members: RankMemberInput[],
  menuPriceById: Map<string, number>
): ScoredPackage[] {
  const membersByGroup = new Map<string, string[]>();
  for (const m of members) {
    const arr = membersByGroup.get(m.group_id) ?? [];
    arr.push(m.menu_item_id);
    membersByGroup.set(m.group_id, arr);
  }

  const slotsByPkg = new Map<string, RankSlotInput[]>();
  for (const s of slots) {
    const arr = slotsByPkg.get(s.package_id) ?? [];
    arr.push(s);
    slotsByPkg.set(s.package_id, arr);
  }

  return packages.map((p) => {
    const pkgSlots = [...(slotsByPkg.get(p.id) ?? [])].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.group_id.localeCompare(b.group_id);
    });
    let total_units = 0;
    let ceiling = 0;
    for (const sl of pkgSlots) {
      total_units += sl.quantity;
      ceiling += sl.quantity * maxPriceForGroup(sl.group_id, membersByGroup, menuPriceById);
    }
    const estimated_saving = ceiling - p.package_price;
    return { ...p, total_units, estimated_saving };
  });
}

/**
 * Stable sort: total_units DESC, estimated_saving DESC, name ASC, id ASC.
 * Returns rows with assigned `priority` descending along that order (first = highest priority int).
 */
export function computeAutoPriorities(
  packages: RankPackageInput[],
  slots: RankSlotInput[],
  members: RankMemberInput[],
  menuPriceById: Map<string, number>
): { id: string; priority: number }[] {
  const scored = scorePackages(packages, slots, members, menuPriceById);
  const sorted = [...scored].sort((a, b) => {
    if (b.total_units !== a.total_units) return b.total_units - a.total_units;
    if (b.estimated_saving !== a.estimated_saving) return b.estimated_saving - a.estimated_saving;
    const nc = a.name.localeCompare(b.name, "id");
    if (nc !== 0) return nc;
    return a.id.localeCompare(b.id);
  });
  const base = 10000;
  return sorted.map((p, i) => ({ id: p.id, priority: base - i }));
}

/** Human-readable apply order for packages that match the engine display set. */
export function applyOrderSummary(
  packages: RankPackageInput[],
  slots: RankSlotInput[],
  members: RankMemberInput[],
  menuPriceById: Map<string, number>
): string {
  const matcher = packagesForMatcherDisplay(packages, slots);
  if (matcher.length === 0) return "—";
  const priorities = computeAutoPriorities(packages, slots, members, menuPriceById);
  const priById = new Map(priorities.map((x) => [x.id, x.priority]));
  const ordered = [...matcher].sort((a, b) => {
    const pa = priById.get(a.id) ?? 0;
    const pb = priById.get(b.id) ?? 0;
    if (pb !== pa) return pb - pa;
    return a.name.localeCompare(b.name, "id");
  });
  return ordered.map((p) => p.name).join(" → ");
}
