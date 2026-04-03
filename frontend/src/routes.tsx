import { createBrowserRouter, Navigate } from "react-router";
import Login from "./pages/Login";
import Register from "./pages/Register";
// Admin
import UsersManagement from "./pages/admin/UsersManagement";
import CoursesManagement from "./pages/admin/CoursesManagement";
// Student
import StudentHome from "./pages/student/StudentHome";
import QuizList from "./pages/student/QuizList";
import QuizTaking from "./pages/student/QuizTaking";
import QuizReview from "./pages/student/QuizReview";
// Teacher
import TeacherAssessment from "./pages/teacher/Assessment";
import AssessmentDetailPage from "./pages/teacher/AssessmentDetailPage";
import TestDetail from "./pages/teacher/TestDetail";
import TeacherLessons from "./pages/teacher/TeacherLessons";
import LessonEditor from "./pages/teacher/LessonEditor";
import PresentationMode from "./pages/teacher/PresentationMode";
import LabsManagement from "./pages/teacher/LabsManagement";

export const router = createBrowserRouter([
  // Auth
  { path: "/",                                     element: <Login /> },
  { path: "/login",                                element: <Login /> },
  { path: "/register",                             element: <Register /> },
  // Admin
  { path: "/admin",                                element: <Navigate to="/admin/users" replace /> },
  { path: "/admin/users",                          element: <UsersManagement /> },
  { path: "/admin/courses",                        element: <CoursesManagement /> },
  // Student
  { path: "/student",                              element: <StudentHome /> },
  { path: "/student/home",                         element: <StudentHome /> },
  { path: "/student/quiz",                         element: <QuizList /> },
  { path: "/student/quiz/:quizId/take",            element: <QuizTaking /> },
  { path: "/student/quiz/:quizId/review",          element: <QuizReview /> },
  // Teacher — assessment sub-routes (must be before /:id wildcard)
  { path: "/teacher",                              element: <Navigate to="/teacher/lessons" replace /> },
  { path: "/teacher/assessment",                   element: <Navigate to="/teacher/assessment/generate" replace /> },
  { path: "/teacher/assessment/generate",          element: <TeacherAssessment /> },
  { path: "/teacher/assessment/ai-paper",          element: <TeacherAssessment /> },
  { path: "/teacher/assessment/library",           element: <TeacherAssessment /> },
  { path: "/teacher/assessment/papers",            element: <TeacherAssessment /> },
  { path: "/teacher/assessment/grading",           element: <TeacherAssessment /> },
  { path: "/teacher/assessment/:id",               element: <AssessmentDetailPage /> },
  { path: "/teacher/test/:testId",                 element: <TestDetail /> },
  { path: "/teacher/lessons",                      element: <TeacherLessons /> },
  { path: "/teacher/labs",                         element: <LabsManagement /> },
  { path: "/teacher/lesson-editor/:id",            element: <LessonEditor /> },
  { path: "/teacher/lesson-present/:id",           element: <PresentationMode /> },
]);