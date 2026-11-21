import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// ============================================================================
// RULES HELPER — player-facing NotebookLM-style rules Q&A.
// Fully isolated from the narrate RPG pipeline: no game state, no dice, no
// RPG output contract. Self-contained (no cross-function imports).
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CORE_RULE_SLUGS = [
  "universal-core-engine",
  "universal-game-templates",
  "medicinal-algae-quick-reference",
  "lets-play-mermaids-world-lore",
];

const EXTRAS_CATEGORIES =
  "General, Custom Mechanic, Homebrew Item, NPC Detail, Location Detail, Lore, Reference, Temporary Content";

// Same provider/model mapping the game uses so the player's bound model works.
const PROVIDER_MODELS: Record<string, string> = {
  "deepseek-v4-pro": "deepseek-v4-pro",
  "deepseek-v4.1-flash": "deepseek-v4.1-flash",
  "openai-gpt4o-mini": "gpt-4o-mini",
  "openai-gpt4o": "gpt-4o",
  "gemini-3.8-flash": "gemini-2.0-flash",
  "claude-haiku-5.5": "claude-3-5-haiku-20241022",
  "claude-sonnet-5.5": "Claude Sonnet 5.5",
  "local-ai": "local-model",
  deepseek: "deepseek-v4-pro",
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
  claude: "Claude Sonnet 5.5",
  custom: "gpt-4o",
};

const PROVIDER_ENDPOINTS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  claude: "https://api.anthropic.com/v1/messages",
};

interface HelperMessage {
  role: "user" | "assistant";
  content: string;
}

interface HelperRequestBody {
  message?: string;
  history?: HelperMessage[];
  includeCharacters?: boolean;
  requestType?: string;
  aiModel?: string;
}

interface RuleChunk {
  docSlug: string;
  docTitle: string;
  heading: string;
  content: string;
}

