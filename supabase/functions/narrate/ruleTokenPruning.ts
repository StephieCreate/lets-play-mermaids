/**
 * ============================================================================
 * FILE: supabase/functions/narrate/ruleTokenPruning.ts
 * PURPOSE: DeepSeek-Cache-Safe "Two-Zone" Rule Pruner.
 *
 *   ZONE 1 — pruneRulesByPlayerState()  [Goes in the SYSTEM prompt]
 *     Uses ONLY day-stable Save Log / DB state (Season, Bond Level, Global Level,
 *     Offspring, Starter Pod, Active Apex). NEVER reads playerInput, AI history,
 *     HP, or Stamina. This keeps your System Prompt 100% byte-identical across
 *     turns so DeepSeek Context Caching hits at ~90% discount!
 *
 *   ZONE 2 — getDynamicTurnRules()      [Appended to the CURRENT USER message]
 *     Uses the "Two-Way Radar" (Player Input + Last 2 AI Turns + Wishlist + 20 Rolls)
 *     to inject rare on-demand rules (Save/Summary/Register templates, off-screen
 *     rivals arriving, Graveyard Cultivars, [SOMETIMES] tags, or GM Q&A) at the
 *     very bottom of the request—so it NEVER breaks the cached prefix above it!
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
  storyState?: Record<string, unknown>;       // Database numbers (Level, Bond, Season, etc.)
  apexTarget?: string;                        // Which Apex is active (e.g., "kial", "severin")
  triadActive?: boolean;                      // Optional flag if Triad mode is enabled
}

// Internal snapshot of DAY-FROZEN state (used by Zone 1 so the prefix never shifts mid-day)
interface DayFrozenState {
  saveLog: string;
  registry: string;
  globalLevel: number;
  bondLevel: number;
  legacyMarks: number;
  season: "spring" | "summer" | "fall" | "winter";
  dayNumber: number;
  yearNumber: number;
  hasStartedGame: boolean;
  hasOffspringInSave: boolean;
  hasStarterPod: boolean;
  isTriadActive: boolean;
  isMedicCharacter: boolean;
  apexTarget: string;
}

/**
 * Helper that reads ONLY day-frozen state from the Save Log, Grotto Registry,
 * and coarse DB fields (Season, Bond Level, Global Level).
 * Notice: NEVER reads playerInput, conversationHistory, HP, or Stamina!
 */
function buildDayFrozenState(ctx: PruningContext): DayFrozenState {
  const saveLog = ctx.dailySaveLog ?? "";
  const registry = ctx.grottoRegistry ?? "";
  const state = ctx.storyState ?? {};

  const globalLevel = getNumberStat(state["level"], saveLog, /\*\*Global Level:\*\*\s*(\d+)/i, 1);
  const bondLevel = getNumberStat(state["bond_level"], saveLog, /\*\*Bond Level:\*\*\s*(\d+)/i, 0);
  const legacyMarks = getNumberStat(undefined, saveLog, /\*\*Legacy Marks:\*\*[^|\n]*\|\s*(\d+)\s*Marks/i, 0);

  const season = detectSeason(state["current_season"] as string, saveLog);
  const dayNumber = getNumberStat(undefined, saveLog, /\bDay\s+(\d+)/i, 1);
  const yearNumber = getNumberStat(state["current_year"], saveLog, /\bYear\s+(\d+)/i, 1);

  const hasStartedGame =
    saveLog.trim().length > 0 ||
    registry.trim().length > 0 ||
    state["files_initialized"] === true;

  const offspringFieldMatch = saveLog.match(/\*\*Offspring Fed:\*\*\s*([^\n|]+)/i);
  const offspringFieldText = offspringFieldMatch ? offspringFieldMatch[1].trim() : "N/A";
  const hasOffspringInSave =
    !/^(n\/a|none|no|0)$/i.test(offspringFieldText) ||
    /\b(gestation|pregnant|pregnancy|infant phase|juvenile phase|rescue phase)\b/i.test(saveLog);

  const hasStarterPod =
    /\b(starter pod|pod member|pod synergy)\b/i.test(`${saveLog}\n${registry}`) ||
    (!/shiver status:\s*(not present|none|n\/a)/i.test(saveLog) && /shiver status:/i.test(saveLog));

  const isTriadActive =
    Boolean(ctx.triadActive) ||
    /\btriad surrogate\b/i.test(saveLog);

  const isMedicCharacter = /\b(medic|healer|herbalist|apothecary|doctor)\b/i.test(
    `${registry}\n${saveLog}`,
  );

  return {
    saveLog,
    registry,
    globalLevel,
    bondLevel,
    legacyMarks,
    season,
    dayNumber,
    yearNumber,
    hasStartedGame,
    hasOffspringInSave,
    hasStarterPod,
    isTriadActive,
    isMedicCharacter,
    apexTarget: ctx.apexTarget ?? "",
  };
}

// ============================================================================
// ZONE 1: DAY-FROZEN PREFIX PRUNER (Goes inside the SYSTEM Prompt)
// ============================================================================

/**
 * MAIN ZONE 1 FUNCTION: pruneRulesByPlayerState
 * Called inside index.ts for each rule document right before buildSystemPrompt().
 * Produces a 100% cache-stable prefix that stays byte-identical turn after turn!
 */
