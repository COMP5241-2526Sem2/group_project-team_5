import { apiRequest } from "./apiClient";

export type TaskKind = "exam" | "quiz" | "homework";
export type TaskStatusView = "draft" | "published" | "closed";
export type TaskSourceKind = "bank" | "paper_snapshot";

export interface TaskItemPayloadDto {
  order: number;
  section_label: string | null;
  question_type: string;
  score: number;
  source_kind: TaskSourceKind;
  bank_question_id: number | null;
  ref_paper_id: number | null;
  ref_paper_question_id: number | null;
  snapshot: Record<string, unknown>;
}

export interface TaskCreateRequestDto {
  title: string;
  grade: string;
  subject: string;
  semester?: string | null;
  task_kind: TaskKind;
  duration_min: number;
  total_score: number;
  course_id?: number | null;
  items: TaskItemPayloadDto[];
}

export interface TaskListItemDto {
  task_id: number;
  title: string;
  course_id: number;
  course_name: string;
  grade: string;
  subject: string;
  semester: string | null;
  task_kind: string;
  status: TaskStatusView;
  is_owner?: boolean;
  total_score: number;
  duration_min: number;
  question_count: number;
  created_at: string;
  published_at: string | null;
}

export interface TaskListResponseDto {
  items: TaskListItemDto[];
  page: number;
  page_size: number;
  total: number;
}

export interface TaskItemViewDto {
  order: number;
  section_label: string | null;
  question_type: string;
  score: number;
  source_kind: string;
  bank_question_id: number | null;
  ref_paper_id: number | null;
  ref_paper_question_id: number | null;
  snapshot: Record<string, unknown>;
}

export interface TaskDetailDto {
  task_id: number;
  title: string;
  course_id: number;
  course_name: string;
  grade: string;
  subject: string;
  semester: string | null;
  task_kind: string;
  status: TaskStatusView;
  is_owner?: boolean;
  total_score: number;
  duration_min: number;
  question_count: number;
  created_at: string;
  published_at: string | null;
  items: TaskItemViewDto[];
}

export interface TaskMutationResponseDto {
  task_id: number;
  title: string;
  status: TaskStatusView;
  question_count: number;
  created_at: string;
}

export interface TaskStatusMutationResponseDto {
  task_id: number;
  status: TaskStatusView;
  changed_at: string;
}

export async function fetchTaskListApi(params: {
  status?: TaskStatusView;
  subject?: string;
  grade?: string;
  semester?: string;
  task_kind?: string;
  q?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<TaskListResponseDto> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      search.set(k, String(v));
    }
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return apiRequest<TaskListResponseDto>(`/tasks${suffix}`, {}, "teacher");
}

export async function fetchTaskDetailApi(taskId: number): Promise<TaskDetailDto> {
  return apiRequest<TaskDetailDto>(`/tasks/${taskId}`, {}, "teacher");
}

export async function createTaskApi(payload: TaskCreateRequestDto): Promise<TaskMutationResponseDto> {
  return apiRequest<TaskMutationResponseDto>(
    "/tasks",
    { method: "POST", body: JSON.stringify(payload) },
    "teacher",
  );
}

export async function updateTaskApi(
  taskId: number,
  payload: TaskCreateRequestDto,
): Promise<TaskMutationResponseDto> {
  return apiRequest<TaskMutationResponseDto>(`/tasks/${taskId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }, "teacher");
}

export async function deleteTaskApi(taskId: number): Promise<void> {
  await apiRequest<void>(`/tasks/${taskId}`, { method: "DELETE" }, "teacher");
}

export async function publishTaskApi(taskId: number): Promise<TaskStatusMutationResponseDto> {
  return apiRequest<TaskStatusMutationResponseDto>(
    `/tasks/${taskId}/publish`,
    { method: "POST" },
    "teacher",
  );
}
