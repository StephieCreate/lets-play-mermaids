/**
 * ============================================================================
 * FILE: supabase/functions/narrate/ruleTokenPruning.ts
 * PURPOSE: Dynamically prunes ("trims") sections of your RPG rule documents
 * based on both Player Input AND recent AI Narrator Output ("Two-Way Radar"),
 * plus live stats from the Daily Save Log and Grotto Registry.
 *
 * Currently handles:
 *   1. "universal-core-engine" (All 15 batches)
 *   2. "universal-game-templates" (Modules A, B, C, D)
 *   3. "medicinal-algae-quick-reference" (All medical tables + Environmental Flavor)
 * ============================================================================
 */

// Blueprint for a single message in the chat history
export interface PruningTurnMessage {
  role: "player" | "narrator";
  content: string;
}

// Blueprint for all the game data passed in from index.ts
export interface PruningContext {
  playerInput: string;                        // What the player typed this turn
  currentScene?: string | null;               // Current scene label (if any)
  dailySaveLog?: string;                      // Text from Tab 2: Daily Save Log
  grottoRegistry?: string;                    // Text from Tab 4: Grotto Registry
  grottoMap?: string;                         // Text from Tab 5: The Map
  plotWishlistQueued?: string;                // Queued items from Plot Wishlist
  conversationHistory?: PruningTurnMessage[]; // Recent chat turns (Player + AI)
  storyState?: Record<string, unknown>;       // Database numbers (HP, Stamina, Bond, etc.)
  apexTarget?: string;                        // Which Apex is active (e.g., "kial", "severin")
  triadActive?: boolean;                      // Optional flag if Triad mode is enabled
}

/**
 * MAIN ENTRY FUNCTION: pruneRulesByPlayerState
 * Called inside index.ts for each rule document right before buildSystemPrompt().
 */
