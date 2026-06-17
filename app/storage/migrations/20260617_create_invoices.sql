-- WC-06: invoice create/issue mechanism.
-- Issuance-only lifecycle: draft → issued → void. `issued` does NOT require any
-- paid/charged state — this is a well-formed DB record, not a collection event.
--
-- ZATCA / Fatoorah e-invoicing is OUT OF SCOPE (Register B / SP-02): no
-- cryptographic stamp, QR, clearance, or e-invoice submission here.
--
-- vat_rate / vat_amount are STRUCTURAL fields. The authoritative rate is
-- config (Register B); the application default is a config-overridable
-- placeholder, not a ratified tax decision.

CREATE TABLE IF NOT EXISTS invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT NOT NULL,
  invoice_number TEXT UNIQUE,                              -- nullable until issued
  currency       TEXT NOT NULL DEFAULT 'SAR',
  subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate       NUMERIC(5,4)  NOT NULL DEFAULT 0,
  vat_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','void')),
  created_by     UUID,
  issued_by      UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty         NUMERIC(14,2) NOT NULL,
  unit_amount NUMERIC(14,2) NOT NULL,
  line_total  NUMERIC(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant            ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);

-- MUTABLE grants (NOT append-only): the draft → issued transition requires UPDATE.
-- No DELETE grant. Guarded so it no-ops if the prowork_app role is absent.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'prowork_app') THEN
    GRANT INSERT, SELECT, UPDATE ON invoices            TO prowork_app;
    GRANT INSERT, SELECT, UPDATE ON invoice_line_items  TO prowork_app;
  END IF;
END $$;
