import { apiRequest } from "./apiClient";

export interface PaperListItemDto {
  paper_id: number;
  title: string;
  course_id: number;
  course_name: string;
  grade: string;
  subject: string;
  semester: string | null;
  exam_type: string;
  status: "draft" | "published" | "closed";
  total_score: number;
  duration_min: number;
  question_count: number;
  quality_score: number | null;
  created_at: string;
}

export interface PaperListResponseDto {
  items: PaperListItemDto[];
  page: number;
  page_size: number;
  total: number;
}

export interface PaperDetailOptionDto {
  key: string;
  text: string;
}

export interface PaperDetailQuestionDto {
  paper_question_id: number;
  order: number;
  type: string;
  prompt: string;
  difficulty: string | null;
  score: number;
  options: PaperDetailOptionDto[];
}

export interface PaperDetailSectionDto {
  section_id: number;
  order: number;
  title: string;
  question_type: string;
  question_count: number;
  score_each: number;
  total_score: number;
  questions: PaperDetailQuestionDto[];
}

export interface PaperDetailDto {
  paper_id: number;
  title: string;
  course_id: number;
  course_name: string;
  grade: string;
  subject: string;
  semester: string | null;
  exam_type: string;
  status: "draft" | "published" | "closed";
  total_score: number;
  duration_min: number;
  question_count: number;
  quality_score: number | null;
  created_at: string;
  sections: PaperDetailSectionDto[];
}

export interface PaperCreateQuestionOptionDto {
  key: string;
  text: string;
  is_correct?: boolean;
}

export interface PaperCreateQuestionDto {
  type: string;
  prompt: string;
  difficulty?: string | null;
  explanation?: string | null;
  answer?: string | null;
  options?: PaperCreateQuestionOptionDto[];
  score?: number;
}

export interface PaperCreateRequestDto {
  title: string;
  grade: string;
  subject: string;
  semester?: string | null;
  exam_type?: string;
  duration_min?: number;
  total_score?: number;
  course_id?: number;
  questions: PaperCreateQuestionDto[];
}

export interface PaperCreateResponseDto {
  paper_id: number;
  title: string;
  status: "draft" | "published" | "closed";
  question_count: number;
  created_at: string;
}

export async function fetchPaperListApi(params: {
  status?: "draft" | "published" | "closed";
  subject?: string;
  grade?: string;
  semester?: string;
  exam_type?: string;
  q?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<PaperListResponseDto> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      search.set(k, String(v));
    }
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return apiRequest<PaperListResponseDto>(`/papers${suffix}`, {}, "teacher");
}

export async function fetchPaperDetailApi(paperId: number): Promise<PaperDetailDto> {
  return apiRequest<PaperDetailDto>(`/papers/${paperId}`, {}, "teacher");
}

export async function createPaperApi(payload: PaperCreateRequestDto): Promise<PaperCreateResponseDto> {
  return apiRequest<PaperCreateResponseDto>("/papers", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "teacher");
}
