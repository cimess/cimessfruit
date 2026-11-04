export type BasketItem = { productId: string; optionId: string; quantity: number };
type Option = { id: string; productId: string; stock: number; price: number; label: string; product: { name: string; isAvailable: boolean } };
export type BasketReview = { eligible: boolean; issues: string[]; lines: { optionId: string; name: string; label: string; price: number | null; stock: number; issue: string | null }[]; itemSubtotal: number | null; deliveryFee: number | null; total: number | null };
export function reviewBasket(items: BasketItem[], options: Option[], zone: { isAvailable: boolean; deliveryFee: number } | null): BasketReview {
  const lines = items.map((item) => {
    const option = options.find((value) => value.id === item.optionId && value.productId === item.productId);
    const issue = !option ? "This product or size no longer exists." : !option.product.isAvailable ? "This fruit is currently unavailable."
      : !Number.isInteger(option.price) || option.price <= 0 ? "A valid price has not been set."
      : option.stock < item.quantity ? option.stock <= 0 ? "This size is sold out." : `Only ${option.stock} available. Reduce the quantity.` : null;
    return { optionId: item.optionId, name: option?.product.name ?? "Unavailable item", label: option?.label ?? "", price: option?.price ?? null, stock: option?.stock ?? 0, issue };
  });
  const issues: string[] = [];
  if (!items.length) issues.push("Your bag is empty.");
  if (!zone?.isAvailable) issues.push("Delivery to the selected zone is currently unavailable.");
  if (zone && (!Number.isInteger(zone.deliveryFee) || zone.deliveryFee < 0)) issues.push("The delivery fee is unavailable.");
  const validLines = lines.every((line) => !line.issue);
  const itemSubtotal = validLines ? lines.reduce((sum, line, index) => sum + line.price! * items[index].quantity, 0) : null;
  const total = itemSubtotal !== null && zone ? itemSubtotal + zone.deliveryFee : null;
  if (total !== null && (!Number.isSafeInteger(total) || total <= 0 || total > 2147483647)) issues.push("Order total is outside the supported range.");
  const eligible = validLines && issues.length === 0;
  return { eligible, issues, lines, itemSubtotal, deliveryFee: zone?.deliveryFee ?? null, total: eligible ? total : null };
}