export function pruneRulesByPlayerState(
  ruleSlug: string,
  ruleText: string,
  ctx: PruningContext,
): string {
  // Safety check: if the document is empty, return it as-is.
  if (!ruleText || !ruleText.trim()) return ruleText;

  // ==========================================================================
  // STEP 1: BUILD THE SHARED "TWO-WAY RADAR" & LIVE GAME STATE
  // ==========================================================================

  const saveLog = ctx.dailySaveLog ?? "";
  const registry = ctx.grottoRegistry ?? "";
  const mapText = ctx.grottoMap ?? "";
  const wishlist = ctx.plotWishlistQueued ?? "";
  const state = ctx.storyState ?? {};

  // Strip out automatic system directives added by index.ts so we read only
  // what the player actually typed.
  const rawPlayerInput = ctx.playerInput ?? "";
  const cleanPlayerInput = rawPlayerInput
    .split("\n\n[MANDATORY SYSTEM DIRECTIVE")[0]
    .split("\n\n((APP_ROLL")[0]
    .toLowerCase();

  // Grab the AI's last 2 responses from conversationHistory so our pruner knows
  // what the AI just narrated, rolled, or set up in the scene!
  const recentAiTurns = (ctx.conversationHistory ?? [])
    .filter((turn) => turn.role === "narrator")
    .slice(-2)
    .map((turn) => turn.content)
    .join("\n")
    .toLowerCase();

  // The "Two-Way Radar" combines Player Input + Recent AI Output + Scene Name.
  const twoWayRadar = `${cleanPlayerInput}\n${recentAiTurns}\n${(ctx.currentScene ?? "").toLowerCase()}`;

  // Read live numeric stats from storyState or fallback to the Daily Save Log
  const hp = getNumberStat(state["hp"], saveLog, /\*\*Health:\*\*\s*(\d+)/i, 10);
  const maxHp = getNumberStat(state["max_hp"], saveLog, /\*\*Health:\*\*\s*\d+\s*\/\s*(\d+)/i, 10);
  const stamina = getNumberStat(state["stamina"], saveLog, /\*\*Stamina:\*\*\s*(\d+)/i, 10);
  const globalLevel = getNumberStat(state["level"], saveLog, /\*\*Global Level:\*\*\s*(\d+)/i, 1);
  const bondLevel = getNumberStat(state["bond_level"], saveLog, /\*\*Bond Level:\*\*\s*(\d+)/i, 0);
  const legacyMarks = getNumberStat(undefined, saveLog, /\*\*Legacy Marks:\*\*[^|\n]*\|\s*(\d+)\s*Marks/i, 0);

  // Detect current Season ("spring", "summer", "fall", "winter"), Day (1-28), and Year
  const season = detectSeason(state["current_season"] as string, saveLog, recentAiTurns);
  const dayNumber = getNumberStat(undefined, saveLog, /\bDay\s+(\d+)/i, 1);
  const yearNumber = getNumberStat(state["current_year"], saveLog, /\bYear\s+(\d+)/i, 1);

  // Detect whether Character Creation is finished
  const isNewGameCommand = /\b(start game|start the game|new game|begin game)\b/i.test(cleanPlayerInput);
  const hasStartedGame =
    !isNewGameCommand &&
    (saveLog.trim().length > 0 || registry.trim().length > 0 || state["files_initialized"] === true);

  // Detect whether the player has an active pregnancy or offspring
  const offspringFieldMatch = saveLog.match(/\*\*Offspring Fed:\*\*\s*([^\n|]+)/i);
  const offspringFieldText = offspringFieldMatch ? offspringFieldMatch[1].trim() : "N/A";
  const hasOffspringInSave = !/^(n\/a|none|no|0)$/i.test(offspringFieldText);
  const hasOffspringOrPregnancy =
    hasOffspringInSave ||
    /\b(gestation|pregnant|pregnancy|infant phase|juvenile phase|rescue phase|offspring check)\b/i.test(
      `${saveLog}\n${recentAiTurns}`,
    );

  // Detect whether the player has a Starter Pod
  const hasStarterPod =
    /\b(starter pod|pod member|pod synergy)\b/i.test(`${saveLog}\n${registry}`) ||
    (!/shiver status:\s*(not present|none|n\/a)/i.test(saveLog) && /shiver status:/i.test(saveLog));

  // Detect whether Triad Mode is active
  const isTriadActive =
    Boolean(ctx.triadActive) ||
    /\btriad surrogate\b/i.test(saveLog);

  // Detect if it is Evening or Night
  const isEveningOrNight = /\b(evening|night|nightfall|dark)\b/i.test(
    `${saveLog}\n${recentAiTurns}\n${cleanPlayerInput}`,
  );

  // Detect specific modular player commands
  const isSaveProgressCmd = /\b(save progress|save my progress|generate save|daily save log)\b/i.test(cleanPlayerInput);
  const isSummaryCmd = /\b(give me a summary|generate a summary|narrative summary|summary of today)\b/i.test(cleanPlayerInput);
  const isUpdateRegisterCmd = /\b(update register|grotto register|update my register)\b/i.test(cleanPlayerInput);
  const isSleepCmd = /\b(i go to sleep|go to sleep|i am ending the day|i fall asleep|sleep for the night|retire for the night|bed down)\b/i.test(cleanPlayerInput);

  const gameMode = (state["game_mode"] as string) ?? "ACTIVE";
  const isMaintenanceMode =
    gameMode === "WAITING COMMAND" ||
    isSaveProgressCmd ||
    isSummaryCmd ||
    isUpdateRegisterCmd ||
    isSleepCmd;

  // ==========================================================================
  // STEP 2: ROUTE TO THE MATCHING DOCUMENT PRUNER
  // ==========================================================================

  // --------------------------------------------------------------------------
  // DOCUMENT A: "universal-game-templates"
  // --------------------------------------------------------------------------
  if (ruleSlug === "universal-game-templates") {
    return pruneGameTemplates(ruleText, {
      hasStartedGame,
      isSaveProgressCmd,
      isSummaryCmd,
      isUpdateRegisterCmd,
      bondLevel,
      hasOffspringOrPregnancy,
      hasStarterPod,
      isTriadActive,
      season,
      dayNumber,
      yearNumber,
      apexTarget: ctx.apexTarget ?? "",
    });
  }

  // --------------------------------------------------------------------------
  // DOCUMENT B: "medicinal-algae-quick-reference"
  // --------------------------------------------------------------------------
  if (ruleSlug === "medicinal-algae-quick-reference") {
    return pruneMedicinalAlgaeReference(ruleText, {
      hasStartedGame,
      isMaintenanceMode,
      hp,
      maxHp,
      stamina,
      bondLevel,
      season,
      isEveningOrNight,
      saveLog,
      registry,
      twoWayRadar,
    });
  }

  // --------------------------------------------------------------------------
  // DOCUMENT C: "universal-core-engine"
  // --------------------------------------------------------------------------
  if (ruleSlug !== "universal-core-engine") {
    // Any other document (like Apex Plugins) passes through untouched for now
    return ruleText;
  }

  // Additional state flags needed for "universal-core-engine"
  const hasActiveTrapsInSave =
    /\*\*Active Traps[^*]*\*\*\s*(?!None\b|N\/A\b)[^\n|]+/i.test(saveLog);
  const hasActiveQuestsInSave =
    /active quests[\s\S]{0,120}?(?!none\b|n\/a\b)[a-z0-9]/i.test(saveLog);
  const isOutsideGrotto = detectIfOutsideGrotto(saveLog, recentAiTurns, cleanPlayerInput);
  const isDayStartTurn =
    /\b(proceed|load save|load game|resume game)\b/i.test(cleanPlayerInput) ||
    rawPlayerInput.includes("((APP_ROLL:Daily Encounter");

  let pruned = ruleText;

  // 1. Character Creation (# [SECTION 4: GAME INITIATION SEQUENCE])
  if (hasStartedGame) {
    pruned = stripMarkdownSection(pruned, "[SECTION 4: GAME INITIATION SEQUENCE]");
  }

  // 2. Reproduction & Raising Children (# [SYSTEM_MECHANIC: REPRODUCTION & RAISING CHILDREN])
  const isMatingOrConceptionMentioned =
    /\b(mating season|frenzy|conceive|conception|offspring|pregnant|pregnancy|adopt a pup|adoption|catalyst quest)\b/i.test(
      twoWayRadar,
    );

  if (bondLevel < 18 && !hasOffspringOrPregnancy && !isMatingOrConceptionMentioned) {
    pruned = stripMarkdownSection(pruned, "[SYSTEM_MECHANIC: REPRODUCTION & RAISING CHILDREN]");
    pruned = pruned.replace(
      /\*\*The game is also a family\.\*\*[\s\S]*?(?=\n\n\*\*The ocean is the setting)/i,
      "",
    );
    pruned = pruned.replace(
      /\[\s*THE INFANT\/JUVENILE OVERRIDE\s*\]:[\s\S]*?(?=\n-\s*\*\*The Trigger)/i,
      "",
    );
    pruned = pruned.replace(
      /-\s*\*\*The Growing Void \(Offspring Metabolism\):\*\*[\s\S]*?(?=\n#|\n####|$)/i,
      "",
    );
  } else if (hasOffspringOrPregnancy) {
    const combinedStateText = `${saveLog}\n${recentAiTurns}`;
    const isInGestation = /\bgestation\b|\bpregnant\b/i.test(combinedStateText);
    const isInInfantPhase = /\binfant\b|\brescue phase\b/i.test(combinedStateText);
    const isInJuvenilePhase = /\bjuvenile\b/i.test(combinedStateText);
    const hasTwins = /\btwin\b/i.test(combinedStateText);

    if (!hasTwins && (isInGestation || isInInfantPhase || isInJuvenilePhase)) {
      pruned = stripMarkdownSection(pruned, "1.5.5 THE TWIN ANOMALY");
    }
    if (isInGestation) {
      pruned = stripMarkdownSection(pruned, "5. THE INFANT PHASE");
      pruned = stripMarkdownSection(pruned, "6. THE JUVENILE PHASE");
    } else if (isInInfantPhase) {
      pruned = stripMarkdownSection(pruned, "4. THE GESTATION PHASE");
      pruned = stripMarkdownSection(pruned, "4.5 THE BIRTH EVENT");
      pruned = stripMarkdownSection(pruned, "6. THE JUVENILE PHASE");
    } else if (isInJuvenilePhase) {
      pruned = stripMarkdownSection(pruned, "4. THE GESTATION PHASE");
      pruned = stripMarkdownSection(pruned, "4.5 THE BIRTH EVENT");
      pruned = stripMarkdownSection(pruned, "5. THE INFANT PHASE");
    }
  }

  // 3. The 3-Day Mating Season Heat (#### THE "SEASON" (Mating Biology))
  if (bondLevel < 15 && !isMatingOrConceptionMentioned && !hasOffspringOrPregnancy) {
    pruned = stripMarkdownSection(pruned, 'THE "SEASON" (Mating Biology)');
  }

  const isIntimacyOrAftermathActive =
    /\b(fade-to-black|fade to black|intimate|intimacy|aftermath|sore|kiss|pressed against|mating)\b/i.test(
      `${twoWayRadar}\n${saveLog}`,
    );
  if (!isIntimacyOrAftermathActive) {
    pruned = stripMarkdownSection(pruned, "THE AFTERMATH (Scale Disparity & Recovery)");
  }

  // 4. Starter Pod Rules (THE NOMADIC POD START & THE SUPPRESSED SEASON)
  if (hasStartedGame && !hasStarterPod) {
    pruned = stripMarkdownSection(pruned, "[SYSTEM_OVERRIDE: THE NOMADIC POD START");
    pruned = stripMarkdownSection(pruned, "[SYSTEM_LORE: THE SUPPRESSED SEASON");
  }

  // 5. Late-Game Level 10+ & Seasonal Quest Blocks
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
  if (season !== "winter" || bondLevel < 13) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_OVERRIDE: THE LATE-WINTER PROVISIONING DRIVE",
    );
  }
  if (bondLevel < 15) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_OVERRIDE: THE WANDERING FAMILY",
    );
  }

  // 6. Bond-Stage Gating (Nightclub Protocol, Solo Week, Hearth Friction)
  if (bondLevel >= 11) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_RULE]: EARLY-GAME INDIFFERENCE (The Nightclub Protocol)",
    );
  }
  if (bondLevel >= 1 && dayNumber >= 7) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_RULE]: THE SOLO SURVIVAL WEEK (The Organic Arrival)",
    );
  }
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
  if (bondLevel < 6 || isOutsideGrotto) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MODULE: THE HEARTH FRICTION (The Domestic Prompt Bank)]",
    );
  }

  // 7. Out-of-Season Weather Pruning
  pruned = pruneOutOfSeasonWeather(pruned, season);

  // 8. Two-Way Radar Gates (Triggered by EITHER Player OR AI Output)
  if (!rawPlayerInput.includes("((APP_ROLL")) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_RULE]: THE APP-INJECTED ROLL (Standby Supply)",
    );
  }

  const isWishlistActiveInAi = /\*\*Wishlist:\*\*\s*\[(SCANNING|ACTIVE|RESOLVED)/i.test(recentAiTurns);
  if (!wishlist.trim() && !isWishlistActiveInAi) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: NARRATIVE PLOT WISHLIST ENGINE]",
    );
  }

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

  const isQuestInRadar =
    hasActiveQuestsInSave ||
    /\b(quest|objective|fetch|grand offering)\b/i.test(twoWayRadar);
  if (!isQuestInRadar) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: QUEST RESOLUTION & CLOSURE]",
    );
  }

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

  // Check if the player is getting close to starvation penalties (Stamina 4 or lower)
  // OR if either the player or the AI's last 2 responses mention hunger/exhaustion.
  const isNearStarvation =
    stamina <= 4 ||
    /\b(hungry|starving|starvation|famished|exhausted|exhaustion|collapse|stamina:\s*[0-4]\b)\b/i.test(
      `${saveLog}\n${twoWayRadar}`,
    );

  // Unlock the Game Over / Starvation Collapse rules EARLY (at Stamina <= 4 or HP <= 4)
  // so the AI already knows the collapse and rescue rules BEFORE you hit 0!
  const isLethalDangerInRadar =
    hp <= 4 ||
    isNearStarvation ||
    /\b(game over|timeline rewind|abyssal miracle|near death|lethal|cannibalistic apex|rolled a 1\b|seed:\s*`?1d20`?\s*->\s*\*?\*?1\b)\b/i.test(
      `${rawPlayerInput}\n${twoWayRadar}`,
    );
  
  if (!isLethalDangerInRadar) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: THE GAME OVER PROTOCOL]",
    );
  }

  if (
    !isDayStartTurn &&
    !isMaintenanceMode &&
    !/\bpressure\b/i.test(twoWayRadar)
  ) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MECHANIC: THE PRESSURE GAUGE (Threat Escalation)]",
    );
  }

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

  // 9. Scrub non-active Apex names from examples
  pruned = scrubInactiveApexNames(pruned, ctx.apexTarget ?? "");

  // 10. Process optional HTML comment gates
  pruned = processHtmlCommentGates(pruned, {
    bondLevel,
    globalLevel,
    season,
    hasOffspring: hasOffspringOrPregnancy,
  });

  return pruned.replace(/\n{3,}/g, "\n\n").trim();
}