export function pruneRulesByPlayerState(
  ruleSlug: string,
  ruleText: string,
  ctx: PruningContext,
): string {
  if (!ruleText || !ruleText.trim()) return ruleText;

  // Use ONLY day-frozen state so DeepSeek caches the entire system prompt + chat history
  const frozen = buildDayFrozenState(ctx);

  // --------------------------------------------------------------------------
  // DOCUMENT A: "universal-game-templates" (Zone 1)
  // On active saves, keep ONLY the tiny static Skill-to-Modifier math table in
  // the cached prefix. Full Save/Summary/Register templates inject via Zone 2!
  // --------------------------------------------------------------------------
  if (ruleSlug === "universal-game-templates") {
    return pruneGameTemplatesZone1(ruleText, frozen);
  }

  // --------------------------------------------------------------------------
  // DOCUMENT B: "medicinal-algae-quick-reference" (Zone 1)
  // Keeps Base Algae, Apothecary Prep, Analgesics, Anomalies, & Season-filtered
  // Environmental Flavor frozen in the cache. Hard-prunes Endocrine (Mating Heat)
  // and non-medic Graveyard Cultivars (Zone 2 injects them on demand if needed).
  // --------------------------------------------------------------------------
  if (ruleSlug === "medicinal-algae-quick-reference") {
    return pruneMedicinalAlgaeZone1(ruleText, frozen);
  }

  // --------------------------------------------------------------------------
  // DOCUMENT C: Apex Plugins & Any Other Custom Rule Files (Zone 1)
  // Keeps 100% of the Primary Apex + any constant crew listed in the Save Log's
  // live location lines (like Ezra's crew). Strips off-screen rivals/visitors so
  // they can NEVER bleed onto the Primary Apex (Zone 2 injects them on arrival!).
  // --------------------------------------------------------------------------
  if (ruleSlug !== "universal-core-engine") {
    let pluginText = ruleText;

    if (ruleSlug.startsWith("apex-") || /\[APEX PLUGIN:/i.test(ruleText)) {
      pluginText = pruneApexPluginZone1(pluginText, frozen);
    }

    return processStaticGatesZone1(pluginText, frozen);
  }

  // --------------------------------------------------------------------------
  // DOCUMENT D: "universal-core-engine" (Zone 1)
  // Hard-prunes ONLY out-of-stage / out-of-season / anti-bleed bloat.
  // Everyday gameplay rules (Travel, Traps, Pets, Waystations, Quests, Injury,
  // Game Over, Pressure Gauge, Wishlist) stay FROZEN in the cache at ~10% cost!
  // --------------------------------------------------------------------------
  let pruned = ruleText;

  // 1. Character Creation (# [SECTION 4: GAME INITIATION SEQUENCE])
  if (frozen.hasStartedGame) {
    pruned = stripMarkdownSection(pruned, "[SECTION 4: GAME INITIATION SEQUENCE]");
  }

  // 2. Reproduction & Raising Children (strictly gated by Bond >= 18 or Save Log)
  if (frozen.bondLevel < 18 && !frozen.hasOffspringInSave) {
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
  } else if (frozen.hasOffspringInSave) {
    const isInGestation = /\bgestation\b|\bpregnant\b/i.test(frozen.saveLog);
    const isInInfantPhase = /\binfant\b|\brescue phase\b/i.test(frozen.saveLog);
    const isInJuvenilePhase = /\bjuvenile\b/i.test(frozen.saveLog);
    const hasTwins = /\btwin\b/i.test(frozen.saveLog);

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

  // 3. The 3-Day Mating Season Heat (gated until Bond >= 15 or active pregnancy)
  if (frozen.bondLevel < 15 && !frozen.hasOffspringInSave) {
    pruned = stripMarkdownSection(pruned, 'THE "SEASON" (Mating Biology)');
  }

  // 4. Starter Pod Rules (strip once started if player has no Starter Pod)
  if (frozen.hasStartedGame && !frozen.hasStarterPod) {
    pruned = stripMarkdownSection(pruned, "[SYSTEM_OVERRIDE: THE NOMADIC POD START");
    pruned = stripMarkdownSection(pruned, "[SYSTEM_LORE: THE SUPPRESSED SEASON");
  }

  // 5. Late-Game Level 10+ & Seasonal Quest Blocks
  if (frozen.globalLevel < 10 || (frozen.season !== "fall" && frozen.season !== "winter")) {
    pruned = stripBulletBlock(pruned, "[LATE-GAME ROLE REVERSAL");
    pruned = stripBulletBlock(pruned, "[LATE-GAME CONFLICT");
  }
  if (frozen.globalLevel < 10 || frozen.season !== "winter") {
    pruned = stripBulletBlock(pruned, "[LATE-GAME MIGRATION");
    pruned = stripBulletBlock(pruned, "[LATE-GAME HAZARD");
  }
  if (frozen.globalLevel < 10) {
    pruned = stripBulletBlock(pruned, "[LATE-GAME EXPLORATION");
  }
  if (frozen.bondLevel < 13 || (frozen.season !== "winter" && frozen.season !== "summer")) {
    pruned = stripBulletBlock(pruned, "[LATE-GAME BIOLOGY");
  }
  if (frozen.season !== "fall" && frozen.season !== "winter") {
    pruned = stripBulletBlock(pruned, "[FALL & WINTER STAGNATION OVERRIDE]");
  }
  if (frozen.season !== "winter" || frozen.bondLevel < 13) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_OVERRIDE: THE LATE-WINTER PROVISIONING DRIVE",
    );
  }
  if (frozen.bondLevel < 15) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_OVERRIDE: THE WANDERING FAMILY",
    );
  }

  // 6. Bond-Stage Gating (Day-frozen only — no location/turn toggles!)
  if (frozen.bondLevel >= 11) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_RULE]: EARLY-GAME INDIFFERENCE (The Nightclub Protocol)",
    );
  }
  if (frozen.bondLevel >= 1 && frozen.dayNumber >= 7) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_RULE]: THE SOLO SURVIVAL WEEK (The Organic Arrival)",
    );
  }
  if (frozen.bondLevel === 0 && frozen.dayNumber < 7 && frozen.hasStartedGame) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_RULE]: THE APEX-PRESENT PROTECTION",
    );
    pruned = stripMarkdownSection(
      pruned,
      "[DIRECTIVE_MODULE]: 17. THE BOUNDED EPIC",
    );
  }
  if (frozen.bondLevel < 6) {
    pruned = stripMarkdownSection(
      pruned,
      "[SYSTEM_MODULE: THE HEARTH FRICTION (The Domestic Prompt Bank)]",
    );
  }

  // 7. Out-of-Season Weather Pruning (only shifts once every 28 in-game days!)
  pruned = pruneOutOfSeasonWeather(pruned, frozen.season);

  // 8. Legacy Loop (only needed at Level 19+ or if player already holds Legacy Marks)
  if (frozen.globalLevel < 19 && frozen.legacyMarks === 0) {
    pruned = pruned.replace(
      /-\s*\*\*The Legacy Loop:\*\*[\s\S]*?(?=\n#|\n####|$)/i,
      "",
    );
  }

  // 9. Scrub non-active Apex names from core engine examples
  pruned = scrubInactiveApexNames(pruned, frozen.apexTarget);

  // 10. Process Day-Frozen [GATE: ...] / [ALWAYS] tags (hides [SOMETIMES] tags for Zone 2)
  pruned = processStaticGatesZone1(pruned, frozen);

  return pruned.replace(/\n{3,}/g, "\n\n").trim();
}

// ============================================================================
// ZONE 2: DYNAMIC TURN TAIL (Appended ONLY to the Current User Message)
// ============================================================================