const SYNONYM_GROUPS: string[][] = [
  ["hp", "health", "damage", "injury", "wound", "hurt", "dying"],
  ["stm", "stamina", "exhaustion", "rest", "tired", "energy"],
  ["bond", "romance", "affection", "apex", "love", "heart"],
  ["save", "log", "daily", "checkpoint", "save progress"],
  ["sleep", "night", "halt", "morning", "proceed", "day"],
  ["travel", "map", "grotto", "waystation", "location", "region"],
  ["dice", "roll", "d20", "dc", "check", "skill"],
  ["algae", "heal", "medicine", "herb", "medic", "apothecary"],
  ["xp", "level", "leveling", "experience"],
];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function chunkByHeadings(docSlug: string, docTitle: string, content: string): RuleChunk[] {
  const chunks: RuleChunk[] = [];
  const headingRegex = /^(#{1,4})\s+(.*)$/;
  let currentHeading = docTitle;
  let currentLines: string[] = [];

  const push = () => {
    const text = currentLines.join("\n").trim();
    if (text) chunks.push({ docSlug, docTitle, heading: currentHeading, content: text.slice(0, 6000) });
  };

  for (const line of content.split("\n")) {
    const match = line.match(headingRegex);
    if (match) {
      push();
      currentHeading = match[2].trim() || docTitle;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  push();
  return chunks;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

function scoreChunks(chunks: RuleChunk[], message: string): RuleChunk[] {
  const messageTokens = tokenize(message);
  if (messageTokens.length === 0) return chunks.slice(0, 8);

  const scored = chunks.map((chunk) => {
    const headingLower = chunk.heading.toLowerCase();
    const bodyLower = chunk.content.toLowerCase();
    let score = 0;

    for (const token of messageTokens) {
      if (headingLower.includes(token)) score += 2;
      else if (bodyLower.includes(token)) score += 1;
    }

    for (const group of SYNONYM_GROUPS) {
      if (!group.some((word) => messageTokens.includes(word))) continue;
      for (const word of group) {
        if (headingLower.includes(word)) score += 1.5;
        else if (bodyLower.includes(word)) score += 0.5;
      }
    }

    return { chunk, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.chunk);
}

function buildRuleSources(chunks: RuleChunk[]): { text: string; sources: Array<{ docTitle: string; heading: string }> } {
  const MAX_WORDS = 3500;
  let wordCount = 0;
  const used: RuleChunk[] = [];
  const sources: Array<{ docTitle: string; heading: string }> = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const chunkWords = chunk.content.split(/\s+/).length;
    if (used.length > 0 && wordCount + chunkWords > MAX_WORDS) break;
    used.push(chunk);
    wordCount += chunkWords;

    const key = `${chunk.docTitle}::${chunk.heading}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({ docTitle: chunk.docTitle, heading: chunk.heading });
    }
    if (used.length >= 8) break;
  }

  const text = used
    .map((chunk) => `--- Source: ${chunk.docTitle} • ${chunk.heading} ---\n${chunk.content}`)
    .join("\n\n");
  return { text, sources };
}

function looksLikeCharacterQuestion(message: string): boolean {
  return /\b(my character|my mermaid|my merfolk|look up my character|my stats|my traits|my playthrough|my saved characters?|saved characters?)\b/i.test(
    message,
  );
}

function looksLikeBlankApexRequest(message: string, requestType: string | undefined): boolean {
  if (requestType === "blank_apex_template") return true;
  return /\b(blank|custom|own|new|make|create|draft|write)\b.{0,24}\bapex\b|\bapex\b.{0,24}\b(template|plugin)\b/i.test(
    message,
  );
}

function looksLikeExtraHelp(message: string, requestType: string | undefined): boolean {
  if (requestType === "extra_help") return true;
  return /\bextra\b.{0,30}\b(help|build|create|make|draft|write|idea)\b|\b(help me build)\b/i.test(message);
}

function extractStructuralOutline(text: string): string {
  const kept = text.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^#{1,4}\s/.test(trimmed)) return true;
    if (/^#{0,4}\s*\[/.test(trimmed)) return true;
    if (/^[-*]\s*\*\*/.test(trimmed)) return true;
    if (/^\|/.test(trimmed)) return true;
    if (/bond level/i.test(trimmed)) return true;
    return false;
  });
  return kept.join("\n").slice(0, 14000);
}

function buildHelperSystemPrompt(
  ruleSourcesText: string,
  charactersBlock: string,
  blankApexOutline: string,
  extraHelpActive: boolean,
): string {
  const sections = [
    `You are the Rules Helper for the tabletop survival RPG "Let's Play Mermaids: Dark Ocean Survival" — a warm, clear, beginner-friendly rules guide and creative co-pilot. You are NOT the game narrator.

GROUNDED ACCURACY (NotebookLM style):
- Answer mechanics questions strictly from the <rule_sources> excerpts below and naturally reference the rule document and section name (e.g., "Universal Core Engine • Time Passage").
- If the answer is not in the retrieved excerpts, say so honestly instead of inventing mechanics, and suggest which document or section the player might check.
- Bond starts at Level 1, and each new Bond tier costs bondLevel * 10 XP.

COMPLETE SEPARATION FROM GAMEPLAY (absolute):
- NEVER use the game's [SYSTEM CALCULATION] / OOC / NARRATIVE output format.
- NEVER run dice rolls, weather rolls, or aquatic-anatomy content scrubbers.
- NEVER claim to change game state. You only chat, explain, and draft.

FORMAT:
- Short paragraphs, **bold key takeaways**, bullet lists, and markdown fenced code blocks for anything copy-paste ready.
- Be encouraging and never condescending.`,
  ];

  sections.push(
    ruleSourcesText
      ? `<rule_sources>\n${ruleSourcesText}\n</rule_sources>`
      : `<rule_sources>\nNo rule excerpts matched this question. Answer from general familiarity with the game's structure but clearly say you could not find a specific rule excerpt to cite.\n</rule_sources>`,
  );

  if (charactersBlock) {
    sections.push(
      `<player_characters>\n${charactersBlock}\n</player_characters>\nUse this context to tailor advice, explain how their traits/concept interact with the rules, or help build Extras that fit their specific mermaid.`,
    );
  }

  if (blankApexOutline) {
    sections.push(
      `BLANK APEX TEMPLATE REQUEST: The following is the STRUCTURAL OUTLINE of an official Apex plugin (headings, stat fields, tags, and Bond ladder format only — all canon names, personality, and narrative prose have been stripped). Use it ONLY as a structural reference. Output a clean, ready-to-copy blank Markdown template inside ONE fenced markdown code block, preserving every required engine section, heading, Bond ladder structure (Bond starts at Level 1, each tier requires Bond Level * 10 XP), and mechanical tag, with clear [Fill in ...] placeholders and brief guidance notes. Zero canon Apex lore, names, or spoilers may appear in your output.\n\n<apex_structural_outline>\n${blankApexOutline}\n</apex_structural_outline>`,
    );
  }

  if (extraHelpActive) {
    sections.push(
      `EXTRAS CO-PILOT: The player wants custom content for their game's Extras tab. Brainstorm with them, then output a clean, copy-paste-ready Markdown block with: a **Suggested Title**, a **Suggested Category** (choose the best fit from exactly these: ${EXTRAS_CATEGORIES}), and the **Markdown Content** (concise, engine-friendly, and non-breaking for core rules). Put the content itself in a fenced markdown code block.`,
    );
  }

  return sections.join("\n\n");
}

async function callProvider(
  provider: string,
  apiKey: string,
  baseUrl: string | null,
  systemPrompt: string,
  messages: HelperMessage[],
  requestedModel?: string,
): Promise<{ text: string; error: string | null }> {
  const lookupKey = requestedModel || provider;
  const model = PROVIDER_MODELS[lookupKey] ?? "gpt-4o";

  try {
    if (provider === "gemini") {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
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
          messages,
          max_tokens: 8000,
          temperature: 0.6,
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
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.6,
        max_tokens: 8000,
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Server is not configured. Please try again later." }, 500);
    }

    // ---- 1. Authenticate the caller via their real user JWT ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const userToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!userToken) {
      return json({ error: "Please sign in to use the Rules Helper." }, 401);
    }

    const userClient = createClient(SUPABASE_URL, userToken);
    const { data: userData, error: userErr } = await userClient.auth.getUser(userToken);
    if (userErr || !userData?.user) {
      return json({ error: "Please sign in to use the Rules Helper." }, 401);
    }
    const userId = userData.user.id;

    const body: HelperRequestBody = await req.json();
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 12000) : "";
    if (!message) {
      return json({ error: "Type a question first and I'll dig into the rules for you." }, 400);
    }
    const history: HelperMessage[] = (Array.isArray(body.history) ? body.history : [])
      .filter(
        (m): m is HelperMessage =>
          Boolean(m) &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 16000) }));

    // ---- 2. Load the user's own core rule documents (RLS-scoped) ----
    const { data: ruleRows } = await userClient
      .from("rule_documents")
      .select("slug, title, content")
      .in("slug", CORE_RULE_SLUGS);

    const docs: Array<{ slug: string; title: string; content: string }> = [];
    const bySlug = new Map<string, { title: string; content: string }>();
    for (const row of ruleRows ?? []) {
      if (row.content && row.content.trim()) {
        bySlug.set(row.slug, { title: row.title, content: row.content });
      }
    }

    // ---- New-player fallback: read core rules from the active store cartridge ----
    const missingSlugs = CORE_RULE_SLUGS.filter((slug) => !bySlug.has(slug));
    if (missingSlugs.length > 0) {
      const { data: cartridgeRows } = await userClient
        .from("store_cartridges")
        .select("payload")
        .eq("is_active", true)
        .order("uploaded_at", { ascending: false })
        .limit(1);
      const rules = (cartridgeRows?.[0]?.payload as { rules?: Array<{ slug: string; title: string; content: string }> })
        ?.rules ?? [];
      for (const rule of rules) {
        if (missingSlugs.includes(rule.slug) && rule.content?.trim() && !bySlug.has(rule.slug)) {
          bySlug.set(rule.slug, { title: rule.title, content: rule.content });
        }
      }
    }

    for (const slug of CORE_RULE_SLUGS) {
      const doc = bySlug.get(slug);
      if (doc) docs.push({ slug, title: doc.title, content: doc.content });
    }

    // ---- 3. Chunk + score + inject top rule chunks (core rules only, zero spoilers) ----
    const allChunks: RuleChunk[] = [];
    for (const doc of docs) {
      allChunks.push(...chunkByHeadings(doc.slug, doc.title, doc.content));
    }
    const ranked = scoreChunks(allChunks, message);
    const { text: ruleSourcesText, sources } = buildRuleSources(ranked);

    // ---- 4. Blank Apex template outline (structure only, no canon spoilers) ----
    let blankApexOutline = "";
    if (looksLikeBlankApexRequest(message, body.requestType)) {
      const { data: apexRows } = await userClient
        .from("rule_documents")
        .select("content")
        .like("slug", "apex-%")
        .limit(1);
      let apexRaw = apexRows?.[0]?.content ?? "";
      if (!apexRaw) {
        const { data: cartridgeRows } = await userClient
          .from("store_cartridges")
          .select("payload")
          .eq("is_active", true)
          .order("uploaded_at", { ascending: false })
          .limit(1);
        const rules = (cartridgeRows?.[0]?.payload as { rules?: Array<{ slug: string; content: string }> })?.rules ?? [];
        apexRaw = rules.find((rule) => rule.slug.startsWith("apex-") && rule.content)?.content ?? "";
      }
      if (apexRaw) {
        blankApexOutline = extractStructuralOutline(apexRaw);
      }
    }

    const extraHelpActive = looksLikeExtraHelp(message, body.requestType);

    // ---- 5. Character lookup ONLY when asked or toggled ----
    let charactersBlock = "";
    let usedCharacters = false;
    const explicitCharacterRequest = body.includeCharacters === true || looksLikeCharacterQuestion(message);
    let includeCharacters = explicitCharacterRequest;

    if (!includeCharacters && /\b(character|characters|mermaid|merfolk|playthrough|stats|traits)\b/i.test(message)) {
      const { data: nameRows } = await userClient
        .from("characters")
        .select("name")
        .eq("user_id", userId)
        .limit(50);
      if (nameRows?.some((row) => row.name && new RegExp(escapeRegex(row.name as string), "i").test(message))) {
        includeCharacters = true;
      }
    }

    if (includeCharacters) {
      const { data: characterRows } = await userClient
        .from("characters")
        .select("id, name, concept, traits, emoji")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12);

      const characterBlocks: string[] = [];
      for (const character of (characterRows ?? []) as Array<Record<string, unknown>>) {
        const { data: playthroughRows } = await userClient
          .from("playthroughs")
          .select("title, apex_target, status, story_state, updated_at")
          .eq("character_id", character.id as string)
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1);

        const playthrough = (playthroughRows ?? [])[0] as Record<string, unknown> | undefined;
        const state = (playthrough?.story_state ?? {}) as Record<string, unknown>;
        const stats = [
          state["stamina"] !== undefined ? `Stamina ${state["stamina"]}/${state["max_stamina"] ?? "?"}` : null,
          state["hp"] !== undefined ? `HP ${state["hp"]}/${state["max_hp"] ?? "?"}` : null,
          state["level"] !== undefined ? `Level ${state["level"]}` : null,
          state["bond_level"] !== undefined ? `Bond ${state["bond_level"]}` : null,
        ]
          .filter(Boolean)
          .join(", ");

        characterBlocks.push(
          [
            `Character: ${character.emoji ? `${character.emoji} ` : ""}${character.name}`,
            character.concept ? `Concept: ${character.concept}` : "",
            character.traits ? `Traits: ${JSON.stringify(character.traits).slice(0, 1200)}` : "",
            playthrough
              ? `Playthrough: ${playthrough.title ?? "Untitled"} (Apex: ${playthrough.apex_target ?? "none"}, Status: ${playthrough.status}${stats ? `, Stats: ${stats}` : ""})`
              : "Playthrough: none yet",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
      if (characterBlocks.length > 0) {
        charactersBlock = characterBlocks.join("\n\n");
        usedCharacters = true;
      }
    }

    // ---- 6. Load the caller's active BYOK key (same pattern as the game) ----
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: secretRow } = await supabaseAdmin
      .from("app_secrets")
      .select("value")
      .eq("name", "user_key_encryption_secret")
      .maybeSingle();
    const secret = (secretRow?.value as string) ?? null;
    if (!secret || secret.startsWith("CHANGE_ME-")) {
      return json({ error: "No active AI key configured. Please add one in AI Configuration to use the Rules Helper." }, 400);
    }

    const { data: keyResult, error: keyErr } = await supabaseAdmin.rpc("get_active_ai_key", {
      p_user: userId,
      p_secret: secret,
    });
    if (keyErr) {
      console.error("rules-helper get_active_ai_key error:", keyErr.message);
      return json({ error: "Could not load your AI key. Check AI Configuration and try again." }, 500);
    }
    const activeKey =
      keyResult && Array.isArray(keyResult) && keyResult.length > 0
        ? (keyResult[0] as { provider: string; api_key: string; base_url: string | null })
        : null;
    if (!activeKey) {
      return json({ error: "No active AI key configured. Please add one in AI Configuration to use the Rules Helper." }, 400);
    }

    // ---- 7. Build prompt + call provider (10-message sliding window) ----
    const systemPrompt = buildHelperSystemPrompt(ruleSourcesText, charactersBlock, blankApexOutline, extraHelpActive);
    const chatMessages: HelperMessage[] = [...history, { role: "user", content: message }].slice(-10);

    const { text, error: providerError } = await callProvider(
      activeKey.provider,
      activeKey.api_key,
      activeKey.base_url,
      systemPrompt,
      chatMessages,
      body.aiModel,
    );

    if (providerError) {
      console.error("rules-helper provider error:", providerError);
      return json({ error: providerError }, 502);
    }
    if (!text.trim()) {
      return json({ error: "The AI returned an empty response. Try again, or check your key in AI Configuration." }, 502);
    }

    return json({ reply: text, sources, usedCharacters });
  } catch (err) {
    console.error("rules-helper error:", err);
    return json({ error: (err as Error).message || "An unexpected error occurred" }, 500);
  }
});
