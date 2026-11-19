import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  pruneRulesByPlayerState,
  getDynamicTurnRules,
} from "./ruleTokenPruning.ts";
import {
  corsHeaders,
  CORE_RULE_SLUGS,
  SEASON_KEYWORDS,
  apexRuleSlug,
  triadSurrogateSlug,
} from "./types.ts";
import type { NarrateRequest, NarrativeSummaryRow } from "./types.ts";
import {
  applyCommandInterceptors,
  buildTimePassageDirective,
  isSaveRequest,
  isSummaryRequest,
} from "./gameMechanics.ts";
import {
  buildConversationMessages,
  buildSystemPrompt,
  buildUserPrompt,
  extractQueuedSection,
} from "./promptBuilder.ts";
import { callAI, extractNarration } from "./aiProviders.ts";
import {
  SCENE_ANALYSIS_PATTERN,
  applyStatUpdatesFromNarration,
  enforceAquaticAnatomy,
} from "./postProcessing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Server is not configured. Please try again later." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: NarrateRequest = await req.json();

    if (!body.playthroughId || !body.characterName || !body.playerInput) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: playthroughId, characterName, playerInput" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- 1. COMMAND INTERCEPTORS & STATE MACHINE ----
    // (Nightly Halt Markov weather, Encounter Bag on Proceed, Summary/Save
    // directives, and the Standby Roll Protocol)
    const currentGameState = applyCommandInterceptors(body);
    body.storyState["game_mode"] = currentGameState;

    // ---- 2. Resolve the user's active AI key (BYOK, any provider) ----
    // The playthrough has an owner; we fetch their active encrypted key,
    // decrypt it via the SECURITY DEFINER function, and use it for this call.
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let activeKey: { provider: string; api_key: string; base_url: string | null; label: string } | null = null;

    // Read the master encryption secret from app_secrets (service role only).
    const { data: secretRow } = await supabaseAdmin
      .from("app_secrets")
      .select("value")
      .eq("name", "user_key_encryption_secret")
      .maybeSingle();

    const secret = (secretRow?.value as string) ?? null;

    if (secret && !secret.startsWith("CHANGE_ME-")) {
      // Look up the playthrough owner.
      const { data: ptOwner } = await supabaseAdmin
        .from("playthroughs")
        .select("user_id")
        .eq("id", body.playthroughId)
        .maybeSingle();

      if (ptOwner?.user_id) {
        const { data: keyResult, error: keyErr } = await supabaseAdmin.rpc(
          "get_active_ai_key",
          { p_user: ptOwner.user_id, p_secret: secret },
        );

        if (keyErr) {
          console.error("get_active_ai_key error:", keyErr.message);
        } else if (keyResult && Array.isArray(keyResult) && keyResult.length > 0) {
          activeKey = keyResult[0] as { provider: string; api_key: string; base_url: string | null; label: string };
        }
      }
    }

    if (!activeKey) {
      return new Response(
        JSON.stringify({ error: "No AI API key found. Add a key in AI Configuration to start playing." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- 3. Fetch dynamic context from Supabase ----
    let ruleContents: Record<string, string> = {};
    let dailySaveLog = "";
    let configApexTarget = body.apexTarget;
    let kipActive = false;
    let triadActive = false;
    let triadTarget = "";
    let narrativeSummaries: NarrativeSummaryRow[] = [];
    let narrativeSummaryRules = "";
    let grottoRegistry = "";
    let grottoMap = "";
    let hardModeActive = false;
    let plotWishlist = "";
    let activeExtras: { title: string; content: string; category: string }[] = [];
    let lockedSaveLogWeather: string | null = null;
    let staminaPendingInSaveLog = false;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Gather all rule-document slugs we need for this turn.
    const slugs = new Set<string>(CORE_RULE_SLUGS);

    // Fetch the playthrough to get the authoritative config.
    const { data: ptRow } = await supabase
      .from("playthroughs")
      .select("apex_target, story_state, user_id")
      .eq("id", body.playthroughId)
      .maybeSingle();

    if (ptRow) {
      const ptState = (ptRow.story_state ?? {}) as Record<string, unknown>;
      configApexTarget = (ptRow.apex_target as string) ?? body.apexTarget;
      kipActive = Boolean(ptState.kip_active);
      triadActive = Boolean(ptState.triad_active);
      triadTarget = typeof ptState.triad_target === "string" ? ptState.triad_target : "";

      if (configApexTarget) slugs.add(apexRuleSlug(configApexTarget));
      if (triadActive && triadTarget) {
        slugs.add("triad-core");
        slugs.add(triadSurrogateSlug(triadTarget));
      }
      if (kipActive) {
        slugs.add("npc-kip-translator");
      }
    }

    // Fetch rule documents (all belong to the same owner; service role bypasses RLS).
    const { data: ruleRows } = await supabase
      .from("rule_documents")
      .select("slug, content")
      .in("slug", Array.from(slugs));

    if (ruleRows) {
      for (const row of ruleRows) {
        ruleContents[row.slug as string] = (row.content as string) ?? "";
      }
    }

    if (configApexTarget?.startsWith("custom:") && ptRow?.user_id) {
      const { data: customRow } = await supabase
        .from("user_custom_apexes")
        .select("content")
        .eq("id", configApexTarget.slice("custom:".length))
        .eq("user_id", ptRow.user_id as string)
        .maybeSingle();
      if (customRow) {
        ruleContents[apexRuleSlug(configApexTarget)] = (customRow.content as string) ?? "";
      }
    }

    // Fetch the daily save log, grotto registry, map, and plot wishlist notes.
    const { data: noteRows } = await supabase
      .from("playthrough_notes")
      .select("tab, content")
      .eq("playthrough_id", body.playthroughId)
      .in("tab", ["daily-save-log", "grotto-registry", "the-map", "plot-wishlist", "narrative-summaries-rules", "hard-mode-consent"]);

    if (noteRows) {
      for (const row of noteRows) {
        const content = (row.content as string) ?? "";
        if (row.tab === "daily-save-log") dailySaveLog = content;
        else if (row.tab === "grotto-registry") grottoRegistry = content;
        else if (row.tab === "the-map") grottoMap = content; // Reads your existing frontend tab
        else if (row.tab === "plot-wishlist") plotWishlist = content;
        else if (row.tab === "narrative-summaries-rules") narrativeSummaryRules = content;
        else if (row.tab === "hard-mode-consent") hardModeActive = content === "active";
      }
    }

    // 1. Check if the Save Log already locked in today's Ocean Condition
    const saveLogWeatherMatch = dailySaveLog.match(/Ocean Condition:\s*([^\n|*]+)/i);
    lockedSaveLogWeather =
      saveLogWeatherMatch && !/pending|none|tbd/i.test(saveLogWeatherMatch[1])
        ? saveLogWeatherMatch[1].trim()
        : null;

    // 2. Check if the Save Log explicitly noted that the -2 morning stamina cost is still pending
    staminaPendingInSaveLog = /pending at Proceed/i.test(dailySaveLog);

    if (lockedSaveLogWeather && body.playerInput.includes("The player has typed Proceed")) {
      body.playerInput += `\n\n[WEATHER LOCK — ENFORCE SAVE LOG]: Today's Ocean Condition is already locked in the [DAILY SAVE LOG] as:   "${lockedSaveLogWeather}". You are STRICTLY FORBIDDEN from rolling or substituting a different weather condition (such as Plankton Bloom). Use "${lockedSaveLogWeather}" and its exact modifiers in your OOC block and narrative.`;
    }

    // 3. Inject Time Clock Telemetry ONLY during active gameplay turns
    // (Completely skips Maintenance Window / WAITING COMMAND, Sleep, Save, Summary, and Proceed)
    if (
      currentGameState === "ACTIVE" &&
      !body.playerInput.includes("[MANDATORY SYSTEM DIRECTIVE")
    ) {
      const timePacing = buildTimePassageDirective(
        body.conversationHistory ?? [],
        dailySaveLog,
        body.playerInput,
      );
      body.playerInput += `\n\n${timePacing.directive}`;
    }

    // Fetch all narrative summaries for this playthrough.
    const { data: summaryRows } = await supabase
      .from("narrative_summaries")
      .select("id, season, year, content")
      .eq("playthrough_id", body.playthroughId)
      .order("year", { ascending: false })
      .order("season", { ascending: false });

    if (summaryRows) {
      narrativeSummaries = summaryRows as NarrativeSummaryRow[];
    }

    // Fetch active extras (only is_active = true entries are included in the prompt).
    const { data: extraRows } = await supabase
      .from("extra_contents")
      .select("title, content, category")
      .eq("playthrough_id", body.playthroughId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (extraRows) {
      activeExtras = extraRows as { title: string; content: string; category: string }[];
    }

    // ---- 4. THE HARD-STATE PRESENCE CHECK ----
    const filesInitialized = body.storyState["files_initialized"] === true;
    const hasSaveLog = dailySaveLog && dailySaveLog.trim().length > 0;
    const hasRegister = grottoRegistry && grottoRegistry.trim().length > 0;
    const hasSummary = narrativeSummaries && narrativeSummaries.length > 0;
    const isActivelySaving = isSaveRequest(body.playerInput) || isSummaryRequest(body.playerInput);

    // Only hard-fail if the game has officially saved, suddenly loses its files, AND the player isn't actively trying to generate them right now.
    if (filesInitialized && !isActivelySaving && (!hasSaveLog || !hasRegister || !hasSummary)) {
      return new Response(
        JSON.stringify({
          error: "⛔ SYSTEM HALT: Critical State Missing! The engine requires the Daily Save Log, Grotto Register, and Narrative Summary to run. One or more of these files are missing."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- 5. Determine which summaries to include in the prompt ----
    // The current season is always included. Older seasons are included only
    // when the player's input or current scene references that specific season/year.
    const currentSeason = (body.storyState["current_season"] as string) ?? null;
    const currentYear = (body.storyState["current_year"] as number) ?? null;

    const referenceText = `${body.playerInput} ${body.currentScene ?? ""}`.toLowerCase();

    const summariesToInclude: NarrativeSummaryRow[] = [];
    const referencedSummaries: NarrativeSummaryRow[] = [];

    for (const s of narrativeSummaries) {
      const isCurrent =
        currentSeason && currentYear
          ? s.season === currentSeason && s.year === currentYear
          : false;

      if (isCurrent) {
        summariesToInclude.push(s);
        continue;
      }

      // 1. Explicit mention check (Season + Year)
      const seasonWords = SEASON_KEYWORDS[s.season] ?? [s.season];
      const yearStr = String(s.year);
      const yearPattern = `year ${s.year}`;
      const mentionsSeason = seasonWords.some((w) => referenceText.includes(w));
      const mentionsYear = referenceText.includes(yearPattern) || referenceText.includes(yearStr);

      // 2. Thematic / Entity Context Check (Smart Search)
      // We scan the summary's content for major nouns, locations, or recurring plot words
      // present in your current scene or input, even if you didn't name the season explicitly.
      const summaryContentLower = s.content.toLowerCase();

      // Pull significant words from the current scene/input (ignoring tiny filler words)
      const significantWords = referenceText
        .split(/\W+/)
        .filter((word) => word.length > 4); // Focus on words with 5+ letters (names, locations, nouns)

      const matchingKeywordsCount = significantWords.filter((word) => summaryContentLower.includes(word)).length;

      // If you explicitly name the season/year OR the scene shares 3+ major thematic keywords with that past summary
      if ((mentionsSeason && mentionsYear) || matchingKeywordsCount >= 3) {
        referencedSummaries.push(s);
      }
    }

    // Current season first, then referenced older seasons (most recent first).
    referencedSummaries.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      const order: Record<string, number> = { spring: 0, summer: 1, fall: 2, winter: 3 };
      return (order[b.season] ?? 0) - (order[a.season] ?? 0);
    });
    summariesToInclude.push(...referencedSummaries);

    // Use the config-derived apex target if we successfully read it.
    const effectiveReq: NarrateRequest = { ...body, apexTarget: configApexTarget || body.apexTarget };

    // Extract only the Queued section from the plot wishlist; ignore Completed.
    const plotWishlistQueued = extractQueuedSection(plotWishlist);

    // ---- 6. DYNAMIC RULE TOKEN PRUNING ----
    // Loop through every loaded rule document and trim out sections that don't
    // apply to the player's current stats, season, or recent AI narration.
    // Package the shared pruning context once so both Zone 1 and Zone 2 use it
  const pruningCtx = {
    playerInput: body.playerInput,
    currentScene: effectiveReq.currentScene,
    dailySaveLog,
    grottoRegistry,
    grottoMap,
    plotWishlistQueued,
    conversationHistory: body.conversationHistory,
    storyState: effectiveReq.storyState,
    apexTarget: effectiveReq.apexTarget,
    triadActive,
  };

  // Save an untouched copy of the raw rules so Zone 2 can pull on-demand templates/rivals
  const rawRuleContents: Record<string, string> = { ...ruleContents };

  // ZONE 1: Prune for the day-frozen System Prompt (100% cache-stable prefix)
  for (const [slug, content] of Object.entries(ruleContents)) {
    ruleContents[slug] = pruneRulesByPlayerState(slug, content, pruningCtx);
  }

  // ZONE 2: Build the Dynamic Turn Tail (empty "" on most normal turns;
  // only populated on Save/Summary/Register, Rival arrival, or GM Q&A!)
  const dynamicTurnTail = getDynamicTurnRules(rawRuleContents, pruningCtx);

    // ---- 7. Build prompts and call the AI ----
    const systemPrompt = buildSystemPrompt(
      effectiveReq,
      ruleContents,
      dailySaveLog,
      { kipActive, triadActive, triadTarget },
      summariesToInclude,
      { currentSeason, currentYear },
      grottoRegistry,
      grottoMap,
      plotWishlistQueued,
      activeExtras,
      narrativeSummaryRules,
      { hardModeActive, gentleDay: Boolean(body.gentleDay) },
    );
    const userPrompt = `${buildUserPrompt(effectiveReq)}${dynamicTurnTail}`;
    const conversationMessages = buildConversationMessages(
      body.conversationHistory ?? [],
      userPrompt,
    );

    const { response: aiResponse, providerError } = await callAI(
      activeKey.provider,
      activeKey.api_key,
      activeKey.base_url,
      systemPrompt,
      conversationMessages,
      effectiveReq.aiModel
    );

    if (providerError) {
      console.error("AI provider error:", providerError);
      return new Response(
        JSON.stringify({ error: providerError }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- 8. Post-process the narration ----
    const data = await aiResponse!.json();
    const rawNarration: string = extractNarration(activeKey.provider, data).replace(SCENE_ANALYSIS_PATTERN, "").trim();
    const narration: string = enforceAquaticAnatomy(rawNarration);

    if (!narration) {
      return new Response(
        JSON.stringify({ error: "The AI provider returned an empty response. Try again or check your key in AI Configuration." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- 9. Auto-update stats from the AI's OOC / GM NOTE, then persist ----
    applyStatUpdatesFromNarration(narration, body.storyState, dailySaveLog);

    await supabase
      .from("playthroughs")
      .update({
        story_state: body.storyState,
        turn_count: (body.storyState["turn_count"] as number ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.playthroughId);

    return new Response(
      JSON.stringify({
        narration,
        turnCount: (body.storyState["turn_count"] as number ?? 0) + 1,
        storyState: body.storyState,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Narrate function error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