// ============================================================================
// DOCUMENT-SPECIFIC PRUNERS (Templates & Medicinal Algae + Environmental Flavor)
// ============================================================================

/**
 * PRUNER FOR: "universal-game-templates"
 * Only sends the specific template (Save Log, Summary, or Grotto Register)
 * when the player actually asks for it! On normal turns, keeps ONLY the tiny
 * "### II. BASE SURVIVAL SKILLS (Static)" Score-to-Modifier conversion table.
 */
function pruneGameTemplates(
  text: string,
  opts: {
    hasStartedGame: boolean;
    isSaveProgressCmd: boolean;
    isSummaryCmd: boolean;
    isUpdateRegisterCmd: boolean;
    bondLevel: number;
    hasOffspringOrPregnancy: boolean;
    hasStarterPod: boolean;
    isTriadActive: boolean;
    season: string;
    dayNumber: number;
    yearNumber: number;
    apexTarget: string;
  },
): string {
  let cleaned = scrubInactiveApexNames(text, opts.apexTarget);

  if (opts.bondLevel < 18 && !opts.hasOffspringOrPregnancy) {
    cleaned = stripMarkdownSection(cleaned, "IV. OFFSPRING (THE LEGACY)");
    cleaned = cleaned.replace(/\n-\s*\*\*Offspring Fed:\*\*[^\n]*/i, "");
    cleaned = cleaned.replace(
      /,\s*Gestation Phase\s*\([^)]*\)\s*\|\s*Holding Infant\s*\([^)]*\)/i,
      "",
    );
  }

  if (!opts.isTriadActive) {
    cleaned = cleaned.replace(/\n-\s*\*\*\[TRIAD SURROGATE\][^\n]*/i, "");
  }

  if (opts.hasStartedGame && !opts.hasStarterPod) {
    cleaned = cleaned.replace(
      /\n-\s*\*\*\[NPC Name\]:\*\*\s*\[e\.g\.,\s*Lea \(Nomadic Pod Mate\)\][\s\S]*?(?=\n###\s+IV\.|\n###\s+V\.|$)/i,
      "\n",
    );
  }

  cleaned = stripMarkdownSection(cleaned, "MODULE D: NARRATIVE PLOT WISHLIST TEMPLATE");

  if (opts.isSaveProgressCmd) {
    cleaned = stripMarkdownSection(cleaned, "MODULE A: THE NARRATIVE SUMMARY");
    cleaned = stripMarkdownSection(cleaned, "MODULE C: THE PLAYER GROTTO REGISTER");
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }

  if (opts.isSummaryCmd) {
    cleaned = stripMarkdownSection(cleaned, "MODULE B: THE DAILY SAVE LOG");
    cleaned = stripMarkdownSection(cleaned, "MODULE C: THE PLAYER GROTTO REGISTER");

    const isFirstDayEver = opts.season === "spring" && opts.dayNumber <= 1 && opts.yearNumber <= 1;
    if (!isFirstDayEver) {
      cleaned = cleaned.replace(
        /# \[SYSTEM_HEADER: NARRATIVE_ARCHIVE_ONLY\][\s\S]*?\[System_Instructions:[^\]]*\]\s*---/i,
        "",
      );
    }
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }

  if (opts.isUpdateRegisterCmd || !opts.hasStartedGame) {
    cleaned = stripMarkdownSection(cleaned, "MODULE A: THE NARRATIVE SUMMARY");
    if (opts.isUpdateRegisterCmd && opts.hasStartedGame) {
      cleaned = stripMarkdownSection(cleaned, "MODULE B: THE DAILY SAVE LOG");
    }
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }

  const skillTableMatch = cleaned.match(
    /###\s+II\.\s+BASE SURVIVAL SKILLS[\s\S]*?(?=\n###\s+III\.|$)/i,
  );
  if (skillTableMatch) {
    return skillTableMatch[0].trim();
  }

  return "";
}

