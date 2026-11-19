export const SCENE_ANALYSIS_PATTERN = /<scene_analysis>[\s\S]*?<\/scene_analysis>\s*/gi;

/**
 * Backend Anatomy & Buoyancy Gate: Scrubs accidental human/bipedal nouns and
 * standing/walking verbs out of the AI's response and replaces them with
 * merfolk/aquatic equivalents (floating, treading, drifting, hovering, tail/fluke).
 */
export function enforceAquaticAnatomy(text: string): string {
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
export function applyStatUpdatesFromNarration(
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
