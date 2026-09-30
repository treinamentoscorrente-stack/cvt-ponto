CREATE TABLE IF NOT EXISTS extra_work_requests (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  description VARCHAR(160) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE','APROVADO','REJEITADO')),
  reviewed_by BIGINT REFERENCES admins(id) ON DELETE RESTRICT,
  review_note VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  CHECK (ended_at > started_at),
  CHECK (ended_at - started_at <= INTERVAL '24 hours')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_extra_work_request_pending_exact
  ON extra_work_requests(employee_id,started_at,ended_at)
  WHERE status='PENDENTE';
CREATE INDEX IF NOT EXISTS idx_extra_work_requests_status_created
  ON extra_work_requests(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extra_work_requests_employee_started
  ON extra_work_requests(employee_id,started_at DESC);