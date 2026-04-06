## OpenStudy 项目概览

本仓库采用前后端分离结构，当前工作区包含两个顶层目录：

- `backend/`：后端服务、数据库迁移、数据导入脚本、后端测试
- `frontend/`：前端应用（学生端/教师端/管理员端页面）

### 1. 项目框架

后端（`backend/`）主要分层：

- `app/api/v1`：FastAPI 路由层（Quiz、Paper、AI 评分等接口）
- `app/services`：业务逻辑层（attempt 流程、评分、AI 建议与采纳）
- `app/models`：SQLAlchemy ORM 模型层
- `app/schemas`：Pydantic 请求/响应模型层
- `alembic/versions`：数据库迁移版本管理
- `scripts`：PDF 抽取与批量导入脚本
- `tests`：unit + integration 测试

前端（`frontend/`）主要结构：

- `src/pages`：页面级组件（student/teacher/admin）
- `src/components`：可复用 UI 与业务组件
- `src/utils`：通用工具（语音、API client、模块 API 封装）

### 2. 技术栈

后端：

- Python 3.11+
- FastAPI（Web API 框架）
- SQLAlchemy 2.x（异步 ORM）
- Alembic（数据库迁移）
- Pydantic v2（数据校验）
- Pytest（测试）
- OpenAI SDK（AI 评分建议，兼容 OpenAI/OhMyGPT 网关）

数据库：

- 开发环境：PostgreSQL（Supabase）
- 目标方向：MySQL（生产统一方向）

前端：

- React 18 + TypeScript
- Vite 6（构建与开发服务器）
- React Router（路由）
- Radix UI + Lucide + Motion + Sonner（UI 组件与交互）

### 3. 快速启动（开发）

后端：

```bash
cd /workspaces/group_project-team_5/backend
# 建议先准备 .venv 与依赖，再启动
```

前端：

```bash
cd /workspaces/group_project-team_5/frontend
npm i
npm run dev
```

### 4. 关键文档入口

- 最终接口文档：`API_FINAL_DOCS.md`
- AI 辅助评分方案：`AI_PAPER_SCORING_IMPLEMENTATION_PLAN_V1.md`

## 数据录入说明

如果你手上已经有教材或试卷数据，建议按当前数据库结构分两条线录入：教材入库和试卷入库。当前项目没有独立的导入界面，所以最稳妥的方式是先整理成结构化文件，再通过 SQL 或 Python 脚本批量写入 MySQL。

### 1. 教材数据怎么录入

教材表对应的是 `textbooks`。每条记录至少需要这些字段：

- publisher：出版社
- grade：年级
- subject：学科
- semester：vol1 或 vol2
- content：教材正文或教材内容摘要

如果你只是想让 Quiz 生成接口可以按教材找题，先录入教材表即可；后续再把章节和题库题目补进去。

### 2. 试卷数据怎么录入

试卷结构对应的是 `papers`、`paper_sections`、`paper_questions`、`paper_question_options`。

推荐录入顺序：

1. 先创建 paper 主记录。
2. 再创建 paper_sections。
3. 再创建 paper_questions。
4. 最后创建 paper_question_options。

注意：当前 schema 里 `paper_questions.bank_question_id` 是必填字段，所以每道试卷题都必须先有一条题库题目作为来源。

### 3. 题库数据怎么录入

如果你希望试卷也能被 Quiz 生成流程复用，需要先录入题库：

- question_bank_items：题库主表
- question_bank_options：选择题选项

题库记录建议至少包含：

- grade
- subject
- question_type
- prompt
- difficulty
- answer_text
- explanation
- chapter
- source_type
- source_id

其中 `source_type` 可以取 paper、exercise、textbook、ai_generated、manual。`source_id` 用来标识来源对象。

### 4. 推荐的导入顺序

如果你同时有教材、试卷和题库，建议按这个顺序导入：

1. 先导入教材
2. 再导入题库
3. 再导入试卷主表和题目明细

这样可以保证后续的试卷题目能够正确关联到题库来源。

### 5. 最实用的录入方式

如果数据量不大，可以直接用 MySQL 客户端手工插入。

如果数据量比较大，建议准备一个 JSON 或 CSV 文件，再写一个一次性的 Python 导入脚本，使用项目里的数据库连接配置批量写入。

### 6. 我建议你给我的数据格式

你如果愿意，我可以直接帮你生成导入脚本。你只需要把数据整理成下面两种格式中的一种：

- 教材：出版社、年级、学科、册次、内容
- 试卷：试卷标题、年级、学科、总分、时长、题型、题干、答案、解析、选项、章节、来源

你也可以直接把现有的 Excel 字段名发给我，我帮你映射成数据库字段，并补一份可执行的导入脚本。

## PDF 自动抽取并入库

当前仓库已经提供了从 PDF 到数据库的可执行流水线。

### 1. 抽取 PDF 为结构化 JSON

```bash
cd /workspaces/group_project-team_5/backend
.venv/bin/python scripts/extract_pdfs_to_normalized.py \
	--pdf-dir paper_exapmle \
	--normalized-dir paper_exapmle/normalized \
	--manifest paper_exapmle/import_manifest.generated.json \
	--course-id 1
```

### 2. 先做 dry-run 校验

```bash
cd /workspaces/group_project-team_5/backend
PYTHONPATH=. .venv/bin/python scripts/import_documents.py paper_exapmle/import_manifest.generated.json --created-by 1 --dry-run
```

### 3. 执行正式入库

```bash
cd /workspaces/group_project-team_5/backend
PYTHONPATH=. .venv/bin/python scripts/import_documents.py paper_exapmle/import_manifest.generated.json --created-by 1
```

### 4. 说明

- 导入脚本会跳过同名试卷，避免重复导入同一份试卷。
- 教材内容过长时会自动截断，避免 MySQL `TEXT` 长度报错。
- 当前抽取属于启发式抽取，题目内容可能需要人工二次校对。

## 接口文档

- 最终接口文档（唯一入口）：`API_FINAL_DOCS.md`
- AI 辅助评分实施方案（规划）：`AI_PAPER_SCORING_IMPLEMENTATION_PLAN_V1.md`

历史参考文档：

- `API_QUIZ_DOCS.md`
- `API_PAPER_DOCS.md`
- `API_QUIZ_CONTRACT_V2.md`
- `API_PAPER_CONTRACT_V1.md`
- `API_PAPER_CONTRACT_V2_ATTEMPTS.md`
- `PAPER_ATTEMPTS_ACCEPTANCE_CHECKLIST_V1.md`
- `PAPER_ATTEMPTS_MIGRATION_PLAN_V1_REVIEW.md`
- `API_INTERFACE_CHANGELOG.md`
- `QUIZ_ACCEPTANCE_CHECKLIST.md`
- `QUIZ_ACCEPTANCE_CHECKLIST_V2.md`
