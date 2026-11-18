/**
 * ============================================================================
 * FILE: supabase/functions/narrate/ruleTokenPruning.ts
 * PURPOSE: Dynamically hides ("prunes") sections of the game rules that do not
 * apply to the player's current turn, preventing AI "rule bleed" (like talking
 * about pups, starter pods, or winter storms during solo Spring survival)
 * while keeping 100% of the game's prose style, voice, and world lore intact.
 * ============================================================================
 */

// An "interface" in TypeScript is like a blueprint. It tells the code what
// data we are passing in from index.ts so TypeScript can catch typos for us.
export interface PruningTurnMessage {
  role: "player" | "narrator";
  content: string;
}

export interface PruningContext {
  playerInput: string;                    // What the player typed this turn
  currentScene?: string | null;           // Optional scene label from the app
  dailySaveLog?: string;                  // Text from Tab 2: Daily Save Log
  grottoRegistry?: string;                // Text from Tab 4: Grotto Registry
  grottoMap?: string;                     // Text from Tab 5: The Map
  plotWishlistQueued?: string;            // Only the [QUEUED] items from Plot Wishlist
  conversationHistory?: PruningTurnMessage[]; // Past chat turns (lets us read what the AI wrote!)
  storyState?: Record<string, unknown>;   // Live database numbers (HP, Stamina, Bond, etc.)
  apexTarget?: string;                    // Which Apex you are romancing (e.g., "kial", "severin")
}

/**
 * MAIN FUNCTION: pruneRulesByPlayerState
 * The "export" keyword lets index.ts import and use this function.
 * It takes the rule document's name (ruleSlug), its full Markdown text (ruleText),
 * and the current game state (ctx), and returns the cleaned-up Markdown text.
 */
