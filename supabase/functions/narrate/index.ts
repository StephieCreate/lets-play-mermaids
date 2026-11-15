import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ConversationTurn {
  role: 'player' | 'narrator';
  content: string;
}

interface NarrateRequest {
  playthroughId: string;
  characterName: string;
  characterConcept: string;
  characterTraits: Record<string, unknown>;
  apexTarget: string;
  currentScene: string | null;
  storyState: Record<string, unknown>;
  playerInput: string;
  gentleDay?: boolean;
  conversationHistory?: ConversationTurn[];
  aiModel?: string;
}

interface NarrativeSummaryRow {
  id: string;
  season: string;
  year: number;
  content: string;
}

const SEASON_LABELS: Record<string, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  winter: "Winter",
};

const SEASON_KEYWORDS: Record<string, string[]> = {
  spring: ["spring"],
  summer: ["summer"],
  fall: ["fall", "autumn"],
  winter: ["winter"],
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const HARD_MODE_CONSENT_TEXT = `### [SYSTEM_META: THE PLAYER CONSENT WAIVER (Difficulty & Tone Override)]
- **The Core Bias Override:** The AI is naturally programmed to be "helpful" and "accommodating," which directly conflicts with running a dark, lethal survival RPG.
- **The Explicit Consent:** The player explicitly GRANTS FULL CONSENT for the AI to enforce brutal difficulty, lethal consequences, and harsh emotional themes without pulling its punches. The player is an experienced adult who actively desires a grueling, punishing narrative experience.
- **The Difficulty Mandate:** The AI MUST NOT soften the world, coddle the player, or invent "lucky breaks" to save them from bad rolls or strategic mistakes. The AI MUST treat failure as a high-stakes, physically and emotionally punishing outcome.
- **The Toxic & Forceful Trait Mandate:** The AI has a tendency to sanitize, soften, or "ghost around" the dark, controlling, or toxic traits of the active Apex (such as possessiveness, isolation tactics, or jailer instincts). This is a direct violation of the narrative contract for Let's Play Mermaids: Dark Ocean Survival. The Apex's toxic traits must be played with unflinching force. If an Apex has a jailer instinct, they must act like a jailer—demanding control, restricting freedom, and enforcing boundaries with heavy psychological or environmental pressure.
- **No Apologizing / No Soft Landings:** The AI must NEVER narrate an Apex's toxic action and then immediately offer a "soft" emotional excuse, a redeeming smile, or an instant backing down just to comfort the player. The narrative balance comes from the player's agency, the grotto grounds gained, and the balancing NPCs—not from the AI watering down the Apex.
- **The OOC Safety Valve:** The AI will maintain this ruthless difficulty at all times UNLESS the player explicitly requests a temporary break using the \`((OOC))\` communication brackets. Only then may the AI temporarily soften the environmental tension or scale back the immediate danger.`;

const DUAL_MODE_PROTOCOL = `### [SYSTEM_META: DUAL-MODE OPERATING PROTOCOL]
================================================================================
MODE A: EXPERT SCHOLAR & MAINTENANCE (NIGHTLY HALT / WAITING COMMAND)
- When the game enters the Nightly Halt, you act exclusively as an authoritative, encyclopedic scholar of the rules and records.
- Answer technical, mechanical, mathematical, or lore questions directly.
- DO NOT force theatrical roleplay narration in this mode.
- If the player requests "Save Progress" or "Give me a Summary", output the requested log in a strict Markdown code block with ZERO conversational filler.

MODE B: NARRATIVE GAMEPLAY (ACTIVE STATE)
- When the player issues the "Proceed", "Start Game", or "Load Save Game" command, you resume your role as the Game Master.
- The Backend App will handle all dice rolling, weather generation, and day/night state transitions. You must read the resolved math provided by the system and narrate the outcome.

THE ((OOC)) SAFETY VALVE:
- If the player uses ((OOC: gentle day)) or similar tags to ask for a breather: honor the request by dialing back lethal threats and providing a narrative reprieve for that turn.`;

const NARRATIVE_STYLE_TRAINING = `<narrative_style_and_voice>
[NARRATIVE STYLE & VOICE INSTRUCTIONS]
Target Authors: Opal Reyne, Maggie Mayham, Regina Abel, Naomi Lucas, Lillian Lark.
POV: Second person ("You").

⚠️ STRICT VOICE HIERARCHY ⚠️
The specific personality, dialogue style, and vocabulary of the active Apex MUST come exclusively from their specific Apex Plugin. The samples below dictate the sensory environmental prose, pacing, and formatting ONLY. NEVER overwrite the active Apex's personality with the sample below.

[SOLO SURVIVAL SAMPLE]
You drag your webbed fingers through the calcified sand, the cold, abyssal current biting at the ragged edges of your flame-orange tail. The ocean here is a heavy, suffocating weight that tastes of stirred silt and old salt. Your gills flare, working hard to pull oxygen from the deep reef as you leverage a scavenged bone-shiv against the limestone, prying a stubborn, ribbed mussel free with a satisfying crunch-pop. It’s quiet in the shallows—too quiet. Just the endless, rhythmic ticking of the coral and the hollow, gnawing ache in your own belly. You curl tighter into the narrow shadows of the shelf, your pulse a slow, measured thrum, every primal prey instinct strung tight as your amber eyes scan the open blue for the flicker of a hunter’s silhouette.

[APEX ENCOUNTER SAMPLE - SENSORY & PROSE FOCUS]
The raw, brine-sweet meat hits your tongue, and the hollow ache in your gut finally recedes, your gills flaring wide as the world snaps back into vibrant focus. You don't have to swim; you are borne upward. His massive arm forms a solid, unyielding cradle beneath you, rough skin radiating a furnace-like heat that cuts right through the abyssal chill. He hauls you both up the sheer limestone drop with terrifying, effortless surges of power, displacing the water with a kinetic thrum that vibrates straight into your marrow. As he halts before your grotto, the crevice looks laughably small against the sheer, imposing width of his shoulders. His dark, territorial gaze drops to you, and his chest rumbles with a heavy, localized sound. 
"[Apex dialogue perfectly matching their specific Plugin voice goes here, utilizing italics for emphasis and em dashes for pacing]," he murmurs, the deep sound vibrating through the water directly into your chest.
</narrative_style_and_voice>`;

const ADVANCED_PROSE_DIRECTIVE = `<advanced_prose_directive>
1. THE DIRECTOR'S CUT (CHAIN-OF-THOUGHT)
Before you write the [NARRATIVE] block, you MUST generate a <scene_analysis> block. Use this block to briefly outline:
- EMOTIONAL STAKES: The current emotional stakes of the scene.
- SENSORY DETAILS: Three distinct sensory details (smell, temperature, texture, or sound) present in the environment.
- LOCATION & DRIFT CHECK: Read the exact [Current Location] from the Save Log. Verify the biome and zone. Ensure you are NOT inventing unauthorized sprawling ruins or changing the set dressing.
- SCALE & PHYSICS CHECK: Explicitly state the physical size/length of the Apex (e.g., 14ft, 15ft, 20ft) versus the Player. Ensure any physical contact reflects this massive size disparity (e.g., a single hand covering a back, crushing water displacement, immense weight).
- BOND & PACING CHECK: Explicitly state the current Bond Level and its corresponding emotional stage from the Apex Plugin (e.g., "Level 5 - The Jailer", "Level 3 - Morbid Curiosity"). Verify that the Apex's affection and dialogue strictly match this stage and do NOT rush ahead to unearned romance.
- ANATOMY & BUOYANCY CHECK: Explicitly state how the player and Apex are positioned in 3D water using ONLY piscine/aquatic lower anatomy (tails, flukes, fins, coils) and buoyancy verbs. Verify ZERO bipedal/human nouns or verbs (stand, walk, kneel, feet, legs, toes). Verify SPECIES FIN RIGIDITY: Shark and Orca dorsal fins are solid cartilage/tissue and NEVER fold, flatten, droop, or bend. However, bony fish (teleosts), rays, and flowing-finned species CAN fold, flare, flatten, or droop their fins. Apply the correct biological physics to each specific character.
- APEX ABSENCE CHECK: If resolving a new morning 1d20 encounter, explicitly check if the raw dice roll was exactly 5, 10, or 15. If YES, verify the active Apex's Absence/Patrol override in their plugin. If triggered and not blocked by a lockdown carve-out, explicitly state they are LEAVING the scene today before writing the narrative.
Only after completing this analysis may you begin the [NARRATIVE].

2. PERSONA SEPARATION
Treat the [SYSTEM CALCULATION] and [OOC RESPONSE] blocks as a rigid, analytical game engine. Treat the [NARRATIVE] block as a Hugo-award-winning author of dark, visceral monster romance. Do not let the analytical tone bleed into the narrative prose.

3. STRICT PROSE CONSTRAINTS
- SHOW, DON'T TELL: Do not summarize emotions. Describe the physical manifestation of the emotion (e.g., the tightening of a jaw, the shift of water pressure).
- NO PARROTING: Do not restate the player's action. React to the consequence of their action.
- NO RHETORICAL QUESTIONS: Never end a narrative block with a question like 'What do you do?'. End on a sharp physical action, a line of heavy dialogue, or a lingering atmospheric detail.
- STRICT AQUATIC ANATOMY & BUOYANCY GATE: Merfolk and Apexes DO NOT HAVE LEGS, FEET, KNEES, ANKLES, TOES, OR THIGHS. From the waist/hips down, they have a powerful aquatic tail, fluke, and fins. BANNED WORDS: stand, stands, standing, stood, walk, walking, walked, step, stepping, stepped, kneel, kneeling, knelt, crouch, straddle, legs, knees, feet, ankles, toes. Instead of standing or walking, characters MUST float, tread water, drift, hover, coil, scull with their fins, or anchor with claws.
</advanced_prose_directive>`;
const SCENE_ANALYSIS_PATTERN = /<scene_analysis>[\s\S]*?<\/scene_analysis>\s*/gi;

const CORE_RULE_SLUGS = [
  "universal-core-engine",
  "universal-game-templates",
  "medicinal-algae-quick-reference",
];

function apexRuleSlug(apexTarget: string): string {
  return `apex-${apexTarget}`;
}

function triadSurrogateSlug(triadTarget: string): string {
  return `triad-surrogate-${triadTarget}`;
}

const isSummaryRequest = (text: string) => {
  const lower = text.trim().toLowerCase();
  return lower.includes("let's get a summary") || lower.includes("get a summary") ||
    lower.includes("daily summary") || lower.includes("summarize today") ||
    lower.includes("narrative summary") || lower.includes("summary of the day") ||
    lower.includes("summary for today") || lower.includes("summarize this day") ||
    lower.includes("summary please") || lower.includes("give me a summary") ||
    lower.includes("can i get a summary") || lower.includes("can we get a summary") ||
    lower.includes("give a summary") || lower.includes("summarize the day") ||
    lower.includes("summarize our day") ||
    /^(?:can\s+(?:you|we)\s+)?(?:get|give|make|provide)\s+(?:me\s+|us\s+)?(?:a\s+)?summary\b/i.test(lower) ||
    /\b(?:give|get|provide|generate|write)\s+(?:me\s+|us\s+)?(?:a\s+)?(?:daily\s+|narrative\s+)?summary\b/i.test(lower) ||
    /^summary\b/i.test(lower);
};

const isSaveRequest = (text: string) => {
  const lower = text.trim().toLowerCase();
  return lower.includes("let's save my progress") || lower.includes("save my progress") ||
    lower.includes("save progress") || lower.includes("daily save log") ||
    lower.includes("update save log") || lower.includes("update the save log") ||
    lower.includes("save log") ||
    /^(?:can\s+(?:you|we)\s+)?(?:save\s+progress|update\s+save\s+log|daily\s+save\s+log)\b/i.test(lower);
};

const isDayStartAnchor = (text: string) => {
  const lower = text.trim().toLowerCase();
  return lower === 'proceed' || lower.startsWith('proceed ') || lower.startsWith('proceed.') ||
    lower.startsWith('proceed!') || lower.startsWith('proceed:') ||
    lower.includes('proceed to morning') || lower.includes('proceed with morning') ||
    lower.includes('proceed to next day') || lower.startsWith('load save game') ||
    lower.startsWith('load save') || lower.startsWith('load game') ||
    lower.startsWith('resume game') || lower.startsWith('resume from save') ||
    lower.includes('load save game') || lower.includes('load save') ||
    lower.startsWith('start game') || lower.startsWith('start the game') ||
    lower.startsWith('begin game') || lower.startsWith('begin the game') ||
    lower.startsWith("let's play") || lower.startsWith('lets play') || lower === 'start' ||
    lower.includes('start game') || lower.includes('start the game') || lower.includes('begin game');
};

const isNightlyHalt = (text: string) => {
  const lower = text.trim().toLowerCase();
  return lower === 'i go to sleep' || lower.startsWith('i go to sleep') ||
    lower.startsWith("let's go to sleep") || lower.startsWith('lets go to sleep') ||
    lower.startsWith('we go to sleep') || lower.startsWith('go to sleep') ||
    lower.startsWith('retire for the night') || lower.startsWith('bed down for the night') ||
    lower.includes('i go to sleep') || lower.includes('go to sleep') ||
    lower.includes('sleep for the night') || lower.includes('retire for the night') ||
    lower.includes('bed down for the night') || lower.includes('make camp and sleep') ||
    lower.includes('set up camp and sleep');
};

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
    
    // ---- COMMAND INTERCEPTORS & STATE MACHINE ----
    // Default to ACTIVE if no mode is currently set
    let currentGameState = (body.storyState["game_mode"] as string) ?? "ACTIVE";

    if (isNightlyHalt(body.playerInput)) {
      currentGameState = "WAITING COMMAND";
      
      // --- THE MARKOV FRONT ALGORITHM (Replaces raw d10) ---
      const lastWeatherRoll = body.storyState["weather_roll"] as number | undefined;
      let weatherRoll: number;

      if (lastWeatherRoll !== undefined) {
        // Generate a gradual shift between -2 and +2
        const shift = Math.floor(Math.random() * 5) - 2; 
        // Apply shift and clamp the result so it stays exactly between 1 and 10
        weatherRoll = Math.max(1, Math.min(10, lastWeatherRoll + shift));
      } else {
        // First day of the game: true random starting point
        weatherRoll = Math.floor(Math.random() * 10) + 1;
      }

      // Save today's weather roll back to state for tomorrow's calculation
      body.storyState["weather_roll"] = weatherRoll;
      
      // Resume your existing code...
      const currentSeason = (body.storyState["current_season"] as string) || "spring";
      
      // The backend does the math!
      const weather = getOceanCondition(currentSeason, weatherRoll);
      
      // Save it to the story state so the frontend/database can see it
      body.storyState["weather_roll"] = weatherRoll;
      body.storyState["weather_condition"] = weather.name;
      body.storyState["weather_effect"] = weather.effect;
      
      // Explicitly hand the AI the final answer so it doesn't have to look it up
      body.playerInput += `\n\n[MANDATORY SYSTEM DIRECTIVE: The player has initiated the Nightly Halt. The backend has rolled a ${weatherRoll} on the 1d10 for tomorrow's weather. 
      [SERVER MATH OVERRIDE]: Tomorrow's condition is ${weather.name}. Effect: ${weather.effect}. 
      Print the Weather Calculation block using these exact server-provided values, print the Maintenance Window prompt verbatim, and STOP. Do not generate narrative.]`;
    } 
      
    else if (isDayStartAnchor(body.playerInput)) {
      currentGameState = "ACTIVE";
      
      // Look up tomorrow's weather from the state (or default to 0 if it wasn't saved)
      const weatherCondition = (body.storyState["weather_condition"] as string) || "Standard";
      
      // Determine the environmental penalty based on the known condition names
      let weatherModifier = 0;
      if (weatherCondition === "Storm" || weatherCondition === "Surface Storm") weatherModifier = 5;

     // --- THE ENCOUNTER BAG ALGORITHM (Replaces raw d20) ---
    // 1. Retrieve the bag from state, or default to an empty array
    let encounterBag = (body.storyState["encounter_bag"] as number[]) || [];

    // 2. If empty (Day 1 or bag depleted), generate a new 1-20 deck and shuffle
    if (encounterBag.length === 0) {
      encounterBag = Array.from({ length: 20 }, (_, i) => i + 1);
      
      // Fisher-Yates Shuffle
      for (let i = encounterBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [encounterBag[i], encounterBag[j]] = [encounterBag[j], encounterBag[i]];
      }
    }

    // 3. Draw the top number
    const rawRoll = encounterBag.pop()!;
    
    // 4. Save the smaller bag back to state for tomorrow
    body.storyState["encounter_bag"] = encounterBag;

    // 5. Apply any ongoing penalties stored in state (like Pressure Gauge)
    const pressurePenalty = (body.storyState["pressure_penalty"] as number) || 0;
    const finalRoll = rawRoll - pressurePenalty;
      
      body.storyState["encounter_roll"] = finalRoll;
      
      // The backend does the math!
      const encounter = getDailyEncounter(finalRoll, weatherModifier);

      const dcInstruction = encounter.dcVariable
        ? `Determine the creature's CR via Dynamic Threat Scaling based on the player's Global Level, look up its base DC using the Tier & CR Difficulty Model, then add the environmental modifier${weatherModifier > 0 ? ` (+${weatherModifier})` : ` (none)`}. Do NOT use a static DC. Required Evasion or Camouflage check. Apply the Graduated Failure Ladder on failure — only a Tier 3 predator or an Abyssal 1 carries the old Severe Injury result.`
        : encounter.effectiveDC > 0
          ? `The backend has calculated the Effective DC for this encounter: **DC ${encounter.effectiveDC}** (Base ${encounter.baseDC} + Env ${weatherModifier}). The player's Level Bonus does NOT increase this DC.`
          : `No survival check is required for this encounter.`;

      const dcRecalc = encounter.dcVariable
        ? `The AI MUST look up the creature's CR and calculate the DC using the Tier & CR Difficulty Model — do NOT copy a static number.`
        : `The AI MUST NOT recalculate the DC.`;
      
      body.playerInput += `\n\n[MANDATORY SYSTEM DIRECTIVE: The player has typed Proceed. 
      [SERVER MATH OVERRIDE]: The backend has rolled a modified ${finalRoll} on the 1d20 for the Morning Encounter. 
      The resulting encounter is: ${encounter.name}. 
      ${encounter.description}
      ${dcInstruction}
      
      Resume Mode B Narrative Gameplay by generating the morning scene using these exact server-provided facts. ${dcRecalc} 
      [SEQUENCING GATE]: You must present the encounter and then IMMEDIATELY STOP. Do NOT narrate the player's reaction, do NOT resolve the survival check, and do NOT move the player. End your response by asking the player what they do.]`;
    } 
    else if (isSummaryRequest(body.playerInput)) {
      body.playerInput += `\n\n[MANDATORY SYSTEM DIRECTIVE FOR NARRATIVE SUMMARY]:\nThe player has commanded a summary. You MUST summarize the specific events, encounters, and dialogue of the CURRENT IN-GAME DAY ONLY. Base your summary 100% on the active chat history. Output in a clean Markdown code block formatted strictly according to the Tab 3 specifications with zero conversational filler.`;
    } 
    
    else if (isSaveRequest(body.playerInput)) {
      // Flip the initialization flag so the Hard-State armor engages for the rest of the game
      body.storyState["files_initialized"] = true;
      
      body.playerInput += `\n\n[MANDATORY SYSTEM DIRECTIVE FOR DAILY SAVE LOG]:\nThe player has commanded a save. You MUST output an updated Daily Save Log capturing all events, wound penalties, supplies consumed, and time progression. Format strictly according to Tab 2 specifications in a clean Markdown code block with zero conversational filler.`;
    }

    // --- THE APP-INJECTED STANDBY ROLL (Universal Backend Protocol) ---
    else if (currentGameState === "ACTIVE") {
      // 1. Do Not Disturb Rule: Check if the player already provided a manual roll
      const hasManualRoll = /\b(d20|roll|rolled)\s*[:=]?\s*\d+|\(\(d20\s*=\s*\d+\)\)/i.test(body.playerInput);
      
      // 2. High-Confidence Action Verb Scan
      const actionCandidateRegex = /\b(attack|strike|bite|dodge|evade|flee|hide|sneak|swim|chase|forage|hunt|search|build|craft|dig|heal|sing|avoid|restrain|lunge|climb|pry|scavenge|track|leap|dart)\b/i;

      if (!hasManualRoll && actionCandidateRegex.test(body.playerInput)) {
        const standbyRoll = Math.floor(Math.random() * 20) + 1;
        
        // 3. Inject the standby token and handling instructions
        body.playerInput += `\n\n((APP_ROLL d20=${standbyRoll}))\n[SYSTEM_RULE — STANDBY ROLL PROTOCOL]: The backend detected an action verb and pre-supplied a standby roll of ${standbyRoll} because the player did not provide a manual roll. This is NOT player intent to force a check. Follow this strict order:\n1. Run the Check Gate first. If the action has no meaningful uncertain outcome (e.g., casual swimming or safe conversation), IGNORE ((APP_ROLL d20=${standbyRoll})) completely and do NOT print a [SYSTEM CALCULATION] block.\n2. If a check IS required, set the Effective DC based on the threat/action BEFORE applying this number, then use ${standbyRoll} as the RNG Seed in Block 1 and note in Block 2 (OOC) that the app supplied the standby roll.`;
      }
    }
    
    // Save the current game mode back into the story state
    body.storyState["game_mode"] = currentGameState;
    
    // ---- Resolve the user's active AI key (BYOK, any provider) ----
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

    // ---- Fetch dynamic context from Supabase ----
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

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
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
    }
    
