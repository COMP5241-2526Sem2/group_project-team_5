# OpenStudy Frontend — 路由导航文档

> 项目根路径：`http://localhost:3000`（开发服务器默认端口）
> 基于 `src/routes.tsx` 生成

---

## 目录

- [认证 Auth](#认证-auth)
- [管理员 Admin](#管理员-admin)
- [学生 Student](#学生-student)
- [教师 Teacher](#教师-teacher)

---

## 认证 Auth

| 路由 | 说明 | 组件 |
|---|---|---|
| `/` | 首页，重定向到登录 | `Login` |
| `/login` | 登录页 | `Login` |
| `/register` | 注册页 | `Register` |

---

## 管理员 Admin

| 路由 | 说明 | 组件 |
|---|---|---|
| `/admin` | 管理员首页（重定向至 `/admin/users`） | `UsersManagement` |
| `/admin/users` | 用户管理 | `UsersManagement` |
| `/admin/courses` | 课程管理 | `CoursesManagement` |

> 另有 `pages/admin/Dashboard.tsx`（文件存在，暂未注册到路由）

---

## 学生 Student

| 路由 | 说明 | 组件 |
|---|---|---|
| `/student` | 学生首页 | `StudentHome` |
| `/student/home` | 学生首页（同上） | `StudentHome` |
| `/student/quiz` | 测验列表 | `QuizList` |
| `/student/quiz/:quizId/take` | 进行测验 | `QuizTaking` |
| `/student/quiz/:quizId/review` | 回顾测验答案 | `QuizReview` |

---

## 教师 Teacher

| 路由 | 说明 | 组件 |
|---|---|---|
| `/teacher` | 教师首页（重定向至 `/teacher/lessons`） | `TeacherLessons` |
| `/teacher/lessons` | 课程列表 | `TeacherLessons` |
| `/teacher/labs` | 实验室管理 | `LabsManagement` |
| `/teacher/assessment` | 评测首页（重定向至 `/teacher/assessment/generate`） | `TeacherAssessment` |
| `/teacher/assessment/generate` | 生成试卷 | `AssessmentGenerate` |
| `/teacher/assessment/ai-paper` | AI 出题 | `AssessmentAIPaper` |
| `/teacher/assessment/library` | 题目库 | `AssessmentLibrary` |
| `/teacher/assessment/papers` | 历史试卷 | `AssessmentPapers` |
| `/teacher/assessment/grading` | 阅卷评分 | `AssessmentGrading` |
| `/teacher/assessment/:id` | 试卷详情 | `AssessmentDetailPage` |
| `/teacher/test/:testId` | 测试详情 | `TestDetail` |
| `/teacher/lesson-editor/:id` | 课程编辑器 | `LessonEditor` |
| `/teacher/lesson-present/:id` | 课程演示模式 | `PresentationMode` |

> 另有 `pages/teacher/Dashboard.tsx`、`pages/teacher/TeacherAssessmentList.tsx`、`pages/teacher/TeacherAssessmentDetail.tsx`（文件存在，暂未注册到路由）

---

## 快速访问链接

> 在浏览器地址栏直接输入访问（需先启动开发服务器）

### 认证
- 登录：http://localhost:3000/login
- 注册：http://localhost:3000/register

### 管理员
- 用户管理：http://localhost:3000/admin/users
- 课程管理：http://localhost:3000/admin/courses

### 学生
- 首页：http://localhost:3000/student/home
- 测验列表：http://localhost:3000/student/quiz

### 教师
- 课程列表：http://localhost:3000/teacher/lessons
- 实验室：http://localhost:3000/teacher/labs
- 生成试卷：http://localhost:3000/teacher/assessment/generate
- AI 出题：http://localhost:3000/teacher/assessment/ai-paper
- 题目库：http://localhost:3000/teacher/assessment/library
- 历史试卷：http://localhost:3000/teacher/assessment/papers
- 阅卷评分：http://localhost:3000/teacher/assessment/grading
