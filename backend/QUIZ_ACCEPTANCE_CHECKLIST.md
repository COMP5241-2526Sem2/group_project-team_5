# Quiz 功能验收清单（可执行版）

适用分支：`feature/quiz_gen`

目标：让你用最少步骤确认 Quiz 生成功能和学生作答闭环是否达到预期。

## 0. 准备

在后端目录启动服务：

```bash
cd /workspaces/group_project-team_5/backend
PYTHONPATH=. .venv/bin/uvicorn app.main:app --reload --port 8000
```

另开一个终端作为验收终端：

```bash
cd /workspaces/group_project-team_5/backend
export BASE_URL="http://127.0.0.1:8000/api/v1"
export TEACHER_ID="1"
export STUDENT_ID="2"
```

说明：`STUDENT_ID` 必须是已选上目标课程的学生，否则 `todo` 会为空、`detail` 会返回 404。  
当前这套 Supabase 数据里，已选课学生通常是 `1001`（可先用 `GET /quizzes/todo` 验证）。

健康检查：

```bash
curl -s "$BASE_URL/health"
```

通过标准：返回 `"status":"ok"`。

---

## 1. 生成 Quiz（老师）

### 1.1 textbook 模式

```bash
curl -s -X POST "$BASE_URL/quiz-generation" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $TEACHER_ID" \
  -d '{
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
  }'
```

通过标准：

1. 返回 200。
2. 响应包含 `question_id`（后续当作 `quiz_id` 使用）。
3. `generated_count + reused_count == question_count`。

### 1.2 错误校验（必须测）

`type_targets` 总数不匹配：

```bash
curl -s -X POST "$BASE_URL/quiz-generation" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $TEACHER_ID" \
  -d '{
    "mode": "textbook",
    "grade": "S3",
    "subject": "Biology",
    "difficulty": "medium",
    "question_count": 6,
    "total_score": 100,
    "duration_min": 30,
    "textbook_id": 1,
    "type_targets": {
      "MCQ_SINGLE": 3,
      "SHORT_ANSWER": 1
    }
  }'
```

通过标准：返回 422 或带有 `sum(type_targets) must equal question_count` 的校验错误。

---

## 2. 学生待办与详情

先设定你上一步拿到的 `quiz_id`：

```bash
export QUIZ_ID="把上一条响应里的question_id填到这里"
```

### 2.1 待办列表

```bash
curl -s "$BASE_URL/quizzes/todo" -H "X-User-Id: $STUDENT_ID"
```

通过标准：

1. 返回 200。
2. 列表里能找到 `quiz_id == $QUIZ_ID`。
3. `status` 为 `Not started` 或 `In progress`。

说明：`200` 仅表示接口调用成功，不代表业务条件命中。若返回 `{"items":[]}`，表示“当前学生没有符合条件的待做 Quiz”。

排查顺序（建议逐条执行）：

```bash
echo "STUDENT_ID=$STUDENT_ID QUIZ_ID=$QUIZ_ID"
curl -s "$BASE_URL/quizzes/todo" -H "X-User-Id: $STUDENT_ID"
curl -i -s "$BASE_URL/quizzes/$QUIZ_ID" -H "X-User-Id: $STUDENT_ID"
curl -s "$BASE_URL/quizzes/completed" -H "X-User-Id: $STUDENT_ID"
```

常见原因：

1. `STUDENT_ID` 不是已选课学生（最常见）。
2. 该 quiz 已提交，已进入 `completed` 列表。
3. `QUIZ_ID` 不是这次生成返回的 id（变量被旧值覆盖）。

### 2.2 Quiz 详情

```bash
curl -s "$BASE_URL/quizzes/$QUIZ_ID" -H "X-User-Id: $STUDENT_ID"
```

通过标准：

1. 返回 200。
2. `items` 长度等于 `question_count`。
3. 客观题包含 `options`，主观题 `options` 可为空。

---

## 3. Attempt 幂等 + 保存作答

### 3.1 创建 attempt（调用两次）

第一次：

```bash
curl -s -X POST "$BASE_URL/quizzes/$QUIZ_ID/attempts" -H "X-User-Id: $STUDENT_ID"
```

第二次：

```bash
curl -s -X POST "$BASE_URL/quizzes/$QUIZ_ID/attempts" -H "X-User-Id: $STUDENT_ID"
```

通过标准：两次返回的 `attempt_id` 一致（幂等）。

设置 `attempt_id`：

```bash
export ATTEMPT_ID="把上一步返回的attempt_id填到这里"
```

