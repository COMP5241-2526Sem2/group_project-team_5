import { apiRequest, apiRequestBlobWithProgress, type BlobProgress } from "./apiClient";

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
  is_owner?: boolean;
  total_score: number;
  duration_min: number;
  question_count: number;
  quality_score: number | null;
  created_at: string;
  has_source_pdf?: boolean;
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
  is_correct?: boolean | null;
}

export interface PaperDetailQuestionDto {
  paper_question_id: number;
  order: number;
  type: string;
  prompt: string;
  difficulty: string | null;
  score: number;
  answer?: string | null;
  explanation?: string | null;
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
  is_owner?: boolean;
  total_score: number;
  duration_min: number;
  question_count: number;
  quality_score: number | null;
  created_at: string;
  has_source_pdf?: boolean;
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
  /** If true, server publishes in the same transaction as create (one round-trip). */
  publish_after?: boolean;
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

/** Distinct grades / subjects / publishers for AI paper wizard; backend may omit this route. */
export interface PaperMetaOptionsDto {
  grades?: string[];
  subjects?: string[];
  publishers?: string[];
  publisher_source?: string;
}

export async function fetchPaperMetaOptionsApi(params?: {
  grade?: string;
  subject?: string;
  semester?: string | null;
}): Promise<PaperMetaOptionsDto> {
  try {
    const search = new URLSearchParams();
    if (params?.grade?.trim()) search.set("grade", params.grade.trim());
    if (params?.subject?.trim()) search.set("subject", params.subject.trim());
    if (params?.semester != null && String(params.semester).trim() !== "") {
      search.set("semester", String(params.semester).trim());
    }
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return await apiRequest<PaperMetaOptionsDto>(`/papers/meta/options${suffix}`, {}, "teacher");
  } catch {
    return {};
  }
}

export async function createPaperApi(payload: PaperCreateRequestDto): Promise<PaperCreateResponseDto> {
  return apiRequest<PaperCreateResponseDto>("/papers", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "teacher");
}

export async function updatePaperApi(
  paperId: number,
  payload: PaperCreateRequestDto,
): Promise<PaperCreateResponseDto> {
  return apiRequest<PaperCreateResponseDto>(`/papers/${paperId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }, "teacher");
}

export interface PaperPdfParseResponseDto {
  paper_draft: PaperCreateRequestDto;
  warnings: string[];
  extracted_text_preview: string;
}

export async function parsePaperPdfApi(
  file: File,
  meta: Partial<{
    title: string;
    grade: string;
    subject: string;
    semester: string | null;
    exam_type: string;
    duration_min: number;
    total_score: number;
    course_id: number;
  }> = {},
): Promise<PaperPdfParseResponseDto> {
  const form = new FormData();
  form.append("file", file);
  Object.entries(meta).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const s = String(v).trim();
    if (!s) return;
    form.append(k, s);
  });
  return apiRequest<PaperPdfParseResponseDto>(
    "/papers/parse-pdf",
    { method: "POST", body: form },
    "teacher",
  );
}

export async function uploadPaperSourcePdfApi(paperId: number, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await apiRequest<void>(
    `/papers/${paperId}/source-pdf`,
    { method: "POST", body: form },
    "teacher",
  );
}

export interface PaperStatusMutationResponseDto {
  paper_id: number;
  status: "draft" | "published" | "closed";
  changed_at: string;
}

export async function publishPaperApi(paperId: number): Promise<PaperStatusMutationResponseDto> {
  return apiRequest<PaperStatusMutationResponseDto>(`/papers/${paperId}/publish`, {
    method: "POST",
  }, "teacher");
}

export async function unpublishPaperApi(paperId: number): Promise<PaperStatusMutationResponseDto> {
  return apiRequest<PaperStatusMutationResponseDto>(`/papers/${paperId}/unpublish`, {
    method: "POST",
  }, "teacher");
}

export async function deletePaperApi(paperId: number): Promise<void> {
  await apiRequest<void>(`/papers/${paperId}`, { method: "DELETE" }, "teacher");
}

export type PaperExportFormat = "html" | "pdf" | "txt";

export type { BlobProgress };

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function replaceExt(name: string, ext: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return `paper${ext}`;
  const idx = trimmed.lastIndexOf(".");
  if (idx <= 0) return `${trimmed}${ext}`;
  return `${trimmed.slice(0, idx)}${ext}`;
}

async function htmlToPdfBlob(htmlText: string): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");
  const body = doc.body;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "800px";
  container.style.background = "#fff";
  container.style.color = "#111";
  container.style.padding = "0";
  container.style.margin = "0";

  // Preserve styles from exported HTML
  const styleEls = Array.from(doc.querySelectorAll("style"));
  styleEls.forEach((s) => container.appendChild(s.cloneNode(true)));

  const bodyWrapper = document.createElement("div");
  bodyWrapper.style.padding = "24px";
  bodyWrapper.style.boxSizing = "border-box";
  bodyWrapper.appendChild(body.cloneNode(true));
  container.appendChild(bodyWrapper);

  document.body.appendChild(container);
  try {
    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });

    const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let y = 0;
    pdf.addImage(imgData, "JPEG", 0, y, imgWidth, imgHeight);
    let remaining = imgHeight - pageHeight;
    while (remaining > 1) {
      pdf.addPage();
      y -= pageHeight;
      pdf.addImage(imgData, "JPEG", 0, y, imgWidth, imgHeight);
      remaining -= pageHeight;
    }

    const out = pdf.output("arraybuffer");
    return new Blob([out], { type: "application/pdf" });
  } finally {
    container.remove();
  }
}

/** Triggers browser download with optional per-chunk progress (streams response body). */
export async function downloadPaperExportApi(
  paperId: number,
  format: PaperExportFormat,
  onProgress?: (p: BlobProgress) => void,
): Promise<void> {
  // If user selects PDF but paper has no stored source PDF, backend will 400.
  // We fall back to downloading HTML and rendering it to a PDF client-side.
  if (format === "pdf") {
    try {
      const { blob, filename } = await apiRequestBlobWithProgress(
        `/papers/${paperId}/export?format=pdf`,
        "teacher",
        onProgress,
      );
      triggerBrowserDownload(blob, filename ?? `paper-${paperId}.pdf`);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!msg.toLowerCase().includes("pdf")) {
        throw e;
      }
      // fallback continues below
    }

    const { blob: htmlBlob, filename: htmlName } = await apiRequestBlobWithProgress(
      `/papers/${paperId}/export?format=html`,
      "teacher",
      onProgress,
    );
    const htmlText = await htmlBlob.text();
    const pdfBlob = await htmlToPdfBlob(htmlText);
    const baseName = htmlName ?? `paper-${paperId}.html`;
    triggerBrowserDownload(pdfBlob, replaceExt(baseName, ".pdf"));
    return;
  }

  const suffix = `?format=${encodeURIComponent(format)}`;
  const { blob, filename } = await apiRequestBlobWithProgress(
    `/papers/${paperId}/export${suffix}`,
    "teacher",
    onProgress,
  );
  let fallback = `paper-${paperId}.html`;
  if (blob.type.includes("text/plain")) fallback = `paper-${paperId}.txt`;
  triggerBrowserDownload(blob, filename ?? fallback);
}
