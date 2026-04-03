OpenStudy Quiz — Figma Blueprint (Accessibility Version)

建议你的 Figma 文件结构：

Page 1 — Quiz Flow
Page 2 — Accessibility System
Page 3 — Keyboard Interaction Map
Page 4 — AI Vision Flow
Page 1 — Quiz Flow

包含 6个核心界面

Frame 1 — Quiz List
Frame 2 — Quiz Overview
Frame 3 — MCQ Question
Frame 4 — MCQ with Chart + AI Vision
Frame 5 — Short Answer (Voice)
Frame 6 — Submit + Review
Frame 1 — Quiz List

尺寸建议

1440 × 900

布局

--------------------------------
OpenStudy
--------------------------------

To Do | Completed

[Card]

COMP5434
Data Structures Quiz 1
Due: Mar 6

Status: In Progress

如果 DDL < 24h

卡片左边增加

orange highlight bar

Figma组件

QuizCard
StatusBadge

交互

Click Card → Frame 2
Frame 2 — Quiz Overview

这是 盲人模式入口

布局

--------------------------------
Quiz preview
--------------------------------

Data Structures Quiz 1

Course: Data Structures
Due: Mar 6

Questions: 6
Time: 45 mins
Score: 100

--------------------------------
Accessibility (Blind Mode)

[Toggle]

TTS active — questions will be read aloud
Press Space in quiz to activate voice commands

[ Read page aloud ]
--------------------------------

[ Close ]      [ Start quiz ]
Blind Mode 打开后

TTS 自动播报

Blind mode enabled.

This quiz contains:
5 multiple choice questions
1 short answer question.

Keyboard controls:

Press 1 to 4 to select answers.
Press Enter to confirm.
Press Control + A to analyze charts.

For short answer questions,
hold Space to record voice answers.
Frame 3 — MCQ Question

布局

--------------------------------
Q1 / 6           progress bar
--------------------------------

Question text

(large readable font)

--------------------------------
[1] Option A

[2] Option B

[3] Option C

[4] Option D
--------------------------------

选项设计

large button cards
height: 80px

选中状态

blue border
light blue background
Keyboard Interaction
1 → select option 1
2 → select option 2
3 → select option 3
4 → select option 4

TTS

Option 2 selected.
Press Enter to confirm.

确认

Enter

TTS

Answer confirmed.
Moving to next question.
Frame 4 — MCQ + Chart + AI Vision

布局

--------------------------------
Q2 / 6
--------------------------------

| Question text | Chart |

--------------------------------
Options
--------------------------------

右侧

Chart / diagram
AI Vision Trigger

快捷键

Ctrl + A

系统行为

Auto screenshot chart region

然后

Open AI Vision Sidebar
AI Vision Sidebar (Overlay)

右侧滑出

宽度

360px

布局

--------------------------------
AI Vision Assistant
--------------------------------

[Chart Screenshot]

--------------------------------
AI Description

The diagram shows a binary tree.
Node A is the root node.

Node B and C are children of A.

Node B has child D.

Node C has children E and F.

Node E has child G.
--------------------------------

Listening waveform
--------------------------------

重要规则

AI MUST NOT reveal answer
如果没有图

Ctrl + A

TTS

No visual content to analyze.
Frame 5 — Short Answer (Voice Mode)

布局

--------------------------------
Q6 / 6
Short Answer
--------------------------------

Explain why hash tables
have O(1) average lookup time.

--------------------------------

[ Large Text Area ]

          🎤

--------------------------------

麦克风设计

floating center icon

状态

Purple → idle
Red → recording
Voice Interaction

触发

Hold Space

第一次使用

弹出

Voice recording notice
Recording Consent Modal
--------------------------------
Accessibility & recording notice
--------------------------------

In Blind mode, your voice will be recorded
and stored until the end of the term
for grading review.

Only the course teacher and administrators
can replay recordings.

Downloads are disabled.

Recordings are deleted after the term ends.
--------------------------------

Cancel       I Agree

接受后

Space → start recording
Release → stop recording

TTS

Recording started
Recording stopped
Audio saved successfully
Frame 6 — Submission

点击 Submit

出现

--------------------------------
Confirm submission
--------------------------------

You are about to submit your quiz.

You won't be able to change answers
after submission.

Cancel      Confirm
Frame 7 — Review Page

布局

--------------------------------
Score: 85 / 100
--------------------------------

Question 1

Your answer: B
Correct answer: C

Teacher feedback:
Good reasoning but missing complexity explanation.
Page 3 — Keyboard Interaction Map

在 Figma 单独画一页

Keyboard Controls

表格

Key	Action
1-4	Select option
Enter	Confirm answer
Ctrl + A	Analyze chart
Space (hold)	Voice recording
Esc	Cancel modal
Tab	Navigate elements
Page 4 — Accessibility System

组件库

TTS indicator
Recording indicator
Focus ring
Voice waveform
AI vision sidebar

颜色

Focus Blue
Accessibility Purple
Recording Red
最重要的设计原则（写在 Figma 里）
1. No automatic microphone activation
2. Full keyboard accessibility
3. AI must not leak answers
4. Clear audio feedback
5. Minimal cognitive load