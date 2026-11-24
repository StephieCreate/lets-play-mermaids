import type { NarrateRequest, TimePacingState } from "./types.ts";

export const isSummaryRequest = (text: string) => {
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

export const isSaveRequest = (text: string) => {
  const lower = text.trim().toLowerCase();
  return lower.includes("let's save my progress") || lower.includes("save my progress") ||
    lower.includes("save progress") || lower.includes("daily save log") ||
    lower.includes("update save log") || lower.includes("update the save log") ||
    lower.includes("save log") ||
    /^(?:can\s+(?:you|we)\s+)?(?:save\s+progress|update\s+save\s+log|daily\s+save\s+log)\b/i.test(lower);
};

export const isDayStartAnchor = (text: string) => {
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

export const isNightlyHalt = (text: string) => {
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

/**
 * Backend Time Clock Telemetry for the 6-phase ladder:
 * Morning -> Late Morning -> Noon -> Afternoon -> Evening -> Night (~35 turns/day)
 * Works WITH the Markdown Living Clock, Slow Clock, and Travel Route rules.
 */
export function buildTimePassageDirective(
  conversationHistory: Array<{ role: string; content: string }>,
  dailySaveLog: string,
  playerInput: string,
): TimePacingState {
  const PHASES = ["Morning", "Late Morning", "Noon", "Afternoon", "Evening", "Night"];

  const normalizePhase = (raw: string): string | null => {
    const val = raw.trim().toLowerCase();
    if (val === "late morning") return "Late Morning";
    if (val === "morning") return "Morning";
    if (val === "noon" || val === "midday") return "Noon";
    if (val === "afternoon") return "Afternoon";
    if (val === "evening" || val === "dusk") return "Evening";
    if (val === "night") return "Night";
    return null;
  };

  const extractPhase = (text: string): string | null => {
    const clean = text.replace(/[*_~`]/g, "");
    const m = clean.match(/Time Clock:\s*(Late\s+Morning|Morning|Noon|Midday|Afternoon|Evening|Dusk|Night)/i);
    return m ? normalizePhase(m[1]) : null;
  };

  const narratorMsgs = (conversationHistory || []).filter(
    (m) => m.role === "assistant" || m.role === "narrator"
  );
  const totalDayTurns = narratorMsgs.length + 1;

  // 1. Get current phase from latest narrator turn (or Save Log at day start)
  let currentPhase = "Morning";
  if (narratorMsgs.length > 0) {
    for (let i = narratorMsgs.length - 1; i >= 0; i--) {
      const found = extractPhase(narratorMsgs[i].content);
      if (found) {
        currentPhase = found;
        break;
      }
    }
  } else {
    const savePhase = dailySaveLog.match(
      /Year\s+\d+\s*[-—]\s*(Late\s+Morning|Morning|Noon|Midday|Afternoon|Evening|Dusk|Night)/i
    );
    if (savePhase) {
      currentPhase = normalizePhase(savePhase[1]) ?? "Morning";
    }
  }

  // 2. Count consecutive turns spent in this exact phase
  let turnsInPhase = 0;
  for (let i = narratorMsgs.length - 1; i >= 0; i--) {
    const p = extractPhase(narratorMsgs[i].content);
    if (p === currentPhase) {
      turnsInPhase++;
    } else if (p !== null) {
      break;
    }
  }

  const currentTurnInPhase = turnsInPhase + 1;
  const phaseIdx = PHASES.indexOf(currentPhase);
  const nextPhase = phaseIdx >= 0 && phaseIdx < PHASES.length - 1 ? PHASES[phaseIdx + 1] : "Night";

  // 3. Detect which of your Markdown Time Rails applies to this turn
  const isTravelIntent = /\b(swim\s+(?:back|home|to|toward|east|west|north|south)|head\s+(?:back|home|to|toward)|travel\s+to|return\s+to\s+the\s+grotto|leave\s+for|journey\s+to|skip\s+to\s+arrival)\b/i.test(
    playerInput
  );

  const isQuietMoment = /\b(cuddle|curl\s+up|groom|grooming|nestle|whisper|rest\s+against|lean\s+against|hold\s+(?:him|her|them)|quietly|stillness|nuzzle|stroke|pet|stay\s+close)\b/i.test(
    playerInput
  );

  // 4. Night Phase Lock + Nightfall Threat Reminder
  if (currentPhase === "Night") {
    return {
      currentPhase,
      turnsInPhase,
      totalDayTurns,
      directive: `[TIME CLOCK TELEMETRY — NIGHT (Turn ${currentTurnInPhase} in Night | Day Turn #${totalDayTurns})]: Time Clock is at **Night**. Keep Time Clock at **Night** until the player sleeps/saves. If the player is in open water or an unsecured location, enforce [CAUGHT IN THE DARK (NIGHTFALL)] (-5 encounter roll, +5 DC penalty; Encounter Overlap Limit applies).`,
    };
  }

  // 5. Travel Route Rail
  if (isTravelIntent) {
    return {
      currentPhase,
      turnsInPhase,
      totalDayTurns,
      directive: `[TIME CLOCK TELEMETRY — TRAVEL CHECK (${currentPhase} -> ${nextPhase} | Day Turn #${totalDayTurns})]: The player may be initiating travel. Enforce [THE TRAVEL ROUTE]: state the exact chain of nodes, NO fast-travel/teleportation, and advance +1 phase per completed travel hop (${currentPhase} → ${nextPhase}).`,
    };
  }

  // 6. Slow Clock Rail (Quiet Moments)
  if (isQuietMoment) {
    return {
      currentPhase,
      turnsInPhase,
      totalDayTurns,
      directive: `[TIME CLOCK TELEMETRY — SLOW CLOCK ACTIVE (Turn ${currentTurnInPhase} in ${currentPhase} | Day Turn #${totalDayTurns})]: This turn reads as a Quiet Moment. [THE SLOW CLOCK] overrides the Living Clock: HOLD Time Clock at **${currentPhase}** while the player is still present in the moment. Advance to **${nextPhase}** ONLY after the moment naturally exhales/closes.`,
    };
  }

  // 7. Living Clock Pacing Telemetry (~5-7 turns per phase, ~35 turns/day)
  if (currentTurnInPhase <= 4) {
    return {
      currentPhase,
      turnsInPhase,
      totalDayTurns,
      directive: `[TIME CLOCK TELEMETRY — ${currentPhase} (Turn ${currentTurnInPhase} of ~6 | Day Turn #${totalDayTurns} of ~35)]: Current phase is **${currentPhase}** (next in ladder: **${nextPhase}**). Unless a major [LIVING CLOCK] beat or travel hop fully closes on this turn, hold Time Clock at **${currentPhase}** so the scene has room to breathe.`,
    };
  }

  if (currentTurnInPhase <= 7) {
    return {
      currentPhase,
      turnsInPhase,
      totalDayTurns,
      directive: `[TIME CLOCK TELEMETRY — LIVING CLOCK WINDOW (Turn ${currentTurnInPhase} of ~6 in ${currentPhase} | Day Turn #${totalDayTurns} of ~35)]: You are in the ideal 5–7 turn window for **${currentPhase}**. Run the End-of-Response Audit: if a meaningful beat (encounter, survival check, foraging, repair, or extended exchange) closes on this turn, ADVANCE Time Clock to **${nextPhase}** with subtle water/light cues. If mid-beat or in a Quiet Moment, hold at **${currentPhase}**.`,
    };
  }

  return {
    currentPhase,
    turnsInPhase,
    totalDayTurns,
    directive: `[TIME CLOCK TELEMETRY — LIVING CLOCK ALERT (Turn ${currentTurnInPhase} in ${currentPhase} | Day Turn #${totalDayTurns} of ~35)]: **${currentPhase}** has lasted ${currentTurnInPhase} turns. Run the End-of-Response Audit: unless the player is actively inside a [SLOW CLOCK] Quiet Moment or split-second combat, transition the ambient light/current and ADVANCE Time Clock to **${nextPhase}** on this turn.`,
  };
}

/**
 * Dialogue Isolation Gate (No Mind-Reading): a turn-level, cache-safe directive
 * appended ONLY to the outgoing user prompt. Never saved, never in systemPrompt.
 */
export function buildDialogueIsolationDirective(rawPlayerInput: string): string {
  // 1. Strip appended directives and OOC brackets before scanning.
  let clean = rawPlayerInput
    .replace(/\n?\[MANDATORY SYSTEM DIRECTIVE[\s\S]*$/i, "")
    .replace(/\n?\(\(APP_ROLL[^)]*\)\)/gi, "")
    .replace(/\n?\[WEATHER LOCK[^\]]*\]/gi, "")
    .replace(/\n?\[STAMINA PENDING[^\]]*\]/gi, "")
    .replace(/\n?\[TIME CLOCK TELEMETRY[^\]]*\]/gi, "")
    .replace(/\(\([^()]*\)\)/g, "")
    .trim();
  if (clean === "") return "";

  // 2. Pure system/bookkeeping commands carry no roleplay prose to gate.
  const lower = clean.toLowerCase();
  const pureCommands = [
    /^proceed\b/i,
    /^save( my)? progress\b/i,
    /^update (the )?register\b/i,
    /^give me a summary\b/i,
    /^start (the )?game\b/i,
    /^load (save |the )?game\b/i,
    /^i go to sleep\b/i,
  ];
  if (pureCommands.some((re) => re.test(clean)) || isSummaryRequest(clean) || isSaveRequest(clean)) {
    return "";
  }

  // 3. Extract quoted dialogue; what remains is unquoted prose.
  const quoteRegex = /["\u201C]([^"\u201D]+)["\u201D]/g;
  const quoted: string[] = [];
  for (const m of clean.matchAll(quoteRegex)) {
    quoted.push(m[1].trim());
  }
  const unquotedText = clean.replace(quoteRegex, " ").replace(/\s+/g, " ").trim();
  if (quoted.length === 0 && unquotedText.length < 15) return "";

  // 4. Explicit summarized speech is the allowed exception (no quotes needed).
  const hasSummarizedSpeech =
    /\b(?:i|my character)\s+(?:quickly\s+|quietly\s+|briefly\s+|carefully\s+|slowly\s+)?(?:tell|told|explain|explained|describe|described|recount|recounted|summarize|summarized|inform|informed|mention|mentioned|relay|relayed|share|shared|warn|warned|ask|asked|answer|answered|reply|replied|fill\s+(?:him|her|them)\s+in|let\s+(?:him|her|them)\s+know)\b/i.test(
      unquotedText,
    );

  // 5. Case 2 — Mixed Novel POV: quotes present alongside meaningful prose.
  if (quoted.length > 0 && unquotedText.length >= 15) {
    const quotedList = quoted
      .map((q) => (q.length > 120 ? `${q.slice(0, 117)}...` : q))
      .map((q) => `"${q}"`)
      .join(" | ");
    return `[DIALOGUE ISOLATION GATE — MIXED NOVEL POV]: ONLY the text enclosed in quotation marks ("...") was spoken aloud by the player. Spoken this turn: ${quotedList}. Everything outside quotation marks is private internal monologue or physical narration—100% INAUDIBLE to the Primary Mate and all NPCs (except any phrase that explicitly narrates telling/explaining something aloud, e.g., "I tell him what I saw"). NPCs are STRICTLY FORBIDDEN from mind-reading, quoting, or answering unspoken thoughts.`;
  }

  // 6. Case 1 — Silent / Novel-POV turn.
  if (quoted.length === 0 && !hasSummarizedSpeech) {
    return `[DIALOGUE ISOLATION GATE — NO SPOKEN DIALOGUE]: The player used NO quotation marks ("...") and did NOT describe speaking aloud. Treat their entire input as physical action and/or private internal monologue. All unquoted thoughts, memories, feelings, and novel-style narration are 100% INVISIBLE AND INAUDIBLE to the Primary Mate and all NPCs. NPCs are STRICTLY FORBIDDEN from answering, echoing, quoting, or reacting to unspoken thoughts—they may ONLY react to observable physical/sensory cues (posture, distance, gill rhythm, adrenaline scent, actions).`;
  }

  // 7. Case 3 — Explicit summarized speech.
  return `[DIALOGUE ISOLATION GATE — SUMMARIZED SPEECH]: The player explicitly described telling/explaining something to an NPC without exact quotation marks. Treat ONLY that explicitly summarized communication as audible speech. All other unquoted internal thoughts, feelings, or novel prose in this message remain strictly private and inaudible (No Mind-Reading).`;
}

/**
 * Server-Side Math: Calculates the encounter outcome and Effective DC based on the final modified d20 roll.

 * The Tier & CR Difficulty Model (Static DCs):
 * CR 1 (Tier 1) = DC 12 | CR 3 = DC 14 | CR 5 (Tier 2) = DC 18
 * CR 10 = DC 22 | CR 15 (Tier 3) = DC 26 | CR 20 = DC 30
 */
export function getDailyEncounter(roll: number, weatherModifier: number = 0): { name: string; baseDC: number; effectiveDC: number; description: string; dcVariable: boolean } {
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
export function getOceanCondition(season: string, roll: number): { name: string; effect: string } {
  // Trim + strip punctuation so season wording differences never fail lookup
  const currentSeason = season.trim().toLowerCase().replace(/[^a-z]/g, "");
  const normalizedRoll = Math.max(1, Math.min(10, Math.round(roll)));

  if (currentSeason === 'spring') {
    if (normalizedRoll <= 4) return { name: "Crystal Clear", effect: "Ideal visibility. Standard Evasion/Foraging." };
    if (normalizedRoll <= 8) return { name: "Plankton Bloom", effect: "Murky water. Perception -5. Camouflage +5." };
    return { name: "Current Surge", effect: "Strong flow. Endurance -5. Travel is difficult." };
  }

  if (currentSeason === 'summer') {
    if (normalizedRoll <= 4) return { name: "Calm Blue", effect: "Standard conditions." };
    if (normalizedRoll <= 8) return { name: "Thermal Layer", effect: "Speed +5, but heat causes rapid fatigue. All Stamina drains cost an additional -1 Stamina." };
    return { name: "Surface Storm", effect: "Turbulence reaches the depths. Evasion -10 due to debris." };
  }

  if (currentSeason === 'fall' || currentSeason === 'autumn') {
    if (normalizedRoll <= 4) return { name: "Crisp/Cold", effect: "Standard conditions." };
    if (normalizedRoll <= 8) return { name: "Migratory Crossing", effect: "Many predators in the area. Evasion Checks required for travel." };
    return { name: "Abyssal Murk", effect: "Silt from the shelf clouds the water. Visibility zero." };
  }

  if (currentSeason === 'winter') {
    if (normalizedRoll <= 6) return { name: "The Deep Chill", effect: "Cold water. Endurance -10. Must stay near the Grotto." };
    return { name: "Silent Stillness", effect: "No currents. Sound travels further. Perception +10." };
  }

  // Fallback just in case
  return { name: "Standard", effect: "Standard conditions." };
}

/**
 * Runs the Nightly Halt (Markov weather), Day Start Anchor (Encounter Bag +
 * Proceed directive), Summary, Save, and Standby Roll blocks. Mutates
 * body.playerInput / body.storyState and returns the current game mode.
 */
export function applyCommandInterceptors(body: NarrateRequest): string {
  // Default to ACTIVE if no mode is currently set
  let currentGameState = (body.storyState["game_mode"] as string) ?? "ACTIVE";

  if (isNightlyHalt(body.playerInput)) {
    currentGameState = "WAITING COMMAND";

    // --- THE MARKOV FRONT ALGORITHM (Replaces raw d10) ---
    // Always a fresh random transition from true randomness (Math.random) —
    // never a day-seeded hash, never a reuse of a stale weather value left in
    // story_state by a deleted/rerolled message.
    const lastWeatherRoll = body.storyState["weather_roll"] as number | undefined;
    const hasValidLastRoll =
      typeof lastWeatherRoll === "number" &&
      Number.isFinite(lastWeatherRoll) &&
      lastWeatherRoll >= 1 &&
      lastWeatherRoll <= 10;
    const lastWeather = ((body.storyState["last_weather"] as string) || "").trim().toLowerCase() || null;
    const lastStreak = (body.storyState["weather_streak"] as number) || 0;
    const currentSeason = ((body.storyState["current_season"] as string) || "spring").trim().toLowerCase();

    let weatherRoll: number;

    if (hasValidLastRoll && lastWeatherRoll !== undefined) {
      // Generate a gradual shift between -2 and +2
      const shift = Math.floor(Math.random() * 5) - 2;
      let candidate = lastWeatherRoll + shift;
      // Bounce inward off the 1/10 edges instead of clamping onto the same state
      if (candidate < 1) candidate = 2 - candidate;
      if (candidate > 10) candidate = 20 - candidate;
      weatherRoll = candidate;
    } else {
      // First day of the game (or an invalid/stale roll): true random starting point
      weatherRoll = Math.floor(Math.random() * 10) + 1;
    }

    let weather = getOceanCondition(currentSeason, weatherRoll);

    // Anti-stickiness guard: uncommon/special conditions (Plankton Bloom,
    // Surface Storm, Abyssal Murk, Thermal Layer, Migratory Crossing, Silent
    // Stillness) repeat only with 15% weight, and NO condition may run a 3rd
    // consecutive day — day 3 forces a transition to a different state.
    const isUncommonOrSpecial = (roll: number) =>
      currentSeason === "winter" ? roll >= 7 : roll >= 5;
    // last_weather is stored normalized (lowercase, trimmed) so comparisons are
    // resilient to wording drift; the canonical mixed-case name is in weather_condition.
    let weatherStreak = weather.name.toLowerCase() === lastWeather ? lastStreak + 1 : 1;

    if (
      weather.name.toLowerCase() === lastWeather &&
      (weatherStreak > 2 || (isUncommonOrSpecial(weatherRoll) && Math.random() >= 0.15))
    ) {
      for (let attempt = 0; attempt < 25; attempt++) {
        const reroll = Math.floor(Math.random() * 10) + 1;
        const next = getOceanCondition(currentSeason, reroll);
        if (next.name.toLowerCase() !== lastWeather) {
          weatherRoll = reroll;
          weather = next;
          weatherStreak = 1;
          break;
        }
      }
    }

    // Save it to the story state so the frontend/database can see it
    body.storyState["weather_roll"] = weatherRoll;
    body.storyState["weather_condition"] = weather.name;
    body.storyState["weather_effect"] = weather.effect;
    body.storyState["last_weather"] = weather.name.trim().toLowerCase();
    body.storyState["weather_streak"] = weatherStreak;

    // Explicitly hand the AI the final answer so it doesn't have to look it up
    body.playerInput += `\n\n[MANDATORY SYSTEM DIRECTIVE: The player has initiated the Nightly Halt. The backend has rolled a ${weatherRoll} on the 1d10 for tomorrow's weather.
    [SERVER MATH OVERRIDE]: Tomorrow's condition is ${weather.name}. Effect: ${weather.effect}.
    [SAVE LOG WEATHER OVERWRITE]: You MUST overwrite the "Ocean Condition" line in the [DAILY SAVE LOG] with "${weather.name} — ${weather.effect}" and its exact modifiers. Do NOT recycle yesterday's weather: tomorrow's Proceed must use this freshly rolled condition, or the [WEATHER LOCK] will enforce the stale one.
    Print the Weather Calculation block using these exact server-provided values, print the Maintenance Window prompt verbatim, and STOP. Do not generate narrative.]`;
  }

  else if (isDayStartAnchor(body.playerInput)) {
    currentGameState = "ACTIVE";

    // Look up tomorrow's weather from the state (or default to 0 if it wasn't saved)
    // Normalized (trim + lowercase + punctuation stripped) so minor wording or
    // punctuation differences in story state never fail the modifier lookup.
    const weatherCondition =
      ((body.storyState["weather_condition"] as string) || "Standard").trim().toLowerCase().replace(/[^a-z\s]/g, "");

    // Determine the environmental penalty based on the known condition names
    let weatherModifier = 0;
    if (weatherCondition.includes("storm")) weatherModifier = 5;

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
    [SEQUENCING GATE]: You must present the encounter and then IMMEDIATELY STOP. Do NOT narrate the player's reaction, do NOT resolve the survival check, and do NOT move the player. End your response by asking the player what they do.
    [STAMINA GUARD]: Inspect the [DAILY SAVE LOG]. Deduct the -2 Morning Wake-Up stamina cost ONLY ONCE. If the Save Log says "(-2 pending at Proceed)", deduct -2 now. If the Save Log ALREADY deducted the -2 morning cost when saving, DO NOT deduct it a second time!
    [FORMATTING LOCK]: You MUST include the exact "Stat Tracker: Stm [X/10]..." line inside your OOC block, reflecting the accurate morning stamina.`;
  }
  else if (isSummaryRequest(body.playerInput)) {
    body.playerInput += `\n\n[MANDATORY SYSTEM DIRECTIVE FOR NARRATIVE SUMMARY]:\nThe player has commanded a summary. You MUST summarize the specific events, encounters, and dialogue of the CURRENT IN-GAME DAY ONLY. Base your summary 100% on the active chat history. Output in a clean Markdown code block with zero conversational filler. Follow the MODULE A: THE NARRATIVE SUMMARY template supplied in this turn's <dynamic_turn_rules> VERBATIM: reproduce its exact heading hierarchy (#, ##, ###, ####) and bold field labels exactly as written — NEVER wrap Markdown heading hashes in bold (e.g., never print **### Title**), NEVER drop the space after heading hashes, and NEVER omit the required blank lines between sections.`;
  }

  else if (isSaveRequest(body.playerInput)) {
    // Flip the initialization flag so the Hard-State armor engages for the rest of the game
    body.storyState["files_initialized"] = true;

    body.playerInput += `\n\n[MANDATORY SYSTEM DIRECTIVE FOR DAILY SAVE LOG]:\nThe player has commanded a save. You MUST output an updated Daily Save Log capturing all events, wound penalties, supplies consumed, and time progression. Format strictly according to Tab 2 specifications in a clean Markdown code block with zero conversational filler.\n[SAVE LOG WEATHER OVERWRITE]: Write the "Ocean Condition" line using the server-locked condition for the CURRENT day — "${(body.storyState["weather_condition"] as string) || "Standard"}" — exactly as provided in story state. Do NOT recycle a previous day's weather into the Save Log.\n[STAMINA TIMING LOCK]: Apply ONLY overnight rest/healing/thermal quartz bonuses. You are STRICTLY FORBIDDEN from deducting the -2 Morning Wake-Up Stamina cost during Save Log generation. Record the player's rested Stamina and write "(-2 pending at Proceed)" next to it.`;
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

  return currentGameState;
}
