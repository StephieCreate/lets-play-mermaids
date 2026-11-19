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
  // Group the strict bookkeeping commands together (Save, Summary, Register, Sleep)
  const isBookkeepingCmd =
    isSaveProgressCmd || isSummaryCmd || isUpdateRegisterCmd || isSleepCmd;

  // Detect commands that start or resume active gameplay
  const isProceedCmd = /\b(proceed|load save|load game|resume game)\b/i.test(
    cleanPlayerInput,
  );

  // Detect if the user is running a Dev Audit test (so we NEVER bypass the pruner during testing!)
  const isDevAuditCmd = /\b(dev audit|pruner test)\b/i.test(cleanPlayerInput);

  // "Open Rulebook" check:
  // Unlocks the full rulebook if the game is paused in WAITING COMMAND and the player
  // is asking the GM a question (not clicking Save/Summary/Register/Sleep/Proceed),
  // OR if they explicitly ask a rules question.
  const isGmRulesQuestion =
    !isDevAuditCmd &&
    ((gameMode === "WAITING COMMAND" && !isBookkeepingCmd && !isProceedCmd) ||
      /\b(gm question|rules? question|explain the .* (rule|mechanic))\b/i.test(
        cleanPlayerInput,
      ));

  // Only hide the algae/flavor guide during strict bookkeeping commands
  const isMaintenanceMode = isBookkeepingCmd;

  // ==========================================================================
  // STEP 2: ROUTE TO THE MATCHING DOCUMENT PRUNER
  // ==========================================================================
// If the player is asking the GM a rules question during the paused Maintenance Window,
  // return the full unpruned rule text so the GM can answer accurately!
  if (isGmRulesQuestion) {
    return ruleText;
  }
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
    let pluginText = ruleText;

    // Run the active-scene NPC pruner on any Apex Plugin ("apex-severin", "apex-kial", "apex-ezra", etc.)
    if (ruleSlug.startsWith("apex-")) {
      pluginText = pruneOffscreenSecondaryNpcsInApexPlugin(pluginText, {
        apexTarget: ctx.apexTarget ?? "",
        bondLevel,
        rawPlayerInput,
        twoWayRadar,
        saveLog,
        wishlist,
      });
    }

    // Run the dynamic tag scanner on the plugin as well
    return processHtmlCommentGates(pluginText, {
      bondLevel,
      globalLevel,
      season,
      hasOffspring: hasOffspringOrPregnancy,
      twoWayRadar,
      saveLog,
    });
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

  // 10. Process optional HTML comment gates & dynamic [SOMETIMES]/[GATE] tags
  pruned = processHtmlCommentGates(pruned, {
    bondLevel,
    globalLevel,
    season,
    hasOffspring: hasOffspringOrPregnancy,
    twoWayRadar,
    saveLog,
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
  state: {
    bondLevel: number;
    globalLevel: number;
    season: string;
    hasOffspring: boolean;
    twoWayRadar?: string;
    saveLog?: string;
  },
): string {
  const radarAndSave = `${state.twoWayRadar ?? ""}\n${state.saveLog ?? ""}`.toLowerCase();

  // Layer 1: Process <!-- [GATE: ...] --> HTML comment blocks
  const gateRegex = /<!--\s*\[GATE:\s*([^\]]+)\]\s*-->([\s\S]*?)<!--\s*\[\/GATE\]\s*-->/gi;
  let result = text.replace(
    gateRegex,
    (_fullMatch, conditionRaw: string, innerContent: string) => {
      if (!evaluateDynamicGateCondition(conditionRaw, state, radarAndSave)) {
        return "";
      }
      return innerContent;
    },
  );

  // Layer 2: Scan Markdown Headings (# to ####) for [ALWAYS], [SOMETIMES], [GATE: ...],
  // or plain-English "- **The Trigger:** Bond Level X+" rules
  const headingSectionRegex = /(?:^|\n)(#{1,4}\s+[^\n]+)([\s\S]*?)(?=\n#{1,4}\s+|$)/g;

  result = result.replace(
    headingSectionRegex,
    (fullSection, headingLine: string, bodyText: string) => {
      if (/\[\s*ALWAYS\s*\]/i.test(headingLine)) {
        const cleanHeading = headingLine.replace(/\s*\[\s*ALWAYS\s*\]/gi, "");
        return `\n${cleanHeading}${bodyText}`;
      }

      const headingGateMatch = headingLine.match(/\[\s*GATE:\s*([^\]]+)\]/i);
      if (headingGateMatch) {
        if (!evaluateDynamicGateCondition(headingGateMatch[1], state, radarAndSave)) {
          return "\n";
        }
        const cleanHeading = headingLine.replace(/\s*\[\s*GATE:\s*[^\]]+\]/gi, "");
        return `\n${cleanHeading}${bodyText}`;
      }

      const sometimesMatch = headingLine.match(/\[\s*SOMETIMES(?::\s*([^\]]+))?\s*\]/i);
      if (sometimesMatch) {
        const rawKeywords = sometimesMatch[1];
        const cleanHeading = headingLine.replace(/\s*\[\s*SOMETIMES(?::\s*[^\]]+)?\s*\]/gi, "");
        const keywords = rawKeywords
          ? rawKeywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean)
          : extractKeywordsFromHeading(cleanHeading);

        if (!keywords.some((kw) => radarAndSave.includes(kw))) {
          return "\n";
        }
        return `\n${cleanHeading}${bodyText}`;
      }

      const triggerLineMatch = bodyText.match(
        /-\s*\*\*(?:The\s+)?Trigger[^*]*\*\*([^\n]+)/i,
      );
      if (triggerLineMatch) {
        const triggerLine = triggerLineMatch[1];
        const bondReqMatch = triggerLine.match(
          /\bBond(?:\s+is|\s+reaches)?\s+Level\s+(\d+)\s*(?:\+|or\s+higher)/i,
        );
        if (bondReqMatch && state.bondLevel < parseInt(bondReqMatch[1], 10)) {
          return "\n";
        }
        const levelReqMatch = triggerLine.match(
          /\bGlobal\s+Level\s+(\d+)\s*(?:\+|or\s+higher)/i,
        );
        if (levelReqMatch && state.globalLevel < parseInt(levelReqMatch[1], 10)) {
          return "\n";
        }
      }

      return fullSection;
    },
  );

  return result;
}