/**
 * PRUNER FOR: "medicinal-algae-quick-reference"
 * Splits the document into:
 *   1. Medical & Flora Tables (Top Half) -> Unlocks only the specific tables needed
 *      (Base 5-Plant Table, Apothecary Prep, Analgesics/Muscle Soak, Graveyard Cultivars,
 *      Endocrine/Mating Pheromone Brew, and Deep-Ocean Anomalies).
 *   2. "# [SYSTEM_MODULE: ENVIRONMENTAL FLAVOR EXPANSION]" (Bottom Half) -> Kept active
 *      on normal gameplay turns so the ocean stays rich with soundscapes and fauna,
 *      with Section 8 filtered to the current Season and Section 10 gated to Evening/Night!
 */
function pruneMedicinalAlgaeReference(
  text: string,
  opts: {
    hasStartedGame: boolean;
    isMaintenanceMode: boolean;
    hp: number;
    maxHp: number;
    stamina: number;
    bondLevel: number;
    season: "spring" | "summer" | "fall" | "winter";
    isEveningOrNight: boolean;
    saveLog: string;
    registry: string;
    twoWayRadar: string;
  },
): string {
  // Never needed during Character Creation or Save/Summary/Sleep maintenance turns
  if (!opts.hasStartedGame || opts.isMaintenanceMode) {
    return "";
  }

  // Split the file at "# [SYSTEM_MODULE: ENVIRONMENTAL FLAVOR EXPANSION]" so we can
  // prune the Medical tables without accidentally deleting the Environmental Flavor module!
  const envFlavorHeader = "# [SYSTEM_MODULE: ENVIRONMENTAL FLAVOR EXPANSION]";
  const splitIndex = text.indexOf(envFlavorHeader);

  let medicalPart = splitIndex !== -1 ? text.slice(0, splitIndex) : text;
  let envFlavorPart = splitIndex !== -1 ? text.slice(splitIndex) : "";

  const combinedContext = `${opts.saveLog}\n${opts.registry}\n${opts.twoWayRadar}`;

  // Check if the player's character is a Medic, Healer, Herbalist, or Apothecary
  const isMedicCharacter = /\b(medic|healer|herbalist|apothecary|doctor)\b/i.test(
    `${opts.registry}\n${opts.saveLog}`,
  );

  // --------------------------------------------------------------------------
  // PART 1: PRUNE THE MEDICAL & FLORA TABLES (Top Half)
  // --------------------------------------------------------------------------

  // A. Endocrine & Cognitive Support + Hidden Sanctuary Steep (Hard Rule-Bleed Lock!)
  // Only unlock if the 3-day Mating Season / Frenzy is active or mentioned, or Bond >= 15,
  // or if one of those 4 specific plants is explicitly named.
  const isEndocrineNeeded =
    opts.bondLevel >= 15 ||
    /\b(frenzy|mating season|three-day|3-day|hormone|pheromone|heat|brain fog|sedative|gorgonian|cave kelp|ecklonia|sargassum|mangrove|sanctuary steep)\b/i.test(
      combinedContext,
    );

  if (!isEndocrineNeeded) {
    medicalPart = stripMarkdownSection(
      medicalPart,
      "Endocrine & Cognitive Support (Hormonal Regulation)",
    );
  }

  // B. Deep-Ocean Anomalies (Fire Thermal Quartz, Abyssal Sun-Stone, Singing Shells)
  // Keep when exploring/foraging in outer zones/trenches/vents, fortifying the Grotto,
  // during Winter ("Deep Chill"), or when any of the 3 anomalies are mentioned.
  const isAnomalyNeeded =
    opts.season === "winter" ||
    /\b(quartz|sun-stone|sun stone|singing shell|anomaly|anomalies|lava|hydrothermal|vent|trench|abyss|abyssal|whale skeleton|whale bone|camouflage|fortify|grotto|forage|explore)\b/i.test(
      combinedContext,
    );

  if (!isAnomalyNeeded && !isMedicCharacter) {
    medicalPart = stripMarkdownSection(
      medicalPart,
      "Deep-Ocean Anomalies (Environmental Items)",
    );
  }

  // C. The Fallen Medics' Legacy (Graveyard Cultivars) & Transplant Mechanics
  // Keep for Medic characters, Moderate/Severe injuries, infections/rot/concussions/fractures,
  // or when gardening/cultivating/transplanting or any of the 5 cultivars are mentioned.
  const isGraveyardCultivarNeeded =
    isMedicCharacter ||
    /\b(moderate injury|severe injury|infection|infected|rot|necrosis|necrotic|gangrene|concussion|head trauma|fracture|broken|puncture|venom|toxin|cultivate|cultivation|transplant|garden|nursery|holdfast|spore|wineglass|acetabularia|dead man's fingers|codium|oarweed|finger kelp|laminaria|bladderwrack|fucus|red feather|false coral|asparagopsis)\b/i.test(
      combinedContext,
    );

  if (!isGraveyardCultivarNeeded) {
    medicalPart = stripMarkdownSection(
      medicalPart,
      "The Fallen Medics' Legacy: Rare Graveyard Cultivars",
    );
  }

  // D. Analgesics & Deep-Tissue Care + Leviathan Muscle Soak
  // Keep for Medic characters, when HP < Max HP, during Scale-Disparity soreness,
  // or when pain/ache/massage/soak or any of the 4 analgesics are mentioned.
  const isAnalgesicNeeded =
    isMedicCharacter ||
    opts.hp < opts.maxHp ||
    /\b(sore|soreness|aftermath|ache|aching|bruise|bruised|strain|strained|crushed|blunt|trauma|pain|numb|numbing|massage|soak|poultice|mud mask|sea grapes|green feather|caulerpa|cactus tree|halimeda|sea whip|pseudopterogorgia|cone snail|conotoxin|muscle soak)\b/i.test(
      combinedContext,
    );

  if (!isAnalgesicNeeded) {
    medicalPart = stripMarkdownSection(
      medicalPart,
      "Analgesics & Deep-Tissue Care (Flora & Fauna)",
    );
  }

  // E. Advanced Apothecary Preparation Methods & Deep-Trench Poultice Recipe
  // Keep for Medic characters, active injuries/stings/infections, or medicine crafting.
  // Keep Apothecary Prep Methods when injured, approaching starvation fatigue (Stamina <= 4),
  // or actively treating wounds/stings.
  const isApothecaryPrepNeeded =
    isMedicCharacter ||
    opts.hp < opts.maxHp ||
    opts.stamina <= 4 ||
    /\b(injury|injured|wound|wounded|bleed|bleeding|laceration|sting|stung|venom|infection|infected|burn|gill|heal|healing|medicinal|medicine|poultice|salve|bandage|cast|apothecary|remedy|cure|treat|steep|macerat|starving|exhausted|fatigue)\b/i.test(
      combinedContext,
    );

  if (!isApothecaryPrepNeeded) {
    medicalPart = stripMarkdownSection(
      medicalPart,
      "Advanced Marine Apothecary Preparation Methods",
    );
  }

  // F. Base 5-Plant Table (Kelp, Irish Moss, Spirulina, Coralline, Sea Lettuce)
  // Keep if ANY medical/analgesic/cultivar section above is active, OR if foraging,
  // eating/meals, Apex provisioning, or low Stamina is active.
  const isBaseAlgaeTableNeeded =
    isMedicCharacter ||
    isApothecaryPrepNeeded ||
    isAnalgesicNeeded ||
    isGraveyardCultivarNeeded ||
    opts.stamina <= 6 ||
    /\b(forage|foraging|eat|eating|meal|food|hungry|starving|provision|catch|kelp|algae|irish moss|spirulina|coralline|sea lettuce|flora|herb|harvest)\b/i.test(
      combinedContext,
    );

  if (!isBaseAlgaeTableNeeded) {
    // If no medical, foraging, or food triggers are active, keep ONLY the Deep-Ocean Anomalies
    // (if unlocked) from the top half and hide the base algae table.
    const anomaliesMatch = medicalPart.match(
      /###\s+💎\s*Deep-Ocean Anomalies[\s\S]*$/i,
    );
    medicalPart = anomaliesMatch ? anomaliesMatch[0] : "";
  }

  // --------------------------------------------------------------------------
  // PART 2: PRUNE THE ENVIRONMENTAL FLAVOR EXPANSION (Bottom Half)
  // --------------------------------------------------------------------------
  if (envFlavorPart) {
    // 1. In "## 8. OPTIONAL SEASONAL CONDITION FLAVOR NAMES", keep ONLY the table rows
    // that match the current Season (e.g., only "| Spring ..." rows during Spring)
    // so the AI never gets out-of-season weather flavor bleed!
    const otherSeasons = ["Spring", "Summer", "Fall", "Winter"].filter(
      (s) => s.toLowerCase() !== opts.season,
    );
    for (const otherSeason of otherSeasons) {
      const rowRegex = new RegExp(`\\n\\|\\s*${otherSeason}\\s+[^\\n]+`, "gi");
      envFlavorPart = envFlavorPart.replace(rowRegex, "");
    }

    // 2. In "## 10. OPTIONAL LUNAR TEXTURE", only include during Evening/Night
    // or if moon/tide/spawn is mentioned in the radar.
    const isLunarNeeded =
      opts.isEveningOrNight ||
      /\b(moon|lunar|king tide|coral mass spawn|milky)\b/i.test(opts.twoWayRadar);
    if (!isLunarNeeded) {
      envFlavorPart = stripMarkdownSection(
        envFlavorPart,
        "10. OPTIONAL LUNAR TEXTURE",
      );
    }
  }

  return `${medicalPart}\n\n${envFlavorPart}`.replace(/\n{3,}/g, "\n\n").trim();
}

