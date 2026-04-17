/**
 * New Order cart draft (localStorage). Cleared when checkout completes (confirmation)
 * or when the operator taps Clear.
 */

export const NEW_ORDER_DRAFT_KEY = "wrapz_new_order_draft_v1";

export type DiscountMode = "none" | "preset" | "manual_percent" | "manual_fixed";

export type PendingCheckout = { orderId: string; queueNumber: number };

export type NewOrderDraftV1 = {
  v: 1;
  cartQty: Record<string, number>;
  customerName: string;
  orderNotes: string;
  discountMode: DiscountMode;
  presetId: string;
  manualPercent: string;
  manualFixed: string;
  bestComboApplied: boolean;
  /** Set after an order row is created; cart fields are cleared but checkout can be resumed. */
  pendingCheckout?: PendingCheckout | null;
};

export function clearNewOrderDraftCompletely(): void {
  try {
    localStorage.removeItem(NEW_ORDER_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function readNewOrderDraftRaw(): string | null {
  try {
    return localStorage.getItem(NEW_ORDER_DRAFT_KEY);
  } catch {
    return null;
  }
}

export function writeNewOrderDraft(draft: NewOrderDraftV1): void {
  try {
    localStorage.setItem(NEW_ORDER_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}