/**
 * MAIN ZONE 2 FUNCTION: getDynamicTurnRules
 * Called ONCE per turn in index.ts using the RAW (unpruned) ruleContents map.
 * Returns ONLY the on-demand blocks needed for THIS specific turn (empty "" on
 * most normal turns). Attach the returned text to the CURRENT user message
 * (never the system prompt, and never saved into chat history) so DeepSeek's
 * prefix cache stays 100% intact!
 */
export function getDynamicTurnRules(
  rawRulesBySlug: Record<string, string>,
  ctx: PruningContext,
): string {
  const frozen = buildDayFrozenState(ctx);
  const state = ctx.storyState ?? {};
  const wishlist = ctx.plotWishlistQueued ?? "";

  // Clean the player's current message
  const rawPlayerInput = ctx.playerInput ?? "";
  const cleanPlayerInput = rawPlayerInput
    .split("\n\n[MANDATORY SYSTEM DIRECTIVE")[0]
    .split("\n\n((APP_ROLL")[0]
    .toLowerCase();

  // Grab the AI's last 2 responses for the Two-Way Radar
  const recentAiTurns = (ctx.conversationHistory ?? [])
    .filter((turn) => turn.role === "narrator")
    .slice(-2)
    .map((turn) => turn.content)
    .join("\n")
    .toLowerCase();

  const twoWayRadar = `${cleanPlayerInput}\n${recentAiTurns}\n${(ctx.currentScene ?? "").toLowerCase()}`;

  // Detect modular bookkeeping & GM Q&A commands
  const isSaveProgressCmd = /\b(save progress|save my progress|generate save|daily save log)\b/i.test(cleanPlayerInput);
  const isSummaryCmd = /\b(give me a summary|generate a summary|narrative summary|summary of today)\b/i.test(cleanPlayerInput);
  const isUpdateRegisterCmd = /\b(update register|grotto register|update my register)\b/i.test(cleanPlayerInput);
  const isSleepCmd = /\b(i go to sleep|go to sleep|i am ending the day|i fall asleep|sleep for the night|retire for the night|bed down)\b/i.test(cleanPlayerInput);
  const isBookkeepingCmd = isSaveProgressCmd || isSummaryCmd || isUpdateRegisterCmd || isSleepCmd;

  const isProceedCmd = /\b(proceed|load save|load game|resume game)\b/i.test(cleanPlayerInput);
  const isDevAuditCmd = /\b(dev audit|pruner test)\b/i.test(cleanPlayerInput);
  const gameMode = (state["game_mode"] as string) ?? "ACTIVE";

  // "Open Rulebook" check during WAITING COMMAND (keeps Zone 1 cached while handing
  // the GM any pruned-out reference sections to answer player rules questions!)
  const isGmRulesQuestion =
    !isDevAuditCmd &&
    ((gameMode === "WAITING COMMAND" && !isBookkeepingCmd && !isProceedCmd) ||
      /\b(gm question|rules? question|explain the .* (rule|mechanic))\b/i.test(
        cleanPlayerInput,
      ));

  const dynamicSnippets: string[] = [];

  // --------------------------------------------------------------------------
  // 1. ON-DEMAND TEMPLATES (Save Progress / Summary / Update Register)
  // --------------------------------------------------------------------------
  const rawTemplates = rawRulesBySlug["universal-game-templates"] ?? "";
  if (rawTemplates && frozen.hasStartedGame && (isSaveProgressCmd || isSummaryCmd || isUpdateRegisterCmd)) {
    const requestedTemplate = extractRequestedTemplateZone2(rawTemplates, frozen, {
      isSaveProgressCmd,
      isSummaryCmd,
      isUpdateRegisterCmd,
    });
    if (requestedTemplate) {
      dynamicSnippets.push(requestedTemplate);
    }
  }

  // --------------------------------------------------------------------------
  // 2. GM OPEN RULEBOOK Q&A (Only when paused & asking the GM a rules question)
  // --------------------------------------------------------------------------
  if (isGmRulesQuestion) {
    const qaBundle = buildGmQaMissingRulesBundle(rawRulesBySlug, frozen);
    if (qaBundle) {
      dynamicSnippets.push(qaBundle);
    }
    return wrapDynamicTurnTail(dynamicSnippets);
  }

  // Skip active-scene pop-ins during strict Save/Summary/Sleep bookkeeping turns
  if (isBookkeepingCmd) {
    return wrapDynamicTurnTail(dynamicSnippets);
  }

  // --------------------------------------------------------------------------
  // 3. OFF-SCREEN APEX RIVALS & VISITING NPCS ARRIVING MID-DAY
  // (e.g., Kial in Severin's save, Brass, or The Shiver on a 20 roll / mention)
  // --------------------------------------------------------------------------
  for (const [slug, rawText] of Object.entries(rawRulesBySlug)) {
    if (!rawText) continue;

    if (slug.startsWith("apex-") || /\[APEX PLUGIN:/i.test(rawText)) {
      const triggeredNpcs = extractTriggeredOffscreenApexNpcsZone2(rawText, frozen, {
        rawPlayerInput,
        twoWayRadar,
        wishlist,
      });
      if (triggeredNpcs) {
        dynamicSnippets.push(triggeredNpcs);
      }
    }

    // Also inject any [SOMETIMES: ...] or keyword [GATE: ...] sections triggered this turn!
    const triggeredSometimes = extractTriggeredSometimesSectionsZone2(rawText, frozen, twoWayRadar);
    if (triggeredSometimes) {
      dynamicSnippets.push(triggeredSometimes);
    }
  }

  // --------------------------------------------------------------------------
  // 4. RARE PRUNED MEDICAL SECTIONS ON DEMAND (Graveyard Cultivars / Endocrine)
  // --------------------------------------------------------------------------
  const rawAlgae = rawRulesBySlug["medicinal-algae-quick-reference"] ?? "";
  if (rawAlgae && frozen.hasStartedGame) {
    // If Graveyard Cultivars were hidden in Zone 1 (non-medic), unlock on severe trauma/gardening
    if (
      !frozen.isMedicCharacter &&
      /\b(moderate injury|severe injury|infection|infected|rot|necrosis|necrotic|gangrene|concussion|head trauma|fracture|broken|puncture|venom|toxin|cultivate|cultivation|transplant|garden|nursery|holdfast|spore|wineglass|acetabularia|dead man's fingers|codium|oarweed|finger kelp|laminaria|bladderwrack|fucus|red feather|false coral|asparagopsis)\b/i.test(
        `${frozen.saveLog}\n${twoWayRadar}`,
      )
    ) {
      const cultivars = extractMarkdownSection(
        rawAlgae,
        "The Fallen Medics' Legacy: Rare Graveyard Cultivars",
      );
      if (cultivars) dynamicSnippets.push(cultivars);
    }

    // If Endocrine & Cognitive Support was hidden in Zone 1 (Bond < 15), unlock if explicitly active
    if (
      frozen.bondLevel < 15 &&
      /\b(frenzy|mating season|three-day|3-day|hormone|pheromone|heat|brain fog|sedative|gorgonian|cave kelp|ecklonia|sargassum|mangrove|sanctuary steep)\b/i.test(
        `${frozen.saveLog}\n${twoWayRadar}`,
      )
    ) {
      const endocrine = extractMarkdownSection(
        rawAlgae,
        "Endocrine & Cognitive Support (Hormonal Regulation)",
      );
      if (endocrine) dynamicSnippets.push(endocrine);
    }
  }

  // --------------------------------------------------------------------------
  // 5. RARE EARLY-UNLOCK CORE RULES (Only if explicitly invoked before Bond threshold)
  // --------------------------------------------------------------------------
  const rawCore = rawRulesBySlug["universal-core-engine"] ?? "";
  if (rawCore) {
    if (
      frozen.bondLevel < 18 &&
      !frozen.hasOffspringInSave &&
      /\b(conceive|conception|adopt a pup|adoption|catalyst quest|pregnant|pregnancy)\b/i.test(
        twoWayRadar,
      )
    ) {
      const repro = extractMarkdownSection(
        rawCore,
        "[SYSTEM_MECHANIC: REPRODUCTION & RAISING CHILDREN]",
      );
      if (repro) dynamicSnippets.push(scrubInactiveApexNames(repro, frozen.apexTarget));
    }

    if (
      frozen.bondLevel < 15 &&
      !frozen.hasOffspringInSave &&
      /\b(mating season|frenzy|three-day cycle)\b/i.test(twoWayRadar)
    ) {
      const matingHeat = extractMarkdownSection(rawCore, 'THE "SEASON" (Mating Biology)');
      if (matingHeat) dynamicSnippets.push(scrubInactiveApexNames(matingHeat, frozen.apexTarget));
    }
  }

  return wrapDynamicTurnTail(dynamicSnippets);
}

/**
 * Wraps Zone 2 on-demand snippets cleanly so the AI recognizes them as active
 * turn rules without ever polluting the cached system prefix.
 */
function wrapDynamicTurnTail(snippets: string[]): string {
  const cleaned = snippets.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";

  return `\n\n<dynamic_turn_rules>\n[SYSTEM NOTE: The following on-demand rules/profiles are unlocked for THIS turn. Follow them with the same authority as your core system prompt.]\n\n${cleaned.join("\n\n---\n\n")}\n</dynamic_turn_rules>`;
}

// ============================================================================
// DOCUMENT-SPECIFIC ZONE 1 & ZONE 2 HELPERS
// ============================================================================

/**
 * ZONE 1 FOR "universal-game-templates":
 * - During active gameplay: keeps ONLY the tiny static Skill-to-Modifier math table.
 * - During Character Creation (before first Save): keeps cleaned Module B & C.
 */
function pruneGameTemplatesZone1(text: string, frozen: DayFrozenState): string {
  let cleaned = cleanTemplateConditionals(text, frozen);

  if (!frozen.hasStartedGame) {
    cleaned = stripMarkdownSection(cleaned, "MODULE A: THE NARRATIVE SUMMARY");
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }

  const skillTableMatch = cleaned.match(
    /###\s+II\.\s+BASE SURVIVAL SKILLS[\s\S]*?(?=\n###\s+III\.|$)/i,
  );
  return skillTableMatch ? skillTableMatch[0].trim() : "";
}

/**
 * ZONE 2 FOR "universal-game-templates":
 * Extracts ONLY the exact template the player asked for (Save, Summary, or Register).
 */
function extractRequestedTemplateZone2(
  text: string,
  frozen: DayFrozenState,
  cmds: {
    isSaveProgressCmd: boolean;
    isSummaryCmd: boolean;
    isUpdateRegisterCmd: boolean;
  },
): string {
  let cleaned = cleanTemplateConditionals(text, frozen);

  if (cmds.isSaveProgressCmd) {
    cleaned = stripMarkdownSection(cleaned, "MODULE A: THE NARRATIVE SUMMARY");
    cleaned = stripMarkdownSection(cleaned, "MODULE C: THE PLAYER GROTTO REGISTER");
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }

  if (cmds.isSummaryCmd) {
    cleaned = stripMarkdownSection(cleaned, "MODULE B: THE DAILY SAVE LOG");
    cleaned = stripMarkdownSection(cleaned, "MODULE C: THE PLAYER GROTTO REGISTER");

    const isFirstDayEver =
      frozen.season === "spring" && frozen.dayNumber <= 1 && frozen.yearNumber <= 1;
    if (!isFirstDayEver) {
      cleaned = cleaned.replace(
        /# \[SYSTEM_HEADER: NARRATIVE_ARCHIVE_ONLY\][\s\S]*?\[System_Instructions:[^\]]*\]\s*---/i,
        "",
      );
    }
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }

  if (cmds.isUpdateRegisterCmd) {
    cleaned = stripMarkdownSection(cleaned, "MODULE A: THE NARRATIVE SUMMARY");
    cleaned = stripMarkdownSection(cleaned, "MODULE B: THE DAILY SAVE LOG");
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }

  return "";
}

/**
 * Removes inactive conditional lines (Offspring, Triad, Starter Pod, Module D)
 * from universal-game-templates so both Zone 1 and Zone 2 stay bleed-free.
 */
function cleanTemplateConditionals(text: string, frozen: DayFrozenState): string {
  let cleaned = scrubInactiveApexNames(text, frozen.apexTarget);

  if (frozen.bondLevel < 18 && !frozen.hasOffspringInSave) {
    cleaned = stripMarkdownSection(cleaned, "IV. OFFSPRING (THE LEGACY)");
    cleaned = cleaned.replace(/\n-\s*\*\*Offspring Fed:\*\*[^\n]*/i, "");
    cleaned = cleaned.replace(
      /,\s*Gestation Phase\s*\([^)]*\)\s*\|\s*Holding Infant\s*\([^)]*\)/i,
      "",
    );
  }

  if (!frozen.isTriadActive) {
    cleaned = cleaned.replace(/\n-\s*\*\*\[TRIAD SURROGATE\][^\n]*/i, "");
  }

  if (frozen.hasStartedGame && !frozen.hasStarterPod) {
    cleaned = cleaned.replace(
      /\n-\s*\*\*\[NPC Name\]:\*\*\s*\[e\.g\.,\s*Lea \(Nomadic Pod Mate\)\][\s\S]*?(?=\n###\s+IV\.|\n###\s+V\.|$)/i,
      "\n",
    );
  }

  cleaned = stripMarkdownSection(cleaned, "MODULE D: NARRATIVE PLOT WISHLIST TEMPLATE");
  return cleaned;
}

