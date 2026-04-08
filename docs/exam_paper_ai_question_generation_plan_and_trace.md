# Exam Paper 出题功能实现计划与溯源文档

## 0. 目标
修复 AI Question Gen 在 Exam Paper 模式下“题目与上传材料无关”的问题，并提供可追溯证据。

## 1. 实现计划
1. 审查现有链路并定位与上传材料脱钩的环节。
2. 修复前端 Exam 文件处理：保留 File 对象并提取真实文本。
3. 为 preview 接口增加 Exam 上下文字段（source_mode / match_mode / difficulty / file_names）。
4. 在后端 Prompt 注入 Exam 模式约束，严格按模式引导生成。
5. 增加前端可观测信息（generation_mode + warning），便于判断 LLM/回退路径。
6. 输出可溯源文档：请求体、Prompt 原文、判定规则与改动位置。

## 2. 需求确认（5问结果）
1. 题量规则：固定 10 题。
2. 匹配语义：严格匹配。
3. 难度映射：基础/巩固/拔高 -> easy/medium/hard 固定映射。
4. JPG/PNG 处理：无法可靠抽取文字时阻止生成并提示。
5. 溯源文档：包含前端真实请求体样例、后端最终 Prompt、generation_mode/warning 规则。

## 3. 根因定位
### 3.1 前端 Exam 流程未用正文文本
原逻辑在 Exam 模式主要使用文件名、模式字符串拼接 source_text，未将上传文件正文作为主要输入。

### 3.2 Exam 文件状态不保留 File
Exam 文件列表仅保存 name/size/url，导致生成阶段无法对每个文件重新抽取文本。

### 3.3 后端 Prompt 缺少 Exam 模式上下文
后端 preview Prompt 之前未明确接收 source_mode / exam_match_mode / exam_difficulty 等上下文，无法执行“题型一致/知识点一致”等策略。

## 4. 接口与实现改动

### 4.1 前端 preview 请求（新增字段）
请求新增：
- source_mode
- exam_generation_mode
- exam_match_mode
- exam_difficulty
- source_file_names

示例：
```json
{
  "source_text": "...从上传试卷抽取的正文...",
  "subject": "Mathematics",
  "grade": "Grade 8",
  "difficulty": "medium",
  "question_count": 10,
  "type_targets": {"MCQ": 8, "Fill-blank": 2},
  "source_mode": "exam",
  "exam_generation_mode": "simulation",
  "exam_match_mode": "type",
  "exam_difficulty": "solid",
  "source_file_names": ["F2 Maths 1st term 24-25 PP1 wsc.pdf"]
}
```

### 4.2 Exam 文件提取策略
- 仅允许 PDF/TXT/MD/DOCX（与后端提取能力一致）。
- 对每个 Exam 文件执行文本抽取。
- 任一文件抽取失败则阻止生成并提示具体文件名。
- 抽取文本作为 source_text 主体参与生成。

### 4.3 难度映射
- basic -> easy
- solid -> medium
- advanced -> hard

### 4.4 严格题型匹配（Exam + type 模式）
在前端根据试卷文本信号推断 type_targets（选项标记、True/False、填空线等），用于更接近原卷题型结构。

### 4.5 后端 Prompt 增强
在 Exam 模式下加入：
- source_mode=exam
- exam_generation_mode / exam_match_mode / exam_difficulty
- source_files
- 约束：
  - 术语、数字上下文、叙述风格对齐 source_text
  - type 模式下严格镜像题型模式
  - knowledge 模式下保持知识点一致，题型可变

## 5. 后端最终 Prompt（改造后样例）
```text
subject=Mathematics
grade=Grade 8
difficulty=medium
question_count=10
type_targets={"MCQ": 8, "Fill-blank": 2}
source_mode=exam
source_files=["F2 Maths 1st term 24-25 PP1 wsc.pdf"]
exam_generation_mode=simulation
exam_match_mode=type
exam_difficulty=solid
Constraints:
1) Do not include phrases like 'according to source/provided material/uploaded document'.
2) Keep questions answerable standalone.
3) For MCQ provide exactly 4 options A-D and exactly one correct option.
4) For True/False provide answer as True or False.
5) Reflect concrete concepts from source text.
6) Keep terminology, numeric context, and scenario style aligned with source_text.
7) Strictly mirror the question-type pattern and item framing style found in source_text.
source_text:
...
```

## 6. 可观测性改造
在前端结果区展示：
- generation_mode（llm / heuristic）
- warning（回退原因）

用于快速判断“与材料无关”是否由 LLM 调用失败回退导致。

## 7. 关键代码位置
- 前端 Exam 文本提取与上下文注入：
  - frontend/src/pages/teacher/assessment/AssessmentGenerate.tsx
  - frontend/src/utils/aiQuestionGenApi.ts
- 后端 preview schema 扩展：
  - backend/app/schemas/quiz/quiz_generation.py
- 后端 Prompt 增强：
  - backend/app/services/quiz/ai_question_gen_service.py

## 8. 验证要点
1. Exam 上传 PDF/TXT/MD/DOCX 后，preview 请求的 source_text 不再是文件名，而是抽取正文。
2. response 中 generation_mode 为 llm 时，题目内容应明显贴合原卷主题与数字上下文。
3. 若 generation_mode=heuristic，前端需展示 warning，避免误判为“LLM质量差”。
4. Exam 模式下上传不支持格式时，生成被阻止并提示。
