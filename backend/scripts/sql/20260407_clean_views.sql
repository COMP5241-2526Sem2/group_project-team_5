BEGIN;

-- Query-facing clean view for question bank items.
CREATE OR REPLACE VIEW v_question_bank_items_clean AS
SELECT
    qbi.id,
    qbi.publisher,
    qbi.grade,
    qbi.subject,
    qbi.semester,
    qbi.question_type,
    COALESCE(qbi.normalized_prompt, qbi.prompt) AS prompt_clean,
    COALESCE(qbi.normalized_answer_text, qbi.answer_text) AS answer_text_clean,
    COALESCE(qbi.normalized_explanation, qbi.explanation) AS explanation_clean,
    COALESCE(qbi.normalized_chapter, qbi.chapter) AS chapter_clean,
    COALESCE(qbi.normalized_difficulty, qbi.difficulty) AS difficulty_clean,
    qbi.prompt AS prompt_raw,
    qbi.answer_text AS answer_text_raw,
    qbi.explanation AS explanation_raw,
    qbi.chapter AS chapter_raw,
    qbi.difficulty AS difficulty_raw,
    qbi.clean_confidence,
    qbi.clean_version,
    qbi.cleaned_at,
    qbi.rule_cleaned_at,
    qbi.rule_hash
FROM question_bank_items qbi;

-- Query-facing clean view for paper questions.
CREATE OR REPLACE VIEW v_paper_questions_clean AS
SELECT
    pq.id,
    pq.paper_id,
    pq.section_id,
    pq.order_num,
    pq.question_type,
    COALESCE(pq.normalized_prompt, pq.prompt) AS prompt_clean,
    COALESCE(pq.normalized_answer_text, pq.answer_text) AS answer_text_clean,
    COALESCE(pq.normalized_explanation, pq.explanation) AS explanation_clean,
    COALESCE(pq.normalized_chapter, pq.chapter) AS chapter_clean,
    COALESCE(pq.normalized_difficulty, pq.difficulty) AS difficulty_clean,
    pq.prompt AS prompt_raw,
    pq.answer_text AS answer_text_raw,
    pq.explanation AS explanation_raw,
    pq.chapter AS chapter_raw,
    pq.difficulty AS difficulty_raw,
    pq.clean_confidence,
    pq.clean_version,
    pq.cleaned_at,
    pq.rule_cleaned_at,
    pq.rule_hash
FROM paper_questions pq;

-- Duplicate candidate views (rule-hash level).
CREATE OR REPLACE VIEW v_question_bank_items_duplicate_candidates AS
SELECT
    rule_hash,
    COUNT(*) AS duplicate_count,
    ARRAY_AGG(id ORDER BY id) AS ids
FROM question_bank_items
WHERE rule_hash IS NOT NULL
GROUP BY rule_hash
HAVING COUNT(*) > 1;

CREATE OR REPLACE VIEW v_paper_questions_duplicate_candidates AS
SELECT
    rule_hash,
    COUNT(*) AS duplicate_count,
    ARRAY_AGG(id ORDER BY id) AS ids
FROM paper_questions
WHERE rule_hash IS NOT NULL
GROUP BY rule_hash
HAVING COUNT(*) > 1;

COMMIT;