/**
 * ZONE 1 FOR "medicinal-algae-quick-reference":
 * Stays 100% frozen all day so the Base Algae Table, Apothecary Prep, Analgesics,
 * Deep-Ocean Anomalies, and Season-Filtered Environmental Flavor are cached cheaply!
 * Only hard-prunes Endocrine (until Bond 15+) and Graveyard Cultivars (for non-medics).
 */
function pruneMedicinalAlgaeZone1(text: string, frozen: DayFrozenState): string {
  if (!frozen.hasStartedGame) {
    return "";
  }

  const envFlavorHeader = "# [SYSTEM_MODULE: ENVIRONMENTAL FLAVOR EXPANSION]";
  const splitIndex = text.indexOf(envFlavorHeader);

  let medicalPart = splitIndex !== -1 ? text.slice(0, splitIndex) : text;
  let envFlavorPart = splitIndex !== -1 ? text.slice(splitIndex) : "";

  // Hard anti-bleed lock: hide Endocrine / Mating Heat brew until Bond 15+
  if (frozen.bondLevel < 15) {
    medicalPart = stripMarkdownSection(
      medicalPart,
      "Endocrine & Cognitive Support (Hormonal Regulation)",
    );
  }

  // Hide rare Graveyard Cultivars in Zone 1 unless player is a Medic/Healer
  // (Zone 2 injects it on demand if a non-medic suffers severe infection/rot or transplants)
  if (!frozen.isMedicCharacter) {
    medicalPart = stripMarkdownSection(
      medicalPart,
      "The Fallen Medics' Legacy: Rare Graveyard Cultivars",
    );
  }

  // Filter Environmental Flavor Section 8 to ONLY the current Season (day-frozen!)
  if (envFlavorPart) {
    const otherSeasons = ["Spring", "Summer", "Fall", "Winter"].filter(
      (s) => s.toLowerCase() !== frozen.season,
    );
    for (const otherSeason of otherSeasons) {
      const rowRegex = new RegExp(`\\n\\|\\s*${otherSeason}\\s+[^\\n]+`, "gi");
      envFlavorPart = envFlavorPart.replace(rowRegex, "");
    }
  }

  return `${medicalPart}\n\n${envFlavorPart}`.replace(/\n{3,}/g, "\n\n").trim();
}

