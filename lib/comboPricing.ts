/**
 * Pure combo / package pricing engine (no I/O).
 * Greedy largest-priority-first; each cart unit consumed at most once.
 */

export type ComboCartLine = {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  is_bundle: boolean;
};

export type ComboPackageSlotDef = {
  groupId: string;
  quantity: number;
  sortOrder: number;
};

export type ComboPackageDef = {
  id: string;
  name: string;
  packagePrice: number;
  priority: number;
  isActive: boolean;
  isConfigured: boolean;
  slots: ComboPackageSlotDef[];
};

export type GroupMembersMap = Record<string, string[]>;

export type ComboAllocation = {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
};

export type ComboApplication = {
  packageId: string;
  packageName: string;
  packagePrice: number;
  listValue: number;
  savings: number;
  allocations: ComboAllocation[];
};

export type ComboSnapshotEntry = {
  package_id: string;
  package_name: string;
  count: number;
  list_value: number;
  package_value: number;
  savings: number;
  allocations: Array<{
    menu_item_id: string;
    menu_item_name: string;
    quantity: number;
    unit_price: number;
  }>;
};

export type ComboPricingResult = {
  applications: ComboApplication[];
  comboSavingsAmount: number;
  snapshot: ComboSnapshotEntry[];
};

function sortSlots(slots: ComboPackageSlotDef[]): ComboPackageSlotDef[] {
  return [...slots].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.groupId.localeCompare(b.groupId);
  });
}

function sortPackages(packages: ComboPackageDef[]): ComboPackageDef[] {
  return [...packages].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
}

/** Build mutable pool: itemId -> qty for non-bundle lines only. */
export function eligibleComboPool(lines: ComboCartLine[]): Map<string, { qty: number; name: string; unitPrice: number }> {
  const pool = new Map<string, { qty: number; name: string; unitPrice: number }>();
  for (const l of lines) {
    if (l.is_bundle) continue;
    if (l.quantity <= 0) continue;
    const prev = pool.get(l.itemId);
    if (prev) {
      prev.qty += l.quantity;
    } else {
      pool.set(l.itemId, { qty: l.quantity, name: l.itemName, unitPrice: l.unitPrice });
    }
  }
  return pool;
}

function groupAvailable(pool: Map<string, { qty: number; name: string; unitPrice: number }>, members: string[]): number {
  let sum = 0;
  for (const id of members) {
    sum += pool.get(id)?.qty ?? 0;
  }
  return sum;
}

/**
 * Try to consume one package instance from pool. Mutates pool on success.
 * Returns null if slots cannot be satisfied, or if list value would not exceed package price (no saving).
 */
function tryConsumeOnePackage(
  pkg: ComboPackageDef,
  pool: Map<string, { qty: number; name: string; unitPrice: number }>,
  membersByGroup: GroupMembersMap
): ComboApplication | null {
  const slots = sortSlots(pkg.slots);
  if (slots.length === 0) return null;

  for (const s of slots) {
    const members = membersByGroup[s.groupId];
    if (!members || members.length === 0) return null;
    if (groupAvailable(pool, members) < s.quantity) return null;
  }

  const allocations: ComboAllocation[] = [];
  let listValue = 0;

  for (const s of slots) {
    const members = [...(membersByGroup[s.groupId] ?? [])].sort((a, b) => a.localeCompare(b));
    let need = s.quantity;
    for (const itemId of members) {
      if (need <= 0) break;
      const cell = pool.get(itemId);
      if (!cell || cell.qty <= 0) continue;
      const take = Math.min(cell.qty, need);
      if (take <= 0) continue;
      cell.qty -= take;
      need -= take;
      listValue += take * cell.unitPrice;
      const existing = allocations.find((a) => a.menuItemId === itemId);
      if (existing) {
        existing.quantity += take;
      } else {
        allocations.push({
          menuItemId: itemId,
          menuItemName: cell.name,
          quantity: take,
          unitPrice: cell.unitPrice,
        });
      }
    }
    if (need > 0) return null;
  }

  if (listValue <= pkg.packagePrice) {
    return null;
  }

  const savings = listValue - pkg.packagePrice;
  return {
    packageId: pkg.id,
    packageName: pkg.name,
    packagePrice: pkg.packagePrice,
    listValue,
    savings,
    allocations,
  };
}

export function computeComboPricing(
  lines: ComboCartLine[],
  packages: ComboPackageDef[],
  membersByGroup: GroupMembersMap
): ComboPricingResult {
  const active = sortPackages(
    packages.filter((p) => p.isActive && p.isConfigured && p.slots.length > 0)
  );

  const pool = eligibleComboPool(lines);
  const applications: ComboApplication[] = [];

  for (const pkg of active) {
    for (;;) {
      const copy = new Map<string, { qty: number; name: string; unitPrice: number }>();
      for (const [id, v] of pool) {
        copy.set(id, { qty: v.qty, name: v.name, unitPrice: v.unitPrice });
      }
      const one = tryConsumeOnePackage(pkg, copy, membersByGroup);
      if (!one) break;
      for (const [id, v] of copy) {
        pool.set(id, v);
      }
      applications.push(one);
    }
  }

  const comboSavingsAmount = Math.max(
    0,
    Math.round(applications.reduce((s, a) => s + a.savings, 0))
  );

  const byPackage = new Map<string, ComboApplication[]>();
  for (const a of applications) {
    const arr = byPackage.get(a.packageId) ?? [];
    arr.push(a);
    byPackage.set(a.packageId, arr);
  }

  const snapshot: ComboSnapshotEntry[] = [];
  for (const [packageId, apps] of byPackage) {
    const first = apps[0];
    const count = apps.length;
    const list_value = Math.round(apps.reduce((s, x) => s + x.listValue, 0));
    const package_value = Math.round(first.packagePrice * count);
    const savings = Math.max(0, Math.round(apps.reduce((s, x) => s + x.savings, 0)));
    const allocMap = new Map<string, { name: string; qty: number; price: number }>();
    for (const app of apps) {
      for (const al of app.allocations) {
        const prev = allocMap.get(al.menuItemId);
        if (prev) prev.qty += al.quantity;
        else
          allocMap.set(al.menuItemId, {
            name: al.menuItemName,
            qty: al.quantity,
            price: al.unitPrice,
          });
      }
    }
    snapshot.push({
      package_id: packageId,
      package_name: first.packageName,
      count,
      list_value,
      package_value,
      savings,
      allocations: [...allocMap.entries()].map(([menu_item_id, v]) => ({
        menu_item_id,
        menu_item_name: v.name,
        quantity: v.qty,
        unit_price: v.price,
      })),
    });
  }

  snapshot.sort((a, b) => a.package_name.localeCompare(b.package_name));

  return { applications, comboSavingsAmount, snapshot };
}
