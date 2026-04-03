# Vibe Coding Prompt（学生端 Quiz + 盲人语音无障碍 + 录音回溯）

把下面整段内容复制到 Cursor / 你的 AI 编码助手中使用（这是最终 Prompt）。

---

## 背景
现在要新增一个 `Quiz` 功能：侧栏新增 `Quiz` 入口，包含 Quiz 列表、概览、作答、提交、已完成复盘，并重点支持**盲人学生**通过语音完成测验。  
题目由教师端生成并推送到学生端；本次只实现学生端功能，但必须预留/对接所需 API（尤其是录音回放需求）。

## 目标（必须完成）
实现学生端 Quiz 功能，满足以下硬性要求：

### 1) 信息架构与页面
新增侧栏入口 `Quiz`，并实现以下页面（路由以现有项目为准）：
- `QuizList`：展示 `To Do` 与 `Completed` 两区块（不分页）
- `QuizOverview`（未完成）：显示 DDL、课程、题目数；询问是否开始作答
- `QuizTaking`：一次只展示一道题（共 6 题：5 MCQ + 1 Short answer）
- `QuizResultOverview`（已完成）：显示 `Correct` 与 `Score`
- `QuizReview`：逐题展示我的作答与正确答案；简答题显示教师评语；布局尽量与作答页类似

### 2) 列表规则（QuizList）
- **仅展示学生已选修课程**的 Quiz（只显示“我需要完成的”）。
- `To Do` 只展示**当前开放可作答**的 Quiz（不展示未来未开始的 Quiz）。
- **排序**：按 `Due (DDL)` 从近到远升序。
- 状态标签（英文文案固定）：
  - `Not started`：未开始作答
  - `In progress`：已开始但未提交
  - `Due soon`：距离 DDL ≤ 24 小时且未提交
- 空/错状态（英文文案固定）：
  - `No quizzes to do right now.`
  - `You haven't completed any quizzes yet.`
  - `Failed to load quizzes. Please try again.` + `Retry`

### 3) 概览页交互（QuizOverview）
未完成 Quiz 概览页必须显示：
- `Course:`、`Due:`、`Questions: 6 (5 MCQ + 1 Short answer)`
- 主按钮：`Start quiz`
- 次按钮：`Back to list`
- 无障碍开关：`Accessibility (Blind mode)`（见第 5 点）

已完成 Quiz 概览页（QuizResultOverview）必须显示：
- `Submitted:`
- `Correct: {mcqCorrect} / 5 (MCQ)`
- `Score: {score} / {totalScore}`
- 主按钮：`Review answers`
- 次按钮：`Back to list`

### 4) 作答页规则（QuizTaking）
- **一次只显示一题**（题干 + 选项或简答输入）。
- 顶部显示 `Progress: Qx/6`，右上角提供题号导航 `1..6`，并用视觉标记“已作答”。
- **自动跳题**：答完当前题后进入“确认态”，确认后自动进入下一题。
- 学生可通过题号导航切换任意题目。
- 最后一题右下角显示 `Submit`，点击后必须出现二次确认弹窗：
  - Title：`Confirm submission`
  - Body：`You are about to submit your quiz. You won't be able to change your answers after submission.`
  - Buttons：`Cancel` / `Confirm submit`
- 提交成功：toast/提示 `Submitted successfully.` 并自动回到 `QuizList`。
- 提交失败：`Submission failed. Please try again.` + `Retry`（不得丢答案）。

### 5) 盲人模式（最核心：必须可用）
#### 5.1 身份来源与兜底开关
- 盲人学生身份来自**学生档案标记**（例如 `studentProfile.accessibility.blind = true`）。
- 若标记为真：`Blind mode` 默认开启。
- **必须提供手动开关作为兜底**：即使档案未标记，学生也能手动开启；档案标记用户也能手动关闭。

#### 5.2 技术路线
- 朗读（TTS）+ 语音识别（STT）：优先使用浏览器 **Web Speech API**。
- 原始录音：使用 **MediaRecorder** 录制音频（例如 `audio/webm`）。
- 若 Web Speech 或麦克风不可用：降级为键盘操作 + ARIA（仍能完成 Quiz）。

#### 5.3 知情同意（因为需要保存原始音频）
首次开启盲人模式（或首次进入作答页）必须弹窗告知并征求同意（英文文案固定）：
- Title：`Accessibility & recording notice`
- Body：`In Blind mode, your voice will be recorded and stored until the end of the term for grading review. Only the course teacher and administrators can replay it online. Downloads are disabled.`
- Buttons：`I agree` / `Cancel`
若用户选择 `Cancel`：盲人模式不启用，但仍可继续用非语音方式作答。

#### 5.4 每题强制确认（语音与非语音都一致）
你必须实现“确认态”，**不确认不得自动进入下一题**。
- MCQ：选中/识别到选项后，系统读回 `You chose B: {optionText}. Confirm? Say 'Confirm' or 'Change'.`
- Short answer：听写分段追加后读回 `Added: '{text}'. Confirm? Say 'Confirm' or 'Change'.`