export function pruneRulesByPlayerState(
  ruleSlug: string,
  ruleText: string,
  ctx: PruningContext,
): string {
  // Safety check: if the rule document is empty, return it right away.
  if (!ruleText || !ruleText.trim()) return ruleText;

  // Right now, we are only pruning "universal-core-engine".
  // Any other rule file (templates, algae, apex plugins) passes through untouched
  // until we add their rules in the next step!
  if (ruleSlug !== "universal-core-engine") {
    return ruleText;
  }

  // ==========================================================================
  // PART 1: BUILD THE "TWO-WAY RADAR" (Player Input + AI Output + Save Files)
  // ==========================================================================

  const saveLog = ctx.dailySaveLog ?? "";
  const registry = ctx.grottoRegistry ?? "";
  const mapText = ctx.grottoMap ?? "";
  const wishlist = ctx.plotWishlistQueued ?? "";
  const state = ctx.storyState ?? {};

  // Clean the player's input so we only look at what YOU typed, ignoring any
  // automatic "[MANDATORY SYSTEM DIRECTIVE]" or "((APP_ROLL))" text added by index.ts.
  const rawPlayerInput = ctx.playerInput ?? "";
  const cleanPlayerInput = rawPlayerInput
    .split("\n\n[MANDATORY SYSTEM DIRECTIVE")[0]
    .split("\n\n((APP_ROLL")[0]
    .toLowerCase();

  // Pull the AI's last 2 responses from the chat history.
  // .filter() keeps only the AI's turns ("narrator").
  // .slice(-2) grabs the 2 most recent ones so we know what the AI just set up!
  const recentAiTurns = (ctx.conversationHistory ?? [])
    .filter((turn) => turn.role === "narrator")
    .slice(-2)
    .map((turn) => turn.content)
    .join("\n")
    .toLowerCase();

  // Combine Player Input + Recent AI Output + Current Scene into one "Radar" string.
  // Whenever we check if a topic (like traps, travel, or injuries) is active in the
  // scene, we check this combined radar so BOTH you and the AI can trigger rules!
  const twoWayRadar = `${cleanPlayerInput}\n${recentAiTurns}\n${(ctx.currentScene ?? "").toLowerCase()}`;

  // ==========================================================================
  // PART 2: READ EXACT PLAYER STATS (From storyState OR Daily Save Log)
  // ==========================================================================

  // The "??" operator means "use the left value if it exists; otherwise fall back to the right value."
  const hp = getNumberStat(state["hp"], saveLog, /\*\*Health:\*\*\s*(\d+)/i, 10);
  const maxHp = getNumberStat(state["max_hp"], saveLog, /\*\*Health:\*\*\s*\d+\s*\/\s*(\d+)/i, 10);
  const stamina = getNumberStat(state["stamina"], saveLog, /\*\*Stamina:\*\*\s*(\d+)/i, 10);
  const globalLevel = getNumberStat(state["level"], saveLog, /\*\*Global Level:\*\*\s*(\d+)/i, 1);
  const bondLevel = getNumberStat(state["bond_level"], saveLog, /\*\*Bond Level:\*\*\s*(\d+)/i, 0);
  const legacyMarks = getNumberStat(undefined, saveLog, /\*\*Legacy Marks:\*\*[^|\n]*\|\s*(\d+)\s*Marks/i, 0);

  // Detect the current Season ("spring", "summer", "fall", or "winter")
  const season = detectSeason(state["current_season"] as string, saveLog, recentAiTurns);

  // Detect what day of the season it is (1 to 28)
  const dayNumber = getNumberStat(undefined, saveLog, /\bDay\s+(\d+)/i, 1);

  // Check if the game has already finished Character Creation.
  // While you are in Turns 1-6 of Character Creation, your Save Log is still blank,
  // so hasStartedGame will be FALSE and Section 4 (Character Creation) will stay visible!
  const isNewGameCommand = /\b(start game|start the game|new game|begin game)\b/i.test(cleanPlayerInput);
  const hasStartedGame =
    !isNewGameCommand &&
    (saveLog.trim().length > 0 || registry.trim().length > 0 || state["files_initialized"] === true);

  // Check if the player has an active pup/offspring or pregnancy
  const offspringFieldMatch = saveLog.match(/\*\*Offspring Fed:\*\*\s*([^\n|]+)/i);
  const offspringFieldText = offspringFieldMatch ? offspringFieldMatch[1].trim() : "N/A";
  const hasOffspringInSave = !/^(n\/a|none|no|0)$/i.test(offspringFieldText);
  const hasOffspringOrPregnancy =
    hasOffspringInSave ||
    /\b(gestation|pregnant|pregnancy|infant phase|juvenile phase|rescue phase|offspring check)\b/i.test(
      `${saveLog}\n${recentAiTurns}`,
    );

  // Check if the player has a Starter Pod (e.g., from Character Creation)
  const hasStarterPod =
    /\b(starter pod|pod member|pod synergy)\b/i.test(`${saveLog}\n${registry}`) ||
    (!/shiver status:\s*(not present|none|n\/a)/i.test(saveLog) && /shiver status:/i.test(saveLog));

  // Check if the player has Active Traps in the Save Log
  const hasActiveTrapsInSave =
    /\*\*Active Traps[^*]*\*\*\s*(?!None\b|N\/A\b)[^\n|]+/i.test(saveLog);

  // Check if the player has Active Quests in the Save Log
  const hasActiveQuestsInSave =
    /active quests[\s\S]{0,120}?(?!none\b|n\/a\b)[a-z0-9]/i.test(saveLog);

  // Check if the player is currently outside the main Grotto
  const isOutsideGrotto = detectIfOutsideGrotto(saveLog, recentAiTurns, cleanPlayerInput);

  // Check if it is currently Evening or Night (from Save Log or AI's OOC Time Clock)
  const isEveningOrNight = /\b(evening|night|nightfall|dark)\b/i.test(
    `${saveLog}\n${recentAiTurns}\n${cleanPlayerInput}`,
  );

  // Check if the game is in Maintenance / Waiting Command mode (Sleep, Save, Summary)
  const gameMode = (state["game_mode"] as string) ?? "ACTIVE";
  const isNightlyHaltOrMaintenance =
    gameMode === "WAITING COMMAND" ||
    /\b(i go to sleep|go to sleep|sleep for the night|retire for the night|bed down|save progress|save my progress|daily save log|summary|update register)\b/i.test(
      cleanPlayerInput,
    );

  // Check if this turn is a Day-Start ("Proceed" or "Load Save Game")
  const isDayStartTurn =
    /\b(proceed|load save|load game|resume game)\b/i.test(cleanPlayerInput) ||
    rawPlayerInput.includes("rolled a modified");

  // ==========================================================================
  // PART 3: SURGICAL PRUNING OF UNIVERSAL-CORE-ENGINE
  // ==========================================================================

  let pruned = ruleText;

  // --------------------------------------------------------------------------
  // RULE 1: Character Creation (# [SECTION 4: GAME INITIATION SEQUENCE])
  // Once your Save Log or Grotto Registry exists, you are done creating your
  // character. Stripping Section 4 saves ~1,200 words on every turn!
  // --------------------------------------------------------------------------
  if (hasStartedGame) {
    pruned = stripMarkdownSection(pruned, "[SECTION 4: GAME INITIATION SEQUENCE]");
  }

  // --------------------------------------------------------------------------
  // RULE 2: Offspring & Raising Children (# [SYSTEM_MECHANIC: REPRODUCTION & RAISING CHILDREN])
  // This section is ~2,400 words. If Bond < 18 and you do NOT have a pup or
  // pregnancy, we strip it completely so the AI never hallucinates pups early.
  // --------------------------------------------------------------------------
  const isMatingOrConceptionMentioned =
    /\b(mating season|frenzy|conceive|conception|offspring|pregnant|pregnancy|adopt a pup|adoption|catalyst quest)\b/i.test(
      twoWayRadar,
    );

  if (bondLevel < 18 && !hasOffspringOrPregnancy && !isMatingOrConceptionMentioned) {
    // Strip the entire 2,400-word Reproduction section
    pruned = stripMarkdownSection(pruned, "[SYSTEM_MECHANIC: REPRODUCTION & RAISING CHILDREN]");

    // Also strip the 1-paragraph "family/pup" mention inside the Prime Directive (Batch 1)
    pruned = pruned.replace(
      /\*\*The game is also a family\.\*\*[\s\S]*?(?=\n\n\*\*The ocean is the setting)/i,
      "",
    );

    // Strip the "Growing Void (Offspring Metabolism)" and "[THE INFANT/JUVENILE OVERRIDE]" in Batch 6
    pruned = pruned.replace(
      /\[\s*THE INFANT\/JUVENILE OVERRIDE\s*\]:[\s\S]*?(?=\n-\s*\*\*The Trigger)/i,
      "",
    );
    pruned = pruned.replace(
      /-\s*\*\*The Growing Void \(Offspring Metabolism\):\*\*[\s\S]*?(?=\n#|\n####|$)/i,
      "",
    );
  } else if (hasOffspringOrPregnancy) {
    // If you DO have an active pregnancy or pup, only keep the phase you are actually in!
    const combinedStateText = `${saveLog}\n${recentAiTurns}`;
    const isInGestation = /\bgestation\b|\bpregnant\b/i.test(combinedStateText);
    const isInInfantPhase = /\binfant\b|\brescue phase\b/i.test(combinedStateText);
    const isInJuvenilePhase = /\bjuvenile\b/i.test(combinedStateText);
    const hasTwins = /\btwin\b/i.test(combinedStateText);

    if (!hasTwins && (isInGestation || isInInfantPhase || isInJuvenilePhase)) {
      pruned = stripMarkdownSection(pruned, "1.5.5 THE TWIN ANOMALY");
    }
    if (isInGestation) {
      // During pregnancy, hide Infant and Juvenile hardships until the pup is born
      pruned = stripMarkdownSection(pruned, "5. THE INFANT PHASE");
      pruned = stripMarkdownSection(pruned, "6. THE JUVENILE PHASE");
    } else if (isInInfantPhase) {
      // During the Infant phase, hide Gestation, Birth, and Juvenile rules
      pruned = stripMarkdownSection(pruned, "4. THE GESTATION PHASE");
      pruned = stripMarkdownSection(pruned, "4.5 THE BIRTH EVENT");
      pruned = stripMarkdownSection(pruned, "6. THE JUVENILE PHASE");
    } else if (isInJuvenilePhase) {
      // During the Juvenile phase, hide Gestation, Birth, and Infant rules
      pruned = stripMarkdownSection(pruned, "4. THE GESTATION PHASE");
      pruned = stripMarkdownSection(pruned, "4.5 THE BIRTH EVENT");
      pruned = stripMarkdownSection(pruned, "5. THE INFANT PHASE");
    }
  }

  // --------------------------------------------------------------------------
  // RULE 3: The 3-Day Mating Season Heat (#### THE "SEASON" (Mating Biology))
  // NOTE: All general Mer-folk Biology, Lateral Line, and Bioluminescent Flush
  // stay 100% untouched! We ONLY gate the 1,050-word 3-day heat/frenzy/conception
  // mechanics until Bond >= 15 or when heat/mating season is mentioned.
  // --------------------------------------------------------------------------
  if (bondLevel < 15 && !isMatingOrConceptionMentioned && !hasOffspringOrPregnancy) {
    pruned = stripMarkdownSection(pruned, 'THE "SEASON" (Mating Biology)');
  }

  // Gate "THE AFTERMATH (Scale Disparity & Recovery)" unless intimacy/fade-to-black
  // or the soreness penalty is active in the radar or Save Log.
  const isIntimacyOrAftermathActive =
    /\b(fade-to-black|fade to black|intimate|intimacy|aftermath|sore|kiss|pressed against|mating)\b/i.test(
      `${twoWayRadar}\n${saveLog}`,
    );
  if (!isIntimacyOrAftermathActive) {
    pruned = stripMarkdownSection(pruned, "THE AFTERMATH (Scale Disparity & Recovery)");
  }

  // --------------------------------------------------------------------------
  // RULE 4: Starter Pod Rules (THE NOMADIC POD START & THE SUPPRESSED SEASON)
  // If you are playing solo (no Starter Pod in your Save Log or Grotto Registry),
  // strip these ~650 words so the AI never hallucinates "Lea and San".
  // --------------------------------------------------------------------------
  if (hasStartedGame && !hasStarterPod) {
    pruned = stripMarkdownSection(pruned, "[SYSTEM_OVERRIDE: THE NOMADIC POD START");
    pruned = stripMarkdownSection(pruned, "[SYSTEM_LORE: THE SUPPRESSED SEASON");
  }

  // --------------------------------------------------------------------------
  // RULE 5: Late-Game Level 10+ & Seasonal Events (Batch 6 & Batch 8)
  // Prevents the AI from inventing glowing roots, rusted lab mysteries,
  // rival leviathan wars, or winter famines when you are below Level 10
  // or in the wrong season.
  // --------------------------------------------------------------------------
  if (globalLevel < 10 || (season !== "fall" && season !== "winter")) {
    pruned = stripBulletBlock(pruned, "[LATE-GAME ROLE REVERSAL");
    pruned = stripBulletBlock(pruned, "[LATE-GAME CONFLICT");
  }
  if (globalLevel < 10 || season !== "winter") {
    pruned = stripBulletBlock(pruned, "[LATE-GAME MIGRATION");
    pruned = stripBulletBlock(pruned, "[LATE-GAME HAZARD");
  }
  if (globalLevel < 10) {
    pruned = stripBulletBlock(pruned, "[LATE-GAME EXPLORATION");
  }
  if (bondLevel < 13 || (season !== "winter" && season !== "summer")) {
    pruned = stripBulletBlock(pruned, "[LATE-GAME BIOLOGY");
  }
  if (season !== "fall" && season !== "winter") {
    pruned = stripBulletBlock(pruned, "[FALL & WINTER STAGNATION OVERRIDE]");
  }

  // Late-Winter Provisioning Drive (Batch 6) only applies in Winter at Bond 13+
  if (season !== "winter" || bondLevel < 13) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_OVERRIDE: THE LATE-WINTER PROVISIONING DRIVE",
    );
  }

  // Wandering Family Easter Egg (Batch 12) only applies at Bond 15+
  if (bondLevel < 15) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_OVERRIDE: THE WANDERING FAMILY",
    );
  }

  // --------------------------------------------------------------------------
  // RULE 6: Bond-Stage Gating (Nightclub Protocol, Hearth Friction, Solo Week)
  // --------------------------------------------------------------------------
  // Once Bond reaches 11+, the Apex is no longer an indifferent stranger.
  // Stripping the Nightclub Protocol prevents the AI from making a high-bond
  // mate suddenly act cold and distant again.
  if (bondLevel >= 11) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_RULE]: EARLY-GAME INDIFFERENCE (The Nightclub Protocol)",
    );
  }

  // Once the Apex has arrived (Bond >= 1 and Day >= 7), strip the Solo Survival Week lock.
  if (bondLevel >= 1 && dayNumber >= 7) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_RULE]: THE SOLO SURVIVAL WEEK (The Organic Arrival)",
    );
  }

  // During the Solo Survival Week (Bond 0, Days 1-6), hide Apex-Present Protection
  // and Bounded Epics (which require the Apex in the water).
  if (bondLevel === 0 && dayNumber < 7 && hasStartedGame) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_RULE]: THE APEX-PRESENT PROTECTION",
    );
    pruned = stripMarkdownSection(
      pruned,
      "[DIRECTIVE_MODULE]: 17. THE BOUNDED EPIC",
    );
  }

  // Hearth Friction (The 15-item Domestic Prompt Bank in Batch 6) assumes the
  // Apex is living/sleeping in the Grotto with you. Hide it when Bond < 6 or outside.
  if (bondLevel < 6 || isOutsideGrotto) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MODULE: THE HEARTH FRICTION (The Domestic Prompt Bank)]",
    );
  }

  // --------------------------------------------------------------------------
  // RULE 7: Out-of-Season Weather Pruning (Batch 13)
  // Under "2. OCEAN CONDITION GENERATION", strip the 3 seasons you aren't in!
  // --------------------------------------------------------------------------
  pruned = pruneOutOfSeasonWeather(pruned, season);

  // --------------------------------------------------------------------------
  // RULE 8: Two-Way Radar Gates (Triggered by EITHER Player OR AI Output)
  // --------------------------------------------------------------------------

  // A. Standby App Roll Rules: Only needed when index.ts actually injected ((APP_ROLL
  if (!rawPlayerInput.includes("((APP_ROLL")) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_RULE]: THE APP-INJECTED ROLL (Standby Supply)",
    );
  }

  // B. Narrative Plot Wishlist Engine (~500 words):
  // Keep if you have queued wishlist items OR the AI's recent OOC has an active wishlist item.
  const isWishlistActiveInAi = /\*\*Wishlist:\*\*\s*\[(SCANNING|ACTIVE|RESOLVED)/i.test(recentAiTurns);
  if (!wishlist.trim() && !isWishlistActiveInAi) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: NARRATIVE PLOT WISHLIST ENGINE]",
    );
  }

  // C. Travel Route Chains & Waystations (Batch 7):
  // Keep whenever you are outside the Grotto, it's Evening/Night, OR either you
  // or the AI mention swimming somewhere, traveling, map chains, outer zones, or shelters.
  const isTravelOrWaystationInRadar =
    isOutsideGrotto ||
    isEveningOrNight ||
    /\b(travel|swim to|head to|head home|swim back|return to|leave the grotto|explore|scout|outer zone|inner zone|chain|route|map|waystation|shelter|camp|crevice|wreck|reef|trench|kelp forest|sand bar|league)\b/i.test(
      twoWayRadar,
    );

  if (!isTravelOrWaystationInRadar) {
    pruned = stripMarkdownSection(pruned, 'THE "OUTER ZONE" TRAVEL ENCOUNTER');
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_RULE]: THE TRAVEL ROUTE (Location Chains & No Fast-Travel)",
    );
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: WAYSTATIONS & TEMPORARY SHELTERS]",
    );
  }

  // D. Trap Rules ("Blood in the Water" & "Degradation" in Batch 9):
  // Keep if you have active traps in your Save Log OR you/the AI mention traps, nets, or live-wells.
  const isTrapInRadar =
    hasActiveTrapsInSave ||
    /\b(trap|traps|net|live-well|live well|snare|weir|passive food)\b/i.test(
      `${twoWayRadar}\n${registry}`,
    );

  if (!isTrapInRadar) {
    pruned = stripMarkdownSection(
      pruned,
      '1. THE "BLOOD IN THE WATER" RULE (Trap Dependency)',
    );
    pruned = stripMarkdownSection(
      pruned,
      "2. THE DEGRADATION RULE (Trap Maintenance)",
    );
  }

  // E. Downtime Domestication / Pets (Batch 9):
  // Keep if you have a pet in your Registry/Save Log OR you/the AI mention pets or taming scavengers.
  const isPetInRadar =
    /\b(pet|pets|tame|taming|domesticate|isopod|sea louse|sea cucumber|hermit crab)\b/i.test(
      `${twoWayRadar}\n${saveLog}\n${registry}`,
    );

  if (!isPetInRadar) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: DOWNTIME DOMESTICATION (Pets)]",
    );
  }

  // F. Secondary Grotto / Waystation Promotion (Batch 9):
  // Keep only if you have a Waystation on your Map/Registry or mention promoting one.
  const hasWaystation =
    /\b(waystation|secondary grotto|temporary shelter)\b/i.test(
      `${mapText}\n${registry}\n${saveLog}\n${twoWayRadar}`,
    );
  if (!hasWaystation) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: THE SECONDARY GROTTO (Waystation Promotion)]",
    );
  }

  // G. Quest Resolution & Closure (Batch 8):
  // Keep if you have an Active Quest in the Save Log OR you/the AI mention a quest.
  const isQuestInRadar =
    hasActiveQuestsInSave ||
    /\b(quest|objective|fetch|grand offering)\b/i.test(twoWayRadar);
  if (!isQuestInRadar) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: QUEST RESOLUTION & CLOSURE]",
    );
  }

  // H. Injury & Healing Protocol (Batch 12) and Game Over Protocol (Batch 13):
  // Note: "# [SYSTEM_MECHANIC: THE 10-POINT HEALTH BAR]" is ALWAYS kept so basic HP math works!
  // The detailed Injury & Healing timers/infection rules unlock whenever HP < Max HP,
  // an injury is in the Save Log, OR you/the AI mention wounds, blood, danger, or healing.
  const isInjuredOrHealingInRadar =
    hp < maxHp ||
    /\b(injury|injured|wound|wounded|bleed|bleeding|blood|bite|bitten|laceration|scar|infection|infected|burn|heal|healing|medicinal|algae|kelp|moss|herb|forage|predator|hostile|cannibal)\b/i.test(
      `${saveLog}\n${twoWayRadar}`,
    );

  if (!isInjuredOrHealingInRadar) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: INJURY & HEALING PROTOCOL]",
    );
  }

  // Game Over Protocol unlocks if HP is low (<= 4), Stamina is 0, a raw 1 was rolled,
  // or fatal/game-over keywords appear in the radar.
  const isLethalDangerInRadar =
    hp <= 4 ||
    stamina === 0 ||
    /\b(game over|timeline rewind|abyssal miracle|near death|lethal|cannibalistic apex|rolled a 1\b|seed:\s*`?1d20`?\s*->\s*\*?\*?1\b)\b/i.test(
      `${rawPlayerInput}\n${twoWayRadar}`,
    );

  if (!isLethalDangerInRadar) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: THE GAME OVER PROTOCOL]",
    );
  }

  // I. Pressure Gauge (Batch 4) & Sleep Trigger Bookkeeping (Batch 13):
  // Pressure only updates on Morning Encounter rolls ("Proceed"), Save Progress, or Maintenance.
  if (
    !isDayStartTurn &&
    !isNightlyHaltOrMaintenance &&
    !/\bpressure\b/i.test(twoWayRadar)
  ) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: THE PRESSURE GAUGE (Threat Escalation)]",
    );
  }

  // J. Legacy Marks (Batch 13):
  // Only needed when Global Level >= 19, you already have Legacy Marks, or you use one.
  if (
    globalLevel < 19 &&
    legacyMarks === 0 &&
    !/legacy mark/i.test(twoWayRadar)
  ) {
    pruned = pruned.replace(
      /-\s*\*\*The Legacy Loop:\*\*[\s\S]*?(?=\n#|\n####|$)/i,
      "",
    );
  }

  // --------------------------------------------------------------------------
  // RULE 9: Cross-Apex Name Scrubbing (Prevents Character Personality Bleed)
  // Your Core Rules mention Kial, Malibu, Ricsa, Severin, and Ezra as examples.
  // If you are romancing Severin, seeing Malibu's playful tail-yanking or
  // Kial's stingray-crushing in the Core Rules can cause personality bleed!
  // This helper replaces non-active Apex names in examples with generic terms.
  // --------------------------------------------------------------------------
  pruned = scrubInactiveApexNames(pruned, ctx.apexTarget ?? "");

  // --------------------------------------------------------------------------
  // RULE 10: Optional HTML Comment Gate Support
  // If you ever add <!-- [GATE: BOND>=10] --> ... <!-- [/GATE] --> inside your
  // Markdown files in the future, this processes them automatically!
  // --------------------------------------------------------------------------
  pruned = processHtmlCommentGates(pruned, {
    bondLevel,
    globalLevel,
    season,
    hasOffspring: hasOffspringOrPregnancy,
  });

  // Clean up any 3+ blank lines left behind by removed sections so the prompt is tidy.
  return pruned.replace(/\n{3,}/g, "\n\n").trim();
}

