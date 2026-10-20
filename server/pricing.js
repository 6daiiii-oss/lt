import { requireThat } from './lib.js';
export { feeBreakdown } from '../public/modules/fees.js';
// The supplier enters the final product price including IGV. No buyer markup.
export function priceForBuyer(supplierCents) {
  requireThat(Number.isSafeInteger(supplierCents) && supplierCents > 0 && supplierCents <= 100_000_000,'Precio de marca inválido.',422);
  return supplierCents;
}
export function buyerOrder(order) {
  const {commission_cents,commission_bps,policy_snapshot,...publicOrder}=order;
  if(policy_snapshot) {
    const {commission,pricing,fees,...policies}=policy_snapshot;
    publicOrder.policy_snapshot=policies;
  }
  return publicOrder;
}
