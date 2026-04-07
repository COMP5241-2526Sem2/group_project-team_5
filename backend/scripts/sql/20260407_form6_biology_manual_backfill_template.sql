-- Manual backfill template for Form Six · Biology (paper_id=3).
-- Fill TODO values, then run in one transaction.
-- Scope: bank_question_ids 61, 63, 68, 70 and mapped paper_questions 129, 131, 136, 138.

BEGIN;

-- 0) Safety check: verify current rows before updating.
SELECT id, question_type, answer_text
FROM question_bank_items
WHERE id IN (61, 63, 68, 70)
ORDER BY id;

SELECT id, order_num, question_type, answer_text
FROM paper_questions
WHERE id IN (129, 131, 136, 138)
ORDER BY id;

SELECT bank_question_id, option_key, option_text, is_correct
FROM question_bank_options
WHERE bank_question_id IN (61, 63, 68, 70)
ORDER BY bank_question_id, option_key;

-- 1) Example pattern:
-- For single-choice: question_type='MCQ_SINGLE', answer_text='B', exactly one is_correct=true.
-- For multiple-choice: question_type='MCQ_MULTI', answer_text='A,C', more than one is_correct=true.
-- If the source item is not objectively gradable, keep SHORT_ANSWER and skip option correctness update.

-- ====================================================================
-- ID 61 / paper_question 129
-- TODO: choose one of:
--   A) objective backfill
--      set question_type='MCQ_SINGLE' or 'MCQ_MULTI'
--      set answer_text='TODO'
--      set option correctness in question_bank_options
--   B) keep subjective
--      set question_type='SHORT_ANSWER', answer_text=NULL
-- ====================================================================

-- TODO (uncomment and fill):
-- UPDATE question_bank_items
-- SET question_type = 'MCQ_SINGLE',
--     answer_text = 'B'
-- WHERE id = 61;
--
-- UPDATE paper_questions
-- SET question_type = 'MCQ_SINGLE',
--     answer_text = 'B'
-- WHERE id = 129;
--
-- UPDATE question_bank_options
-- SET is_correct = CASE option_key
--   WHEN 'A' THEN FALSE
--   WHEN 'B' THEN TRUE
--   WHEN 'C' THEN FALSE
--   WHEN 'D' THEN FALSE
--   ELSE FALSE
-- END
-- WHERE bank_question_id = 61;

-- ====================================================================
-- ID 63 / paper_question 131
-- ====================================================================
-- TODO (uncomment and fill):
-- UPDATE question_bank_items
-- SET question_type = 'SHORT_ANSWER',
--     answer_text = NULL
-- WHERE id = 63;
--
-- UPDATE paper_questions
-- SET question_type = 'SHORT_ANSWER',
--     answer_text = NULL
-- WHERE id = 131;
--
-- UPDATE question_bank_options
-- SET is_correct = NULL
-- WHERE bank_question_id = 63;

-- ====================================================================
-- ID 68 / paper_question 136
-- ====================================================================
-- TODO (uncomment and fill):
-- UPDATE question_bank_items
-- SET question_type = 'SHORT_ANSWER',
--     answer_text = NULL
-- WHERE id = 68;
--
-- UPDATE paper_questions
-- SET question_type = 'SHORT_ANSWER',
--     answer_text = NULL
-- WHERE id = 136;
--
-- UPDATE question_bank_options
-- SET is_correct = NULL
-- WHERE bank_question_id = 68;

-- ====================================================================
-- ID 70 / paper_question 138
-- ====================================================================
-- TODO (uncomment and fill):
-- UPDATE question_bank_items
-- SET question_type = 'SHORT_ANSWER',
--     answer_text = NULL
-- WHERE id = 70;
--
-- UPDATE paper_questions
-- SET question_type = 'SHORT_ANSWER',
--     answer_text = NULL
-- WHERE id = 138;
--
-- UPDATE question_bank_options
-- SET is_correct = NULL
-- WHERE bank_question_id = 70;

-- 2) Post-checks (run before COMMIT).
SELECT id, question_type, answer_text
FROM question_bank_items
WHERE id IN (61, 63, 68, 70)
ORDER BY id;

SELECT bank_question_id,
       count(*) AS option_count,
       count(*) FILTER (WHERE is_correct IS TRUE) AS correct_count
FROM question_bank_options
WHERE bank_question_id IN (61, 63, 68, 70)
GROUP BY bank_question_id
ORDER BY bank_question_id;

-- 3) Commit if all expected; otherwise ROLLBACK manually.
-- COMMIT;
-- ROLLBACK;