// ============================================================================
// APEX PLUGIN ZONE 1 (DAY-FROZEN) & ZONE 2 (DYNAMIC ARRIVAL) HELPERS
// ============================================================================

/**
 * Splits an Apex Plugin safely at major [BRACKETED] headers so mismatched
 * "#" vs "####" headings NEVER accidentally cut Bond Leveling or Heart Events.
 */
function splitApexPluginBlocks(text: string): string[] {
  const blockSplitRegex =
    /(?=(?:^|\n)#{0,4}[ \t]*(?:\[(?:APEX PLUGIN|NPC PROFILE|SYSTEM_OVERRIDES?|SYSTEM_MODULE|SYSTEM_MECHANIC|SYSTEM_TABLE|SYSTEM_LORE|SYSTEM_EVENT|BEHAVIORAL_CONSTRAINT)|THE 20 BOND LEVELS))/i;
  return text.split(blockSplitRegex);
}

/**
 * Auto-detects the active Primary Apex's name from "# [APEX PLUGIN: NAME (...)]".
 */
function detectPrimaryApexName(text: string, apexTarget: string): string {
  const headerApexMatch = text.match(/\[APEX PLUGIN:\s*([A-Za-z]+)/i);
  return (
    headerApexMatch?.[1] ||
    apexTarget.replace(/^apex-/i, "").split(/[\s_-]+/)[0] ||
    ""
  ).toLowerCase();
}

/**
 * Checks if a secondary NPC is already listed as present in the Save Log's
 * live location lines (keeps Ezra's constant crew frozen in Zone 1!).
 */
function isNpcPresentInSaveLog(
  npcName: string,
  subtitle: string,
  activeSavePool: string,
): boolean {
  const cleanName = npcName.trim().toLowerCase();
  if (!activeSavePool) return false;

  if (cleanName && new RegExp(`\\b${escapeRegex(cleanName)}\\b`, "i").test(activeSavePool)) {
    return true;
  }

  if (["brea", "thane", "zrill"].includes(cleanName) && /\bshiver\b/i.test(activeSavePool)) {
    return true;
  }
  if (cleanName === "brea" && /\bthane\b/i.test(activeSavePool)) return true;
  if (cleanName === "thane" && /\bbrea\b/i.test(activeSavePool)) return true;

  if (subtitle) {
    const cleanedSubtitle = subtitle
      .toLowerCase()
      .replace(/\b(the|a|an|rival|rare|encounter|campaign|condensed|npc|pod|mate)\b/g, " ")
      .replace(/[^a-z\s-]/g, " ")
      .trim();
    if (
      cleanedSubtitle.length >= 4 &&
      new RegExp(`\\b${escapeRegex(cleanedSubtitle)}\\b`, "i").test(activeSavePool)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * ZONE 1 FOR APEX PLUGINS (Day-Frozen):
 * Keeps 100% of the Primary Apex + any constant NPCs listed in the Save Log's live
 * presence lines. Prunes off-screen rivals/visitors to 0 words so ZERO appearance
 * bleed can happen AND the system prefix stays 100% frozen for DeepSeek caching!
 */
function pruneApexPluginZone1(text: string, frozen: DayFrozenState): string {
  const primaryApexName = detectPrimaryApexName(text, frozen.apexTarget);
  const activeSavePool = extractActiveNpcStateLines(frozen.saveLog).toLowerCase();
  const blocks = splitApexPluginBlocks(text);
  const hiddenNpcNames = new Set<string>();

  const processedBlocks = blocks.map((block) => {
    const firstLine = block.trimStart().split("\n")[0] ?? "";

    // CHECK A: [NPC PROFILE: ...]
    const npcProfileMatch = firstLine.match(
      /\[NPC PROFILE:\s*([^\](:\-]+?)(?:\s*(?:\(([^)]+)\)|[-–—:]\s*([^\]]+)))?\s*\]/i,
    );
    if (npcProfileMatch) {
      const npcName = npcProfileMatch[1].trim().toLowerCase();
      const subtitle = (npcProfileMatch[2] ?? npcProfileMatch[3] ?? "").trim();

      if (primaryApexName && npcName === primaryApexName) return block;
      if (block.trim().length < 250 && !/visual|appearance|scar|hair|tail/i.test(block)) {
        return block;
      }
      if (isNpcPresentInSaveLog(npcName, subtitle, activeSavePool)) {
        return block;
      }

      hiddenNpcNames.add(npcName);
      return "";
    }

    // CHECK B: [SYSTEM_MODULE: <NAME>'S (CONDENSED) VOICE DIRECTIVE ...]
    const voiceMatch = firstLine.match(
      /\[SYSTEM_MODULE:\s*([A-Za-z]+)(?:['’]s)?\s+(?:CONDENSED\s+)?VOICE DIRECTIVE/i,
    );
    if (voiceMatch) {
      const npcName = voiceMatch[1].trim().toLowerCase();
      if (primaryApexName && npcName === primaryApexName) return block;
      if (isNpcPresentInSaveLog(npcName, "", activeSavePool)) return block;

      hiddenNpcNames.add(npcName);
      return "";
    }

    return block;
  });

  // Clean off-screen NPC bullets from "NPC VOCABULARY & SENSORY BANK"
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
 * ZONE 2 FOR APEX PLUGINS (Dynamic Turn Tail):
 * Checks if any secondary/rival NPC who was pruned out of Zone 1 just entered
 * the scene (via Two-Way Radar, Wishlist, 20 Roll, or Level 19 Heart Event).
 * Returns ONLY their Profile + Voice Directive + Vocab bullet for THIS turn!
 */
function extractTriggeredOffscreenApexNpcsZone2(
  rawText: string,
  frozen: DayFrozenState,
  turn: {
    rawPlayerInput: string;
    twoWayRadar: string;
    wishlist: string;
  },
): string {
  const primaryApexName = detectPrimaryApexName(rawText, frozen.apexTarget);
  const activeSavePool = extractActiveNpcStateLines(frozen.saveLog).toLowerCase();
  const dynamicPool = `${turn.twoWayRadar}\n${turn.wishlist}`.toLowerCase();

  const justRolled20 =
    /\(\(d20\s*=\s*20\)\)/i.test(turn.rawPlayerInput) ||
    /APP_ROLL:Daily Encounter[^\n]*\b20\b/i.test(turn.rawPlayerInput) ||
    /\brolled a (?:modified )?20\b/i.test(turn.rawPlayerInput);

  const isGenericRivalActive =
    (justRolled20 && frozen.bondLevel >= 10) ||
    /\b(rival|rivalry|intruder|usurper|territory threat|sparring match|other apex|another apex|challenger|phantom's counsel)\b/i.test(
      dynamicPool,
    );

  const isTriggeredDynamically = (
    npcName: string,
    subtitle: string,
    isRivalBlock: boolean,
  ): boolean => {
    const cleanName = npcName.trim().toLowerCase();

    if (cleanName && new RegExp(`\\b${escapeRegex(cleanName)}\\b`, "i").test(dynamicPool)) {
      return true;
    }
    if (["brea", "thane", "zrill"].includes(cleanName) && (/\bshiver\b/i.test(dynamicPool) || justRolled20)) {
      return true;
    }
    if (cleanName === "brea" && /\bthane\b/i.test(dynamicPool)) return true;
    if (cleanName === "thane" && /\bbrea\b/i.test(dynamicPool)) return true;

    if (subtitle) {
      const cleanedSubtitle = subtitle
        .toLowerCase()
        .replace(/\b(the|a|an|rival|rare|encounter|campaign|condensed|npc|pod|mate)\b/g, " ")
        .replace(/[^a-z\s-]/g, " ")
        .trim();
      if (
        cleanedSubtitle.length >= 4 &&
        new RegExp(`\\b${escapeRegex(cleanedSubtitle)}\\b`, "i").test(dynamicPool)
      ) {
        return true;
      }
    }

    if (isRivalBlock && (isGenericRivalActive || frozen.bondLevel === 19)) {
      return true;
    }

    return false;
  };

  const blocks = splitApexPluginBlocks(rawText);
  const unlockedBlocks: string[] = [];
  const unlockedNames = new Set<string>();

  for (const block of blocks) {
    const firstLine = block.trimStart().split("\n")[0] ?? "";

    // Check [NPC PROFILE]
    const npcProfileMatch = firstLine.match(
      /\[NPC PROFILE:\s*([^\](:\-]+?)(?:\s*(?:\(([^)]+)\)|[-–—:]\s*([^\]]+)))?\s*\]/i,
    );
    if (npcProfileMatch) {
      const npcName = npcProfileMatch[1].trim().toLowerCase();
      const subtitle = (npcProfileMatch[2] ?? npcProfileMatch[3] ?? "").trim();

      if (primaryApexName && npcName === primaryApexName) continue;
      if (block.trim().length < 250 && !/visual|appearance|scar|hair|tail/i.test(block)) continue;

      // Skip if already present in Zone 1!
      if (isNpcPresentInSaveLog(npcName, subtitle, activeSavePool)) continue;

      const isRivalBlock =
        /\brival\b/i.test(subtitle) || /\bthe rival\b/i.test(block.slice(0, 300));

      if (isTriggeredDynamically(npcName, subtitle, isRivalBlock)) {
        unlockedBlocks.push(block.trim());
        unlockedNames.add(npcName);
      }
      continue;
    }

    // Check [VOICE DIRECTIVE]
    const voiceMatch = firstLine.match(
      /\[SYSTEM_MODULE:\s*([A-Za-z]+)(?:['’]s)?\s+(?:CONDENSED\s+)?VOICE DIRECTIVE/i,
    );
    if (voiceMatch) {
      const npcName = voiceMatch[1].trim().toLowerCase();
      if (primaryApexName && npcName === primaryApexName) continue;
      if (isNpcPresentInSaveLog(npcName, "", activeSavePool)) continue;

      const isRivalVoice =
        /\bcondensed\b|\bcampaign\b|\brival\b/i.test(firstLine) ||
        /\bthe rival\b/i.test(block.slice(0, 350));

      if (isTriggeredDynamically(npcName, "", isRivalVoice)) {
        unlockedBlocks.push(block.trim());
        unlockedNames.add(npcName);
      }
    }
  }

  // Also grab their Vocabulary Bank bullets if they just unlocked!
  if (unlockedNames.size > 0) {
    for (const block of blocks) {
      if (!/\[SYSTEM_MODULE:\s*NPC VOCABULARY/i.test(block)) continue;
      for (const name of unlockedNames) {
        const vocabMatch = block.match(
          new RegExp(
            `(?:^|\\n)(-[ \\t]+\\*\\*${escapeRegex(name)}\\b[^\\n]*(?:\\n[ \\t]+-[^\\n]*)*)`,
            "i",
          ),
        );
        if (vocabMatch) {
          unlockedBlocks.push(`[VOCABULARY BANK ADDENDUM]\n${vocabMatch[1].trim()}`);
        }
      }
    }
  }

  return unlockedBlocks.join("\n\n");
}

// ============================================================================
// GM Q&A OPEN-RULEBOOK HELPER (Zone 2 Only — Keeps Zone 1 Cached!)
// ============================================================================

/**
 * When the player asks the GM a rules question during WAITING COMMAND, gathers
 * the major pruned-out sections (Reproduction, Mating Heat, Weather, Cultivars,
 * Endocrine) and places them in Zone 2 so the GM can answer accurately without
 * breaking the cached Zone 1 prefix!
 */
function buildGmQaMissingRulesBundle(
  rawRulesBySlug: Record<string, string>,
  frozen: DayFrozenState,
): string {
  const missing: string[] = [];
  const rawCore = rawRulesBySlug["universal-core-engine"] ?? "";
  const rawAlgae = rawRulesBySlug["medicinal-algae-quick-reference"] ?? "";

  if (rawCore) {
    if (frozen.bondLevel < 18 && !frozen.hasOffspringInSave) {
      const repro = extractMarkdownSection(rawCore, "[SYSTEM_MECHANIC: REPRODUCTION & RAISING CHILDREN]");
      if (repro) missing.push(repro);
    }
    if (frozen.bondLevel < 15 && !frozen.hasOffspringInSave) {
      const heat = extractMarkdownSection(rawCore, 'THE "SEASON" (Mating Biology)');
      if (heat) missing.push(heat);
    }
    // Include full 4-season weather reference so the GM can answer Winter/Summer/Fall questions
    const allSeasons = [
      { key: "spring", header: "\\[SPRING:\\s*THE BLOOM\\]" },
      { key: "summer", header: "\\[SUMMER:\\s*THE SURFACE GALES\\]" },
      { key: "fall", header: "\\[FALL:\\s*THE DEEP SHIFT\\]" },
      { key: "winter", header: "\\[WINTER:\\s*THE STILLNESS\\]" },
    ];
    for (const s of allSeasons) {
      if (s.key !== frozen.season) {
        const match = rawCore.match(
          new RegExp(
            `(-\\s*\\*\\*${s.header}\\*\\*[\\s\\S]*?)(?=\\n-\\s*\\*\\*\\[(?:SPRING|SUMMER|FALL|WINTER):|\\n#{1,4}\\s+|$)`,
            "i",
          ),
        );
        if (match) missing.push(match[1].trim());
      }
    }
  }

  if (rawAlgae) {
    if (frozen.bondLevel < 15) {
      const endo = extractMarkdownSection(rawAlgae, "Endocrine & Cognitive Support (Hormonal Regulation)");
      if (endo) missing.push(endo);
    }
    if (!frozen.isMedicCharacter) {
      const cult = extractMarkdownSection(rawAlgae, "The Fallen Medics' Legacy: Rare Graveyard Cultivars");
      if (cult) missing.push(cult);
    }
  }

  return missing.join("\n\n");
}

// ============================================================================
// SMART MARKDOWN TAG SCANNER (Split into Zone 1 Static + Zone 2 Dynamic)
// ============================================================================

/**
 * ZONE 1 TAG SCANNER (Day-Frozen Only):
 * - [ALWAYS] -> Kept in Zone 1 (tag stripped).
 * - [GATE: BOND>=X / LEVEL>=X / SPRING|SUMMER|FALL|WINTER / OFFSPRING] -> Evaluated
 *   using day-frozen state.
 * - [SOMETIMES] / [SOMETIMES: ...] -> Stripped from Zone 1 (handled by Zone 2 so
 *   keyword flips NEVER break DeepSeek's prefix cache!).
 * - Plain-English "- **The Trigger:** Bond Level X+ / Global Level X+" -> Enforced.
 */
function processStaticGatesZone1(text: string, frozen: DayFrozenState): string {
  const gateRegex = /<!--\s*\[GATE:\s*([^\]]+)\]\s*-->([\s\S]*?)<!--\s*\[\/GATE\]\s*-->/gi;
  let result = text.replace(
    gateRegex,
    (_fullMatch, conditionRaw: string, innerContent: string) => {
      const evalResult = evaluateStaticGateCondition(conditionRaw, frozen);
      // If it's a keyword gate (null) or unmet static gate (false), hide from Zone 1
      return evalResult === true ? innerContent : "";
    },
  );

  const headingSectionRegex = /(?:^|\n)(#{1,4}\s+[^\n]+)([\s\S]*?)(?=\n#{1,4}\s+|$)/g;

  result = result.replace(
    headingSectionRegex,
    (fullSection, headingLine: string, bodyText: string) => {
      if (/\[\s*ALWAYS\s*\]/i.test(headingLine)) {
        const cleanHeading = headingLine.replace(/\s*\[\s*ALWAYS\s*\]/gi, "");
        return `\n${cleanHeading}${bodyText}`;
      }

      // [SOMETIMES] sections belong in Zone 2 so they never invalidate the Zone 1 cache
      if (/\[\s*SOMETIMES(?::\s*[^\]]+)?\s*\]/i.test(headingLine)) {
        return "\n";
      }

      const headingGateMatch = headingLine.match(/\[\s*GATE:\s*([^\]]+)\]/i);
      if (headingGateMatch) {
        const evalResult = evaluateStaticGateCondition(headingGateMatch[1], frozen);
        if (evalResult !== true) return "\n";
        const cleanHeading = headingLine.replace(/\s*\[\s*GATE:\s*[^\]]+\]/gi, "");
        return `\n${cleanHeading}${bodyText}`;
      }

      // Plain-English "- **The Trigger:** Bond Level X+ / Global Level X+"
      const triggerLineMatch = bodyText.match(
        /-\s*\*\*(?:The\s+)?Trigger[^*]*\*\*([^\n]+)/i,
      );
      if (triggerLineMatch) {
        const triggerLine = triggerLineMatch[1];
        const bondReqMatch = triggerLine.match(
          /\bBond(?:\s+is|\s+reaches)?\s+Level\s+(\d+)\s*(?:\+|or\s+higher)/i,
        );
        if (bondReqMatch && frozen.bondLevel < parseInt(bondReqMatch[1], 10)) {
          return "\n";
        }
        const levelReqMatch = triggerLine.match(
          /\bGlobal\s+Level\s+(\d+)\s*(?:\+|or\s+higher)/i,
        );
        if (levelReqMatch && frozen.globalLevel < parseInt(levelReqMatch[1], 10)) {
          return "\n";
        }
      }

      return fullSection;
    },
  );

  return result;
}

/**
 * ZONE 2 TAG SCANNER (Dynamic Turn Tail):
 * Finds any [SOMETIMES: word1, word2], [SOMETIMES], or keyword-based [GATE: word]
 * sections in raw Markdown that match the Two-Way Radar on THIS turn.
 */
function extractTriggeredSometimesSectionsZone2(
  rawText: string,
  frozen: DayFrozenState,
  twoWayRadar: string,
): string {
  const radarAndSave = `${twoWayRadar}\n${frozen.saveLog}`.toLowerCase();
  const matches: string[] = [];

  // Check keyword HTML comment gates (ones that evaluateStaticGateCondition skipped)
  const gateRegex = /<!--\s*\[GATE:\s*([^\]]+)\]\s*-->([\s\S]*?)<!--\s*\[\/GATE\]\s*-->/gi;
  let gateMatch: RegExpExecArray | null;
  while ((gateMatch = gateRegex.exec(rawText)) !== null) {
    const cond = gateMatch[1].trim();
    if (evaluateStaticGateCondition(cond, frozen) === null) {
      if (radarAndSave.includes(cond.toLowerCase())) {
        matches.push(gateMatch[2].trim());
      }
    }
  }

  // Check [SOMETIMES: ...] and keyword [GATE: ...] headings
  const headingSectionRegex = /(?:^|\n)(#{1,4}\s+[^\n]+)([\s\S]*?)(?=\n#{1,4}\s+|$)/g;
  let secMatch: RegExpExecArray | null;
  while ((secMatch = headingSectionRegex.exec(rawText)) !== null) {
    const headingLine = secMatch[1];
    const bodyText = secMatch[2];

    const sometimesMatch = headingLine.match(/\[\s*SOMETIMES(?::\s*([^\]]+))?\s*\]/i);
    if (sometimesMatch) {
      const rawKeywords = sometimesMatch[1];
      const cleanHeading = headingLine.replace(/\s*\[\s*SOMETIMES(?::\s*[^\]]+)?\s*\]/gi, "");
      const keywords = rawKeywords
        ? rawKeywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean)
        : extractKeywordsFromHeading(cleanHeading);

      if (keywords.some((kw) => radarAndSave.includes(kw))) {
        matches.push(`${cleanHeading}${bodyText}`.trim());
      }
      continue;
    }

    const headingGateMatch = headingLine.match(/\[\s*GATE:\s*([^\]]+)\]/i);
    if (headingGateMatch) {
      const cond = headingGateMatch[1].trim();
      if (evaluateStaticGateCondition(cond, frozen) === null && radarAndSave.includes(cond.toLowerCase())) {
        const cleanHeading = headingLine.replace(/\s*\[\s*GATE:\s*[^\]]+\]/gi, "");
        matches.push(`${cleanHeading}${bodyText}`.trim());
      }
    }
  }

  return matches.join("\n\n");
}

/**
 * Evaluates ONLY day-frozen static gate conditions.
 * Returns true/false for stat/season gates, or null if it's a dynamic keyword gate.
 */
function evaluateStaticGateCondition(
  conditionRaw: string,
  frozen: DayFrozenState,
): boolean | null {
  const cond = conditionRaw.trim().toUpperCase();

  const bondMatch = cond.match(/^BOND\s*>=\s*(\d+)$/);
  if (bondMatch) return frozen.bondLevel >= parseInt(bondMatch[1], 10);

  const levelMatch = cond.match(/^LEVEL\s*>=\s*(\d+)$/);
  if (levelMatch) return frozen.globalLevel >= parseInt(levelMatch[1], 10);

  if (["SPRING", "SUMMER", "FALL", "WINTER"].includes(cond)) {
    return frozen.season.toUpperCase() === cond;
  }

  if (cond === "OFFSPRING") return frozen.hasOffspringInSave;

  return null; // Not a static gate -> treat as dynamic keyword gate for Zone 2
}

// ============================================================================
// GENERAL HELPER FUNCTIONS
// ============================================================================

function stripMarkdownSection(text: string, headingTitleSnippet: string): string {
  const escapedTitle = escapeRegex(headingTitleSnippet);
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

function extractMarkdownSection(text: string, headingTitleSnippet: string): string {
  const escapedTitle = escapeRegex(headingTitleSnippet);
  const headingMatch = text.match(
    new RegExp(`^(#{1,4})\\s+[^\\n]*${escapedTitle}[^\\n]*`, "im"),
  );
  if (!headingMatch) return "";

  const hashCount = headingMatch[1].length;
  const sectionRegex = new RegExp(
    `(?:^|\\n)(#{${hashCount}}\\s+[^\\n]*${escapedTitle}[^\\n]*[\\s\\S]*?)(?=\\n#{1,${hashCount}}\\s+|$)`,
    "i",
  );
  const match = text.match(sectionRegex);
  return match ? match[1].trim() : "";
}

function stripBulletBlock(text: string, bracketSnippet: string): string {
  const escaped = escapeRegex(bracketSnippet);
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
): "spring" | "summer" | "fall" | "winter" {
  const combined = `${stateSeason ?? ""} ${saveLog}`.toLowerCase();
  const dateMatch = combined.match(/\b(spring|summer|fall|autumn|winter)\s*,\s*day\s*\d+/i);
  const word = dateMatch ? dateMatch[1].toLowerCase() : combined;

  if (word.includes("winter")) return "winter";
  if (word.includes("fall") || word.includes("autumn")) return "fall";
  if (word.includes("summer")) return "summer";
  return "spring";
}

function extractActiveNpcStateLines(saveLog: string): string {
  if (!saveLog) return "";
  const lines = saveLog.split("\n");
  const activeLines: string[] = [];

  for (const line of lines) {
    if (
      /\*\*(?:Current Location|Current NPC Location|Secondary NPCs|Active Quests|Shiver Status|Triad Surrogate|Companions?|Pod Members?)[^*]*\*\*/i.test(
        line,
      )
    ) {
      if (!/:\s*(?:not present|absent|none|n\/a)\b/i.test(line)) {
        activeLines.push(line);
      }
    }
  }
  return activeLines.join("\n");
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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}