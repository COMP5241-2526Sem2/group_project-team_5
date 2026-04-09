# AI Question Gen Illustration Trace Guide

## 1) Is this using an LLM image model now?

Yes, the current path is:

1. Frontend calls `POST /api/v1/quiz-generation/illustrations`.
2. Backend uses `QuizIllustrationService`.
3. Service directly builds one constrained image prompt from question content + style settings.
4. Service calls image generation (`client.images.generate`) with that prompt.
5. If image generation fails, it falls back to a deterministic SVG data URL and sets `used_fallback=true`.

## 2) Exactly what frontend sends

Frontend payload builder is in:
- `frontend/src/pages/teacher/assessment/AssessmentGenerate.tsx` (`buildIllustrationPayload`)

Shape:

```json
{
  "style": "auto|diagram|chart|photo|scientific",
  "style_prompt": "optional free text from Style Description",
  "questions": [
    {
      "question_id": "gq-1",
      "prompt": "question prompt text",
      "question_type": "MCQ|True/False|Fill-blank|Short Answer|Essay"
    }
  ]
}
```

API client method:
- `frontend/src/utils/aiQuestionGenApi.ts` -> `generateQuestionIllustrationsApi(...)`

## 3) Backend prompt constraints

In `backend/app/services/quiz/quiz_illustration_service.py`, method `_build_openai_prompt(...)`, constraints include:

- Style-specific guide (diagram/chart/photo/scientific/auto)
- Keep image concept-focused, with minimal irrelevant objects
- **No readable text/letters/numbers/formulas/options/question sentences**
- Use optional user `style_prompt` as additional guidance

## 4) Where to read raw LLM content for tracing

Enable in `backend/.env`:

```env
DUMP_LLM_RAW_SESSIONS=true
```

Then restart backend. Trace files are dumped to:

- `backend/data/llm_illustration_traces/`

Each file contains JSON with fields such as:

- `raw_prompt`
- `image_prompt`
- `attempt`
- `used_provider`
- `image_len`
- or fallback error reason

## 5) Quick manual test

```bash
curl -X POST "http://localhost:8000/api/v1/quiz-generation/illustrations" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" \
  -d '{
    "style": "scientific",
    "style_prompt": "clean anatomy style",
    "questions": [
      {
        "question_id": "q-demo-1",
        "prompt": "Which events help food enter the oesophagus during swallowing?",
        "question_type": "MCQ"
      }
    ]
  }'
```

Check response fields:

- `images[].image_url`
- `images[].used_fallback`
- `images[].error`

If `used_fallback=true`, investigate trace files and image-model support on your current base URL/model.

## 6) Most common quality drop reasons

1. Image model call fails and service falls back to SVG.
2. `ILLUSTRATION_MODEL` not supported by current provider gateway.
3. Provider/base URL supports chat but not images API.
4. `style_prompt` too vague, causing generic results.
5. Upstream timeout or retry exhaustion.
