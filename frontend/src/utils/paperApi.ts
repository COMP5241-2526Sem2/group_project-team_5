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
