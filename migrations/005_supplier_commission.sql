-- Do not rewrite historical order snapshots, reservations or ledger entries.
-- Invalidate pending quotes naturally: checkout/webhook revalidates current price.
UPDATE products SET wholesale_cents=supplier_cents,updated_at=now()
 WHERE wholesale_cents<>supplier_cents;
CREATE INDEX orders_repeat_relationship ON orders(buyer_id,brand_id,state);
