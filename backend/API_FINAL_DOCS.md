# OpenStudy 后端接口文档（最终版）

更新日期：2026-04-06  
适用分支：feature/quiz_gen  
基础前缀：`/api/v1`

本文件是当前后端接口的唯一推荐入口（Single Source of Truth）。

---

## 1. 通用约定

### 1.1 请求头

- 除健康检查外，接口均要求：`X-User-Id: <int>`
- 带 JSON 请求体时：`Content-Type: application/json`

### 1.2 统一状态码

- `200`：成功
- `400`：业务规则错误（如提交后再改答案、分值越界）
- `403`：无权限
- `404`：资源不存在
- `422`：参数校验失败

### 1.3 角色

- 学生：作答相关接口
- 教师：本课程资源管理与评分
- 管理员：跨课程教师能力超集

---

## 2. 接口总览

### 2.1 通用

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |

### 2.2 Quiz 模块

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/quiz-generation` | 生成 Quiz |
| GET | `/quizzes/todo` | 待完成 Quiz |
| GET | `/quizzes/completed` | 已完成 Quiz |
| GET | `/quizzes/{quiz_id}` | Quiz 详情 |
| POST | `/quizzes/{quiz_id}/attempts` | 创建/获取 attempt |
| PUT | `/attempts/{attempt_id}/answers` | 保存答案 |
| POST | `/attempts/{attempt_id}/submit` | 提交答案 |
| GET | `/attempts/{attempt_id}/review` | 复盘 |
| POST | `/quizzes/{quiz_id}/publish` | 发布 Quiz |
| POST | `/quizzes/{quiz_id}/close` | 关闭 Quiz |
| POST | `/quizzes/{quiz_id}/reopen` | 重开 Quiz |
| PUT | `/attempts/{attempt_id}/answers/{question_id}/grade` | 单题评分 |
| PUT | `/attempts/{attempt_id}/answers/grade-batch` | 批量评分（原子） |
| POST | `/audio` | 学生上传音频 |
| GET | `/audio/{audio_id}/stream` | 教师/Admin 回放音频 |
| POST | `/audio/{audio_id}/audit` | 音频审计 |

### 2.3 Paper 模块

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/papers` | 试卷列表（筛选分页） |
| GET | `/papers/{paper_id}` | 试卷详情 |
| POST | `/papers/{paper_id}/publish` | 发布试卷 |
| POST | `/papers/{paper_id}/close` | 关闭试卷 |
| POST | `/papers/{paper_id}/reopen` | 重开试卷 |
| GET | `/papers/{paper_id}/attempts/me` | 学生创建/获取本人 attempt（幂等） |
| PUT | `/paper-attempts/{attempt_id}/answers` | 学生保存答案 |
| POST | `/paper-attempts/{attempt_id}/submit` | 学生提交并自动判客观题 |
| GET | `/paper-attempts/{attempt_id}/review` | 学生复盘 |
| GET | `/papers/{paper_id}/attempts` | 教师/管理员查看作答列表 |
| PUT | `/paper-attempts/{attempt_id}/answers/{question_id}/grade` | 单题评分 |
| PUT | `/paper-attempts/{attempt_id}/answers/grade-batch` | 批量评分（原子） |
| POST | `/paper-attempts/{attempt_id}/ai-score` | 生成 AI 评分建议 |
| GET | `/paper-attempts/{attempt_id}/ai-score` | 查询 AI 评分建议 |
| POST | `/paper-attempts/{attempt_id}/ai-score/{question_id}/adopt` | 采纳单题 AI 建议 |
| POST | `/paper-attempts/{attempt_id}/ai-score/adopt-batch` | 批量采纳 AI 建议 |

---

## 3. 核心业务规则

### 3.1 Quiz

1. 同一学生同一 Quiz 的 attempt 幂等。
2. 批量评分 all-or-nothing。
3. 音频大小受配置项 `QUIZ_AUDIO_MAX_BYTES` 限制。

### 3.2 Paper

1. 对外试卷状态：`draft/published/closed`。
2. 内部 `archived` 映射为对外 `closed`。
3. 发布前要求试卷至少 1 题。
4. `paper_attempts` 唯一键：`(paper_id, student_id)`。
5. submit 后默认不允许学生继续改答案。
6. 客观题自动判分，主观题教师评分。
7. 批量评分 all-or-nothing。
8. AI 建议与正式分数分离；只有采纳动作才写正式分数。

---

## 4. 关键参数

### 4.1 GET /papers

- `status`: `draft/published/closed`
- `subject`: string
- `grade`: string
- `semester`: string
- `exam_type`: string
- `q`: string
- `page`: int, >=1
- `page_size`: int, 1~100

### 4.2 GET /papers/{paper_id}/attempts

