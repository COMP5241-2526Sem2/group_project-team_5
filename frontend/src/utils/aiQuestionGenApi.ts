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

export interface AIQuestionGenPreviewJobCreateResponseDto {
  job_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
}

export interface AIQuestionGenPreviewJobStatusResponseDto {
  job_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  result: AIQuestionGenPreviewResponseDto | null;
  error: string | null;
  updated_at: string;
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

export async function createPreviewGenerateJobApi(
  payload: AIQuestionGenPreviewRequestDto,
): Promise<AIQuestionGenPreviewJobCreateResponseDto> {
  return apiRequest<AIQuestionGenPreviewJobCreateResponseDto>(
    "/quiz-generation/preview/jobs",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "teacher",
  );
}

export async function getPreviewGenerateJobStatusApi(
  jobId: string,
): Promise<AIQuestionGenPreviewJobStatusResponseDto> {
  return apiRequest<AIQuestionGenPreviewJobStatusResponseDto>(
    `/quiz-generation/preview/jobs/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
    },
    "teacher",
  );
}
