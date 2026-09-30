CREATE TABLE IF NOT EXISTS punch_adjustment_requests (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  work_date DATE NOT NULL,
  requested_entrada TIME,
  requested_intervalo_inicio TIME,
  requested_intervalo_fim TIME,
  requested_saida TIME,
  reason VARCHAR(240) NOT NULL,
  original_punches JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(10) NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE','APROVADO','REJEITADO')),
  reviewed_by BIGINT REFERENCES admins(id) ON DELETE RESTRICT,
  review_note VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_adjustment_request_pending
  ON punch_adjustment_requests(employee_id, work_date)
  WHERE status='PENDENTE';
CREATE INDEX IF NOT EXISTS idx_adjustment_requests_status_created
  ON punch_adjustment_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adjustment_requests_employee_created
  ON punch_adjustment_requests(employee_id, created_at DESC);