BEGIN;

CREATE TABLE IF NOT EXISTS company (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  legal_name TEXT NOT NULL DEFAULT 'Corrente da Vida Treinamentos',
  trade_name TEXT NOT NULL DEFAULT 'CVT',
  cnpj VARCHAR(14) NOT NULL DEFAULT '06987134000124',
  daily_minutes INTEGER NOT NULL DEFAULT 480 CHECK (daily_minutes > 0 AND daily_minutes <= 1440),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO company (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  login VARCHAR(40) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  cpf VARCHAR(11) NOT NULL UNIQUE,
  admission_date DATE NOT NULL,
  status VARCHAR(10) NOT NULL CHECK (status IN ('ATIVO','INATIVO')),
  login VARCHAR(40) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS punches (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  work_date DATE NOT NULL,
  punch_time TIME NOT NULL,
  punch_type VARCHAR(20) NOT NULL CHECK (punch_type IN ('ENTRADA','INTERVALO_INICIO','INTERVALO_FIM','SAIDA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, work_date, punch_type)
);
CREATE INDEX IF NOT EXISTS idx_punches_employee_date ON punches(employee_id, work_date);

CREATE TABLE IF NOT EXISTS holidays (
  id BIGSERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  description VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  role VARCHAR(10) NOT NULL CHECK (role IN ('admin','employee')),
  user_id BIGINT NOT NULL,
  csrf_token VARCHAR(96) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key CHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_role VARCHAR(20) NOT NULL,
  actor_id BIGINT,
  action VARCHAR(60) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

COMMIT;
