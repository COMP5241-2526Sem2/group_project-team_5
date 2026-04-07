# Data Cleaning Pipeline (A + B + C, no manual review)

This pipeline is designed for Supabase/Postgres and keeps raw data unchanged.

## Files and order

1. `20260407_add_cleaning_columns.sql`
2. `20260407_rule_cleaning.sql`
3. `20260407_clean_views.sql`
4. `20260407_ai_cleaning_output_schema.json` (used by app-side validator)
5. `../ai_clean_questions.py` (B-layer batch script)

## What each step does

- Step 1 adds layered cleaning columns (`normalized_*`, confidence/version/timestamps/hash).
- Step 2 performs deterministic rule cleaning and writes to `normalized_*` with `clean_version='rule_v1'`.
- Step 3 creates query-ready clean views and duplicate-candidate views.
- Step 4 defines strict AI output schema for semantic cleaning stage.
- Step 5 calls LLM, validates output against schema, and updates `normalized_*`.

## Runtime behavior

- Keep original columns untouched (`prompt`, `answer_text`, `explanation`, `chapter`, `difficulty`).
- Downstream consumers should read:
  - `v_question_bank_items_clean`
  - `v_paper_questions_clean`

## AI update contract (B-layer)

When AI output passes JSON-schema validation, update:

- `normalized_prompt`
- `normalized_answer_text`
- `normalized_explanation`
- `normalized_chapter`
- `normalized_difficulty`
- `clean_confidence`
- `clean_version`
- `cleaned_at = now()`

Do not update raw columns in AI stage.

## Run B-layer script

From `backend/`:

```bash
PYTHONPATH=. python3 scripts/ai_clean_questions.py --table both --batch-size 50 --min-confidence 0.85 --clean-version ai_clean_v1
```

Dry run first:

```bash
PYTHONPATH=. python3 scripts/ai_clean_questions.py --table both --batch-size 20 --max-rows 40 --dry-run
```

## Suggested rollback

- Fast rollback for read path: switch consumers back to raw table columns.
- If needed, clear semantic output only:

```sql
UPDATE question_bank_items
SET normalized_prompt = NULL,
    normalized_answer_text = NULL,
    normalized_explanation = NULL,
    normalized_chapter = NULL,
    normalized_difficulty = NULL,
    clean_confidence = NULL,
    clean_version = NULL,
    cleaned_at = NULL;

UPDATE paper_questions
SET normalized_prompt = NULL,
    normalized_answer_text = NULL,
    normalized_explanation = NULL,
    normalized_chapter = NULL,
    normalized_difficulty = NULL,
    clean_confidence = NULL,
    clean_version = NULL,
    cleaned_at = NULL;
```
