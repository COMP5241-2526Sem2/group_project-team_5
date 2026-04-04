# OpenStudy Frontend

OpenStudy 的前端项目，基于 React + Vite + React Router 构建。  
当前代码已包含多角色教学场景页面（认证、管理员、学生、教师）与一批可直接运行的 mock 数据/交互流程。

## 技术栈

- React 18
- Vite 6
- React Router
- Tailwind CSS 4（含部分内联样式页面）
- Lucide Icons

## 环境要求

- Node.js 18+（建议 LTS）
- npm 9+

## 本地运行

```bash
npm install
npm run dev
```

默认会启动在：`http://localhost:3000`（见 `vite.config.ts`）。

## 构建

```bash
npm run build
```

构建产物输出目录：`build/`。

## 主要目录结构

```text
frontend/
├─ src/
│  ├─ pages/                  # 路由页面（按角色拆分）
│  │  ├─ admin/
│  │  ├─ student/
│  │  └─ teacher/
│  ├─ components/
│  │  ├─ admin/
│  │  ├─ student/
│  │  ├─ teacher/
│  │  ├─ labs/                # 实验组件与 AI 生成实验相关逻辑
│  │  └─ ui/                  # 通用 UI 组件
│  ├─ routes.tsx              # 全局路由定义
│  ├─ App.tsx                 # RouterProvider 入口
│  └─ main.tsx                # React 挂载入口
├─ ROUTES.md                  # 路由清单文档
└─ vite.config.ts
```

## 功能模块概览

- 认证：登录、注册页面。
- 管理员：用户管理、课程管理（含搜索、筛选、分页、弹窗操作）。
- 学生：测验列表、开始答题、成绩预览与回顾。
- 教师：
  - 课程管理（`/teacher/lessons`）
  - 实验室管理（内置实验 + AI 生成实验 + 实时预览）
  - 试卷评测工作流（生成、题库、历史、阅卷、详情页）

## 常用入口路由

- 登录：`/login`
- 注册：`/register`
- 管理员用户管理：`/admin/users`
- 管理员课程管理：`/admin/courses`
- 学生首页：`/student/home`
- 学生测验列表：`/student/quiz`
- 教师课程：`/teacher/lessons`
- 教师实验室：`/teacher/labs`
- 教师评测：`/teacher/assessment/generate`

完整路由请查看 `ROUTES.md` 与 `src/routes.tsx`。

## 开发说明

- 当前大量页面使用前端 mock 数据，便于 UI/交互联调。
- 路由真实来源是 `src/routes.tsx`；如新增页面，请同步更新 `ROUTES.md`。
- 若后续接入后端 API，建议优先替换 `pages/*` 中的 mock 请求与本地状态逻辑。