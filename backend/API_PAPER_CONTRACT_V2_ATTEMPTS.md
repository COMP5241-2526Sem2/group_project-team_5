# Paper 接口契约 V2（Attempts 草案，仅文档）

更新日期：2026-04-06  
适用分支：feature/quiz_gen  
基础前缀：`/api/v1`

## 1. 范围

本草案只定义 Paper 作答与评阅接口契约，不包含数据库实现。

目标：

1. 建立独立的 `paper_attempts` 语义（不复用 quiz attempts）
2. 明确客观题自动评分 + 主观题教师/AI 混合评分的 API 形态
3. 提前锁定前后端字段，降低后续迁移返工成本

## 2. 角色与权限

- 学生：
  - 获取可作答 paper 清单
  - 创建/获取本人 attempt
  - 保存答案
  - 提交 attempt
  - 查看本人 review
- 教师：
  - 查看本课程学生 attempt 列表
  - 对主观题单题评分/批量评分
- 管理员：
  - 教师全部能力（跨课程）

## 3. 状态机

### 3.1 Paper

- `draft -> published -> closed`
- `closed -> published`（reopen）

### 3.2 PaperAttempt

- `in_progress`：学生作答中
- `submitted`：学生已提交，等待主观题评阅
- `graded`：主观题评分完成

状态流转：

- 学生提交：`in_progress -> submitted`
- 评分完成：`submitted -> graded`

## 4. 数据对象

### 4.1 AttemptListItem

```json
{
  "attempt_id": 501,
  "paper_id": 101,
  "paper_title": "S4 Midterm Biology Paper",
  "student_id": 1004,
  "student_name": "Alice",
  "status": "submitted",
  "score": 78.5,
  "total_score": 100,
  "objective_correct": 18,
  "objective_total": 22,
  "started_at": "2026-04-06T09:00:00Z",
  "submitted_at": "2026-04-06T09:45:00Z"
}
```

### 4.2 AttemptDetail

```json
{
  "attempt_id": 501,
  "paper_id": 101,
  "student_id": 1004,
  "status": "submitted",
  "score": 78.5,
  "total_score": 100,
  "items": [
    {
      "question_id": 9001,
      "type": "MCQ",
      "max_score": 3,
      "selected_option": "B",
      "text_answer": null,
      "is_correct": true,
      "awarded_score": 3,
      "teacher_feedback": null
    },
    {
      "question_id": 9010,
      "type": "SHORT_ANSWER",
      "max_score": 10,
      "selected_option": null,
      "text_answer": "...",
      "is_correct": null,
      "awarded_score": null,
      "teacher_feedback": null
    }
  ]
}
```

## 5. 接口定义（草案）

### 5.1 学生端

1. `GET /papers/{paper_id}/attempts/me`
- 说明：创建或返回当前学生 attempt（幂等）

2. `PUT /paper-attempts/{attempt_id}/answers`
- 请求体：

```json
{
  "answers": [
    {"question_id": 9001, "selected_option": "B"},
    {"question_id": 9010, "text_answer": "answer text"}
  ]
}
```

3. `POST /paper-attempts/{attempt_id}/submit`
- 说明：
  - 自动判客观题
  - 主观题保留待评阅

4. `GET /paper-attempts/{attempt_id}/review`
- 说明：返回提交后复盘视图（含每题评分状态）

### 5.2 教师端

1. `GET /papers/{paper_id}/attempts`
- 说明：查看本试卷学生作答列表（支持分页/状态过滤）

2. `PUT /paper-attempts/{attempt_id}/answers/{question_id}/grade`
- 请求体：

```json
{
  "awarded_score": 8.5,
  "teacher_feedback": "结构完整",
  "is_correct": null
}
```

3. `PUT /paper-attempts/{attempt_id}/answers/grade-batch`
- 请求体：

```json
{
  "items": [
    {"question_id": 9010, "awarded_score": 8.5, "teacher_feedback": "结构完整"},
    {"question_id": 9011, "awarded_score": 7.0, "teacher_feedback": "可补充例子"}
  ]
}
```

- 规则：批量评分采用原子提交（all-or-nothing）

## 6. 统一错误码约定

- `400`：业务规则不满足（如重复提交后再修改答案）
- `403`：无权限
- `404`：paper/attempt/question 不存在
- `422`：请求参数校验失败

## 7. 关键业务规则

1. `attempt` 与 `student + paper` 唯一绑定，重复创建返回同一记录。
2. `submit` 后禁止学生继续改答案（除非后续引入 reopen-attempt 规则）。
3. `awarded_score` 必须满足：`0 <= awarded_score <= max_score`。
4. 主观题全部完成评分后，attempt 状态转 `graded`。
5. 教师仅可操作自己课程下的 paper attempts；管理员不受此限制。

## 8. 与当前实现边界

本文件仅为契约草案。当前仓库已实现：

- Paper V1：列表 + 详情
- Paper 生命周期：publish/close/reopen

未实现：

- `paper_attempts` 相关模型、迁移、路由与服务

在你确认前，不进行任何数据库改动。
