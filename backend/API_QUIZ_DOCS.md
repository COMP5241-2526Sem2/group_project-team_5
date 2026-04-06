# Quiz 接口文档（规范版）

更新日期：2026-04-06  
适用分支：feature/quiz_gen  
基础前缀：`/api/v1`

## 1. 通用约定

### 1.1 请求头

- `Content-Type: application/json`（有请求体时必填）
- `X-User-Id: <int>`（除健康检查外，Quiz 接口必填）

### 1.2 状态码

- `200`：成功
- `400`：请求不合法（常见：缺少 `X-User-Id` 或参数越界）
- `404`：资源不存在（常见：quiz/attempt 不存在）
- `422`：请求体验证失败（Pydantic 校验失败）

### 1.3 Quiz 领域映射

- `questions`：Quiz 主体
- `question_items`：Quiz 内题项
- `question_attempts`：学生作答尝试
- `question_attempt_answers`：逐题答案

## 2. 接口目录

| 模块 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| Health | GET | `/health` | 服务健康检查 |
| Quiz Generation | POST | `/quiz-generation` | 生成 Quiz |
| Quiz Runtime | GET | `/quizzes/todo` | 待完成 Quiz 列表 |
| Quiz Runtime | GET | `/quizzes/completed` | 已完成 Quiz 列表 |
| Quiz Runtime | GET | `/quizzes/{quiz_id}` | Quiz 详情 |
| Quiz Runtime | POST | `/quizzes/{quiz_id}/attempts` | 创建或获取 attempt |
| Quiz Runtime | PUT | `/attempts/{attempt_id}/answers` | 保存作答 |
| Quiz Runtime | POST | `/attempts/{attempt_id}/submit` | 提交作答 |
| Quiz Runtime | GET | `/attempts/{attempt_id}/review` | 获取复盘 |
| Quiz Management | POST | `/quizzes/{quiz_id}/publish` | 发布 Quiz |
| Quiz Management | POST | `/quizzes/{quiz_id}/close` | 关闭 Quiz |
| Quiz Management | POST | `/quizzes/{quiz_id}/reopen` | 重开 Quiz |
| Quiz Management | PUT | `/attempts/{attempt_id}/answers/{question_id}/grade` | 教师单题评分 |
| Quiz Management | PUT | `/attempts/{attempt_id}/answers/grade-batch` | 教师批量评分 |
| Quiz Audio | POST | `/audio` | 学生上传音频 |
| Quiz Audio | GET | `/audio/{audio_id}/stream` | 教师/Admin 回放音频 |
| Quiz Audio | POST | `/audio/{audio_id}/audit` | 写入音频审计 |

## 3. 接口明细

### 3.1 健康检查

- 方法：`GET`
- 路径：`/api/v1/health`
- 鉴权：不需要

成功响应示例：

```json
{
  "success": true,
  "data": {
    "status": "ok"
  },
  "message": "healthy"
}
```

---

### 3.2 生成 Quiz

- 方法：`POST`
- 路径：`/api/v1/quiz-generation`
- 鉴权：需要 `X-User-Id`

请求体字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| mode | `textbook \| paper_mimic` | 是 | 生成模式 |
| grade | string | 是 | 年级 |
| subject | string | 是 | 学科 |
| difficulty | `easy \| medium \| hard` | 是 | 难度 |
| question_count | int | 是 | 题目总数 |
| total_score | int | 是 | Quiz 总分 |
| duration_min | int | 是 | 时长（分钟） |
| textbook_id | int | 条件必填 | `mode=textbook` 时必填 |
| chapter | string | 否 | 章节 |
| source_paper_id | int | 条件必填 | `mode=paper_mimic` 时必填 |
| rewrite_strength | `low \| medium \| high` | 否 | 改写强度，默认 `medium` |
| type_targets | object | 否 | 题型分配，所有值之和必须等于 `question_count` |

请求示例：

```json
{
  "mode": "textbook",
  "grade": "S3",
  "subject": "Biology",
  "difficulty": "medium",
  "question_count": 6,
  "total_score": 100,
  "duration_min": 30,
  "textbook_id": 1,
  "chapter": "Chapter 1",
  "rewrite_strength": "medium",
  "type_targets": {
    "MCQ_SINGLE": 3,
    "TRUE_FALSE": 1,
    "FILL_BLANK": 1,
    "SHORT_ANSWER": 1
  }
}
```

成功响应关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| question_id | int | 生成出来的 Quiz ID |
| status | string | Quiz 状态 |
| reused_count | int | 复用题库题目数 |
| generated_count | int | 新生成题目数 |
| items | array | 题目详情列表 |

---

### 3.3 待完成 Quiz 列表

- 方法：`GET`
- 路径：`/api/v1/quizzes/todo`
- 鉴权：需要 `X-User-Id`

成功响应关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| items[].quiz_id | int | Quiz ID |
| items[].status | string | `Not started \| In progress` |
| items[].question_count | int | 题目数 |
| items[].mcq_count | int | 客观题数 |
| items[].sa_count | int | 主观题数 |

---

### 3.4 已完成 Quiz 列表

- 方法：`GET`
- 路径：`/api/v1/quizzes/completed`
- 鉴权：需要 `X-User-Id`

成功响应关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| items[].status | string | 固定为 `Completed` |
| items[].submitted_at | datetime | 提交时间 |
| items[].score | number | 得分 |
| items[].mcq_correct | int | 客观题答对数 |

---

### 3.5 Quiz 详情

- 方法：`GET`
- 路径：`/api/v1/quizzes/{quiz_id}`
- 鉴权：需要 `X-User-Id`

路径参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| quiz_id | int | 是 | Quiz ID |