#### 5.5 语音指令（英文口令）
最小可用指令集（必须支持）：
- 作答：`A` `B` `C` `D`
- 确认/修改：`Confirm` / `Change`
- 导航：`Next` / `Previous` / `Go to question {n}`
- 朗读：`Repeat` / `Stop`
- 查看当前答案：`My answer`
- 提交：`Submit`（触发提交确认）
- 提交确认：`Confirm submit` / `Cancel`
- 帮助：`Help`

#### 5.6 语音提交防误触（双重确认）
- 学生说 `Submit` 后，必须朗读摘要（至少包含已答题情况），再要求说 `Confirm submit` 才能提交。

#### 5.7 复盘页盲人朗读（必须覆盖教师评语）
在 `QuizReview` 中，盲人模式需支持朗读：
- 题干
- 我的作答
- 正确答案
- 简答题教师评语（长评语分段朗读，每段后提示 `Continue`/`Stop`；至少要有“继续/停止”的机制）

### 6) 原始音频留存与教师端回溯（必须对接）
#### 6.1 录制范围
仅在盲人模式开启且用户同意后录制原始音频：
- MCQ：学生口述选项的音频片段（按题目粒度归档）
- SA：听写音频（可按段或整题；实现上建议按段便于上传重试）

#### 6.2 关联与上传
每段/每题音频必须与以下信息绑定上传：
- `attemptId`
- `questionId`
- `studentId`
并记录 `contentType`、`durationMs` 等元数据。

#### 6.3 生命周期与权限（后端契约要求）
- 音频保存到课程/学期结束自动删除（retention）。
- 只有 **任课教师 + 管理员**可在线回放（stream），**禁止下载**。
- 回放需审计（谁/何时/哪段）。

### 7) UI 文案（必须按此实现）
列表页：
- Title：`Quiz`
- Subtitle：`Only quizzes from your enrolled courses are shown.`
- Sorting hint：`Sorted by due date: soonest first`
按钮：
- To Do 卡片：`View details`
- Completed 卡片：`View result`
- Overview：`Start quiz` / `Back to list`
- Result overview：`Review answers` / `Back to list`

### 8) 数据与 API（按项目实际对接；必要时先做 mock）
请在实现中定义清晰的类型（Quiz/Question/Attempt/Answer/Review/AudioMeta），并对接或 mock 以下能力：
- 获取 ToDo Quiz 列表（已按 enroll 过滤、仅开放可作答）
- 获取 Completed Quiz 列表（含 score/正确数摘要）
- 获取 Quiz 详情（题目、DDL、课程信息）
- 创建/获取 attempt
- 保存草稿答案（每题确认后保存）
- 提交 attempt
- 获取 review（逐题：我的答案/正确答案/教师评语）
- 上传音频（带 attemptId/questionId/studentId 元数据）

### 9) 工程实现指令（让你自适应我的代码库）
按以下顺序做，不要拍脑袋写路径：
1. 先阅读并复用现有 Sidebar/Router/Layout/Card 组件与样式体系。
2. 增加 `Quiz` 入口与路由，保证从侧栏可达。
3. 实现 5 个页面并抽共享组件（建议但不强制命名）：
   - `QuizCard`
   - `QuestionNav`
   - `VoicePanel`（可键盘聚焦）
   - `ConfirmModal`
4. 语音与录音封装成独立模块：
   - `SpeechTTS`（队列朗读、可中断）
   - `SpeechSTT`（命令识别、低置信度重试）
   - `Recorder`（MediaRecorder，产出 blob + 元数据）
   - `CommandParser`（把转写映射为指令：A/B/C/D/Confirm/...）
   - `BlindModeController`（把“题目朗读→监听→确认态→保存→跳题”串起来）
5. 无障碍与键盘可达：
   - 所有按钮/导航可 Tab 聚焦
   - 题号导航可用键盘切换
   - ARIA：对题干、选项、结果区域提供可读结构
6. 可靠性：
   - 保存草稿失败要提示并可重试；不得丢答案
   - 音频上传失败进入重试队列；提交时也要继续上传（不阻塞提交，但要保证最终可回溯）

### 10) Done 定义（自测清单）
在提交实现前，至少完成以下手动自测：
- QuizList：To Do/Completed 分区、排序、空态/错态文案正确。
- 未完成 Overview：Start/Back 正常；盲人模式开关存在，档案标记默认 On。
- 作答：一次一题；题号切换；MCQ/SA 输入与“确认态”生效；最后 Submit 二次确认；成功回列表。
- 盲人模式：题目与选项可朗读；语音 A/B/C/D 可选；Confirm/Change 可控；语音 Submit 双重确认。
- 录音：盲人模式下能生成并上传音频元数据；能与 attempt/question 正确关联（至少在网络面板/日志中可验证）。
- 复盘：显示答对题数；逐题显示我的作答/正确答案；简答题显示教师评语；盲人模式可朗读这些内容。

---

## 输出要求
在实现 PR / 变更说明中，清晰列出：
- 新增页面与路由
- 语音/录音模块的封装位置与用法
- API 契约与 mock 策略（如有）
- 已通过的自测清单

