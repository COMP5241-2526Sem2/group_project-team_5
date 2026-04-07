BEGIN;

-- Question bank: add layered cleaning columns (raw fields remain unchanged).
ALTER TABLE question_bank_items
    ADD COLUMN IF NOT EXISTS normalized_prompt TEXT,
    ADD COLUMN IF NOT EXISTS normalized_answer_text TEXT,
    ADD COLUMN IF NOT EXISTS normalized_explanation TEXT,
    ADD COLUMN IF NOT EXISTS normalized_chapter TEXT,
    ADD COLUMN IF NOT EXISTS normalized_difficulty TEXT,
    ADD COLUMN IF NOT EXISTS clean_confidence NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS clean_version TEXT,
    ADD COLUMN IF NOT EXISTS cleaned_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS rule_cleaned_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS rule_hash TEXT;

-- Paper questions: same layered cleaning columns.
ALTER TABLE paper_questions
    ADD COLUMN IF NOT EXISTS normalized_prompt TEXT,
    ADD COLUMN IF NOT EXISTS normalized_answer_text TEXT,
    ADD COLUMN IF NOT EXISTS normalized_explanation TEXT,
    ADD COLUMN IF NOT EXISTS normalized_chapter TEXT,
    ADD COLUMN IF NOT EXISTS normalized_difficulty TEXT,
    ADD COLUMN IF NOT EXISTS clean_confidence NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS clean_version TEXT,
    ADD COLUMN IF NOT EXISTS cleaned_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS rule_cleaned_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS rule_hash TEXT;

-- Confidence range guard.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_qbi_clean_confidence_range'
    ) THEN
        ALTER TABLE question_bank_items
            ADD CONSTRAINT ck_qbi_clean_confidence_range
            CHECK (clean_confidence IS NULL OR (clean_confidence >= 0 AND clean_confidence <= 1));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_pq_clean_confidence_range'
    ) THEN
        ALTER TABLE paper_questions
            ADD CONSTRAINT ck_pq_clean_confidence_range
            CHECK (clean_confidence IS NULL OR (clean_confidence >= 0 AND clean_confidence <= 1));
    END IF;
END $$;

-- Keep normalized difficulty in a known domain when present.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_qbi_normalized_difficulty_domain'
    ) THEN
        ALTER TABLE question_bank_items
            ADD CONSTRAINT ck_qbi_normalized_difficulty_domain
            CHECK (
                normalized_difficulty IS NULL
                OR normalized_difficulty IN ('easy', 'medium', 'hard')
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_pq_normalized_difficulty_domain'
    ) THEN
        ALTER TABLE paper_questions
            ADD CONSTRAINT ck_pq_normalized_difficulty_domain
            CHECK (
                normalized_difficulty IS NULL
                OR normalized_difficulty IN ('easy', 'medium', 'hard')
            );
    END IF;
END $$;

-- Performance indexes for sync and dedupe jobs.
CREATE INDEX IF NOT EXISTS ix_qbi_cleaned_at ON question_bank_items (cleaned_at);
CREATE INDEX IF NOT EXISTS ix_qbi_rule_hash ON question_bank_items (rule_hash);
CREATE INDEX IF NOT EXISTS ix_qbi_clean_version ON question_bank_items (clean_version);

CREATE INDEX IF NOT EXISTS ix_pq_cleaned_at ON paper_questions (cleaned_at);
CREATE INDEX IF NOT EXISTS ix_pq_rule_hash ON paper_questions (rule_hash);
CREATE INDEX IF NOT EXISTS ix_pq_clean_version ON paper_questions (clean_version);

COMMIT;
