# Paper AI 辅助评分实施方案 V1（最小改造清单）

更新日期：2026-04-06  
状态：方案草案（待你确认后实施）

## 1. 目标

在不破坏当前 Paper 评分主链路的前提下，引入 AI 辅助评分能力。

原则：

1. AI 先给建议，不直接写正式分数。
2. 教师可采纳/修改后再落库。
3. 全过程可审计，可回溯。

## 2. 当前可复用能力

已存在能力：

1. 学生提交与复盘链路。
2. 教师单题/批量评分接口。
3. 批量评分原子提交（all-or-nothing）。

可复用位置：

1. `PaperAttemptService.grade_answer`
2. `PaperAttemptService.grade_answers_batch`

## 3. 数据库改动提案（待确认）

### 3.1 新表：paper_attempt_ai_scores

字段建议：

1. `id` bigint pk
2. `attempt_id` bigint fk -> `paper_attempts.id`
3. `question_id` bigint fk -> `paper_questions.id`
4. `suggested_score` numeric(6,2)
5. `suggested_feedback` text
6. `confidence` numeric(4,3)（0~1）
7. `rationale` text
8. `model_name` text
9. `prompt_version` text
10. `status` text（`success|failed|skipped`）
11. `error_message` text null
12. `created_at` timestamptz
13. `updated_at` timestamptz

约束建议：

1. 唯一键：`(attempt_id, question_id, prompt_version)`
2. `suggested_score >= 0`
3. `confidence` 范围：`0 <= confidence <= 1`

### 3.2 新表：paper_ai_adoption_audits

字段建议：

1. `id` bigint pk
2. `attempt_id` bigint fk -> `paper_attempts.id`
3. `question_id` bigint fk -> `paper_questions.id`
4. `actor_id` bigint fk -> `users.id`
5. `source_ai_score_id` bigint fk -> `paper_attempt_ai_scores.id`
6. `adopted_score` numeric(6,2)
7. `adopted_feedback` text
8. `action` text（`adopt|override`）
9. `created_at` timestamptz

## 4. 接口提案（待确认）

### 4.1 触发 AI 建议生成

- `POST /api/v1/paper-attempts/{attempt_id}/ai-score`
- 权限：教师/管理员
- 作用：为该 attempt 的主观题生成建议（同步或异步）

### 4.2 查询 AI 建议

- `GET /api/v1/paper-attempts/{attempt_id}/ai-score`
- 权限：教师/管理员
- 返回每题 `suggested_score`、`suggested_feedback`、`confidence`、`rationale`

### 4.3 采纳 AI 建议（单题）

- `POST /api/v1/paper-attempts/{attempt_id}/ai-score/{question_id}/adopt`
- 权限：教师/管理员
- 作用：把建议转换为正式评分（内部复用 `grade_answer`）

### 4.4 批量采纳 AI 建议

- `POST /api/v1/paper-attempts/{attempt_id}/ai-score/adopt-batch`
- 权限：教师/管理员
- 作用：批量采纳（内部复用 `grade_answers_batch`，保持原子提交）

## 5. 服务层改造点

新增服务：`PaperAIScoringService`

核心函数：

1. `generate_suggestions(attempt_id, actor_id)`
2. `list_suggestions(attempt_id, actor_id)`
3. `adopt_suggestion(attempt_id, question_id, actor_id)`
4. `adopt_suggestions_batch(attempt_id, actor_id, items)`

与现有服务协作：

1. 建议写入 AI 建议表
2. 采纳时调用现有评分写回逻辑
3. 采纳后写审计表

## 6. 模型调用策略（V1）

1. 仅对主观题调用模型。
2. Prompt 输入：题干、标准答案、分值上限、学生答案、评分规范。
3. 输出强约束 JSON：
   - `suggested_score`
   - `suggested_feedback`
   - `confidence`
   - `rationale`
4. 若模型输出非法分值，降级为 `failed`，不影响人工评分流程。

## 7. 上线顺序（建议）

### 阶段 1（低风险）

1. 建表 + 生成/查询建议接口
2. 前端只展示建议，不允许一键采纳

### 阶段 2（闭环）

1. 单题采纳
2. 批量采纳（原子）
3. 审计记录

### 阶段 3（优化）

1. 置信度阈值策略
2. 重试/缓存策略
3. 成本监控与报表

## 8. 测试清单

1. AI 建议生成成功/失败分支
2. 非法分值拦截
3. 采纳后正式分数写回正确
4. 批量采纳原子回滚
5. 跨课程教师权限拦截

## 9. 待你确认项

1. 是否同意新增两张 AI 评分相关表。
2. 是否同意先做“建议展示”，后做“一键采纳”。
3. 是否同意采纳逻辑复用现有评分接口（保持原子策略）。
