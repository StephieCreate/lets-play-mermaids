# Project memory

## Product intent & audience

- Web application with an AI narration feature served via a Supabase Edge Function (`narrate`).
- The `narrate` function is substantial (~860+ lines) and contains detailed embedded AI prompt instructions (e.g., "RESPONSE BUDGET"), indicating a production-grade, structured AI output pipeline.

## Brand personality & voice

- `.bolt/prompt` contains authoritative global design/voice instructions; reference it rather than restating.

## Visual design & UX direction

- Stack: Vite + React + Tailwind CSS + lucide-react icons; `@/` path alias maps to `src/`.
- No project-specific visual/UX context inferred yet beyond what `.bolt/prompt` already specifies.

## Decisions, constraints & rationale

- Backend: Supabase; Edge Functions are deployed directly to Supabase.
- `narrate` function lives at `supabase/functions/narrate/`.
- User preference: deploy existing code as-is without modifications; edits should be minimal and only when blockers prevent deployment.
- During this turn the function had a genuine syntax error (~line 864): AI prompt text ("RESPONSE BUDGET…") had fallen outside its string literal (string closed ~line 862), making the file unparseable. Minimal repair moved the stray text back inside the string; no logic or behavior changed.
- After the string-boundary fix, deployment succeeded; `narrate` is live on Supabase.
- Earlier (broken) project state is recoverable via Version History.

## Open questions & assumptions

- Exact functional purpose of the `narrate` edge function beyond AI-driven narration is not yet documented.
- Whether additional Supabase Edge Functions exist or are planned.
- Broader application scope and pages beyond the narration feature are not yet inferred.