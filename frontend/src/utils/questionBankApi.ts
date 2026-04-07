import { apiRequest } from "./apiClient";

export interface QuestionBankSetQuestionDto {
  id: string;
  type: string;
  prompt: string;
  options?: string[] | null;
  answer?: string | null;
  difficulty: string;
}

export interface QuestionBankSetDto {
  id: string;
  type: string;
  subject: string;
  grade: string;
  semester: string;
  difficulty: string;
  chapter: string;
  source: string;
  ai_generated: boolean;
  questions: QuestionBankSetQuestionDto[];
}

export interface QuestionBankSetsResponseDto {
  sets: QuestionBankSetDto[];
}

export async function listQuestionBankSetsApi(
  params: Record<string, string | undefined> = {},
): Promise<QuestionBankSetsResponseDto> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiRequest<QuestionBankSetsResponseDto>(`/question-bank/sets${suffix}`, { method: "GET" }, "teacher");
}