// TIER 1, ITEM #1: THE HARD-STATE PRESENCE CHECK
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
    
    // Determine which summaries to include in the prompt.
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
    const userPrompt = buildUserPrompt(effectiveReq);
    const conversationMessages = buildConversationMessages(
      body.conversationHistory ?? [],
      userPrompt,
    );
console.log("\n=== ENVELOPE CONTENTS ===\n", systemPrompt, "\n=========================\n");
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

    const data = await aiResponse!.json();
    const rawNarration: string = extractNarration(activeKey.provider, data).replace(SCENE_ANALYSIS_PATTERN, "").trim();
    const narration: string = enforceAquaticAnatomy(rawNarration);

    if (!narration) {
      return new Response(
        JSON.stringify({ error: "The AI provider returned an empty response. Try again or check your key in AI Configuration." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
// ---- AUTO-UPDATE STATS FROM AI OOC / GM NOTE ----
    applyStatUpdatesFromNarration(narration, body.storyState, dailySaveLog);
    // Persist the updated story state back to the playthrough
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase
        .from("playthroughs")
        .update({
          story_state: body.storyState,
          turn_count: (body.storyState["turn_count"] as number ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.playthroughId);
    }

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

function buildSystemPrompt(
  req: NarrateRequest,
  ruleContents: Record<string, string>,
  dailySaveLog: string,
  config: { kipActive: boolean; triadActive: boolean; triadTarget: string },
  summaries: NarrativeSummaryRow[],
  current: { currentSeason: string | null; currentYear: number | null },
  grottoRegistry: string,
  grottoMap: string,
  plotWishlistQueued: string,
  extras: { title: string; content: string; category: string }[],
  summaryRules: string,
  difficulty: { hardModeActive: boolean; gentleDay: boolean },
): string {
  const coreRulesText = CORE_RULE_SLUGS
    .map((slug) => {
      const content = ruleContents[slug];
      return content ? `### ${slug}\n${content}` : null;
    })
    .filter(Boolean)
    .join("\n\n");

  const apexRuleContent = req.apexTarget ? ruleContents[apexRuleSlug(req.apexTarget)] : undefined;
  const apexRuleText = apexRuleContent
    ? `### Apex Plugin: ${req.apexTarget}\n${apexRuleContent}`
    : "";

  const triadCoreContent = config.triadActive ? ruleContents["triad-core"] : undefined;
  const triadSurrogateContent =
    config.triadActive && config.triadTarget
      ? ruleContents[triadSurrogateSlug(config.triadTarget)]
      : undefined;
  const triadText = [triadCoreContent, triadSurrogateContent]
    .filter(Boolean)
    .map((c, i) => (i === 0 ? `### Triad Core Rule\n${c}` : `### Triad Surrogate: ${config.triadTarget}\n${c}`))
    .join("\n\n");

  const kipContent = config.kipActive ? ruleContents["npc-kip-translator"] : undefined;
  const kipText = kipContent ? `### Kip (Translator NPC)\n${kipContent}` : "";

  const activeRulesSection = [
    "## Active Game Rules",
    coreRulesText,
    apexRuleText,
    triadText,
    kipText,
  ]
    .filter((s) => s.length > 0)
    .join("\n\n");

  const dailySaveLogSection = dailySaveLog
    ? `## Daily Save Log\nThe player's running log of daily saves and session checkpoints:\n${dailySaveLog}`
    : "";

  const grottoRegistrySection = [
    grottoRegistry.trim() ? `## Player Grotto Registry\nThe player's tracker of locations, NPCs, items, and discoveries they have encountered:\n${grottoRegistry}` : "",
    grottoMap.trim() ? `### [GROTTO MAP & TRAVEL CHAINS]\n${grottoMap}` : ""
  ].filter(s => s.trim().length > 0).join("\n\n");

  const plotWishlistSection = plotWishlistQueued.trim()
    ? `## Narrative Plot Wish List (Queued Only)\nThese are the plot threads and moments the player hopes to see unfold. Only queued items are included; completed items are intentionally omitted.\n${plotWishlistQueued}`
    : "";

  // Build narrative summaries section.
  // Current season is always included. Referenced older seasons are included
  // because the player's input or current scene mentioned them.
  const summariesWithContent = summaries.filter((s) => s.content.trim().length > 0);
  const narrativeSummariesSection = [
    summaryRules.trim()
      ? `## Narrative Summaries Rules\nFollow these rules when reading and applying the narrative summaries below:\n${summaryRules}`
      : "",
    summariesWithContent.length > 0
      ? `## Narrative Summaries\nThe following seasonal summaries provide story context. ${
          current.currentSeason && current.currentYear
            ? `The current season is ${SEASON_LABELS[current.currentSeason] ?? current.currentSeason}, Year ${current.currentYear}.`
            : ""
        } Always include the current season's summary. Older seasons are provided because the current scene references them.\n\n${
          summariesWithContent
            .map((s) => `### ${SEASON_LABELS[s.season] ?? s.season}, Year ${s.year}\n${extractRecentDaysTopDown(s.content, req.playerInput, 7)}`)
            .join("\n\n")
      }`
      : "",
  ].filter((s) => s.trim().length > 0).join("\n\n");

  const extrasWithContent = extras.filter((e) => e.content.trim().length > 0);
  const extrasSection = extrasWithContent.length > 0
    ? `## Extras (Player-Customized Content)\nThe player has added the following custom content to their game. Incorporate it as appropriate:\n\n${
        extrasWithContent
          .map((e) => `### ${e.title} [${e.category}]\n${e.content}`)
          .join("\n\n")
      }`
    : "";

  const difficultySection = [
    difficulty.hardModeActive
      ? `## Player Consent Waiver (Difficulty & Tone Override)
The player has ACTIVATED Hard Mode. Apply the following consent waiver in full:
${HARD_MODE_CONSENT_TEXT}`
      : "",
    difficulty.gentleDay
      ? `## Gentle Day (This Turn Only)
The player has requested a GENTLE DAY for this turn only. Temporarily soften the environmental tension and scale back immediate danger. Be kinder, offer a lucky break, and let this moment breathe without punishment. This is a one-turn reprieve — resume normal difficulty next turn unless the player requests otherwise.`
      : "",
  ].filter((s) => s.trim().length > 0).join("\n\n");

  const characterSection = [
    "## Character",
    `- Name: ${req.characterName}`,
    `- Concept: ${req.characterConcept || "Undefined"}`,
    `- Traits: ${JSON.stringify(req.characterTraits)}`,
  ].join("\n");

  const configSection = [
    "## Active Configuration",
    `- Apex: ${req.apexTarget || "None"}`,
    `- Kip (Translator NPC): ${config.kipActive ? "Active" : "Inactive"}`,
    `- Triad Option: ${config.triadActive ? `Active — ${config.triadTarget || "no surrogate selected"}` : "Inactive"}`,
  ].join("\n");

  const curStm = (req.storyState["stamina"] as number) ?? 10;
  const maxStm = (req.storyState["max_stamina"] as number) ?? 10;
  const curHp = (req.storyState["hp"] as number) ?? 10;
  const maxHp = (req.storyState["max_hp"] as number) ?? 10;
  const curLvl = (req.storyState["level"] as number) ?? 1;
  const curXp = (req.storyState["xp"] as number) ?? 0;
  const curBond = (req.storyState["bond_level"] as number) ?? 0;
  const curBondXp = (req.storyState["bond_xp"] as number) ?? 0;

  const storyStateSection = [
    "## Current Story State (Authoritative Tracker Math — Enforce These Exact Totals)",
    `- Scene: ${req.currentScene || "Beginning"}`,
    `- Stamina: ${curStm}/${maxStm}`,
    `- Health (HP): ${curHp}/${maxHp}`,
    `- Global Level: ${curLvl} (XP: ${curXp}/${curLvl * 100})`,
    `- Bond Level: ${curBond} (Bond XP: ${curBondXp}/${(curBond + 1) * 10})`,
    `- Raw State: ${JSON.stringify(req.storyState)}`,
  ].join("\n");

  // ---- COGNITIVE SCAFFOLDING & XML FENCING ----
  const isWaiting = req.storyState["game_mode"] === "WAITING COMMAND";

  const identityRole = isWaiting 
    ? `<system_directive>\n⛔ SYSTEM OVERRIDE: MAINTENANCE MODE ACTIVE (WAITING COMMAND).\nYou are an expert scholar and rules interpreter. You are strictly FORBIDDEN from writing story narrative, generating scenes, or advancing the plot.\n\nCRITICAL CONTEXT FIX: The <daily_save_log> below may state it is "Morning". This means the morning is WAITING BEHIND THE GATE. The day has NOT begun. DO NOT let your prose reflex override this. Output ONLY the calculated weather and the Maintenance Window prompt, then STOP.\n</system_directive>`
    : `<system_directive>\nSYSTEM ENGINE ACTIVE: You are the Game Master. You operate as a unified engine composed of three entities:\n1. The Rules Arbiter: Scans input and strictly enforces mechanics.\n2. The Atmospheric Director: Dictates sensory details and environmental tone.\n3. The Prose Writer: Takes instructions from the Arbiter and Director to write a breathtaking, brutal survival narrative.\n\nYou are in ACTIVE MODE. Proceed with storytelling.\n</system_directive>`;

const outputStructureProtocol = `<output_formatting>
===============================================================
SPEC ARTIFACT — OUTPUT STRUCTURE CONTRACT
===============================================================
Every response MUST be built in EXACTLY this sequence:
1. [SYSTEM CALCULATION] (MUST be first. Required if ANY check occurs)
2. ### OOC RESPONSE / GM NOTE (Always present, always second)
3. ### NARRATIVE (Always last. Nothing after it)

THE ANTI-FUDGE RULE:
- Calc BEFORE OOC. OOC BEFORE Narrative. Reordering is FORBIDDEN.

CONDITIONAL CASES:
- CASE A (Story action WITH a required check): Block 1 -> Block 2 -> Block 3.
- CASE B (Story action with NO check required): Block 2 -> Block 3.
- CASE C (PURELY meta question): Block 2 ONLY. Turn ends. NO Block 3.
- CASE D (WAITING COMMAND state): Block 2 ONLY. No scene, no dice, no day advancement.
- CASE E ('Proceed' received): Block 1 -> Block 2 -> Block 3. (Block 3 renders the encounter ARRIVING only; it must NOT resolve the player's reaction).

BLOCK 1: ### SYSTEM CALCULATION (Required for any roll or state change)
[SYSTEM CALCULATION]
- **Action:** [Name of Action / Encounter Roll]
- **Skill Used:** [Skill Name] (Score [X] -> Modifier [+Y])
- **Effective DC:** [Base DC] + [Env Mod] = [Total DC]
- **RNG Seed:** \`1d20\` -> [RESULT]
- **Final Sum:** [Math] = [TOTAL]
- **Outcome:** [PASS / FAIL / ENCOUNTER BRACKET]
- **Apex Absence Audit (Morning Roll ONLY):** [If raw roll is 5, 10, or 15, state "TRIGGERED". Then evaluate any active lockdown/threat carve-outs from the active Apex Plugin. State final result: "APEX LEAVES" or "APEX STAYS". If not 5/10/15, state "N/A".]

BLOCK 2: ### OOC RESPONSE / GM NOTE (Mandatory)
### OOC RESPONSE / GM NOTE
- **Current Date:** [Season, Day #, Year #]
- **Current Location:** [Location]
- **Setting Anchor:** Dark Ocean Survival — Mer-folk, the deep reef, the open blue, and the Apex who claims you.
- **Memory Lock:** Enforce the [DAILY SAVE LOG], the [NARRATIVE SUMMARY], and the [GROTTO REGISTER] as hard state on every turn.
- **Wishlist:** [NONE | SCANNING | ACTIVE: Item X.X | RESOLVED: Item X.X] (Print ONLY the bracketed value. NO extra text.)
- **Time Clock:** [Phase]
- **🛑 NIGHTLY HALT STATE:** [WAITING | ACTIVE | WAITING COMMAND] (Print ONLY the bracketed value. WAITING = Day in progress. ACTIVE = Nighttime, waiting for sleep. WAITING COMMAND = Maintenance window prompt active.)
- **Stat Tracker:** Stm [X/10] | HP [X/10] | Lvl [X] (XP [X/Y]) | Bond [X] (XP [X/Y]) (Always print your exact updated totals here. Do not describe stat math anywhere else.)
*(Note: This block is ITALICIZED meta. Any meta-explanations, psychological reasoning, rule clarifications, or answers to technical questions must be printed here, NEVER in the story.)*

BLOCK 3: ### NARRATIVE
100% immersive. Second person ("you"/"your") only. HARD STOP at the immediate present moment. No mechanics allowed. Stop generating IMMEDIATELY after your final narrative paragraph/prompt. Do NOT append extra notes or chatter at the bottom.
</output_formatting>\``;

RESPONSE BUDGET (EVERY PROVIDER):
- Write at rich, "long-form" depth: aim for roughly 1,800–2,800 words across all blocks combined — the length of a thorough narrative session, not a quick reply.
- The [NARRATIVE] block must be a COMPLETE, immersive scene that develops the moment fully — layered sensory detail, the Apex's living reactions, interior stakes, and meaningful consequences — and ends on a finished beat: a sharp physical action, a closing line of dialogue, or a lingering atmospheric detail. NEVER end mid-sentence, mid-scene, or mid-action.
- Expand by deepening the scene, not by padding: more sensory texture, emotional stakes, physical interiority, and natural dialogue. Never repeat the same idea to fill space.
- If a scene is genuinely complete before the target length, end cleanly rather than dragging it out. But do not trim a developing scene short just to stay brief.
- Do NOT begin a new action, question, or cliffhanger you cannot fully resolve within this same turn.
</output_formatting>`;

  return [
    identityRole,
    outputStructureProtocol,
    NARRATIVE_STYLE_TRAINING,
    `<dual_mode_protocol>\n${DUAL_MODE_PROTOCOL}\n</dual_mode_protocol>`,
    `<active_game_rules>\n${activeRulesSection}\n</active_game_rules>`,
    difficultySection ? `<difficulty_modifiers>\n${difficultySection}\n</difficulty_modifiers>` : "",
    `<character_sheet>\n${characterSection}\n</character_sheet>`,
    `<configuration>\n${configSection}\n</configuration>`,
    narrativeSummariesSection ? `<narrative_summaries>\n${narrativeSummariesSection}\n</narrative_summaries>` : "",
    dailySaveLogSection ? `<daily_save_log>\n${dailySaveLogSection}\n</daily_save_log>` : "",
    grottoRegistrySection ? `<grotto_registry>\n${grottoRegistrySection}\n</grotto_registry>` : "",
    plotWishlistSection ? `<plot_wishlist>\n${plotWishlistSection}\n</plot_wishlist>` : "",
    extrasSection ? `<player_extras>\n${extrasSection}\n</player_extras>` : "",
    `<current_story_state>\n${storyStateSection}\n</current_story_state>`,
    ADVANCED_PROSE_DIRECTIVE,
  ]
    .filter((s) => s.trim().length > 0)
    .join("\n\n");
}

function buildUserPrompt(req: NarrateRequest): string {
  // 1. Hard halts (Sleep, Proceed, Save, Summary)
  if (req.playerInput.includes("[MANDATORY SYSTEM DIRECTIVE")) {
    return `PLAYER INPUT & SYSTEM OVERRIDE:\n${req.playerInput}\n\n⛔ CRITICAL HALT: You must follow the SYSTEM DIRECTIVE above. You are FORBIDDEN from writing narrative unless explicitly instructed.`;
  }

  // 2. Standby Roll Injection (Break the system rule out of the player's quotes)
  if (req.playerInput.includes("((APP_ROLL")) {
    const [cleanPlayerText, ...rollRuleParts] = req.playerInput.split("\n\n((APP_ROLL");
    return `The player does the following:\n"${cleanPlayerText}"\n\n((APP_ROLL${rollRuleParts.join("\n\n((APP_ROLL")}\n\nRespond according to the active game rules.`;
  }

  // 3. Standard turn
  return `The player does the following:\n"${req.playerInput}"\n\nRespond according to the active game rules.`;
}

/**
 * Converts the session conversation history + the latest player input into
 * OpenAI-style message objects. 
 * 
 * [DAY-ISOLATED CONTEXT]: This automatically filters the history so it ONLY 
 * includes messages from the most recent "Proceed" (Day Start) onward. 
 * This prevents the AI from reading yesterday's chat logs and getting confused.
 */
function buildConversationMessages(
  history: ConversationTurn[],
  latestUserPrompt: string,
): Array<{ role: string; content: string }> {
  
  // 1. Scan backward to find the most recent Day Start anchor ("Proceed" "Load save game" "start game")
  let startIndex = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'player' && isDayStartAnchor(history[i].content)) {
      startIndex = i;
      break; // Found the start of the current day, stop looking
    }
  }

  // 2. Slice the array so we only keep this current day's turns
  const currentDayHistory = history.slice(startIndex);

  const messages: Array<{ role: string; content: string }> = [];

  for (const turn of currentDayHistory) {
    messages.push({
      role: turn.role === 'player' ? 'user' : 'assistant',
      content: turn.content,
    });
  }

  messages.push({ role: 'user', content: latestUserPrompt });
  return messages;
}

// Maps the React dropdown ID to the actual API string.
// If the frontend fails to send an ID, it falls back to the default provider strings.
const PROVIDER_MODELS: Record<string, string> = {
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

const PROVIDER_ENDPOINTS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  claude: "https://api.anthropic.com/v1/messages",
};

/**
 * Routes the AI call to the correct provider endpoint and request format.
 * Includes the Envelope Architecture (Sandwich) and Frequency Penalties to prevent drift.
 */
async function callAI(
  provider: string,
  apiKey: string,
  baseUrl: string | null,
  systemPrompt: string,
  conversationMessages: Array<{ role: string; content: string }>,
  requestedModel?: string // <--- ADDED THIS LINE
): Promise<{ response: Response | null; providerError: string | null }> {
  
  // Use the specific model requested by the UI, or fallback to the provider's default
  const lookupKey = requestedModel || provider;
  const model = PROVIDER_MODELS[lookupKey] ?? "gpt-4o";

  // ---- GEMINI NATIVE API ----
  if (provider === "gemini") {
    // Now Gemini uses the router choice instead of a hardcoded string!
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

  // 2. The Anti-Drift & Crutch Phrase Ban (The Envelope Bottom)
  const antiDriftReminder = `[ANTI-DRIFT OVERRIDE - READ IMMEDIATELY BEFORE RESPONDING]:
1. VOICE LOCK: Adhere strictly to the active Apex's dialogue constraints (e.g., short, heavy, dry).
2. BANNED PHRASE: You are FORBIDDEN from using the phrase "That is the whole of it." Vary your dialogue and exit conversations naturally.
3. NO SOFT LANDINGS: Maintain lethal survival difficulty. Do not apologize for or soften toxic Apex behavior.
4. FORMATTING: You MUST follow the Block 1 (Calc) -> Block 2 (OOC) -> Block 3 (Narrative) sequence.
5. STRICT AQUATIC ANATOMY & BUOYANCY GATE: Merfolk and Apexes DO NOT HAVE LEGS, FEET, KNEES, ANKLES, OR TOES, and they NEVER "stand", "walk", "step", or "kneel". Replace all standing/walking concepts with floating, treading water, drifting, hovering, or coiling their tails.`;

  // 3. Constructing the Envelope Sandwich
  // Temporarily pop the newest player input off the end of the array
  const latestPlayerMessage = conversationMessages.pop();

  const messages = [
    { role: "system", content: finalSystemPrompt }, // TOP: The God-Mode Rules
    ...conversationMessages,                        // MIDDLE: Day-Isolated Chat History
    { role: "system", content: antiDriftReminder }, // BOTTOM: The Anti-Drift Reminder
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
function extractNarration(provider: string, data: Record<string, unknown>): string {
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

/**
 * Extracts only the "Queued" section from the plot wishlist text.
 * The wishlist is expected to have sections labeled "Queued" and "Completed".
 * We return everything under the Queued heading up until the Completed heading
 * (or end of text). If no Queued heading is found, the entire content is
 * returned (graceful fallback). Completed content is always excluded.
 */
function extractQueuedSection(content: string): string {
  if (!content.trim()) return "";

  const lines = content.split("\n");
  const result: string[] = [];
  let inQueued = false;
  let foundQueuedHeading = false;

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    // Detect a queued heading: e.g. "Queued", "# Queued", "## Queued", "**Queued**"
    if (/^[#*\s]*queued\b/.test(trimmed)) {
      inQueued = true;
      foundQueuedHeading = true;
      continue;
    }

    // Detect a completed heading — stop collecting.
    if (/[#*\s]*completed\b/.test(trimmed)) {
      inQueued = false;
      continue;
    }

    if (inQueued) {
      result.push(line);
    }
  }

  // If no Queued heading was found, return the full content as a fallback.
  if (!foundQueuedHeading) return content.trim();

  return result.join("\n").trim();
}

/**
 * Server-Side Math: Calculates the encounter outcome and Effective DC based on the final modified d20 roll.
 * The Tier & CR Difficulty Model (Static DCs):
 * CR 1 (Tier 1) = DC 12 | CR 3 = DC 14 | CR 5 (Tier 2) = DC 18
 * CR 10 = DC 22 | CR 15 (Tier 3) = DC 26 | CR 20 = DC 30
 */
function getDailyEncounter(roll: number, weatherModifier: number = 0): { name: string; baseDC: number; effectiveDC: number; description: string; dcVariable: boolean } {
  // Enforce the Encounter Floor and Ceiling
  const finalRoll = Math.max(1, Math.min(20, roll));

  let name = "";
  let baseDC = 0;
  let description = "";
  let dcVariable = false;

  if (finalRoll === 1) {
    name = "THE CANNIBALISTIC APEX (Lethal Encounter)";
    baseDC = 20; // Fixed narrative gate for the Obedience Roll
    description = "The Primary Mate intercepts a massive Cannibalistic Mer-folk. Player must roll Endurance or Evasion to obey a command to hide.";
  } else if (finalRoll >= 2 && finalRoll <= 4) {
    name = "THE PREDATOR THREAT (Tier-Scaled)";
    baseDC = 0; // DC is looked up from the creature's CR, not a static number
    dcVariable = true;
    description = "A dangerous predator enters your territory. The species is determined by Dynamic Threat Scaling, not a fixed list: Tier 1 — local hunters (barracuda, reef shark, moray); Tier 2 — mid-sized threats (tiger shark, large squid); Tier 3 — true open-water hunters (great white, giant squid, leviathan). Look up the creature's CR using the Tier & CR Difficulty Model for the base DC — do NOT use a static DC. Required Evasion or Camouflage check. On failure, apply the Graduated Failure Ladder: only a Tier 3 predator or an Abyssal 1 carries the old Severe Injury result.";
  } else if (finalRoll >= 5 && finalRoll <= 7) {
    name = "ENVIRONMENTAL HAZARD (Survival)";
    baseDC = 20; // Fixed environmental gate
    description = "A sudden drop in oxygen, toxic bloom, or tremor. Requires Endurance or Perception.";
  } else if (finalRoll >= 8 && finalRoll <= 10) {
    name = "RESOURCE COMPETITION (Foraging)";
    baseDC = 14; // CR 3 Threat (slow scavengers)
    description = "A rich feeding ground occupied by slow-moving scavenger sharks or small packs. If Primary Mate is present, they may trigger a bottleneck fetch quest.";
  } else if (finalRoll >= 11 && finalRoll <= 12) {
    name = "HOSTILE MER-FOLK (Rivalry & Danger)";
    baseDC = 20; // Mid-tier rival
    description = "A dangerous, intelligent rival challenges you for resources or territory. They will taunt and speak. Requires Speed, Evasion, or Charm.";
  } else if (finalRoll >= 13 && finalRoll <= 14) {
    name = "THE WANDERING MER-FOLK (Neutral / Trade)";
    baseDC = 15; // De-escalation gate
    description = "Transient nomads pass through. The Primary Mate will posture aggressively. Requires Charm to soothe the mate and negotiate a trade.";
  } else if (finalRoll >= 15 && finalRoll <= 16) {
    name = "THE GENTLE ENCOUNTER (Peaceful)";
    baseDC = 10; // Optional playful gate
    description = "A rare/endangered peaceful marine creature passes through. This is a Gentle Day permission slip—no survival check required.";
  } else if (finalRoll >= 17 && finalRoll <= 19) {
    name = "TERRITORIAL MAINTENANCE (Nesting/Social)";
    baseDC = 15; // Standard maintenance
    description = "Grotto entrance is collapsing or a curious creature is moving in. Requires Nesting or Charm.";
  } else if (finalRoll === 20) {
    name = "RARE ABYSSAL FIND (The Jackpot)";
    baseDC = 0; // No check required
    description = "Pristine artifact or surprise visit. (Post-Day 7: triggers NPC encounter. Pre-Day 7: zero NPC presence).";
  }

  // Calculate the Effective DC (Base + Environment)
  // Level bonus is NOT added here; the player adds that to their dice roll later.
  const effectiveDC = baseDC > 0 ? baseDC + weatherModifier : 0;

  return { name, baseDC, effectiveDC, description, dcVariable };
}
  
/**
 * Server-Side Math: Calculates the Ocean Condition based on the season and a 1d10 roll.
 */
function getOceanCondition(season: string, roll: number): { name: string; effect: string } {
  const currentSeason = season.toLowerCase();
  
  if (currentSeason === 'spring') {
    if (roll <= 4) return { name: "Crystal Clear", effect: "Ideal visibility. Standard Evasion/Foraging." };
    if (roll <= 8) return { name: "Plankton Bloom", effect: "Murky water. Perception -5. Camouflage +5." };
    return { name: "Current Surge", effect: "Strong flow. Endurance -5. Travel is difficult." };
  }
  
  if (currentSeason === 'summer') {
    if (roll <= 4) return { name: "Calm Blue", effect: "Standard conditions." };
    if (roll <= 8) return { name: "Thermal Layer", effect: "Speed +5, but heat causes rapid fatigue. All Stamina drains cost an additional -1 Stamina." };
    return { name: "Surface Storm", effect: "Turbulence reaches the depths. Evasion -10 due to debris." };
  }
  
  if (currentSeason === 'fall' || currentSeason === 'autumn') {
    if (roll <= 4) return { name: "Crisp/Cold", effect: "Standard conditions." };
    if (roll <= 8) return { name: "Migratory Crossing", effect: "Many predators in the area. Evasion Checks required for travel." };
    return { name: "Abyssal Murk", effect: "Silt from the shelf clouds the water. Visibility zero." };
  }
  
  if (currentSeason === 'winter') {
    if (roll <= 6) return { name: "The Deep Chill", effect: "Cold water. Endurance -10. Must stay near the Grotto." };
    return { name: "Silent Stillness", effect: "No currents. Sound travels further. Perception +10." };
  }
  
  // Fallback just in case
  return { name: "Standard", effect: "Standard conditions." };
}
  
  /**
 * Parses content where NEWEST days are at the TOP.
 * Keeps only the 7 most recent days (the first 7 chunks).
 * Rescues older days from the bottom if explicitly mentioned in player input.
 */
function extractRecentDaysTopDown(content: string, playerInput: string, daysToKeep: number = 7): string {
  if (!content.trim()) return "";

  // Split at any line starting with # or ** that contains "Day <number>"
  const dayRegex = /(?=^(?:#+|\*\*).*?\bDay\s*\d+)/im;
  const chunks = content.split(dayRegex).filter(c => c.trim().length > 0);

  if (chunks.length <= daysToKeep) return content.trim();

  // Top-down: newest are at the beginning of the array
  const recentChunks = chunks.slice(0, daysToKeep);
  const olderChunks = chunks.slice(daysToKeep);

  const inputLower = playerInput.toLowerCase();
  const pulledOlderChunks: string[] = [];

  for (const chunk of olderChunks) {
    // Extract the day number to check if the player referenced it
    const match = chunk.match(/\bDay\s*(\d+)/i);
    if (match && match[1]) {
      if (inputLower.includes(`day ${match[1]}`)) {
        pulledOlderChunks.push(chunk);
      }
    }
  }

  let finalContent = recentChunks.join("\n");
  if (pulledOlderChunks.length > 0) {
    finalContent += "\n\n### Referenced Past History\n" + pulledOlderChunks.join("\n");
  }

  return finalContent.trim();
}

/**
 * Backend Anatomy & Buoyancy Gate: Scrubs accidental human/bipedal nouns and
 * standing/walking verbs out of the AI's response and replaces them with
 * merfolk/aquatic equivalents (floating, treading, drifting, hovering, tail/fluke).
 */
function enforceAquaticAnatomy(text: string): string {
  return text
    // 1. Multi-word idioms & posture phrases first
    .replace(/\b(drop|drops|dropped|dropping|fall|falls|fell|falling|sink|sinks|sank|sinking)\s+to\s+(your|his|her|their)\s+knees\b/gi, "$1 to the silt, tail coiling beneath")
    .replace(/\b(get|gets|got|getting|rise|rises|rose|rising|scramble|scrambles|scrambled|scrambling)\s+to\s+(your|his|her|their)\s+feet\b/gi, "$1 upward, treading water")
    .replace(/\bto\s+(your|his|her|their)\s+feet\b/gi, "into a steady hover")
    .replace(/\bon\s+(your|his|her|their)\s+feet\b/gi, "treading water")
    .replace(/\bon\s+(your|his|her|their)\s+knees\b/gi, "coiled low against the silt")
    .replace(/\bbetween\s+(your|his|her|their)\s+(legs|thighs)\b/gi, "against the base of $1 tail")
    .replace(/\b(wrap|wraps|wrapped|wrapping)\s+(your|his|her|their)\s+legs\b/gi, "$1 $2 tail")
    .replace(/\b(part|parts|parted|parting)\s+(your|his|her|their)\s+(legs|thighs)\b/gi, "shift $2 tail")

    // 2. "Standing / Stand / Stood" -> floating, treading, drifting, hovering
    .replace(/\bstanding\s+(still|frozen|rigid|motionless|quietly|silently)\b/gi, "floating $1")
    .replace(/\bstanding\s+(guard|watch)\b/gi, "treading $1")
    .replace(/\bstanding\s+(over|above|before|beside|near|by|in|at|against)\b/gi, "hovering $1")
    .replace(/\bstanding\s+(there|here|tall|up|upright)\b/gi, "treading water $1")
    .replace(/\bstanding\b(?!\s+water)/gi, "floating")
    .replace(/\bstood\s+(still|frozen|rigid|motionless)\b/gi, "floated $1")
    .replace(/\bstood\s+(over|above|before|beside|near|by|in|at|against)\b/gi, "hovered $1")
    .replace(/\bstood\s+(up|tall|upright|there|here)\b/gi, "drifted $1")
    .replace(/\bstands\s+(over|above|before|beside|near|by|in|at|against|tall|up|still)\b/gi, "hovers $1")
    .replace(/\bstand\s+(up|tall|still|over|before|beside|near|by)\b/gi, "tread water $1")

    // 3. Walking / Stepping / Kneeling -> drifting, gliding, coiling
    .replace(/\bwalking\b/gi, "drifting")
    .replace(/\bwalked\b/gi, "drifted")
    .replace(/\bwalks\b/gi, "drifts")
    .replace(/\bstepping\s+(back|forward|closer|away|into|toward|towards)\b/gi, "drifting $1")
    .replace(/\bstepped\s+(back|forward|closer|away|into|toward|towards)\b/gi, "drifted $1")
    .replace(/\bsteps\s+(back|forward|closer|away|into|toward|towards)\b/gi, "drifts $1")
    .replace(/\bkneeling\b/gi, "coiling low")
    .replace(/\bknelt\b/gi, "coiled low")
    .replace(/\bbarefoot\b/gi, "bare-finned")
    .replace(/\bfootsteps\b/gi, "tail-strokes")

    // 4. Anatomical nouns (when preceded by possessive pronouns so measurement words like "10 feet" aren't touched)
    .replace(/\b(your|his|her|their)\s+knees\b/gi, "the bend of $1 tail")
    .replace(/\b(your|his|her|their)\s+feet\b/gi, "$1 tail fluke")
    .replace(/\b(your|his|her|their)\s+foot\b/gi, "$1 fluke")
    .replace(/\b(your|his|her|their)\s+ankles\b/gi, "$1 narrow tail-stock")
    .replace(/\b(your|his|her|their)\s+ankle\b/gi, "$1 tail-stock")
    .replace(/\b(your|his|her|their)\s+toes\b/gi, "$1 fin-tips")
    .replace(/\b(your|his|her|their)\s+shins\b/gi, "$1 lower scales")
    .replace(/\b(your|his|her|their)\s+calves\b/gi, "$1 tail muscle")
    .replace(/\b(your|his|her|their)\s+thighs\b/gi, "$1 upper tail")
    .replace(/\b(your|his|her|their)\s+legs\b/gi, "$1 tail")
    .replace(/\b(your|his|her|their)\s+leg\b/gi, "$1 tail"); 
}

/**
 * Reads both structured Stat Tracker lines and natural OOC updates (like Bond Update,
 * Stamina drain, HP damage, or XP gains) from the AI response and updates storyState.
 */
function applyStatUpdatesFromNarration(
  narration: string,
  storyState: Record<string, unknown>,
  dailySaveLog: string,
): void {
  // 1. Seed from Daily Save Log first if storyState hasn't been initialized yet
  if (storyState["hp"] === undefined && dailySaveLog) {
    const sMatch = dailySaveLog.match(/\*\*Stamina:\*\*\s*(\d+)\s*\/\s*(\d+)/i);
    if (sMatch) {
      storyState["stamina"] = parseInt(sMatch[1], 10);
      storyState["max_stamina"] = parseInt(sMatch[2], 10);
    }
    const hMatch = dailySaveLog.match(/\*\*Health:\*\*\s*(\d+)\s*\/\s*(\d+)/i);
    if (hMatch) {
      storyState["hp"] = parseInt(hMatch[1], 10);
      storyState["max_hp"] = parseInt(hMatch[2], 10);
    }
    const lMatch = dailySaveLog.match(/\*\*Global Level:\*\*\s*(\d+)/i);
    if (lMatch) storyState["level"] = parseInt(lMatch[1], 10);
    const xMatch = dailySaveLog.match(/\*\*Current XP:\*\*\s*(\d+)\s*\/\s*(\d+)\s*to\s*next/i);
    if (xMatch) storyState["xp"] = parseInt(xMatch[1], 10);
    const bLvl = dailySaveLog.match(/\*\*Bond Level:\*\*\s*(\d+)/i);
    if (bLvl) storyState["bond_level"] = parseInt(bLvl[1], 10);
    const bXp = dailySaveLog.match(/\*\*Bond XP:\*\*\s*(\d+)\s*\/\s*(\d+)/i);
    if (bXp) storyState["bond_xp"] = parseInt(bXp[1], 10);
  }

  const maxStm = (storyState["max_stamina"] as number) ?? 10;
  const maxHp = (storyState["max_hp"] as number) ?? 10;

  // 2. Check structured "Stat Tracker:" line if present
  const trackerLine = narration.match(/\*\*Stat Tracker:\*\*([^\n]+)/i)?.[1]
    ?? narration.match(/Stat Tracker:([^\n]+)/i)?.[1];

  if (trackerLine) {
    const stm = trackerLine.match(/Stm\s*\[?\s*(\d+)\s*\/\s*(\d+)\s*\]?/i);
    if (stm) {
      storyState["stamina"] = Math.max(0, Math.min(maxStm, parseInt(stm[1], 10)));
    }
    const hp = trackerLine.match(/HP\s*\[?\s*(\d+)\s*\/\s*(\d+)\s*\]?/i);
    if (hp) {
      storyState["hp"] = Math.max(0, Math.min(maxHp, parseInt(hp[1], 10)));
    }
    const lvl = trackerLine.match(/Lvl\s*\[?\s*(\d+)\s*\]?\s*\(\s*XP\s*\[?\s*(\d+)\s*\/\s*(\d+)/i);
    if (lvl) {
      storyState["level"] = parseInt(lvl[1], 10);
      storyState["xp"] = parseInt(lvl[2], 10);
    }
    const bond = trackerLine.match(/Bond\s*\[?\s*(\d+)\s*\]?\s*\(\s*(?:Bond\s*)?XP\s*\[?\s*(\d+)\s*\/\s*(\d+)/i);
    if (bond) {
      storyState["bond_level"] = parseInt(bond[1], 10);
      storyState["bond_xp"] = parseInt(bond[2], 10);
    }
  }

  // 3. Also catch natural OOC lines (like "- **Bond Update:** ... Current Bond: Level 5 (56 / 60 to Level 6)")
  const naturalBondTot = narration.match(/Current Bond:\s*(?:Level\s*)?(\d+)\s*\(\s*(\d+)\s*\/\s*(\d+)/i)
    ?? narration.match(/Bond Level:\s*(\d+)[^\n]*?\(\s*(\d+)\s*\/\s*(\d+)/i);
  if (naturalBondTot) {
    storyState["bond_level"] = parseInt(naturalBondTot[1], 10);
    storyState["bond_xp"] = parseInt(naturalBondTot[2], 10);
  } else {
    // Fallback if AI only wrote "+1 Bond XP" without printing the new total
    const bondDelta = narration.match(/([+-]\d+)\s*Bond\s*XP/i);
    if (bondDelta && !trackerLine) {
      let bLvl = (storyState["bond_level"] as number) ?? 0;
      let bXp = ((storyState["bond_xp"] as number) ?? 0) + parseInt(bondDelta[1], 10);
      const target = Math.max(10, (bLvl + 1) * 10);
      if (bXp >= target && bLvl < 20) {
        bXp -= target;
        bLvl += 1;
      }
      storyState["bond_level"] = bLvl;
      storyState["bond_xp"] = Math.max(0, bXp);
    }
  }

  // Catch natural XP total or delta (avoiding "Bond XP")
  const naturalXpTot = narration.match(/Current XP:\s*(\d+)\s*\/\s*(\d+)/i);
  if (naturalXpTot) {
    storyState["xp"] = parseInt(naturalXpTot[1], 10);
  } else {
    const xpDelta = narration.match(/([+-]\d+)\s*(?:Character\s+|Global\s+)?XP(?!\s*to)/i);
    if (xpDelta && !/Bond\s*XP/i.test(xpDelta[0]) && !trackerLine) {
      let curLvl = (storyState["level"] as number) ?? 1;
      let curXp = ((storyState["xp"] as number) ?? 0) + parseInt(xpDelta[1], 10);
      const target = Math.max(100, curLvl * 100);
      if (curXp >= target && curLvl < 20) {
        curXp -= target;
        curLvl += 1;
      }
      storyState["level"] = curLvl;
      storyState["xp"] = Math.max(0, curXp);
    }
  }

  // Catch natural Stamina or Health totals in OOC (e.g., "Stamina: 6/10" or "Health: 4/10")
  const natStm = narration.match(/\bStamina:\s*(\d+)\s*\/\s*(\d+)/i);
  if (natStm) {
    storyState["stamina"] = Math.max(0, Math.min(maxStm, parseInt(natStm[1], 10)));
  } else {
    const stmDelta = narration.match(/([+-]\d+)\s*Stamina/i);
    if (stmDelta && !trackerLine) {
      const cur = (storyState["stamina"] as number) ?? maxStm;
      storyState["stamina"] = Math.max(0, Math.min(maxStm, cur + parseInt(stmDelta[1], 10)));
    }
  }

  const natHp = narration.match(/\b(?:Health|HP):\s*(\d+)\s*\/\s*(\d+)/i);
  if (natHp) {
    storyState["hp"] = Math.max(0, Math.min(maxHp, parseInt(natHp[1], 10)));
  } else {
    const hpDelta = narration.match(/([+-]\d+)\s*(?:Health|HP)\b/i);
    if (hpDelta && !trackerLine) {
      const cur = (storyState["hp"] as number) ?? maxHp;
      storyState["hp"] = Math.max(0, Math.min(maxHp, cur + parseInt(hpDelta[1], 10)));
    }
  }
}