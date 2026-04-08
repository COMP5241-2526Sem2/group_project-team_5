import { apiRequest } from "./apiClient";

export interface AIQuestionGenPreviewQuestionOptionDto {
  key: string;
  text: string;
  correct: boolean;
}

export interface AIQuestionGenPreviewQuestionDto {
  type: "MCQ" | "True/False" | "Fill-blank" | "Short Answer" | "Essay";
  prompt: string;
  options: AIQuestionGenPreviewQuestionOptionDto[];
  answer: string | null;
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
}

export interface AIQuestionGenPreviewRequestDto {
  source_text: string;
  /** Omitted when user provides free-form text only (e.g. Enter Text source). */
  subject?: string;
  grade?: string;
  /** Only used in Exam Paper source mode. */
  task_type?: "simulation" | "error_based";
  /** Only used in Exam Paper source mode. */
  match_mode?: "type" | "knowledge";
  difficulty: "easy" | "medium" | "hard";
  question_count: number;
  type_targets?: Record<string, number>;
}

export interface AIQuestionGenPreviewResponseDto {
  questions: AIQuestionGenPreviewQuestionDto[];
}

export async function previewGenerateQuestionsApi(
  payload: AIQuestionGenPreviewRequestDto,
): Promise<AIQuestionGenPreviewResponseDto> {
  return apiRequest<AIQuestionGenPreviewResponseDto>(
    "/quiz-generation/preview",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "teacher",
  );
}

export async function previewGenerateQuestionsMultimodalApi(
  payload: AIQuestionGenPreviewRequestDto,
  files: File[],
): Promise<AIQuestionGenPreviewResponseDto> {
  const form = new FormData();
  form.append("source_text", payload.source_text);
  if (payload.subject) form.append("subject", payload.subject);
  if (payload.grade) form.append("grade", payload.grade);
  if (payload.task_type) form.append("task_type", payload.task_type);
  if (payload.match_mode) form.append("match_mode", payload.match_mode);
  form.append("difficulty", payload.difficulty);
  form.append("question_count", String(payload.question_count));
  if (payload.type_targets) form.append("type_targets", JSON.stringify(payload.type_targets));
  for (const f of files) form.append("files", f);
  return apiRequest<AIQuestionGenPreviewResponseDto>(
    "/quiz-generation/preview-multimodal",
    {
      method: "POST",
      body: form,
    },
    "teacher",
  );
}
