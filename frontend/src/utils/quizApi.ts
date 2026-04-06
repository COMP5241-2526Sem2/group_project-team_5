import { apiRequest } from "./apiClient";

type QuizQuestionType = "MCQ_SINGLE" | "MCQ_MULTI" | "TRUE_FALSE" | "FILL_BLANK" | "SHORT_ANSWER" | "ESSAY";

export interface QuizListItemDto {
  quiz_id: number;
  title: string;
  course_id: number;
  course_name: string;
  due_at: string | null;
  question_count: number;
  mcq_count: number;
  sa_count: number;
  status: "Not started" | "In progress" | "Completed";
  submitted_at: string | null;
  score: number | null;
  total_score: number;
  mcq_correct: number | null;
}

export interface QuizListResponseDto {
  items: QuizListItemDto[];
}

export interface QuizDetailItemDto {
  question_id: number;
  order: number;
  type: QuizQuestionType;
  prompt: string;
  score: number;
  options: Array<{ key?: string; option_key?: string; text?: string; option_text?: string }> | null;
}

export interface QuizDetailDto {
  quiz_id: number;
  title: string;
  course_id: number;
  course_name: string;
  due_at: string | null;
  duration_min: number | null;
  total_score: number;
  question_count: number;
  items: QuizDetailItemDto[];
}

export interface QuizAttemptDto {
  attempt_id: number;
  quiz_id: number;
  status: "in_progress" | "submitted" | "graded";
  started_at: string | null;
  submitted_at: string | null;
}

export interface QuizReviewItemDto {
  question_id: number;
  order: number;
  type: QuizQuestionType;
  prompt: string;
  options: Array<{ key?: string; option_key?: string; text?: string; option_text?: string }> | null;
  my_answer: { selected_option?: string; text_answer?: string };
  correct_answer: { selected_option?: string; text_answer?: string } | null;
  is_correct: boolean | null;
  awarded_score: number | null;
  teacher_feedback: string | null;
}

export interface QuizReviewDto {
  attempt_id: number;
  quiz_id: number;
  score: number;
  total_score: number;
  mcq_correct: number;
  mcq_total: number;
  items: QuizReviewItemDto[];
}

export interface WriteAnswerItem {
  question_id: number;
  selected_option?: string;
  text_answer?: string;
}

export async function fetchTodoQuizzesApi(): Promise<QuizListItemDto[]> {
  const res = await apiRequest<QuizListResponseDto>("/quizzes/todo", {}, "student");
  return res.items;
}

export async function fetchCompletedQuizzesApi(): Promise<QuizListItemDto[]> {
  const res = await apiRequest<QuizListResponseDto>("/quizzes/completed", {}, "student");
  return res.items;
}

export async function fetchQuizDetailApi(quizId: number): Promise<QuizDetailDto> {
  return apiRequest<QuizDetailDto>(`/quizzes/${quizId}`, {}, "student");
}

export async function createOrGetAttemptApi(quizId: number): Promise<QuizAttemptDto> {
  return apiRequest<QuizAttemptDto>(`/quizzes/${quizId}/attempts`, { method: "POST" }, "student");
}

export async function saveAttemptAnswersApi(attemptId: number, answers: WriteAnswerItem[]): Promise<void> {
  await apiRequest(`/attempts/${attemptId}/answers`, {
    method: "PUT",
    body: JSON.stringify({ answers }),
  }, "student");
}

export async function submitAttemptApi(attemptId: number): Promise<void> {
  await apiRequest(`/attempts/${attemptId}/submit`, { method: "POST" }, "student");
}

export async function fetchReviewApi(attemptId: number): Promise<QuizReviewDto> {
  return apiRequest<QuizReviewDto>(`/attempts/${attemptId}/review`, {}, "student");
}
