# Paper 接口文档（实现态）

更新日期：2026-04-06  
适用分支：feature/quiz_gen  
基础前缀：`/api/v1`

## 1. 概览

当前 Paper 模块已实现两条主链路：

1. Paper 管理链路（列表/详情/发布/关闭/重开）
2. Paper Attempts 运行时链路（学生作答 + 教师评分）

所有接口默认要求请求头：`X-User-Id: <int>`。

## 2. 路由清单

### 2.1 Paper 管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/papers` | 教师/管理员查看试卷列表（支持筛选分页） |
| GET | `/papers/{paper_id}` | 教师/管理员查看试卷详情 |
| POST | `/papers/{paper_id}/publish` | 发布试卷 |
| POST | `/papers/{paper_id}/close` | 关闭试卷 |
| POST | `/papers/{paper_id}/reopen` | 重开试卷 |

### 2.2 Attempts 运行时

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/papers/{paper_id}/attempts/me` | 学生创建或获取本人 attempt（幂等） |
| PUT | `/paper-attempts/{attempt_id}/answers` | 学生保存答案 |
| POST | `/paper-attempts/{attempt_id}/submit` | 学生提交并自动判客观题 |
| GET | `/paper-attempts/{attempt_id}/review` | 学生查看复盘 |
| GET | `/papers/{paper_id}/attempts` | 教师/管理员查看作答列表 |
| PUT | `/paper-attempts/{attempt_id}/answers/{question_id}/grade` | 教师/管理员单题评分 |
| PUT | `/paper-attempts/{attempt_id}/answers/grade-batch` | 教师/管理员批量评分（原子提交） |

## 3. 权限矩阵

- 学生：`attempts/me`、`save`、`submit`、`review`
- 教师：
  - 仅可访问自己课程下的 paper 与 attempts
  - 可执行发布/关闭/重开与评分
- 管理员：跨课程访问（教师能力超集）

## 4. 状态与映射

### 4.1 Paper 状态（对外）

- `draft`
- `published`
- `closed`

实现说明：数据库内部 `archived` 对外映射为 `closed`。

### 4.2 Paper Attempt 状态

- `in_progress`
- `submitted`
- `graded`

状态流转：

1. 学生提交：`in_progress -> submitted`
2. 主观题全部评分完成：`submitted -> graded`

## 5. 查询参数

### 5.1 GET /papers

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| status | `draft/published/closed` | 状态过滤 |
| subject | string | 学科过滤 |
| grade | string | 年级过滤 |
| semester | string | 学期过滤 |
| exam_type | string | 考试类型过滤 |
| q | string | 标题模糊搜索 |
| page | int>=1 | 页码 |
| page_size | int[1,100] | 每页条数 |

### 5.2 GET /papers/{paper_id}/attempts

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| status | `in_progress/submitted/graded` | attempt 状态过滤 |
| page | int>=1 | 页码 |
| page_size | int[1,100] | 每页条数 |

## 6. 关键请求示例

### 6.1 保存答案

路径：`PUT /paper-attempts/{attempt_id}/answers`

```json
{
  "answers": [
    {"question_id": 148, "selected_option": "A"},
    {"question_id": 149, "text_answer": "smoke answer"}
  ]
}
```

### 6.2 提交

路径：`POST /paper-attempts/{attempt_id}/submit`

响应示例：

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

### 6.3 单题评分

路径：`PUT /paper-attempts/{attempt_id}/answers/{question_id}/grade`

```json
{
  "awarded_score": 8.5,
  "teacher_feedback": "ok",
  "is_correct": null
}
```

### 6.4 批量评分

路径：`PUT /paper-attempts/{attempt_id}/answers/grade-batch`

```json
{
  "items": [
    {"question_id": 149, "awarded_score": 8.5, "teacher_feedback": "ok"},
    {"question_id": 150, "awarded_score": 7.0, "teacher_feedback": "good"}
  ]
}
```

## 7. 业务规则

1. attempt 唯一性：`(paper_id, student_id)` 唯一。
2. 提交后不可再修改答案（默认不支持 reopen-attempt）。
3. 评分上限：`0 <= awarded_score <= 题目满分`。
4. 批量评分原子性：任一条失败，全批回滚。
5. 发布约束：paper 至少包含 1 道题。

## 8. 错误码约定

- `200`：成功
- `400`：业务规则错误（如提交后再改、超分）
- `403`：权限不足
- `404`：paper/attempt/question 不存在
- `422`：参数校验失败

## 9. 已验证结果（本地）

- 集成测试：
  - `tests/integration/test_paper_api_v1.py`
  - `tests/integration/test_paper_attempts_api_v1.py`
- 单元测试：
  - `tests/unit/test_paper_attempt_service.py`
- 回归结果：24 passed