// ============================================================================
// HELPER FUNCTIONS (The Toolbox Used by the Main Function Above)
// ============================================================================

/**
 * HELPER 1: stripMarkdownSection
 * Finds a Markdown heading (like "# [SECTION 4...]" or "#### 5. THE INFANT PHASE")
 * and removes everything under it until the next heading of the SAME or HIGHER level.
 *
 * Why "level-aware" matters:
 * If we strip a "# " (1-hash) heading, it also removes all the "### " and "#### "
 * sub-headings inside it, stopping only when it hits the next "# " heading!
 */
function stripMarkdownSection(text: string, headingTitleSnippet: string): string {
  // Escape special punctuation (like brackets [ ] and parentheses ( )) so Regex
  // treats them as normal letters instead of special math symbols.
  const escapedTitle = headingTitleSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Find the line with the heading and count how many "#" symbols it starts with (1 to 4).
  const headingMatch = text.match(
    new RegExp(`^(#{1,4})\\s+[^\\n]*${escapedTitle}[^\\n]*`, "im"),
  );
  if (!headingMatch) return text; // If the heading wasn't found, leave the text alone.

  const hashCount = headingMatch[1].length; // e.g., 1 for "#", 4 for "####"

  // Build a pattern that matches from this heading down to the next heading that has
  // BETWEEN 1 AND hashCount "#" symbols (or the end of the document).
  const sectionRegex = new RegExp(
    `^#{${hashCount}}\\s+[^\\n]*${escapedTitle}[^\\n]*[\\s\\S]*?(?=^#{1,${hashCount}}\\s+|\\Z)`,
    "im",
  );

  // Note: JavaScript's "m" flag uses $(?![\r\n]) for end-of-string, so we match
  // either the next heading line (\n#{1,hashCount}\s+) or the end of the text ($).
  const jsSafeSectionRegex = new RegExp(
    `(?:^|\\n)#{${hashCount}}\\s+[^\\n]*${escapedTitle}[^\\n]*[\\s\\S]*?(?=\\n#{1,${hashCount}}\\s+|$)`,
    "i",
  );

  return text.replace(jsSafeSectionRegex, "\n");
}

