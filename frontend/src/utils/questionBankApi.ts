import { apiRequest } from "./apiClient";

export interface QuestionBankSetQuestionDto {
  id: string;
  type: string;
  prompt: string;
  image_url?: string | null;
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
  can_delete?: boolean;
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

export interface ManualQuestionOptionPayload {
  option_key: string;
  option_text: string;
}

export interface ManualQuestionPayload {
  prompt: string;
  difficulty: string;
  answer: string;
  options?: ManualQuestionOptionPayload[] | null;
}

export interface ManualSetCreatePayload {
  question_type: string;
  subject: string;
  grade: string;
  semester?: string | null;
  chapter: string;
  publisher?: string | null;
  questions: ManualQuestionPayload[];
}

export interface ManualSetCreatedDto {
  set_id: string;
  items_created: number;
}

export async function createManualQuestionBankSetApi(
  body: ManualSetCreatePayload,
): Promise<ManualSetCreatedDto> {
  return apiRequest<ManualSetCreatedDto>(
    "/question-bank/sets/manual",
    { method: "POST", body: JSON.stringify(body) },
    "teacher",
  );
}

export interface DeleteSetByKeyPayload {
  subject: string;
  grade: string;
  semester?: string | null;
  chapter: string;
  question_type: string;
}

export interface DeleteSetByKeyResultDto {
  deleted: number;
}

export async function deleteQuestionBankSetByKeyApi(
  body: DeleteSetByKeyPayload,
): Promise<DeleteSetByKeyResultDto> {
  return apiRequest<DeleteSetByKeyResultDto>(
    "/question-bank/sets/delete-by-key",
    { method: "POST", body: JSON.stringify(body) },
    "teacher",
  );
}
