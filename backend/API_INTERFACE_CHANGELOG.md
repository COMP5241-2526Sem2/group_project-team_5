# 接口变更说明（最小必要补齐包）

更新日期：2026-04-04  
分支：feature/quiz_gen

## 1. 范围
本次补齐聚焦于数据层与接口契约一致性，不新增业务路由，仅明确后续 API 应遵循的字段与枚举。

## 2. Quiz 领域映射（重要）
前后端统一采用以下映射：

- `questions`：Quiz 主体（即原先语义的 quiz）
- `paper_questions`：题目明细
- `paper_question_options`：选项明细
- `question_attempts`：学生作答记录
- `question_attempt_answers`：逐题答案

说明：`quiz_*` 表已从后端模型与迁移中移除，避免与 `question` 体系重复。

## 3. Lesson 接口契约变更
`lesson_decks` 对应接口对象新增字段：

- `deckSource`: `kb_ai | ppt_import | hybrid | manual`
- `thumbnail`: `string | null`

### 推荐响应示例
```json
{
  "id": "d1",
  "title": "Forces & Newton's Laws",
  "subject": "physics",
  "grade": "Grade 8",
  "deckSource": "kb_ai",
  "status": "published",
  "thumbnail": null,
  "createdAt": "2026-04-04T00:00:00Z",
  "updatedAt": "2026-04-04T00:00:00Z",
  "teacherId": "t1"
}
```

### Slide block 类型对齐
`slide_blocks.block_type` 枚举应与前端类型一致：

- `text`
- `interactive`
- `exercise_walkthrough`
- `image`

## 4. Lab 接口契约变更
`lab_registries.status` 枚举调整为：

- `draft`
- `published`
- `deprecated`

与前端 `LabComponentDefinition.status` 对齐。

### 推荐响应示例
```json
{
  "registryKey": "physics.circuit",
  "title": "Circuit Lab",
  "subject": "physics",
  "rendererProfile": "circuit_2d",
  "status": "published",
  "teacherId": null,
  "metadata": {
    "grade": "Grade 9",
    "topic": "Ohm Law"
  }
}
```

## 5. 外键与一致性补齐（本批）
已补齐外键约束的领域：

- `courses.teacher_id -> users.id`
- `enrollments.student_id -> users.id`
- `lesson_decks.teacher_id -> users.id`
- `lab_registries.teacher_id -> users.id`（`ON DELETE SET NULL`）

## 6. 向后兼容建议
由于当前后端业务路由尚未完全落地，建议在正式开放接口时：

1. 在 OpenAPI 中将 `deckSource`、`thumbnail`、`lab.status` 枚举写入 schema。
2. 对旧客户端保留 `status` 的容错映射（如接收到 `active/archived` 时回退到 `published/deprecated`）。
3. 明确文档中 `question` 体系即 quiz 体系，避免再次引入 `quiz_*` 结构。

## 7. Quiz 接口测试清单与实际结果

测试环境：本地 MySQL `openstudy_dev`，后端通过 `uvicorn app.main:app --reload --port 8000` 启动，数据库连接已验证可用。

### 7.1 测试清单

| 编号 | 场景 | 请求 | 预期结果 |
| --- | --- | --- | --- |
| TC-01 | 健康检查 | `GET /api/v1/health` | 返回 200，服务状态为 `ok` |
| TC-02 | 教材生成主流程 | `POST /api/v1/quiz-generation`，`mode=textbook`，携带 `textbook_id`、`chapter`、`X-User-Id` | 返回 200，生成草稿 Quiz 并落库 |
| TC-03 | 重复提交同参数请求 | 同 TC-02 再提交一次 | 返回 200，仍可生成新的草稿 Quiz |
| TC-04 | 缺少作者头 | `POST /api/v1/quiz-generation`，不传 `X-User-Id` | 返回 400，提示缺少头信息 |
| TC-05 | 仿题缺少来源 | `POST /api/v1/quiz-generation`，`mode=paper_mimic` 但不传 `source_paper_id` | 返回 422，提示必填字段缺失 |

### 7.2 实际执行结果

| 编号 | 实际结果 |
| --- | --- |
| TC-01 | 通过，返回 `{"success":true,"data":{"status":"ok"},"message":"healthy"}` |
| TC-02 | 通过，返回 200；生成 `question_id=1`，`status=draft`，`reused_count=0`，`generated_count=6` |
| TC-03 | 通过，返回 200；生成 `question_id=2`，`status=draft`，`reused_count=0`，`generated_count=6` |
| TC-04 | 通过，返回 400 |
| TC-05 | 通过，返回 422，错误信息为 `source_paper_id is required when mode='paper_mimic'` |

### 7.3 数据库写入结果

本次测试结束后，MySQL 中的关键数据量为：

- `questions`: 2
- `question_bank_items`: 12
- `question_items`: 12

说明：当前测试环境下题库与教材基础数据为空，因此生成流程走的是“题库不足时自动补齐模板题”的分支。

## 8. Quiz 运行时接口补齐（新增路由）

本批次新增学生端 Quiz 运行时接口，统一以 `questions` 作为 Quiz 主体。

