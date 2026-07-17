// Thin OpenRouter wrapper. SERVER ONLY — never expose OPENROUTER_API_KEY to the client.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// Streaming variant: yields text chunks as the model produces them (SSE).
// SERVER ONLY. Caller is responsible for persisting the full text after the stream.
export async function* chatStream(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number; maxTokens?: number; timeoutMs?: number; online?: boolean; json?: boolean } = {}
): AsyncGenerator<string, void, unknown> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "PI Companion",
      },
      body: JSON.stringify({
        model: (() => {
          const base = opts.model || process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";
          return opts.online ? `${base}:online` : base;
        })(),
        messages,
        temperature: opts.temperature ?? 0.7,
        stream: true,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("OpenRouter request timed out");
    throw e;
  }

  if (!res.ok || !res.body) {
    clearTimeout(timeout);
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by newlines; each data line is a JSON delta.
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // partial/keepalive line — ignore
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

type ChatOpts = {
  model?: string;
  temperature?: number;
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  online?: boolean; // append :online for OpenRouter's built-in web search
};

// Like chat() but also returns finish_reason so callers can detect a token-limit
// cutoff ("length") and continue-generate. content is always the text.
export async function chatWithMeta(
  messages: ChatMessage[],
  opts: ChatOpts = {}
): Promise<{ content: string; finishReason: string | null }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45000);

  const baseModel = opts.model || process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";
  const model = opts.online ? `${baseModel}:online` : baseModel;

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "PI Companion",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.7,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error("OpenRouter request timed out");
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }

  // Guard against a 200 with a non-JSON body.
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error("OpenRouter returned a non-JSON response");
  }
  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason ?? null,
  };
}

export async function chat(messages: ChatMessage[], opts: ChatOpts = {}): Promise<string> {
  const { content } = await chatWithMeta(messages, opts);
  return content;
}
