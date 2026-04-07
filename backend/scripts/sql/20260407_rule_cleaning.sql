BEGIN;

-- Canonicalize text for deterministic cleaning:
-- - trim
-- - collapse repeated whitespace
-- - map placeholder-like values to NULL
CREATE OR REPLACE FUNCTION canonicalize_text(v TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN v IS NULL THEN NULL
        WHEN btrim(v) = '' THEN NULL
        WHEN lower(btrim(v)) IN ('n/a', 'na', 'null', 'none', 'unknown', '-') THEN NULL
        ELSE regexp_replace(btrim(v), '\s+', ' ', 'g')
    END
$$;

CREATE OR REPLACE FUNCTION canonicalize_difficulty(v TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN v IS NULL THEN NULL
        WHEN lower(btrim(v)) IN ('easy', 'e', '简单', '低', 'low') THEN 'easy'
        WHEN lower(btrim(v)) IN ('medium', 'mid', 'm', '一般', '中', 'normal') THEN 'medium'
        WHEN lower(btrim(v)) IN ('hard', 'h', '困难', '高', 'high') THEN 'hard'
        ELSE NULL
    END
$$;

-- A-layer deterministic cleaning for question_bank_items.
UPDATE question_bank_items
SET
    normalized_prompt = canonicalize_text(prompt),
    normalized_answer_text = canonicalize_text(answer_text),
    normalized_explanation = canonicalize_text(explanation),
    normalized_chapter = canonicalize_text(chapter),
    normalized_difficulty = canonicalize_difficulty(difficulty),
    clean_version = 'rule_v1',
    clean_confidence = 1.0000,
    rule_cleaned_at = CURRENT_TIMESTAMP,
    cleaned_at = CURRENT_TIMESTAMP,
    rule_hash = md5(
        coalesce(canonicalize_text(prompt), '') || '|' ||
        coalesce(canonicalize_text(answer_text), '') || '|' ||
        coalesce(canonicalize_text(explanation), '') || '|' ||
        coalesce(canonicalize_text(chapter), '') || '|' ||
        coalesce(canonicalize_difficulty(difficulty), '')
    )
WHERE
    normalized_prompt IS DISTINCT FROM canonicalize_text(prompt)
    OR normalized_answer_text IS DISTINCT FROM canonicalize_text(answer_text)
    OR normalized_explanation IS DISTINCT FROM canonicalize_text(explanation)
    OR normalized_chapter IS DISTINCT FROM canonicalize_text(chapter)
    OR normalized_difficulty IS DISTINCT FROM canonicalize_difficulty(difficulty)
    OR clean_version IS DISTINCT FROM 'rule_v1'
    OR clean_confidence IS DISTINCT FROM 1.0000;

-- A-layer deterministic cleaning for paper_questions.
UPDATE paper_questions
SET
    normalized_prompt = canonicalize_text(prompt),
    normalized_answer_text = canonicalize_text(answer_text),
    normalized_explanation = canonicalize_text(explanation),
    normalized_chapter = canonicalize_text(chapter),
    normalized_difficulty = canonicalize_difficulty(difficulty),
    clean_version = 'rule_v1',
    clean_confidence = 1.0000,
    rule_cleaned_at = CURRENT_TIMESTAMP,
    cleaned_at = CURRENT_TIMESTAMP,
    rule_hash = md5(
        coalesce(canonicalize_text(prompt), '') || '|' ||
        coalesce(canonicalize_text(answer_text), '') || '|' ||
        coalesce(canonicalize_text(explanation), '') || '|' ||
        coalesce(canonicalize_text(chapter), '') || '|' ||
        coalesce(canonicalize_difficulty(difficulty), '')
    )
WHERE
    normalized_prompt IS DISTINCT FROM canonicalize_text(prompt)
    OR normalized_answer_text IS DISTINCT FROM canonicalize_text(answer_text)
    OR normalized_explanation IS DISTINCT FROM canonicalize_text(explanation)
    OR normalized_chapter IS DISTINCT FROM canonicalize_text(chapter)
    OR normalized_difficulty IS DISTINCT FROM canonicalize_difficulty(difficulty)
    OR clean_version IS DISTINCT FROM 'rule_v1'
    OR clean_confidence IS DISTINCT FROM 1.0000;

COMMIT;
