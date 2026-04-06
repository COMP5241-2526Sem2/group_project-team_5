import { apiRequest } from "./apiClient";

export interface ExtractSourceTextResponseDto {
  source_text: string;
  chars: number;
}

export async function extractSourceTextApi(file: File): Promise<ExtractSourceTextResponseDto> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<ExtractSourceTextResponseDto>(
    "/quiz-generation/extract-text",
    {
      method: "POST",
      body: form,
    },
    "teacher",
  );
}
