CREATE TABLE IF NOT EXISTS extra_work_sessions (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  description VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_extra_work_open_employee
  ON extra_work_sessions(employee_id)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_extra_work_employee_started
  ON extra_work_sessions(employee_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_extra_work_started
  ON extra_work_sessions(started_at DESC);