function evaluateDynamicGateCondition(
  conditionRaw: string,
  state: { bondLevel: number; globalLevel: number; season: string; hasOffspring: boolean },
  radarAndSave: string,
): boolean {
  const cond = conditionRaw.trim().toUpperCase();
  const bondMatch = cond.match(/^BOND\s*>=\s*(\d+)$/);
  if (bondMatch) return state.bondLevel >= parseInt(bondMatch[1], 10);

  const levelMatch = cond.match(/^LEVEL\s*>=\s*(\d+)$/);
  if (levelMatch) return state.globalLevel >= parseInt(levelMatch[1], 10);

  if (["SPRING", "SUMMER", "FALL", "WINTER"].includes(cond)) {
    return state.season.toUpperCase() === cond;
  }

  if (cond === "OFFSPRING") return state.hasOffspring;
  return radarAndSave.includes(cond.toLowerCase());
}

function extractKeywordsFromHeading(headingLine: string): string[] {
  const stopWords = new Set([
    "system", "mechanic", "module", "override", "rule", "lore", "directive",
    "protocol", "table", "event", "section", "with", "from", "that", "this",
  ]);
  return headingLine
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word));
}

/**
 * ============================================================================
 * UNIVERSAL HELPER: pruneOffscreenSecondaryNpcsInApexPlugin
 * Works automatically on EVERY Apex Plugin (Kial, Severin, Ezra's 3 NPCs,
 * Malibu, Ricsa, and future plugins) using a strict "Active Scene" rule:
 *
 *   - Primary Apex (auto-detected from "# [APEX PLUGIN: NAME]") -> ALWAYS KEPT.
 *   - Any other [NPC PROFILE] or [SYSTEM_MODULE: X'S VOICE DIRECTIVE]:
 *       -> KEPT 100% if they are in the active scene (Ezra's constant crew stay
 *          loaded every single turn they are present!).
 *       -> PRUNED TO 0 WORDS if they are NOT in the active scene (zero visual
 *          adjectives or scars left behind to bleed onto the Primary Apex).
 * ============================================================================
 */
