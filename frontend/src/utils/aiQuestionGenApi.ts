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