### 3.2 保存答案（先存一次）

注意：`question_id` 必须是 `GET /quizzes/{quiz_id}` 返回的题项 id（不是题库 id）。

先取当前 quiz 的真实题项 id（建议至少取 3 个）：

```bash
DETAIL_JSON=$(curl -s "$BASE_URL/quizzes/$QUIZ_ID" -H "X-User-Id: $STUDENT_ID")
echo "$DETAIL_JSON"
```

若本机有 `jq`：

```bash
Q1=$(echo "$DETAIL_JSON" | jq '.items[0].question_id')
Q2=$(echo "$DETAIL_JSON" | jq '.items[1].question_id')
Q3=$(echo "$DETAIL_JSON" | jq '.items[2].question_id')
echo "Q1=$Q1 Q2=$Q2 Q3=$Q3"
```

若无 `jq`，可用 Python：

```bash
read Q1 Q2 Q3 <<EOF
$(printf '%s' "$DETAIL_JSON" | python -c 'import json,sys; items=json.load(sys.stdin)["items"]; print(items[0]["question_id"], items[1]["question_id"], items[2]["question_id"])')
EOF
echo "Q1=$Q1 Q2=$Q2 Q3=$Q3"
```

```bash
curl -s -X PUT "$BASE_URL/attempts/$ATTEMPT_ID/answers" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $STUDENT_ID" \
  -d '{
    "answers": [
      {"question_id": '"$Q1"', "selected_option": "A"},
      {"question_id": '"$Q2"', "selected_option": "T"},
      {"question_id": '"$Q3"', "text_answer": "osmosis"}
    ]
  }'
```

通过标准：返回 200，`saved_count` 与提交条目数一致。

### 3.3 覆盖保存（再存一次）

把某一题改成不同答案再提交一次。

通过标准：返回仍为 200，后续 review 应体现最后一次保存的答案。

### 3.4 越界题目校验（必须测）

```bash
curl -s -X PUT "$BASE_URL/attempts/$ATTEMPT_ID/answers" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $STUDENT_ID" \
  -d '{
    "answers": [
      {"question_id": 999999, "selected_option": "A"}
    ]
  }'
```

通过标准：返回 400，并提示该题不属于当前 quiz。

---

## 4. 提交与复盘

### 4.1 提交

```bash
curl -s -X POST "$BASE_URL/attempts/$ATTEMPT_ID/submit" -H "X-User-Id: $STUDENT_ID"
```

通过标准：

1. 返回 200。
2. 响应包含 `score`、`mcq_correct`、`mcq_total`。
3. 客观题得分逻辑符合预期。

### 4.2 复盘

```bash
curl -s "$BASE_URL/attempts/$ATTEMPT_ID/review" -H "X-User-Id: $STUDENT_ID"
```

通过标准：

1. 返回 200。
2. 每题有 `my_answer`。
3. 客观题有 `correct_answer` 与 `is_correct`。
4. `awarded_score` 与 submit 的总分逻辑一致。

### 4.3 已完成列表

```bash
curl -s "$BASE_URL/quizzes/completed" -H "X-User-Id: $STUDENT_ID"
```

通过标准：能看到当前 quiz，并带有 `submitted_at` 与分数信息。

---

## 5. 你最关心的“是否达到预期”判断模板

建议你把预期写成以下 8 条并逐条打勾：

1. 题型分布和数量符合我配置（或默认规则）。
2. 题目内容质量达到可接受水平（题干完整、选项完整）。
3. 学生只能作答自己课程内的 quiz。
4. attempt 创建是幂等的，不会重复建单。
5. 保存答案可覆盖更新，不会产生脏数据。
6. 提交后客观题自动判分准确。
7. review 展示与提交结果一致。
8. completed 列表与实际提交历史一致。

若 8 条都打勾，可以认定本阶段“功能达到预期”。

---

## 6. 快速回归命令（每次改代码后跑）

```bash
cd /workspaces/group_project-team_5/backend
PYTHONPATH=. .venv/bin/pytest tests/unit/test_quiz_generation_schema.py tests/integration/test_quiz_runtime_service.py -q
```

通过标准：全部通过。

---

## 7. 常见误区

1. `question_id` 混用：保存答案时要用 quiz 详情里的题项 id，不是题库题目 id。
2. 忘记 `X-User-Id`：接口会直接返回 400。
3. `type_targets` 配比总数不等于 `question_count`：会被请求校验拦截。
4. 以为 submit 后还能编辑：`attempt` 非 `in_progress` 状态不允许再写入。
