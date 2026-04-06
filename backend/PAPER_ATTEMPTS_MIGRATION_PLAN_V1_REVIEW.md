# Paper Attempts 最小迁移方案 V1（评审稿）

更新日期：2026-04-06  
状态：待确认，不执行迁移

## 1. 目标

在不影响现有 Quiz 运行时能力的前提下，新增独立 Paper 作答体系：

1. `paper_attempts`
2. `paper_attempt_answers`

核心原则：

1. 与 quiz attempts 彻底隔离
2. 接口契约优先，迁移最小化
3. 先可用，再迭代 AI 评分增强

## 2. 迁移范围（拟）

### 2.1 新表

1. `paper_attempts`
- `id` bigint pk
- `paper_id` bigint not null fk -> papers.id
- `student_id` bigint not null fk -> users.id
- `started_at` timestamptz null
- `submitted_at` timestamptz null
- `score` numeric(8,2) null
- `status` enum/string (`in_progress|submitted|graded`)
- 唯一键：`(paper_id, student_id)`

2. `paper_attempt_answers`
- `id` bigint pk
- `attempt_id` bigint not null fk -> paper_attempts.id
- `question_id` bigint not null fk -> paper_questions.id
- `selected_option` text null
- `text_answer` text null
- `is_correct` bool null
- `awarded_score` numeric(6,2) null
- `teacher_feedback` text null
- 唯一键：`(attempt_id, question_id)`

### 2.2 索引（拟）

1. `paper_attempts.paper_id`
2. `paper_attempts.student_id`
3. `paper_attempt_answers.attempt_id`
4. `paper_attempt_answers.question_id`

## 3. 与接口契约映射

对应文档：`API_PAPER_CONTRACT_V2_ATTEMPTS.md`

1. `GET /papers/{paper_id}/attempts/me` -> `paper_attempts` 幂等创建或查询
2. `PUT /paper-attempts/{attempt_id}/answers` -> upsert `paper_attempt_answers`
3. `POST /paper-attempts/{attempt_id}/submit` -> 自动判客观题并更新 attempt
4. `GET /paper-attempts/{attempt_id}/review` -> 聚合题目与答题记录
5. 教师评分接口 -> 写回 `awarded_score/teacher_feedback/is_correct`

## 4. 兼容与风险

1. 兼容：不改现有 Quiz 表和接口，风险隔离
2. 风险：
- `paper_questions.question_type` 历史数据格式可能不一致
- 主客观题判定规则需统一常量，避免 Quiz/Paper 分叉
- PostgreSQL/MySQL 枚举差异需通过 ORM 统一

## 5. 实施顺序（建议）

1. 先落迁移 + ORM 模型（不开放路由）
2. 再落 service + schema + route
3. 最后补集成测试与验收清单回归

## 6. 验收门槛（进入开发前）

1. 你确认字段定义与唯一键方案
2. 你确认 `submit` 后是否允许 reopen-attempt（默认不允许）
3. 你确认评分原子策略继续沿用 all-or-nothing

## 7. 明确约束

当前仅提交评审稿，不执行任何数据库改动。
