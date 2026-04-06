# Quiz 功能验收清单 V2（可执行版）

适用分支：feature/quiz_gen  
基础前缀：`/api/v1`

## 0. 准备

```bash
cd /workspaces/group_project-team_5/backend
export BASE_URL="http://127.0.0.1:8000/api/v1"
export TEACHER_ID="1003"
export STUDENT_ID="1004"
```

说明：你当前开发环境为 Supabase；本清单默认后端服务已启动、迁移已执行。

---

## 1. 生命周期（发布/关闭/重开）

### 1.1 发布

```bash
curl -s -X POST "$BASE_URL/quizzes/$QUIZ_ID/publish" -H "X-User-Id: $TEACHER_ID"
```

通过标准：200，`status=published`。

### 1.2 关闭

```bash
curl -s -X POST "$BASE_URL/quizzes/$QUIZ_ID/close" -H "X-User-Id: $TEACHER_ID"
```

通过标准：200，`status=closed`。

### 1.3 重开

```bash
curl -s -X POST "$BASE_URL/quizzes/$QUIZ_ID/reopen" -H "X-User-Id: $TEACHER_ID"
```

通过标准：200，`status=published`。

---

## 2. 单题评分（教师）

先确保学生已提交，得到 `ATTEMPT_ID`。

```bash
export ATTEMPT_ID="3"
export SA_QID="把主观题 question_id 填这里"
```

```bash
curl -s -X PUT "$BASE_URL/attempts/$ATTEMPT_ID/answers/$SA_QID/grade" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $TEACHER_ID" \
  -d '{
    "awarded_score": 5,
    "teacher_feedback": "结构清晰",
    "is_correct": null
  }'
```

通过标准：200，返回 `attempt_status` 与 `total_score`。

边界校验（必须测）：

```bash
curl -s -X PUT "$BASE_URL/attempts/$ATTEMPT_ID/answers/$SA_QID/grade" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $TEACHER_ID" \
  -d '{
    "awarded_score": 999
  }'
```

通过标准：400，提示超出该题满分。

---

## 3. 批量评分（教师）

```bash
curl -s -X PUT "$BASE_URL/attempts/$ATTEMPT_ID/answers/grade-batch" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $TEACHER_ID" \
  -d '{
    "items": [
      {"question_id": '"$SA_QID"', "awarded_score": 5, "teacher_feedback": "表达准确"}
    ]
  }'
```

通过标准：200，响应包含批量 `items`、最终 `attempt_status`、`total_score`。

---

## 4. 音频上传/回放/审计

### 4.1 上传（学生）

准备一个小文件：

```bash
printf 'demo-audio' > /tmp/demo-audio.bin
```

上传：

```bash
curl -s -X POST "$BASE_URL/audio" \
  -H "X-User-Id: $STUDENT_ID" \
  -F "attempt_id=$ATTEMPT_ID" \
  -F "question_id=$SA_QID" \
  -F "file=@/tmp/demo-audio.bin;type=application/octet-stream"
```

通过标准：200，得到 `audio_id`。

### 4.2 大小上限边界（必须测）

```bash
python - <<'PY'
with open('/tmp/too-large.bin', 'wb') as f:
    f.write(b'x' * (8 * 1024 * 1024 + 1))
print('written')
PY

curl -s -X POST "$BASE_URL/audio" \
  -H "X-User-Id: $STUDENT_ID" \
  -F "attempt_id=$ATTEMPT_ID" \
  -F "question_id=$SA_QID" \
  -F "file=@/tmp/too-large.bin;type=application/octet-stream"
```

通过标准：400，提示超过大小限制。

### 4.3 回放（教师/Admin）

```bash
export AUDIO_ID="把上传响应里的 audio_id 填这里"
curl -i -s "$BASE_URL/audio/$AUDIO_ID/stream" -H "X-User-Id: $TEACHER_ID"
```

通过标准：200，响应头包含 `Content-Disposition: inline`。

### 4.4 手动审计（教师/Admin）

```bash
curl -s -X POST "$BASE_URL/audio/$AUDIO_ID/audit" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $TEACHER_ID" \
  -d '{"action":"manual_review","ip":"127.0.0.1","device_info":"curl"}'
```

通过标准：200，返回 `audit_id`。

---

## 5. Review 音频摘要

```bash
curl -s "$BASE_URL/attempts/$ATTEMPT_ID/review" -H "X-User-Id: $STUDENT_ID"
```

通过标准：`items[]` 中对应题目包含 `audio_records` 数组，且至少一条记录。

---

## 6. 快速回归

```bash
cd /workspaces/group_project-team_5/backend
PYTHONPATH=. .venv/bin/pytest tests/integration/test_quiz_management_service.py tests/integration/test_quiz_runtime_service.py tests/unit/test_quiz_generation_schema.py -q
```

通过标准：全部通过。
