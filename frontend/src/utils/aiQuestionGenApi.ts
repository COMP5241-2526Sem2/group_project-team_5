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
  subject: string;
  grade: string;
  difficulty: "easy" | "medium" | "hard";
  question_count: number;
  type_targets?: Record<string, number>;
  source_mode?: "upload" | "text" | "textbook" | "exam" | "questions";
  exam_generation_mode?: "error-questions" | "simulation";
  exam_match_mode?: "type" | "knowledge";
  exam_difficulty?: "basic" | "solid" | "advanced";
  source_file_names?: string[];
  question_input_mode?: "paste" | "bank";
  derive_mode?: "variation" | "extension" | "contrast";
  seed_questions?: string[];
}

export interface AIQuestionGenPreviewResponseDto {
  questions: AIQuestionGenPreviewQuestionDto[];
  generation_mode?: "llm" | "heuristic";
  warning?: string | null;
}

export interface AIQuestionGenIllustrationRequestItemDto {
  question_id: string;
  prompt: string;
  question_type: string;
}

export interface AIQuestionGenIllustrationRequestDto {
  style: "auto" | "diagram" | "chart" | "photo" | "scientific";
  style_prompt?: string | null;
  questions: AIQuestionGenIllustrationRequestItemDto[];
}

export interface AIQuestionGenIllustrationResultDto {
  question_id: string;
  image_url: string;
  used_fallback?: boolean;
  error?: string | null;
}

export interface AIQuestionGenIllustrationResponseDto {
  images: AIQuestionGenIllustrationResultDto[];
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

export async function generateQuestionIllustrationsApi(
  payload: AIQuestionGenIllustrationRequestDto,
): Promise<AIQuestionGenIllustrationResponseDto> {
  return apiRequest<AIQuestionGenIllustrationResponseDto>(
    "/quiz-generation/illustrations",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "teacher",
  );
}
