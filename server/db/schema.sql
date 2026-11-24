-- Safe to run more than once. Requires PostgreSQL 15+ (UNIQUE NULLS NOT DISTINCT).

CREATE TABLE IF NOT EXISTS teachers (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
  id         SERIAL PRIMARY KEY,
  teacher_id INT  NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,           -- e.g. '5B'
  grade      INT  NOT NULL CHECK (grade BETWEEN 1 AND 12),
  year       INT  NOT NULL
);
CREATE INDEX IF NOT EXISTS classes_teacher_id_idx ON classes(teacher_id);

CREATE TABLE IF NOT EXISTS learners (
  id           SERIAL PRIMARY KEY,
  class_id     INT  NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  first_name   TEXT NOT NULL,
  learner_code TEXT NOT NULL,         -- teacher's own reference, not an ID number
  UNIQUE (class_id, learner_code)
);

-- Surname initial, stored only when two learners in a class share a first
-- name (e.g. "Thandi M." and "Thandi D."), so the teacher can tell them apart.
ALTER TABLE learners ADD COLUMN IF NOT EXISTS initial TEXT CHECK (initial ~ '^[A-Z]$');

CREATE TABLE IF NOT EXISTS subjects (
  id       SERIAL PRIMARY KEY,
  class_id INT  NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  UNIQUE (class_id, name)
);

CREATE TABLE IF NOT EXISTS assessments (
  id         SERIAL PRIMARY KEY,
  subject_id INT  NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  term       INT  NOT NULL CHECK (term BETWEEN 1 AND 4),
  name       TEXT NOT NULL,           -- e.g. 'Term 2 test'
  max_mark   NUMERIC NOT NULL CHECK (max_mark > 0),
  weight     NUMERIC NOT NULL DEFAULT 1,
  UNIQUE (subject_id, term, name)     -- lets a re-import update instead of duplicate
);

CREATE TABLE IF NOT EXISTS marks (
  assessment_id INT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  learner_id    INT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  mark          NUMERIC NOT NULL CHECK (mark >= 0),
  PRIMARY KEY (assessment_id, learner_id)
);

CREATE TABLE IF NOT EXISTS style_examples (
  id         SERIAL PRIMARY KEY,
  teacher_id INT  NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  text       TEXT NOT NULL
);

DO $$ BEGIN
  CREATE TYPE comment_status AS ENUM ('draft', 'approved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS comments (
  id          SERIAL PRIMARY KEY,
  learner_id  INT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  subject_id  INT REFERENCES subjects(id) ON DELETE CASCADE,  -- NULL = general comment
  term        INT NOT NULL CHECK (term BETWEEN 1 AND 4),
  draft_text  TEXT,
  final_text  TEXT,
  status      comment_status NOT NULL DEFAULT 'draft',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  -- NULLS NOT DISTINCT: otherwise two general comments (subject_id NULL)
  -- for the same learner and term would both be allowed.
  UNIQUE NULLS NOT DISTINCT (learner_id, subject_id, term)
);

-- Weighted term average per learner per subject
CREATE OR REPLACE VIEW term_averages AS
SELECT m.learner_id, a.subject_id, a.term,
       ROUND(SUM(m.mark / a.max_mark * 100 * a.weight) / SUM(a.weight), 1) AS average
FROM marks m
JOIN assessments a ON a.id = m.assessment_id
GROUP BY m.learner_id, a.subject_id, a.term;