function pruneOffscreenSecondaryNpcsInApexPlugin(
  text: string,
  opts: {
    apexTarget: string;
    bondLevel: number;
    rawPlayerInput: string;
    twoWayRadar: string;
    saveLog: string;
    wishlist: string;
  },
): string {
  // 1. Auto-detect the active Primary Apex's name from "# [APEX PLUGIN: NAME (...)]"
  //    Falls back to ctx.apexTarget if the header format ever differs.
  const headerApexMatch = text.match(/\[APEX PLUGIN:\s*([A-Za-z]+)/i);
  const primaryApexName = (
    headerApexMatch?.[1] ||
    opts.apexTarget.replace(/^apex-/i, "").split(/[\s_-]+/)[0] ||
    ""
  ).toLowerCase();

  // 2. Build the strict "ACTIVE SCENE" text pool:
  //    - opts.twoWayRadar = Player's current input + AI's last 2 responses + currentScene
  //    - activeSaveLines  = ONLY the live NPC location/presence lines from the Save Log
  //      (ignores old Interaction History so an absent rival from yesterday stays pruned!)
  //    - opts.wishlist    = Queued Plot Wishlist items (so requested cameos can arrive)
  const activeSaveLines = extractActiveNpcStateLines(opts.saveLog);
  const activeScenePool =
    `${opts.twoWayRadar}\n${activeSaveLines}\n${opts.wishlist}`.toLowerCase();

  // Detect if a 20 was just rolled (lets Rivalry / Shiver arrivals load BEFORE the AI narrates them)
  const justRolled20 =
    /\(\(d20\s*=\s*20\)\)/i.test(opts.rawPlayerInput) ||
    /APP_ROLL:Daily Encounter[^\n]*\b20\b/i.test(opts.rawPlayerInput) ||
    /\brolled a (?:modified )?20\b/i.test(opts.rawPlayerInput);

  // Detect if rival/intrusion triggers are firing right now
  const isGenericRivalActive =
    (justRolled20 && opts.bondLevel >= 10) ||
    /\b(rival|rivalry|intruder|usurper|territory threat|sparring match|other apex|another apex|challenger|phantom's counsel)\b/i.test(
      activeScenePool,
    );

  // 3. SAFE BLOCK SPLITTER:
  //    Splits before any major [BRACKETED] header or "THE 20 BOND LEVELS" regardless
  //    of how many "#" symbols it has, so sub-headings stay glued to their parent NPC
  //    and Bond Leveling / Heart Events are NEVER accidentally cut.
  const blockSplitRegex =
    /(?=(?:^|\n)#{0,4}[ \t]*(?:\[(?:APEX PLUGIN|NPC PROFILE|SYSTEM_OVERRIDES?|SYSTEM_MODULE|SYSTEM_MECHANIC|SYSTEM_TABLE|SYSTEM_LORE|SYSTEM_EVENT|BEHAVIORAL_CONSTRAINT)|THE 20 BOND LEVELS))/i;

  const blocks = text.split(blockSplitRegex);

  // Track hidden NPC names so we can also remove their bullets from the Vocabulary Bank
  const hiddenNpcNames = new Set<string>();

  // Helper: returns TRUE only if this secondary NPC is in the active scene (or arriving now)
  const isSecondaryNpcInActiveScene = (
    npcName: string,
    subtitle: string,
    isRivalBlock: boolean,
  ): boolean => {
    const cleanName = npcName.trim().toLowerCase();

    // Check 1: Their name appears in the active scene (Player input, AI's last 2 turns,
    // Save Log's live NPC location lines, or queued Wishlist).
    if (cleanName && new RegExp(`\\b${escapeRegex(cleanName)}\\b`, "i").test(activeScenePool)) {
      return true;
    }

    // Check 2: Group & Pair Synergy (keeps Kial's Shiver pair rule intact when they visit)
    if (["brea", "thane", "zrill"].includes(cleanName) && (/\bshiver\b/i.test(activeScenePool) || justRolled20)) {
      return true;
    }
    if (cleanName === "brea" && /\bthane\b/i.test(activeScenePool)) return true;
    if (cleanName === "thane" && /\bbrea\b/i.test(activeScenePool)) return true;

    // Check 3: Their species/role subtitle appears in the active scene
    // (e.g., "(THE REMORA)" -> "remora", "(THE BULL SHARK RIVAL)" -> "bull shark")
    if (subtitle) {
      const cleanedSubtitle = subtitle
        .toLowerCase()
        .replace(/\b(the|a|an|rival|rare|encounter|campaign|condensed|npc|pod|mate)\b/g, " ")
        .replace(/[^a-z\s-]/g, " ")
        .trim();

      if (
        cleanedSubtitle.length >= 4 &&
        new RegExp(`\\b${escapeRegex(cleanedSubtitle)}\\b`, "i").test(activeScenePool)
      ) {
        return true;
      }
    }

    // Check 4: Rival arrival events (20 roll at Bond 10+, rival keywords, or Level 19 Heart Event)
    if (isRivalBlock && (isGenericRivalActive || opts.bondLevel === 19)) {
      return true;
    }

    return false;
  };

  // 4. PASS 1: Prune any off-screen [NPC PROFILE] and [VOICE DIRECTIVE] blocks to 0 words
  const processedBlocks = blocks.map((block) => {
    const firstLine = block.trimStart().split("\n")[0] ?? "";

    // CHECK A: Is this an "[NPC PROFILE: ...]" block?
    // Matches "[NPC PROFILE: KIAL]", "[NPC PROFILE: BRASS (THE REMORA)]", or "[NPC PROFILE: PILAN - SCOUT]"
    const npcProfileMatch = firstLine.match(
      /\[NPC PROFILE:\s*([^\](:\-]+?)(?:\s*(?:\(([^)]+)\)|[-–—:]\s*([^\]]+)))?\s*\]/i,
    );

    if (npcProfileMatch) {
      const npcName = npcProfileMatch[1].trim().toLowerCase();
      const subtitle = (npcProfileMatch[2] ?? npcProfileMatch[3] ?? "").trim();

      // SAFETY LOCK 1: Never touch the Primary Apex's own profile!
      if (primaryApexName && npcName === primaryApexName) {
        return block;
      }

      // SAFETY LOCK 2: Keep tiny group-trigger headers (like "[NPC PROFILE: THE SHIVER (RARE ENCOUNTER)]")
      // that contain no physical descriptions and only explain when the group visits.
      if (block.trim().length < 250 && !/visual|appearance|scar|hair|tail/i.test(block)) {
        return block;
      }

      const isRivalBlock =
        /\brival\b/i.test(subtitle) || /\bthe rival\b/i.test(block.slice(0, 300));

      // Keep 100% if in the active scene; otherwise prune completely (0 words)!
      if (isSecondaryNpcInActiveScene(npcName, subtitle, isRivalBlock)) {
        return block;
      }

      hiddenNpcNames.add(npcName);
      return "";
    }

    // CHECK B: Is this a "[SYSTEM_MODULE: <NAME>'S (CONDENSED) VOICE DIRECTIVE ...]" block?
    const voiceMatch = firstLine.match(
      /\[SYSTEM_MODULE:\s*([A-Za-z]+)(?:['’]s)?\s+(?:CONDENSED\s+)?VOICE DIRECTIVE/i,
    );

    if (voiceMatch) {
      const npcName = voiceMatch[1].trim().toLowerCase();

      // SAFETY LOCK: Never touch the Primary Apex's own Voice Directive!
      if (primaryApexName && npcName === primaryApexName) {
        return block;
      }

      const isRivalVoice =
        /\bcondensed\b|\bcampaign\b|\brival\b/i.test(firstLine) ||
        /\bthe rival\b/i.test(block.slice(0, 350));

      if (isSecondaryNpcInActiveScene(npcName, "", isRivalVoice)) {
        return block;
      }

      hiddenNpcNames.add(npcName);
      return "";
    }

    // Everything else (Primary Apex overrides, Lore Vaults, Bond Leveling, Provisioning,
    // 20 Heart Events, Behavioral Constraints, Silencing Kiss) stays 100% untouched!
    return block;
  });

  // 5. PASS 2: Remove off-screen NPC bullets from "NPC VOCABULARY & SENSORY BANK"
  const finalBlocks = processedBlocks.map((block) => {
    if (!/\[SYSTEM_MODULE:\s*NPC VOCABULARY/i.test(block) || hiddenNpcNames.size === 0) {
      return block;
    }

    let cleanedVocab = block;
    for (const hiddenName of hiddenNpcNames) {
      const vocabBulletRegex = new RegExp(
        `\\n?-[ \\t]+\\*\\*${escapeRegex(hiddenName)}\\b[^\\n]*(?:\\n[ \\t]+-[^\\n]*)*`,
        "gi",
      );
      cleanedVocab = cleanedVocab.replace(vocabBulletRegex, "");
    }
    return cleanedVocab;
  });

  return finalBlocks.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * HELPER: extractActiveNpcStateLines
 * Pulls ONLY the live location/presence lines from the Daily Save Log so we know
 * who is physically with the player on Turn 1 of a loaded save (like Ezra's crew),
 * without accidentally unlocking absent rivals mentioned in old Interaction History.
 */
function extractActiveNpcStateLines(saveLog: string): string {
  if (!saveLog) return "";
  const lines = saveLog.split("\n");
  const activeLines: string[] = [];

  for (const line of lines) {
    if (
      /\*\*(?:Current Location|Current NPC Location|Secondary NPCs|Active Quests|Shiver Status|Triad Surrogate)[^*]*\*\*/i.test(
        line,
      )
    ) {
      // Skip lines that explicitly say the NPC/group is not present or none
      if (!/:\s*(?:not present|absent|none|n\/a)\b/i.test(line)) {
        activeLines.push(line);
      }
    }
  }

  return activeLines.join("\n");
}

/**
 * Tiny helper that safely escapes punctuation before putting a string into a RegExp.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}