import { ANTI_DRIFT_REMINDER } from "./promptTemplates.ts";

// Maps the React dropdown ID to the actual API string.
// If the frontend fails to send an ID, it falls back to the default provider strings.
export const PROVIDER_MODELS: Record<string, string> = {
  // The Frontend Dropdown IDs
  "deepseek-v4-pro": "deepseek-v4-pro",
  "deepseek-v4.1-flash": "deepseek-v4.1-flash",
  "openai-gpt4o-mini": "gpt-4o-mini",
  "openai-gpt4o": "gpt-4o",
  "gemini-3.8-flash": "gemini-2.0-flash",
  "claude-haiku-5.5": "claude-3-5-haiku-20241022",
  "claude-sonnet-5.5": "Claude Sonnet 5.5",
  "local-ai": "local-model",

  // The Defaults (if no dropdown choice is sent)
  deepseek: "deepseek-v4-pro",
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
  claude: "Claude Sonnet 5.5",
  custom: "gpt-4o",
};

export const PROVIDER_ENDPOINTS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  claude: "https://api.anthropic.com/v1/messages",
};

/**
 * Routes the AI call to the correct provider endpoint and request format.
 * Includes the Envelope Architecture (Sandwich) and Frequency Penalties to prevent drift.
 */
export async function callAI(
  provider: string,
  apiKey: string,
  baseUrl: string | null,
  systemPrompt: string,
  conversationMessages: Array<{ role: string; content: string }>,
  requestedModel?: string
): Promise<{ response: Response | null; providerError: string | null }> {

  // Use the specific model requested by the UI, or fallback to the provider's default
  const lookupKey = requestedModel || provider;
  const model = PROVIDER_MODELS[lookupKey] ?? "gpt-4o";

  // ---- GEMINI NATIVE API ----
  if (provider === "gemini") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents = conversationMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.8, maxOutputTokens: 16192 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { response: null, providerError: `Gemini API returned status ${response.status}: ${errText.slice(0, 200)}` };
    }
    return { response, providerError: null };
  }

  // ---- CLAUDE NATIVE API ----
  if (provider === "claude") {
    const endpoint = PROVIDER_ENDPOINTS["claude"];
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        messages: conversationMessages,
        max_tokens: 16000,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { response: null, providerError: `Claude API returned status ${response.status}: ${errText.slice(0, 200)}` };
    }
    return { response, providerError: null };
  }

  // ---- OPENAI COMPATIBLE (DeepSeek, OpenAI, Custom) ----
  let endpoint: string;
  if (provider === "custom" && baseUrl) {
    endpoint = baseUrl.endsWith("/chat/completions")
      ? baseUrl
      : `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  } else {
    endpoint = PROVIDER_ENDPOINTS[provider] ?? PROVIDER_ENDPOINTS["openai"];
  }

  // 1. DeepSeek Language Lock
  let finalSystemPrompt = systemPrompt;
  if (provider === "deepseek") {
    finalSystemPrompt += `\n\n[CRITICAL DIRECTIVE FOR DEEPSEEK]: You MUST perform all internal reasoning, logic, and chain-of-thought strictly in English. You are FORBIDDEN from using Chinese characters in your thinking process or your final output.`;
  }

  // 2. Constructing the Envelope Sandwich
  // Temporarily pop the newest player input off the end of the array
  const latestPlayerMessage = conversationMessages.pop();

  const messages = [
    { role: "system", content: finalSystemPrompt }, // TOP: The God-Mode Rules
    ...conversationMessages,                        // MIDDLE: Day-Isolated Chat History
    { role: "system", content: ANTI_DRIFT_REMINDER }, // BOTTOM: The Anti-Drift Reminder
  ];

  // Add the newest player input back at the absolute end, right below the reminder
  if (latestPlayerMessage) {
    messages.push(latestPlayerMessage);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.8,
      frequency_penalty: 0.3, // <--- ASSASSINATES REPETITIVE CRUTCH PHRASES
      max_tokens: 16000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const providerName = provider === "deepseek" ? "DeepSeek" : provider === "openai" ? "OpenAI" : provider === "claude" ? "Claude" : "Custom provider";
    return { response: null, providerError: `${providerName} API returned status ${response.status}: ${errText.slice(0, 200)}` };
  }

  return { response, providerError: null };
}

/**
 * Extracts the narration text from the AI provider's response.
 * OpenAI-compatible responses use choices[0].message.content.
 * Gemini responses use candidates[0].content.parts[0].text.
 */
export function extractNarration(provider: string, data: Record<string, unknown>): string {
  if (provider === "gemini") {
    const candidates = data.candidates as Array<{
      content: { parts: Array<{ text: string }> };
    }> | undefined;
    return candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  if (provider === "claude") {
    const content = data.content as Array<{ text: string }> | undefined;
    return content?.[0]?.text ?? "";
  }

  // Fallback for OpenAI / DeepSeek
  const choices = data.choices as Array<{
    message: { content: string };
  }> | undefined;
  return choices?.[0]?.message?.content ?? "";
}
