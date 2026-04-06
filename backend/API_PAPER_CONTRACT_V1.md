# Paper 接口契约 V1（首期：列表 + 详情）

更新日期：2026-04-06  
适用分支：feature/quiz_gen  
基础前缀：`/api/v1`

## 1. 目标与范围

本版本仅实现教师端 Paper 的首期能力：

1. 试卷列表（含筛选）
2. 试卷详情（含 section/questions 预览）

后续版本预留并约束：

1. 状态机沿用：`draft -> published -> closed`
2. 提交体系采用独立实体：`paper_attempts`（不复用 quiz attempts）
3. 评分策略：客观题自动评分 + 主观题教师/AI 混合评分

## 2. 角色与权限

- 教师：仅可访问自己课程下的 Paper
- 管理员：可访问全量 Paper
- 学生：本版本不开放 Paper 列表/详情管理接口

## 3. 通用约定

### 3.1 请求头

- `X-User-Id: <int>`（必填）

### 3.2 状态码

- `200`：成功
- `400`：请求不合法（缺少头/参数不合法）
- `403`：无权限访问该资源
- `404`：资源不存在
- `422`：请求参数校验失败

### 3.3 状态枚举

- `draft`
- `published`
- `closed`

说明：后端模型当前含 `archived`，但对前端接口收敛为三态，避免状态语义分裂。

## 4. 数据结构（DTO）

### 4.1 PaperListItem

```json
{
  "paper_id": 101,
  "title": "Grade 10 Biology Midterm — Spring 2026",
  "course_id": 2,
  "course_name": "S3 Biology",
  "grade": "Grade 10",
  "subject": "Biology",
  "semester": "Vol.2",
  "exam_type": "midterm",
  "status": "published",
  "total_score": 120,
  "duration_min": 90,
  "question_count": 29,
  "quality_score": 91,
  "published_at": "2026-04-05T09:00:00Z",
  "created_at": "2026-04-01T10:30:00Z"
}
```

### 4.2 PaperDetailResponse

```json
{
  "paper_id": 101,
  "title": "Grade 10 Biology Midterm — Spring 2026",
  "course_id": 2,
  "course_name": "S3 Biology",
  "grade": "Grade 10",
  "subject": "Biology",
  "semester": "Vol.2",
  "exam_type": "midterm",
  "status": "published",
  "total_score": 120,
  "duration_min": 90,
  "question_count": 29,
  "quality_score": 91,
  "published_at": "2026-04-05T09:00:00Z",
  "created_at": "2026-04-01T10:30:00Z",
  "sections": [
    {
      "section_id": 9001,
      "order": 1,
      "title": "Section I — Multiple Choice",
      "question_type": "MCQ",
      "question_count": 15,
      "score_each": 3,
      "total_score": 45,
      "questions": [
        {
          "paper_question_id": 80001,
          "order": 1,
          "type": "MCQ",
          "prompt": "Which organelle is primarily responsible for photosynthesis?",
          "difficulty": "easy",
          "score": 3,
          "options": [
            {"key": "A", "text": "Mitochondria"},
            {"key": "B", "text": "Chloroplast"},
            {"key": "C", "text": "Ribosome"},
            {"key": "D", "text": "Vacuole"}
          ]
        }
      ]
    }
  ]
}
```

## 5. 接口定义（V1）

### 5.1 获取试卷列表

- 方法：`GET`
- 路径：`/api/v1/papers`
- 鉴权：`X-User-Id`

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| status | string | 否 | `draft/published/closed` |
| subject | string | 否 | 学科筛选 |
| grade | string | 否 | 年级筛选 |
| semester | string | 否 | 学期筛选 |
| exam_type | string | 否 | midterm/final/unit/... |
| q | string | 否 | 标题模糊搜索 |
| page | int | 否 | 默认 1 |
| page_size | int | 否 | 默认 20，最大 100 |

响应示例：

```json
{
  "items": [
    {
      "paper_id": 101,
      "title": "Grade 10 Biology Midterm — Spring 2026",
      "course_id": 2,
      "course_name": "S3 Biology",
      "grade": "Grade 10",
      "subject": "Biology",
      "semester": "Vol.2",
      "exam_type": "midterm",
      "status": "published",
      "total_score": 120,
      "duration_min": 90,
      "question_count": 29,
      "quality_score": 91,
      "published_at": "2026-04-05T09:00:00Z",
      "created_at": "2026-04-01T10:30:00Z"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

### 5.2 获取试卷详情

- 方法：`GET`
- 路径：`/api/v1/papers/{paper_id}`
- 鉴权：`X-User-Id`

路径参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| paper_id | int | 是 | 试卷 ID |

响应：见 `PaperDetailResponse`。

## 6. 权限与边界规则

1. 教师访问 `GET /papers` 时，仅返回其课程下试卷。
2. 教师访问 `GET /papers/{paper_id}` 时，若非本人课程，返回 `403`。
3. 不存在的 `paper_id` 返回 `404`。
4. `status` 传入非法值返回 `422`。

## 7. 后续版本预留（不在 V1 实现）

### 7.1 生命周期接口（V2）

- `POST /api/v1/papers/{paper_id}/publish`
- `POST /api/v1/papers/{paper_id}/close`
- `POST /api/v1/papers/{paper_id}/reopen`

### 7.2 独立提交体系（V2+）

新增独立表（后续实现前会先与你确认数据库改动）：

- `paper_attempts`
- `paper_attempt_answers`

不复用现有 quiz 的 `question_attempts`。

### 7.3 评分策略（V2+）

- 客观题自动评分
- 主观题教师/AI 混合评分
- 支持单题与批量评分，批量评分采用“全成功才提交”的原子策略

## 8. 验收标准（V1）

1. 列表接口返回字段与前端 Papers 页面展示字段一一对应。
2. 详情接口可返回 section + question + options，支持右侧预览面板渲染。
3. 403/404/422 边界返回稳定。
