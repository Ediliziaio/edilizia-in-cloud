const LEGACY_IMAGE_EDIT_MODEL = "dall-e-2";
const DEFAULT_IMAGE_EDIT_MODEL = "gpt-image-2";

export function buildOpenAIImageEditModelChain(configuredModel?: string | null): string[] {
  const candidates = [
    typeof configuredModel === "string" ? configuredModel.trim() : "",
    DEFAULT_IMAGE_EDIT_MODEL,
    "gpt-image-1.5",
    "gpt-image-1",
    "gpt-image-1-mini",
    LEGACY_IMAGE_EDIT_MODEL,
  ].filter(Boolean);

  return Array.from(new Set(candidates));
}

export function isLegacyOpenAIImageEditModel(model: string): boolean {
  return model === LEGACY_IMAGE_EDIT_MODEL;
}

export function appendOpenAIImageEditImage(
  form: FormData,
  model: string,
  image: Blob,
  filename: string,
) {
  form.append(isLegacyOpenAIImageEditModel(model) ? "image" : "image[]", image, filename);
}

export function resolveOpenAIImageEditSize(model: string, preferredSize?: string | null): string {
  return isLegacyOpenAIImageEditModel(model) ? "1024x1024" : (preferredSize || "1024x1024");
}

export function appendOpenAIImageEditResponseFormat(form: FormData, model: string) {
  if (isLegacyOpenAIImageEditModel(model)) {
    form.append("response_format", "b64_json");
  }
}

export function appendOpenAIImageEditQuality(
  form: FormData,
  model: string,
  quality?: string | null,
) {
  const normalized = typeof quality === "string" ? quality.trim() : "";
  if (!normalized || isLegacyOpenAIImageEditModel(model)) return;
  form.append("quality", normalized);
}

export function shouldFallbackOpenAIImageEdit(status: number, body: string): boolean {
  const normalized = body.toLowerCase();
  return (
    status === 400 ||
    status === 404 ||
    status === 422
  ) && (
    normalized.includes("\"param\":\"model\"") ||
    normalized.includes("\"param\": \"model\"") ||
    normalized.includes("invalid_value") ||
    normalized.includes("model_not_found") ||
    normalized.includes("must be") ||
    normalized.includes("unsupported model") ||
    normalized.includes("does not have access") ||
    normalized.includes("is not supported")
  );
}

function uint8ToBase64(uint8: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function openAIImageEditResultToDataUrl(
  data: Record<string, unknown>,
  fetcher: (url: string, options?: RequestInit) => Promise<Response> = fetch,
): Promise<string | null> {
  const first = (data.data as Array<{ b64_json?: string; url?: string }> | undefined)?.[0];
  if (!first) return null;

  if (first.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }

  if (!first.url) return null;

  const response = await fetcher(first.url, {});
  if (!response.ok) {
    throw new Error(`Impossibile scaricare immagine OpenAI (${response.status})`);
  }
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buffer = await response.arrayBuffer();
  return `data:${mimeType};base64,${uint8ToBase64(new Uint8Array(buffer))}`;
}

export async function runOpenAIImageEditWithFallback(
  params: {
    apiKey: string;
    prompt: string;
    image: Blob;
    filename?: string;
    size?: string | null;
    quality?: string | null;
    configuredModel?: string | null;
    fetcher: (url: string, options: RequestInit) => Promise<Response>;
  },
): Promise<{ data: Record<string, unknown>; modelUsed: string; fallbackErrors: string[] }> {
  const modelChain = buildOpenAIImageEditModelChain(params.configuredModel);
  const fallbackErrors: string[] = [];

  for (let index = 0; index < modelChain.length; index += 1) {
    const model = modelChain[index];
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", params.prompt);
    appendOpenAIImageEditImage(form, model, params.image, params.filename || "photo.jpg");
    form.append("n", "1");
    form.append("size", resolveOpenAIImageEditSize(model, params.size));
    appendOpenAIImageEditResponseFormat(form, model);
    appendOpenAIImageEditQuality(form, model, params.quality);

    const response = await params.fetcher("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${params.apiKey}` },
      body: form,
    });

    if (response.ok) {
      return {
        data: await response.json() as Record<string, unknown>,
        modelUsed: model,
        fallbackErrors,
      };
    }

    const errorBody = await response.text();
    const shortError = `OpenAI ${model} ${response.status}: ${errorBody.substring(0, 220)}`;
    const canFallback = index < modelChain.length - 1 && shouldFallbackOpenAIImageEdit(response.status, errorBody);
    if (canFallback) {
      fallbackErrors.push(shortError);
      if (errorBody.toLowerCase().includes("must be 'dall-e-2'") || errorBody.toLowerCase().includes('must be "dall-e-2"')) {
        const legacyIndex = modelChain.indexOf(LEGACY_IMAGE_EDIT_MODEL);
        if (legacyIndex > index) index = legacyIndex - 1;
      }
      continue;
    }

    throw new Error(shortError);
  }

  throw new Error(`OpenAI image edit failed: ${fallbackErrors.join(" | ")}`);
}
