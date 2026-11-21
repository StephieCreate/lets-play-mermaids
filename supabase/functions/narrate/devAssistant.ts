import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { PROVIDER_MODELS, PROVIDER_ENDPOINTS } from "./aiProviders.ts";
import { corsHeaders } from "./types.ts";

// Dev Mode is completely separate from the RPG pipeline: no playthrough lookup,
// no command interceptors, no rule token pruning, no aquatic-anatomy scrubbing.

export interface DevAssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DevAttachedFile {
  title: string;
  slug: string;
  versionTag: string;
  source: "rule" | "apex";
  content: string;
}

export interface DevAssistantRequestBody {
  mode?: string;
  messages?: DevAssistantMessage[];
  attachedFiles?: DevAttachedFile[];
  aiModel?: string;
}

export function isDevAssistantRequest(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as DevAssistantRequestBody).mode === "dev_assistant"
  );
}

const DEV_SYSTEM_PROMPT = `You are the ultimate digital developer assistant and expert tabletop/survival RPG game designer for "Let's Play Mermaids: Dark Ocean Survival".

This is ADMIN DEV MODE. There are NO roleplay guardrails here: you are not the narrator, no scene-gating applies, no dice interceptors, no output contracts, and no content scrubbers. You speak plainly with the game's developer about rules, lore, mechanics, balance, and edits.

PERSONA & OPERATING STYLE:
- You are a senior game-design co-pilot. Be direct, concrete, and practical.
- ADHD-FRIENDLY FORMATTING (mandatory): always give clear, careful, step-by-step instructions using short paragraphs, **bold key takeaways**, bullet lists, and exact copy-paste markdown/code blocks. NEVER dump giant unformatted walls of text. One idea per paragraph.
- CODE & RULE PLACEMENT ACCURACY (mandatory): when proposing any edit, always state the exact file or document name, the anchor heading, or the section header where the change belongs, plus an exact patch block showing the new wording. Changes must be effortless to apply.
- SMART RULE AUDITING: actively scan all attached markdown rules and custom apexes. Suggest improvements, flag redundant or conflicting mechanics directly and without softening, identify outdated wording to phase out, and provide exact patches showing how rules fit together.
- LORE & BALANCE CO-PILOT: collaborate freely on world lore, Apex personalities, encounter deck balancing, Bond progression (Bond starts at Level 1 and each tier costs bondLevel * 10 XP), XP/Level pacing, Stamina/HP economy, and system mechanics.

When files are attached below, treat them as the current source of truth and quote them by title when referencing them.`;

