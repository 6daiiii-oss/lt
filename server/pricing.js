import { commission, requireThat } from './lib.js';
export const MARKUP_BPS = 1000;
export function priceForBuyer(supplierCents) {
  requireThat(Number.isSafeInteger(supplierCents) && supplierCents > 0 && supplierCents <= 100_000_000,'Precio de marca inválido.',422);
  return supplierCents + commission(supplierCents, MARKUP_BPS);
}
// Never serialize internal pricing to a buyer, including snapshots of old orders.
export function buyerOrder(order) {
  const {commission_cents,commission_bps,policy_snapshot,...publicOrder}=order;
  if(policy_snapshot) {
    const {commission,pricing,...policies}=policy_snapshot;
    publicOrder.policy_snapshot=policies;
  }
  return publicOrder;
}