成功响应关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| quiz_id | int | Quiz ID |
| total_score | int | 总分 |
| question_count | int | 题目数 |
| items[].question_id | int | 题项 ID（保存答案必须用它） |
| items[].type | string | 题型 |
| items[].options | array/null | 客观题有选项，主观题可为空 |

---

### 3.6 创建或获取 Attempt

- 方法：`POST`
- 路径：`/api/v1/quizzes/{quiz_id}/attempts`
- 鉴权：需要 `X-User-Id`

说明：同一学生对同一 quiz 重复调用，返回同一条 attempt（幂等）。

成功响应示例：

```json
{
  "attempt_id": 12,
  "quiz_id": 3,
  "status": "in_progress",
  "started_at": "2026-04-05T03:05:06Z",
  "submitted_at": null
}
```

---

### 3.7 保存作答

- 方法：`PUT`
- 路径：`/api/v1/attempts/{attempt_id}/answers`
- 鉴权：需要 `X-User-Id`

请求体字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| answers | array | 是 | 答案列表，最少 1 条 |
| answers[].question_id | int | 是 | 题项 ID（来自 quiz 详情） |
| answers[].selected_option | string | 否 | 选择题答案 |
| answers[].text_answer | string | 否 | 文本题答案 |

请求示例：

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

成功响应示例：

```json
{
  "attempt_id": 12,
  "saved_count": 2
}
```

错误场景：

- `400`：`attempt is not editable`
- `400`：`question_id <id> not in this quiz`

---

### 3.8 提交作答

- 方法：`POST`
- 路径：`/api/v1/attempts/{attempt_id}/submit`
- 鉴权：需要 `X-User-Id`

说明：

1. 客观题自动判分：`MCQ_SINGLE`、`MCQ_MULTI`、`TRUE_FALSE`、`FILL_BLANK`。
2. 主观题（`SHORT_ANSWER`、`ESSAY`）不自动判分。

成功响应示例：

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

---

### 3.9 获取复盘

- 方法：`GET`
- 路径：`/api/v1/attempts/{attempt_id}/review`
- 鉴权：需要 `X-User-Id`

成功响应关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| score | number | 最终得分 |
| items[].my_answer | object | 我的答案 |
| items[].correct_answer | object/null | 标准答案（题型相关） |
| items[].is_correct | bool/null | 自动判分结果 |
| items[].awarded_score | number/null | 该题得分 |
| items[].teacher_feedback | string/null | 教师反馈 |
| items[].audio_records | array | 该题关联的音频摘要 |

---

### 3.10 发布 Quiz

- 方法：`POST`
- 路径：`/api/v1/quizzes/{quiz_id}/publish`
- 鉴权：需要 `X-User-Id`（教师/管理员）

成功响应示例：

```json
{
  "quiz_id": 11,
  "status": "published",
  "changed_at": "2026-04-06T10:05:00Z"
}
```

### 3.11 关闭 Quiz

- 方法：`POST`
- 路径：`/api/v1/quizzes/{quiz_id}/close`
- 鉴权：需要 `X-User-Id`（教师/管理员）

### 3.12 重开 Quiz

- 方法：`POST`
- 路径：`/api/v1/quizzes/{quiz_id}/reopen`
- 鉴权：需要 `X-User-Id`（教师/管理员）

### 3.13 教师单题评分

- 方法：`PUT`
- 路径：`/api/v1/attempts/{attempt_id}/answers/{question_id}/grade`
- 鉴权：需要 `X-User-Id`（教师/管理员）

请求示例：

```json
{
  "awarded_score": 8.5,
  "teacher_feedback": "结构完整，可补充一个例子",
  "is_correct": null
}
```

### 3.14 教师批量评分

- 方法：`PUT`
- 路径：`/api/v1/attempts/{attempt_id}/answers/grade-batch`
- 鉴权：需要 `X-User-Id`（教师/管理员）

说明：任意 item 校验失败会整批回滚，不落地任何评分结果。

请求示例：

```json
{
  "items": [
    {"question_id": 210, "awarded_score": 8.5, "teacher_feedback": "结构完整"},
    {"question_id": 211, "awarded_score": 7.0, "teacher_feedback": "可补充示例"}
  ]
}
```

### 3.15 上传音频

- 方法：`POST`
- 路径：`/api/v1/audio`
- 鉴权：需要 `X-User-Id`（学生）
- 类型：`multipart/form-data`

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| attempt_id | int | 是 | attempt id |
| question_id | int | 是 | question item id |
| file | binary | 是 | 音频文件 |
| retention_until | ISO datetime | 否 | 保留截止时间 |

说明：

- 音频文件大小上限由配置项 `QUIZ_AUDIO_MAX_BYTES` 控制，默认 `8388608`（8 MiB）。
- 不限制音频格式。

### 3.16 回放音频

- 方法：`GET`
- 路径：`/api/v1/audio/{audio_id}/stream`
- 鉴权：需要 `X-User-Id`（教师/管理员）

说明：响应为内联播放（`Content-Disposition: inline`），服务端会自动写入一条 `stream` 审计。

### 3.17 写入音频审计

- 方法：`POST`
- 路径：`/api/v1/audio/{audio_id}/audit`
- 鉴权：需要 `X-User-Id`（教师/管理员）

请求示例：

```json
{
  "action": "manual_review",
  "ip": "127.0.0.1",
  "device_info": "curl"
}
```

## 4. 关键验收点

1. `type_targets` 的值总和必须等于 `question_count`。
2. 保存答案必须使用 quiz 详情里的 `items[].question_id`。
3. attempt 创建接口满足幂等。
4. submit 后 attempt 不可再编辑。
5. `question_attempt_answers.question_id` 外键已指向 `question_items.id`（迁移：`a9c4f6e2b1d0`）。
