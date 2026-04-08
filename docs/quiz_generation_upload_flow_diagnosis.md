# 上传档案生题功能：调用链与 Prompt 诊断

## 1. 结论先说

当前你看到的问题质量差，不是因为前端没有调用接口，而是因为后端调用 LLM 失败后，自动降级到了 heuristic 模板生成。

本次实测证据：

- `/api/v1/quiz-generation/preview` 返回 `generation_mode = "heuristic"`
- 同时返回 `warning = "LLM call failed (AuthenticationError); heuristic fallback was used."`
- 直接探测聊天模型接口返回 `401 Incorrect API key provided`

因此你现在看到的题目风格（如 `which statement best explains ...`）来自 fallback 模板，而不是 LLM 正常生成质量。

---

## 2. 前端到底给后端发了什么

### 2.1 上传文档后先做文本抽取

- 接口：`POST /quiz-generation/extract-text`
- Content-Type：`multipart/form-data`
- Body：`file=<上传文件二进制>`
- Header：包含 `X-User-Id`

代码位置：

- `frontend/src/utils/sourceExtractionApi.ts`
- `frontend/src/pages/teacher/assessment/AssessmentGenerate.tsx`

### 2.2 再调用题目预览生成

- 接口：`POST /quiz-generation/preview`
- Content-Type：`application/json`
- Header：包含 `X-User-Id`

前端实际 JSON 结构：

```json
{
  "source_text": "...抽取后的文本...",
  "subject": "Biology",
  "grade": "Grade 7",
  "difficulty": "medium",
  "question_count": 10,
  "type_targets": {
    "MCQ": 5,
    "True/False": 2,
    "Fill-blank": 2,
    "Short Answer": 1
  }
}
```

关键点：

- `source_text` 来自上传文件抽取结果；抽取失败时会退化为文件名字符串。
- `type_targets` 来自前端 Step 2 的题型配置。
- `X-User-Id` 由前端通用 API 客户端自动注入。

代码位置：

- `frontend/src/pages/teacher/assessment/AssessmentGenerate.tsx`
- `frontend/src/utils/aiQuestionGenApi.ts`
- `frontend/src/utils/apiClient.ts`

---

## 3. 后端发给 LLM 的 Prompt 约束（原文）

后端构造了两条消息：system + user。

### 3.1 system message

```text
You generate high-quality school assessment questions. Use the source text as reference but do NOT mention source/document/material in the question wording. Return JSON only with key questions. Each question: type, prompt, options(optional), answer(optional), difficulty, explanation.
```

### 3.2 user message 模板

```text
subject={subject}
grade={grade}
difficulty={difficulty}
question_count={question_count}
type_targets={...}
Constraints:
1) Do not include phrases like 'according to source/provided material/uploaded document'.
2) Keep questions answerable standalone.
3) For MCQ provide exactly 4 options A-D and exactly one correct option.
4) For True/False provide answer as True or False.
5) Reflect concrete concepts from source text.
source_text:
{source_text[:7000]}
```

对应实现：`backend/app/services/quiz/ai_question_gen_service.py` 中 `_build_messages(...)`。

---

## 4. 本次运行拿到的“直接输出内容”

### 4.1 preview 接口返回（节选）

```json
{
  "questions": [
    {
      "type": "MCQ",
      "prompt": "In Biology, which statement best explains energy?",
      "options": [
        {"key": "A", "text": "A common misconception about energy", "correct": false},
        {"key": "B", "text": "A correct explanation of energy", "correct": true}
      ]
    }
  ],
  "generation_mode": "heuristic",
  "warning": "LLM call failed (AuthenticationError); heuristic fallback was used."
}
```

### 4.2 直接探测 LLM 提供商返回

```text
CHAT_PROVIDER_ERROR AuthenticationError Error code: 401 - Incorrect API key provided
```

---

## 5. 为什么你看到质量差

因为当前题目不是 LLM 正常产出，而是 `_heuristic_generate(...)` 的固定模板在产出，模板本身就是通用占位风格：

- `In {subject}, which statement best explains {topic}?`
- `A common misconception about {topic}`
- `A correct explanation of {topic}`

这会导致你看到“像套壳、语义浅、细节弱”的题目。

---

## 6. 额外可见性问题（前端）

后端其实返回了 `generation_mode` 和 `warning`，但前端当前只读取了 `questions`，没有把这两个字段展示出来，所以页面上看不出自己已经走了 fallback。

这会造成误判：看起来像“LLM 调了但质量很差”，实际上是“LLM 没成功，走了模板”。

---

## 7. 建议的下一步

1. 先修复可用的 LLM key（或 provider 配置），确保 preview 返回 `generation_mode = "llm"`。
2. 前端在生成结果区显示 `generation_mode` 和 `warning`，避免静默降级。
3. 可选：后端增加 `debug` 字段（例如 provider/model/attempt_count/fallback_reason），便于快速定位问题。
