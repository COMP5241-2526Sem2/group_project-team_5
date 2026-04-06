# Paper Attempts 功能验收清单 V1（草案，可执行）

适用分支：feature/quiz_gen  
基础前缀：`/api/v1`

说明：

1. 本清单对应 `API_PAPER_CONTRACT_V2_ATTEMPTS.md`。
2. 当前仓库已落地 paper attempts 实现；执行前请先完成数据库迁移。

---

## 0. 准备

```bash
cd /workspaces/group_project-team_5/backend
export BASE_URL="http://127.0.0.1:8000/api/v1"
export TEACHER_ID="1003"
export STUDENT_ID="1004"
export PAPER_ID="101"
```

---

## 1. 学生创建或获取本人 attempt

```bash
curl -s -X GET "$BASE_URL/papers/$PAPER_ID/attempts/me" \
  -H "X-User-Id: $STUDENT_ID"
```

通过标准：

1. `200`
2. 返回 `attempt_id`
3. 首次调用创建，重复调用返回同一 `attempt_id`（幂等）

---

## 2. 学生保存答案

先记录 attempt：

```bash
export ATTEMPT_ID="把上一步返回的 attempt_id 填这里"
```

```bash
curl -s -X PUT "$BASE_URL/paper-attempts/$ATTEMPT_ID/answers" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $STUDENT_ID" \
  -d '{
    "answers": [
      {"question_id": 9001, "selected_option": "B"},
      {"question_id": 9010, "text_answer": "sample answer"}
    ]
  }'
```

通过标准：

1. `200`
2. 返回已保存题数
3. 重复保存同题会覆盖旧答案

---

## 3. 学生提交 attempt

```bash
curl -s -X POST "$BASE_URL/paper-attempts/$ATTEMPT_ID/submit" \
  -H "X-User-Id: $STUDENT_ID"
```

通过标准：

1. `200`
2. `status=submitted` 或 `status=graded`（仅当无主观题时）
3. 返回 `score`、`total_score`、`objective_correct`、`objective_total`

---

## 4. 学生查看 review

```bash
curl -s "$BASE_URL/paper-attempts/$ATTEMPT_ID/review" \
  -H "X-User-Id: $STUDENT_ID"
```

通过标准：

1. `200`
2. 返回 items，包含 `awarded_score`、`teacher_feedback`、`is_correct`

---

## 5. 教师查看某 paper 作答列表

```bash
curl -s "$BASE_URL/papers/$PAPER_ID/attempts?page=1&page_size=20" \
  -H "X-User-Id: $TEACHER_ID"
```

通过标准：

1. `200`
2. 仅返回该课程学生 attempts
3. 返回分页字段 `page/page_size/total`

---

## 6. 教师单题评分

```bash
export SA_QID="把主观题 question_id 填这里"

curl -s -X PUT "$BASE_URL/paper-attempts/$ATTEMPT_ID/answers/$SA_QID/grade" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $TEACHER_ID" \
  -d '{
    "awarded_score": 8.5,
    "teacher_feedback": "结构完整",
    "is_correct": null
  }'
```

通过标准：

1. `200`
2. 返回 `attempt_status`
3. `awarded_score` 已写回

边界校验（必须测）：

```bash
curl -s -X PUT "$BASE_URL/paper-attempts/$ATTEMPT_ID/answers/$SA_QID/grade" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $TEACHER_ID" \
  -d '{"awarded_score": 999}'
```

通过标准：`400`，提示超过该题满分。

---

## 7. 教师批量评分（原子提交）

```bash
curl -s -X PUT "$BASE_URL/paper-attempts/$ATTEMPT_ID/answers/grade-batch" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $TEACHER_ID" \
  -d '{
    "items": [
      {"question_id": 9010, "awarded_score": 8.5, "teacher_feedback": "ok"},
      {"question_id": 9011, "awarded_score": 7.0, "teacher_feedback": "good"}
    ]
  }'
```

通过标准：

1. `200`
2. 返回批量 items 与最终总分

原子性校验（必须测）：

```bash
curl -s -X PUT "$BASE_URL/paper-attempts/$ATTEMPT_ID/answers/grade-batch" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $TEACHER_ID" \
  -d '{
    "items": [
      {"question_id": 9010, "awarded_score": 8.5, "teacher_feedback": "ok"},
      {"question_id": 999999, "awarded_score": 1.0, "teacher_feedback": "invalid"}
    ]
  }'
```

通过标准：

1. 返回 `400/404`
2. 第一题评分不应被落库（整批回滚）

---

## 8. 权限与参数边界

1. 学生调用教师评分接口，预期 `403`
2. 教师访问非本人课程 attempt，预期 `403`
3. 非法分页参数（`page=0` 或 `page_size>100`），预期 `422`
4. 不存在的 paper/attempt/question，预期 `404`

---

## 9. 快速回归建议（待实现后）

```bash
cd /workspaces/group_project-team_5/backend
pytest -q tests/integration/test_paper_attempts_api_v1.py
```

通过标准：全部通过。

---

## 10. Supabase 执行顺序（迁移 + 最小烟测）

### 10.1 执行迁移

```bash
cd /workspaces/group_project-team_5/backend
alembic upgrade head
```

通过标准：

1. 迁移成功包含 `e3f4a5b6c7d8_add_paper_attempt_tables`
2. 新表 `paper_attempts`、`paper_attempt_answers` 已创建

### 10.2 最小烟测（建议顺序）

1. 学生创建/获取 attempt：

```bash
curl -s -X GET "$BASE_URL/papers/$PAPER_ID/attempts/me" -H "X-User-Id: $STUDENT_ID"
```

2. 学生保存答案：

```bash
curl -s -X PUT "$BASE_URL/paper-attempts/$ATTEMPT_ID/answers" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $STUDENT_ID" \
  -d '{"answers":[{"question_id":9001,"selected_option":"A"}]}'
```

3. 学生提交：

```bash
curl -s -X POST "$BASE_URL/paper-attempts/$ATTEMPT_ID/submit" -H "X-User-Id: $STUDENT_ID"
```

4. 教师查看作答列表：

```bash
curl -s "$BASE_URL/papers/$PAPER_ID/attempts" -H "X-User-Id: $TEACHER_ID"
```

5. 教师主观题评分：

```bash
curl -s -X PUT "$BASE_URL/paper-attempts/$ATTEMPT_ID/answers/$SA_QID/grade" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $TEACHER_ID" \
  -d '{"awarded_score":8.5,"teacher_feedback":"ok"}'
```

通过标准：以上步骤均返回 `200`，且 attempt 状态按预期流转。