/**
 * HELPER 2: stripBulletBlock
 * Used for the "[LATE-GAME ...]" quests in Batch 8, which are written as
 * bullet points (" - [LATE-GAME ...]:") with indented sub-bullets ("  - The Event:")
 * rather than "#" headings.
 */
function stripBulletBlock(text: string, bracketSnippet: string): string {
  const escaped = bracketSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `\\n?[ \\t]*-[ \\t]*\\**${escaped}[\\s\\S]*?(?=\\n[ \\t]*-[ \\t]*(?:\\[LATE-GAME|\\*\\*\\[)|\\n#{1,4}\\s+|$)`,
    "i",
  );
  return text.replace(regex, "\n");
}

/**
 * HELPER 3: pruneOutOfSeasonWeather
 * In Batch 13 ("2. OCEAN CONDITION GENERATION"), there are 4 seasonal weather blocks:
 * - **[SPRING: THE BLOOM]**
 * - **[SUMMER: THE SURFACE GALES]**
 * - **[FALL: THE DEEP SHIFT]**
 * - **[WINTER: THE STILLNESS]**
 * This removes the 3 seasons you are NOT currently in so the AI never applies
 * Winter's "-10 Endurance Deep Chill" during Spring!
 */
function pruneOutOfSeasonWeather(text: string, currentSeason: string): string {
  const allSeasons = [
    { key: "spring", header: "\\[SPRING:\\s*THE BLOOM\\]" },
    { key: "summer", header: "\\[SUMMER:\\s*THE SURFACE GALES\\]" },
    { key: "fall", header: "\\[FALL:\\s*THE DEEP SHIFT\\]" },
    { key: "winter", header: "\\[WINTER:\\s*THE STILLNESS\\]" },
  ];

  let result = text;
  for (const s of allSeasons) {
    if (s.key !== currentSeason) {
      const regex = new RegExp(
        `\\n?-\\s*\\*\\*${s.header}\\*\\*[\\s\\S]*?(?=\\n-\\s*\\*\\*\\[(?:SPRING|SUMMER|FALL|WINTER):|\\n#{1,4}\\s+|$)`,
        "i",
      );
      result = result.replace(regex, "");
    }
  }
  return result;
}