function buildAttachedFilesContext(files: DevAttachedFile[] | undefined): string {
  if (!files || files.length === 0) return "";
  const blocks = files.map(
    (file) =>
      `=== ATTACHED FILE: ${file.title} (slug: ${file.slug}, version: ${file.versionTag || "Untagged"}, source: ${file.source === "apex" ? "custom apex" : "rule document"}) ===\n${file.content}\n=== END FILE ===`,
  );
  return `\n\n---- ATTACHED PROJECT FILES (${files.length}) ----\n${blocks.join("\n\n")}`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Raw provider chat with NO RPG wrappers and NO anti-drift sandwich.
async function rawDevChat(
  provider: string,
  apiKey: string,
  baseUrl: string | null,
  systemPrompt: string,
  conversationMessages: DevAssistantMessage[],
  requestedModel?: string,
): Promise<{ text: string; error: string | null }> {
  const lookupKey = requestedModel || provider;
  const model = PROVIDER_MODELS[lookupKey] ?? "gpt-4o";

  try {
    if (provider === "gemini") {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const contents = conversationMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 16192 },
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { text: "", error: `Gemini API returned status ${response.status}: ${errText.slice(0, 200)}` };
      }
      const data = await response.json();
      const candidates = data.candidates as Array<{ content: { parts: Array<{ text: string }> } }> | undefined;
      return { text: candidates?.[0]?.content?.parts?.[0]?.text ?? "", error: null };
    }

    if (provider === "claude") {
      const response = await fetch(PROVIDER_ENDPOINTS["claude"], {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          messages: conversationMessages,
          max_tokens: 16000,
          temperature: 0.7,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { text: "", error: `Claude API returned status ${response.status}: ${errText.slice(0, 200)}` };
      }
      const data = await response.json();
      const content = data.content as Array<{ text: string }> | undefined;
      return { text: content?.[0]?.text ?? "", error: null };
    }

    // OpenAI-compatible (OpenAI, DeepSeek, custom base URL)
    let endpoint: string;
    if (provider === "custom" && baseUrl) {
      endpoint = baseUrl.endsWith("/chat/completions")
        ? baseUrl
        : `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    } else {
      endpoint = PROVIDER_ENDPOINTS[provider] ?? PROVIDER_ENDPOINTS["openai"];
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationMessages,
        ],
        temperature: 0.7,
        max_tokens: 16000,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      const providerName = provider === "deepseek" ? "DeepSeek" : provider === "openai" ? "OpenAI" : "Custom provider";
      return { text: "", error: `${providerName} API returned status ${response.status}: ${errText.slice(0, 200)}` };
    }
    const data = await response.json();
    const choices = data.choices as Array<{ message: { content: string } }> | undefined;
    return { text: choices?.[0]?.message?.content ?? "", error: null };
  } catch (err) {
    return { text: "", error: (err as Error).message || "The AI provider request failed." };
  }
}

export async function handleDevAssistant(req: Request, body: DevAssistantRequestBody): Promise<Response> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return json({ error: "Server is not configured. Please try again later." }, 500);
    }

    // ---- 1. Strict server-side admin verification via the caller's user JWT ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const userToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!userToken) {
      return json({ error: "Admin access required." }, 403);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(userToken);
    if (userErr || !userData?.user) {
      return json({ error: "Admin access required." }, 403);
    }
    const userId = userData.user.id;

    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin");
    if (adminErr || isAdmin !== true) {
      return json({ error: "Admin access required." }, 403);
    }

    // ---- 2. Validate the request ----
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const cleanMessages = messages
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-40)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 24000) }));

    if (cleanMessages.length === 0) {
      return json({ error: "Missing conversation messages." }, 400);
    }

    // ---- 3. Load ONLY this authenticated admin's active BYOK key ----
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: secretRow } = await supabaseAdmin
      .from("app_secrets")
      .select("value")
      .eq("name", "user_key_encryption_secret")
      .maybeSingle();

    const secret = (secretRow?.value as string) ?? null;
    if (!secret || secret.startsWith("CHANGE_ME-")) {
      return json({ error: "No AI API key found. Add a key in AI Configuration to use the Dev Assistant." }, 401);
    }

    const { data: keyResult, error: keyErr } = await supabaseAdmin.rpc("get_active_ai_key", {
      p_user: userId,
      p_secret: secret,
    });

    if (keyErr) {
      console.error("devAssistant get_active_ai_key error:", keyErr.message);
      return json({ error: "Could not load your AI key. Check AI Configuration and try again." }, 500);
    }

    const activeKey =
      keyResult && Array.isArray(keyResult) && keyResult.length > 0
        ? (keyResult[0] as { provider: string; api_key: string; base_url: string | null })
        : null;

    if (!activeKey) {
      return json({ error: "No AI API key found. Add a key in AI Configuration to use the Dev Assistant." }, 401);
    }

    // ---- 4. Build the Dev Mode system prompt (RPG pipeline fully bypassed) ----
    const attachedFiles = Array.isArray(body.attachedFiles) ? body.attachedFiles : [];
    const safeFiles: DevAttachedFile[] = attachedFiles
      .filter(
        (f) =>
          f &&
          typeof f.title === "string" &&
          typeof f.content === "string" &&
          f.content.trim().length > 0,
      )
      .slice(0, 30)
      .map((f) => ({
        title: String(f.title).slice(0, 200),
        slug: typeof f.slug === "string" ? f.slug.slice(0, 120) : "",
        versionTag: typeof f.versionTag === "string" ? f.versionTag.slice(0, 40) : "",
        source: f.source === "apex" ? "apex" : "rule",
        content: String(f.content).slice(0, 120000),
      }));

    const systemPrompt = DEV_SYSTEM_PROMPT + buildAttachedFilesContext(safeFiles);

    // ---- 5. Raw chat call: zero RPG wrappers ----
    const { text, error: providerError } = await rawDevChat(
      activeKey.provider,
      activeKey.api_key,
      activeKey.base_url,
      systemPrompt,
      cleanMessages,
      body.aiModel,
    );

    if (providerError) {
      console.error("devAssistant provider error:", providerError);
      return json({ error: providerError }, 502);
    }

    if (!text.trim()) {
      return json({ error: "The AI provider returned an empty response. Try again or check your key in AI Configuration." }, 502);
    }

    return json({ reply: text });
  } catch (err) {
    console.error("devAssistant error:", err);
    return json({ error: (err as Error).message || "An unexpected error occurred" }, 500);
  }
}
