import {
  CORE_RULE_SLUGS,
  SEASON_LABELS,
  SEASON_KEYWORDS,
  apexRuleSlug,
  triadSurrogateSlug,
} from "./types.ts";
import type { ConversationTurn, NarrateRequest, NarrativeSummaryRow } from "./types.ts";
import {
  ADVANCED_PROSE_DIRECTIVE,
  DUAL_MODE_PROTOCOL,
  HARD_MODE_CONSENT_TEXT,
  NARRATIVE_STYLE_TRAINING,
} from "./promptTemplates.ts";
import { isDayStartAnchor } from "./gameMechanics.ts";

export function buildSystemPrompt(
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
  const curBond = Math.max(1, (req.storyState["bond_level"] as number) ?? 1);
  const curBondXp = (req.storyState["bond_xp"] as number) ?? 0;

  const storyStateSection = [
    "## Current Story State (Authoritative Tracker Math — Enforce These Exact Totals)",
    `- Scene: ${req.currentScene || "Beginning"}`,
    `- Stamina: ${curStm}/${maxStm}`,
    `- Health (HP): ${curHp}/${maxHp}`,
    `- Global Level: ${curLvl} (XP: ${curXp}/${curLvl * 100})`,
    `- Bond Level: ${curBond} (Bond XP: ${curBondXp}/${Math.max(1, curBond) * 10})`,
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

export function buildUserPrompt(req: NarrateRequest): string {
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
export function buildConversationMessages(
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

/**
 * Extracts only the "Queued" section from the plot wishlist text.
 * The wishlist is expected to have sections labeled "Queued" and "Completed".
 * We return everything under the Queued heading up until the Completed heading
 * (or end of text). If no Queued heading is found, the entire content is
 * returned (graceful fallback). Completed content is always excluded.
 */
export function extractQueuedSection(content: string): string {
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
 * Parses content where NEWEST days are at the TOP.
 * Keeps only the 7 most recent days (the first 7 chunks).
 * Rescues older days from the bottom if explicitly mentioned in player input.
 */
export function extractRecentDaysTopDown(content: string, playerInput: string, daysToKeep: number = 7): string {
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

