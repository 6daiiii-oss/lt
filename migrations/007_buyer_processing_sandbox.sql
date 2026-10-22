-- Sandbox processing surcharges are paid by the buyer, not credited to sellers.
-- Record any simulated reimbursement separately so settlement net is unaffected.
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_kind_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_kind_check CHECK(kind IN ('products','shipping','commission','refund','adjustment','processing_refund'));
