# Quiz 接口契约 V2（优先级补齐版）

更新日期：2026-04-06  
适用分支：feature/quiz_gen  
基础前缀：`/api/v1`

## 1. 目标

在保留现有学生最小链路（生成、作答、提交、复盘）的基础上，补齐以下缺口：

1. Quiz 生命周期管理（发布/关闭/重开）
2. 教师按题评分写回（主观题）
3. 盲人模式音频上传、回放与审计

## 2. 角色约束

- 学生：
  - 可访问 `todo/completed/detail/attempt/save/submit/review`
  - 可上传自己 attempt 的音频
- 教师：
  - 仅可操作自己课程下的 quiz/attempt
  - 可发布/关闭/重开 quiz
  - 可按题评分、回放音频、写审计
- 管理员：
  - 具备教师全部能力（跨课程）

## 3. 兼容说明

- 现有接口保持兼容，不破坏既有调用。
- 不新增 `POST /api/attempts` 别名，沿用现有：
  - `POST /api/v1/quizzes/{quiz_id}/attempts`

## 4. 新增接口（按优先级）

### P0. Quiz 生命周期

#### 4.1 发布 Quiz
- `POST /api/v1/quizzes/{quiz_id}/publish`
- Header: `X-User-Id`
- 权限：教师（本课程）/管理员
- 规则：
  - quiz 必须存在
  - quiz 至少包含 1 题
  - 状态流转：`draft -> published`，`closed -> published`

响应示例：
```json
{
  "quiz_id": 11,
  "status": "published",
  "changed_at": "2026-04-06T10:05:00Z"
}
```

#### 4.2 关闭 Quiz
- `POST /api/v1/quizzes/{quiz_id}/close`
- Header: `X-User-Id`
- 权限：教师（本课程）/管理员
- 规则：
  - 状态流转：`published -> closed`

#### 4.3 重开 Quiz
- `POST /api/v1/quizzes/{quiz_id}/reopen`
- Header: `X-User-Id`
- 权限：教师（本课程）/管理员
- 规则：
  - 状态流转：`closed -> published`

---

### P1. 按题评分写回

#### 4.4 教师按题评分
- `PUT /api/v1/attempts/{attempt_id}/answers/{question_id}/grade`
- Header: `X-User-Id`
- 权限：教师（本课程）/管理员
- 请求体：
```json
{
  "awarded_score": 8.5,
  "teacher_feedback": "结构完整，可补充一个例子",
  "is_correct": null
}
```

#### 4.4.1 教师批量按题评分
- `PUT /api/v1/attempts/{attempt_id}/answers/grade-batch`
- Header: `X-User-Id`
- 权限：教师（本课程）/管理员
- 请求体：
```json
{
  "items": [
    {"question_id": 210, "awarded_score": 8.5, "teacher_feedback": "结构完整"},
    {"question_id": 211, "awarded_score": 7.0, "teacher_feedback": "可补充示例"}
  ]
}
```
- 规则：
  - 每条 item 独立按“单题评分”规则校验
  - 原子提交：任意一条校验失败则整批回滚，不落地任何评分结果
  - 最终返回 attempt 总分与状态
  - 仅支持“按题写”
  - `awarded_score` 范围：`0 <= awarded_score <= 该题满分`
  - 写回后重算 attempt 总分
  - 当主观题均已给分时，attempt 状态可转为 `graded`

响应示例：
```json
{
  "attempt_id": 3,
  "question_id": 210,
  "awarded_score": 8.5,
  "max_score": 10,
  "attempt_status": "graded",
  "total_score": 88.5
}
```

---

### P2. 音频上传/回放/审计

#### 4.5 上传音频（学生）
- `POST /api/v1/audio`
- Header: `X-User-Id`
- `multipart/form-data` 字段：
  - `attempt_id` (int)
  - `question_id` (int)
  - `file` (binary)
  - `retention_until` (optional ISO datetime)
- 规则：
  - 仅学生可上传自己的 attempt
  - 支持晚到上传（attempt 提交后仍可补传）
  - 文件大小上限由配置项 `QUIZ_AUDIO_MAX_BYTES` 控制，默认 `8388608`（8 MiB）
  - 不限制格式

响应示例：
```json
{
  "audio_id": 15,
  "attempt_id": 3,
  "question_id": 210,
  "content_type": "audio/webm",
  "size_bytes": 53211,
  "created_at": "2026-04-06T10:12:00Z",
  "retention_until": "2026-07-31T00:00:00Z"
}
```

#### 4.6 音频流播放（教师/Admin）
- `GET /api/v1/audio/{audio_id}/stream`
- Header: `X-User-Id`
- 权限：教师（本课程）/管理员
- 规则：
  - 仅内联播放，不提供下载语义（`Content-Disposition: inline`）
  - 服务端自动写入一次 `stream` 审计

#### 4.7 音频审计（手动）
- `POST /api/v1/audio/{audio_id}/audit`
- Header: `X-User-Id`
- 权限：教师（本课程）/管理员
- 请求体：
```json
{
  "action": "manual_review",
  "ip": "127.0.0.1",
  "device_info": "Chrome on macOS"
}
```

---

### P2.1 Review 音频摘要

`GET /api/v1/attempts/{attempt_id}/review` 的每道题新增字段：

```json
"audio_records": [
  {
    "audio_id": 15,
    "content_type": "audio/webm",
    "size_bytes": 53211,
    "created_at": "2026-04-06T10:12:00Z"
  }
]
```

## 5. 状态机

### Quiz
- `draft -> published -> closed`
- `closed -> published`（重开）

### Attempt
- 学生提交后：`in_progress -> submitted`
- 教师按题评分补全主观题后：`submitted -> graded`

## 6. Supabase/MySQL 兼容约束

- 当前开发：Supabase（PostgreSQL）
- 目标：MySQL
- 约束：
  - 枚举值用字符串字面量稳定管理
  - 时间统一 UTC
  - 避免依赖 PostgreSQL 专有 SQL
  - 音频审计与评分逻辑通过 ORM 实现，减少方言差异
