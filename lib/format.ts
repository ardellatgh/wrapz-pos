export function formatRupiah(amount: number): string {
  const n = Math.round(amount);
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function formatDiscountValue(
  type: "percent" | "fixed",
  value: number
): string {
  if (type === "percent") return `${value}%`;
  return formatRupiah(value);
}