/**
 * HELPER 4: scrubInactiveApexNames
 * Replaces example references to other Apexes inside the Universal Core Engine
 * with "[The Primary Mate]" unless that Apex is the one you are actively playing!
 */
function scrubInactiveApexNames(text: string, activeApexTarget: string): string {
  const target = activeApexTarget.toLowerCase();
  const apexNames = ["Kial", "Malibu", "Ricsa", "Severin", "Ezra", "Idris"];

  let result = text;
  for (const name of apexNames) {
    // Only scrub this name if it is NOT your current active Apex
    if (!target.includes(name.toLowerCase())) {
      const possessiveRegex = new RegExp(`\\b${name}'s\\b`, "g");
      const nameRegex = new RegExp(`\\b${name}\\b`, "g");
      result = result
        .replace(possessiveRegex, "the Primary Mate's")
        .replace(nameRegex, "the Primary Mate");
    }
  }
  return result;
}

/**
 * HELPER 5: getNumberStat
 * Reads a number from storyState first; if missing, searches the Daily Save Log
 * using a Regular Expression pattern; if still missing, returns a safe default.
 */
function getNumberStat(
  stateValue: unknown,
  saveLog: string,
  saveRegex: RegExp,
  defaultValue: number,
): number {
  if (typeof stateValue === "number" && !Number.isNaN(stateValue)) {
    return stateValue;
  }
  const match = saveLog.match(saveRegex);
  if (match && match[1]) {
    const parsed = parseInt(match[1], 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

/**
 * HELPER 6: detectSeason
 * Checks storyState, the Daily Save Log, and recent AI OOC headers to figure out
 * whether the game is currently in "spring", "summer", "fall", or "winter".
 */
function detectSeason(
  stateSeason: string | undefined,
  saveLog: string,
  recentAiTurns: string,
): "spring" | "summer" | "fall" | "winter" {
  const combined = `${stateSeason ?? ""} ${saveLog} ${recentAiTurns}`.toLowerCase();
  const dateMatch = combined.match(/\b(spring|summer|fall|autumn|winter)\s*,\s*day\s*\d+/i);
  const word = dateMatch ? dateMatch[1].toLowerCase() : combined;

  if (word.includes("winter")) return "winter";
  if (word.includes("fall") || word.includes("autumn")) return "fall";
  if (word.includes("summer")) return "summer";
  return "spring";
}

/**
 * HELPER 7: detectIfOutsideGrotto
 * Checks if the player's Current Location in the Save Log or AI OOC header is
 * somewhere outside their home Grotto.
 */
function detectIfOutsideGrotto(
  saveLog: string,
  recentAiTurns: string,
  cleanPlayerInput: string,
): boolean {
  // Check if the AI's most recent OOC block or the Save Log lists a Current Location
  const locMatch =
    recentAiTurns.match(/\*\*Current Location:\*\*\s*([^\n]+)/i) ??
    saveLog.match(/\*\*Current Location:\*\*\s*([^\n]+)/i);

  if (locMatch && locMatch[1]) {
    const loc = locMatch[1].toLowerCase();
    // If the location mentions "outer zone" or does NOT mention "grotto", they are out exploring!
    if (loc.includes("outer zone") || !loc.includes("grotto")) {
      return true;
    }
  }

  // Also return true if the player's current input says they are leaving or swimming out
  return /\b(leave the grotto|swim out|head out|outer zone|open blue|open water)\b/i.test(
    cleanPlayerInput,
  );
}

/**
 * HELPER 8: processHtmlCommentGates
 * Optional future-proofing: allows you to wrap any text in your Markdown files with:
 * <!-- [GATE: BOND>=10] --> ... <!-- [/GATE] -->
 * or <!-- [GATE: LEVEL>=10] --> or <!-- [GATE: OFFSPRING] -->
 */
function processHtmlCommentGates(
  text: string,
  state: { bondLevel: number; globalLevel: number; season: string; hasOffspring: boolean },
): string {
  const gateRegex = /<!--\s*\[GATE:\s*([^\]]+)\]\s*-->([\s\S]*?)<!--\s*\[\/GATE\]\s*-->/gi;
  return text.replace(gateRegex, (_fullMatch, conditionRaw: string, innerContent: string) => {
    const cond = conditionRaw.trim().toUpperCase();

    const bondMatch = cond.match(/^BOND\s*>=\s*(\d+)$/);
    if (bondMatch && state.bondLevel < parseInt(bondMatch[1], 10)) return "";

    const levelMatch = cond.match(/^LEVEL\s*>=\s*(\d+)$/);
    if (levelMatch && state.globalLevel < parseInt(levelMatch[1], 10)) return "";

    if (cond === "OFFSPRING" && !state.hasOffspring) return "";

    return innerContent;
  });
}