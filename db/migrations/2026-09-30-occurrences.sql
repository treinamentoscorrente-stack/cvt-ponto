CREATE TABLE IF NOT EXISTS attendance_occurrences (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  work_date DATE NOT NULL,
  occurrence_type VARCHAR(12) NOT NULL CHECK (occurrence_type IN ('FALTA','FOLGA','ATESTADO')),
  period VARCHAR(10) NOT NULL DEFAULT 'DIA_TODO' CHECK (period IN ('DIA_TODO','MANHA','TARDE')),
  note VARCHAR(240),
  created_by BIGINT NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, work_date),
  CHECK (occurrence_type = 'FOLGA' OR period = 'DIA_TODO')
);
CREATE INDEX IF NOT EXISTS idx_occurrences_employee_date ON attendance_occurrences(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_occurrences_date ON attendance_occurrences(work_date);
