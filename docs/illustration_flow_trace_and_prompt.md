# Illustration Flow Trace and Prompt Diagnostics

## Scope
This document traces what the frontend sends to backend for upload-based question generation + illustration, what prompt constraints are sent to LLM, and why quality/option issues can happen.

## 1) Frontend -> Backend payloads

### A. Extract text from uploaded file
Endpoint:
- POST /quiz-generation/extract-text

Headers:
- X-User-Id: <teacher id>

Body:
- multipart/form-data
- file: <uploaded binary>

Client code:
- frontend/src/utils/sourceExtractionApi.ts
- frontend/src/pages/teacher/assessment/AssessmentGenerate.tsx

### B. Generate preview questions
Endpoint:
- POST /quiz-generation/preview

Headers:
- X-User-Id: <teacher id>
- Content-Type: application/json

Body shape:
```json
{
  "source_text": "...extracted text...",
  "subject": "Biology",
  "grade": "Grade 7",
  "difficulty": "easy|medium|hard",
  "question_count": 10,
  "type_targets": {
    "MCQ": 5,
    "True/False": 2,
    "Fill-blank": 2,
    "Short Answer": 1
  }
}
```

Client code:
- frontend/src/utils/aiQuestionGenApi.ts
- frontend/src/pages/teacher/assessment/AssessmentGenerate.tsx

### C. Generate illustrations
Endpoint:
- POST /quiz-generation/illustrations

Headers:
- X-User-Id: <teacher id>
- Content-Type: application/json

Body shape:
```json
{
  "style": "diagram",
  "style_prompt": "optional user style note",
  "questions": [
    {
      "question_id": "gq-1",
      "prompt": "question prompt",
      "question_type": "MCQ"
    }
  ]
}
```

Important:
- `style` is a single enum value per request, not a combined string.
- Valid values are: `auto`, `diagram`, `chart`, `photo`, `scientific`.
- The notation `a|b|c` in docs means "one of", not "send all".

Response note:
- Each returned image item may include:
  - `used_fallback`: true when backend had to use placeholder SVG due provider failure.
  - `error`: provider/timeout error summary for that specific question.

Client code:
- frontend/src/pages/teacher/assessment/AssessmentGenerate.tsx (buildIllustrationPayload)
- frontend/src/utils/aiQuestionGenApi.ts

## 2) Prompt constraints sent to LLM

### A. Question generation prompt constraints
Backend code:
- backend/app/services/quiz/ai_question_gen_service.py

System constraints include:
- Return JSON only.
- Include fields: type, prompt, options, answer, difficulty, explanation.
- For MCQ: exactly 4 options A-D and exactly one correct answer.

User constraints include:
- No phrases like "according to source/provided material/uploaded document".
- Keep question standalone.
- Reflect concrete concepts from source text.
- Inject subject/grade/difficulty/question_count/type_targets/source_text.

### B. Illustration prompt constraints (new tightened version)
Backend code:
- backend/app/services/quiz/quiz_illustration_service.py
- method: _build_openai_prompt(...)

Current constraints:
- Minimalist educational illustration.
- Plain background, 1-3 core elements only.
- Remove unrelated props/decorations.
- No readable text, letters, numbers, symbols, equations, options, or question sentences.
- For graph concepts: essential axes/curve only, no labels.
- Apply selected visual style + optional user style note.

## 3) Direct model input text (actual built prompt)

Example output of backend prompt builder:

```text
Create one minimalist educational illustration directly tied to the concept below. Question type: MCQ. Concept focus: When plotting resistance R against temperature T, determine axis meaning and trend.. Hard constraints: use plain background and only 1-3 core visual elements; remove unrelated props or decorative objects; no stickers, weather icons, desks, books, tools, or scene dressing unless absolutely required by the concept. Do not include any readable text, letters, numbers, symbols, equations, options, or question sentences in the image. For graph concepts, draw only the essential axes/curve relationship without labels. Visual style: flat vector diagram with simple geometry and clear structure. Additional style note: clean minimalist classroom diagram
```

## 4) Why MCQ options could appear to disappear

Root causes that can happen:
1. LLM returns non-standard option format (for example string list, keyed dict, mixed fields), causing weak parsing.
2. LLM returns MCQ without valid options.
3. Frontend receives MCQ with empty options and cannot render the choices block.

Fixes now added:
- Backend parser now accepts more option formats (dict/list/string patterns).
- Backend normalizes MCQ options to 4 options A-D.
- Backend sets one correct option deterministically when needed.
- Frontend rendering now checks `options.length > 0` explicitly.

## 5) Runtime trace sample (current environment)

Observed with real requests:
- PREVIEW_MODE: llm
- PREVIEW_WARNING: None
- FIRST_MCQ_OPTIONS: 4
- ILLUSTRATION_URL_PREFIX: https://rhduntmwejnblgyvprsm.supabase.co/storage/v1/object/public/question-illus...

This means:
- The preview request reached LLM path.
- MCQ options were preserved in response.
- Illustration endpoint returned a real image URL.

## 6) Fast debugging checklist

1. Check preview response fields `generation_mode` and `warning`.
2. Check first MCQ has exactly 4 options in preview response.
3. Check illustration response `images[].image_url` is URL (not data:image/svg+xml base64 fallback).
3.1. Check `images[].used_fallback` and `images[].error` for per-question failure reasons.
4. If style still noisy, inspect `_build_openai_prompt` output and adjust `style_prompt` from UI.

## 7) Why all images can fail with HTTP 504 when selecting all questions

Symptom:
- If illustration is enabled for all questions, the first batch request may return HTTP 504.
- Clicking regenerate on one question works.

Most likely cause:
- A single request for many images runs too long and hits gateway/proxy timeout.
- Single-question regenerate is much shorter, so it succeeds.

Implemented mitigation in code:
- Frontend now sends illustration requests in small batches (default 3 questions per request) instead of one large request.
- Backend now has per-image timeout protection (`illustration_request_timeout_sec`) to avoid one slow image blocking the whole request.

Changed code:
- frontend/src/pages/teacher/assessment/AssessmentGenerate.tsx
  - Added batched illustration generation flow.
- backend/app/config.py
  - Added `illustration_request_timeout_sec`.
- backend/app/services/quiz/quiz_illustration_service.py
  - Added client timeout and per-image `asyncio.wait_for(...)` guard.

Operational tuning suggestions:
1. If 504 still appears, reduce frontend batch size from 3 to 2.
2. Lower `ILLUSTRATION_CONCURRENCY` if upstream provider is unstable.
3. Increase gateway timeout if your deployment layer allows it.