// ============================================================================
// GENERAL HELPER FUNCTIONS
// ============================================================================

function stripMarkdownSection(text: string, headingTitleSnippet: string): string {
  const escapedTitle = headingTitleSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingMatch = text.match(
    new RegExp(`^(#{1,4})\\s+[^\\n]*${escapedTitle}[^\\n]*`, "im"),
  );
  if (!headingMatch) return text;

  const hashCount = headingMatch[1].length;
  const jsSafeSectionRegex = new RegExp(
    `(?:^|\\n)#{${hashCount}}\\s+[^\\n]*${escapedTitle}[^\\n]*[\\s\\S]*?(?=\\n#{1,${hashCount}}\\s+|$)`,
    "i",
  );

  return text.replace(jsSafeSectionRegex, "\n");
}

function stripBulletBlock(text: string, bracketSnippet: string): string {
  const escaped = bracketSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `\\n?[ \\t]*-[ \\t]*\\**${escaped}[\\s\\S]*?(?=\\n[ \\t]*-[ \\t]*(?:\\[LATE-GAME|\\*\\*\\[)|\\n#{1,4}\\s+|$)`,
    "i",
  );
  return text.replace(regex, "\n");
}

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

function scrubInactiveApexNames(text: string, activeApexTarget: string): string {
  const target = activeApexTarget.toLowerCase();
  const apexNames = ["Kial", "Malibu", "Ricsa", "Severin", "Ezra", "Idris", "Pilan", "Antuk", "Van"];

  let result = text;
  for (const name of apexNames) {
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

function detectIfOutsideGrotto(
  saveLog: string,
  recentAiTurns: string,
  cleanPlayerInput: string,
): boolean {
  const locMatch =
    recentAiTurns.match(/\*\*Current Location:\*\*\s*([^\n]+)/i) ??
    saveLog.match(/\*\*Current Location:\*\*\s*([^\n]+)/i);

  if (locMatch && locMatch[1]) {
    const loc = locMatch[1].toLowerCase();
    if (loc.includes("outer zone") || !loc.includes("grotto")) {
      return true;
    }
  }

  return /\b(leave the grotto|swim out|head out|outer zone|open blue|open water)\b/i.test(
    cleanPlayerInput,
  );
}

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