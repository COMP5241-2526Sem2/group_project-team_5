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