### 8.1 路由清单

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/quizzes/todo` | 获取当前学生待做 Quiz 列表 |
| GET | `/api/v1/quizzes/completed` | 获取当前学生已完成 Quiz 列表 |
| GET | `/api/v1/quizzes/{quiz_id}` | 获取 Quiz 详情与题目列表 |
| POST | `/api/v1/quizzes/{quiz_id}/attempts` | 创建或获取当前学生作答尝试 |
| PUT | `/api/v1/attempts/{attempt_id}/answers` | 保存作答（可重复覆盖） |
| POST | `/api/v1/attempts/{attempt_id}/submit` | 提交并完成客观题判分 |
| GET | `/api/v1/attempts/{attempt_id}/review` | 获取提交后复盘视图 |

说明：以上接口均要求请求头携带 `X-User-Id`，缺失时返回 400。

### 8.2 保存作答请求示例

路径：`PUT /api/v1/attempts/12/answers`

```json
{
  "answers": [
    {
      "question_id": 101,
      "selected_option": "A"
    },
    {
      "question_id": 102,
      "text_answer": "osmosis"
    }
  ]
}
```

### 8.3 提交作答响应示例

路径：`POST /api/v1/attempts/12/submit`

```json
{
  "attempt_id": 12,
  "status": "submitted",
  "score": 66.68,
  "total_score": 100,
  "mcq_correct": 3,
  "mcq_total": 3
}
```

### 8.4 关键行为约定

1. 同一学生对同一 Quiz 只保留一条 attempt 记录；重复创建会返回已有 attempt。
2. `save answers` 在 attempt 状态为 `in_progress` 时可多次调用并覆盖旧答案。
3. `submit` 对客观题型执行自动判分：
   - `MCQ_SINGLE`
   - `MCQ_MULTI`
   - `TRUE_FALSE`
   - `FILL_BLANK`
4. 主观题型（如 `SHORT_ANSWER`、`ESSAY`）提交时不自动判分，保留为待人工评阅。

## 9. 数据迁移说明

新增迁移：`a9c4f6e2b1d0_fix_attempt_answer_fk_to_question_items`

变更内容：

1. 将 `question_attempt_answers.question_id` 的外键引用由 `paper_questions.id` 更正为 `question_items.id`。
2. 保持 `ON DELETE CASCADE` 语义，确保 Quiz 题项删除时作答明细自动清理。

影响说明：

- 该迁移修复了 Quiz 运行时写答案时的外键语义错误，避免作答数据写入失败或关联错位。

## 10. Paper 接口阶段性进展（2026-04-06）

### 10.1 已落地（无数据库结构改动）

1. Paper V1 查询接口
  - `GET /api/v1/papers`
  - `GET /api/v1/papers/{paper_id}`
2. Paper 生命周期接口
  - `POST /api/v1/papers/{paper_id}/publish`
  - `POST /api/v1/papers/{paper_id}/close`
  - `POST /api/v1/papers/{paper_id}/reopen`

### 10.2 行为约束

1. 对外状态收敛为三态：`draft/published/closed`
2. 内部 `archived` 对外映射为 `closed`
3. 发布前要求 paper 至少包含 1 道题，否则返回 `400`

### 10.3 文档新增

1. `API_PAPER_CONTRACT_V1.md`：列表与详情契约
2. `API_PAPER_CONTRACT_V2_ATTEMPTS.md`：attempts 草案（仅契约，不含实现）

### 10.4 已落地（2026-04-06）

1. 独立表与迁移：
  - `paper_attempts`
  - `paper_attempt_answers`
  - Alembic revision: `e3f4a5b6c7d8`
2. 学生作答流程接口：
  - `GET /papers/{paper_id}/attempts/me`
  - `PUT /paper-attempts/{attempt_id}/answers`
  - `POST /paper-attempts/{attempt_id}/submit`
  - `GET /paper-attempts/{attempt_id}/review`
3. 教师评分接口：
  - `GET /papers/{paper_id}/attempts`
  - `PUT /paper-attempts/{attempt_id}/answers/{question_id}/grade`
  - `PUT /paper-attempts/{attempt_id}/answers/grade-batch`
4. 规则：
  - submit 后默认不可再修改答案
  - 批量评分原子提交（all-or-nothing）

### 10.5 迁移与运行时修复

1. 在 Supabase 迁移执行中处理了 `paper_attempt_status` 重复创建问题。
2. 修复了 PostgreSQL 枚举值写入兼容问题：
  - 运行时写入 `in_progress/submitted/graded`（value）
  - 避免写入 `IN_PROGRESS`（name）导致失败。

### 10.6 新增评审与验收文档

1. `PAPER_ATTEMPTS_ACCEPTANCE_CHECKLIST_V1.md`
  - Paper attempts 接口可执行验收步骤（含权限、参数与原子性边界）
2. `PAPER_ATTEMPTS_MIGRATION_PLAN_V1_REVIEW.md`
  - 最小迁移方案评审稿（仅方案，不执行迁移）

## 11. 接口文档整并（2026-04-06）

为减少分散文档造成的维护与阅读成本，已新增统一入口：

1. `API_FINAL_DOCS.md`：当前接口唯一推荐入口（Quiz + Paper 实现态）

说明：

1. 原有 `API_*DOCS`、`API_*CONTRACT`、验收与变更文档保留为历史参考。
2. `README.md` 的“接口文档”入口已调整为优先指向 `API_FINAL_DOCS.md`。

## 12. Paper AI 辅助评分 V1（2026-04-06）

新增规划文档：

1. `AI_PAPER_SCORING_IMPLEMENTATION_PLAN_V1.md`

已落地要点：

1. AI 建议分与正式分离（先建议后采纳）
2. 新增表：`paper_attempt_ai_scores`、`paper_ai_adoption_audits`
3. 新增接口：
  - `POST /paper-attempts/{attempt_id}/ai-score`
  - `GET /paper-attempts/{attempt_id}/ai-score`
  - `POST /paper-attempts/{attempt_id}/ai-score/{question_id}/adopt`
  - `POST /paper-attempts/{attempt_id}/ai-score/adopt-batch`
4. 采纳路径复用现有评分逻辑，批量采纳保留原子提交语义。