- `status`: `in_progress/submitted/graded`
- `page`: int, >=1
- `page_size`: int, 1~100

---

## 5. 典型请求示例

### 5.1 Paper 学生保存答案

`PUT /paper-attempts/{attempt_id}/answers`

```json
{
  "answers": [
    {"question_id": 148, "selected_option": "A"},
    {"question_id": 149, "text_answer": "sample answer"}
  ]
}
```

### 5.2 Paper 学生提交

`POST /paper-attempts/{attempt_id}/submit`

```json
{
  "attempt_id": 1,
  "status": "submitted",
  "score": 10.0,
  "total_score": 20.0,
  "objective_correct": 1,
  "objective_total": 1
}
```

### 5.3 Paper 教师评分

`PUT /paper-attempts/{attempt_id}/answers/{question_id}/grade`

```json
{
  "awarded_score": 8.5,
  "teacher_feedback": "ok",
  "is_correct": null
}
```

---

## 6. 数据库结构摘要（接口相关）

### 6.1 Paper 结构

- `papers`
- `paper_sections`
- `paper_questions`
- `paper_question_options`
- `paper_attempts`
- `paper_attempt_answers`

关键约束：

1. `uq_paper_attempts_paper_student`
2. `uq_paper_attempt_answers_attempt_question`
3. 分数字段非负约束

### 6.2 Quiz 结构

- `questions`
- `question_items`
- `question_attempts`
- `question_attempt_answers`
- `quiz_audio_records`
- `quiz_audio_playback_audits`

---

## 7. 验证与回归

当前已通过：

- `tests/integration/test_paper_api_v1.py`
- `tests/integration/test_paper_attempts_api_v1.py`
- `tests/unit/test_paper_attempt_service.py`

最近回归：`24 passed`

---

## 8. 历史文档（参考）

以下文档保留用于追溯设计过程，不再作为首选入口：

- `API_QUIZ_DOCS.md`
- `API_PAPER_DOCS.md`
- `API_QUIZ_CONTRACT_V2.md`
- `API_PAPER_CONTRACT_V1.md`
- `API_PAPER_CONTRACT_V2_ATTEMPTS.md`
- `API_INTERFACE_CHANGELOG.md`

---

## 9. AI 辅助评分（已实现 V1）

当前状态：已上线基础能力。

已实现内容：

1. 生成/查询 AI 建议分与建议评语。
2. 单题采纳与批量采纳（批量采纳仍遵循原子策略）。
3. AI 建议与采纳审计独立入表，不直接覆盖正式评分流程。
4. 可配置真实模型调用（`AI_SCORING_PROVIDER=openai|ohmygpt`），调用失败自动降级到启发式评分。

配置项（环境变量）：

- `AI_SCORING_PROVIDER`：默认 `heuristic`
- `AI_SCORING_MODEL`：默认 `gpt-4o-mini`
- `AI_SCORING_TEMPERATURE`：默认 `0.1`
- `AI_SCORING_TIMEOUT_SEC`：默认 `20`
- `AI_SCORING_MAX_TOKENS`：默认 `600`
- `OHMYGPT_API_KEY`：当 provider 为 `openai/ohmygpt` 时必填
- `OHMYGPT_BASE_URL`：默认 `https://api.ohmygpt.com/v1`

`/paper-attempts/{attempt_id}/ai-score` 返回项中的 `status` 说明：

- `success`：建议由启发式或 LLM 正常生成
- `fallback`：LLM 调用失败，已自动降级为启发式建议

方案文档：

- `AI_PAPER_SCORING_IMPLEMENTATION_PLAN_V1.md`

---

## 10. Quiz 生成（AI 接入）

当前状态：已支持 LLM 生成，失败自动回退模板题生成。

行为说明：

1. 生成流程仍遵循“优先复用题库，不足时生成并入库”。
2. 当 `QUIZ_GENERATION_PROVIDER=openai|ohmygpt` 且配置了 `OHMYGPT_API_KEY` 时，启用 LLM 生成题干/答案/解析。
3. 若 LLM 调用失败、返回格式异常、或生成题目与现有题目过于相似，则自动降级为模板生成，不中断接口返回。

配置项（环境变量）：

- `QUIZ_GENERATION_PROVIDER`：默认 `heuristic`
- `QUIZ_GENERATION_MODEL`：默认 `gpt-4o-mini`
- `QUIZ_GENERATION_TEMPERATURE`：默认 `0.4`
- `QUIZ_GENERATION_TIMEOUT_SEC`：默认 `25`
- `QUIZ_GENERATION_MAX_TOKENS`：默认 `800`
- `OHMYGPT_API_KEY`：当 provider 为 `openai/ohmygpt` 时必填
- `OHMYGPT_BASE_URL`：默认 `https://api.ohmygpt.com/v1`
