# Fish Slop — Theo Browne’s game prompt (reconstructed)

Theo never published a single canonical “here is the Fish Slop prompt” gist. What follows is a reconstruction from his videos, third-party writeups of those videos, and how the game behaves across model generations.

**Sources:** Theo’s “I don’t really like GPT-5.5…”, “I’m scared to make this video” (Gemini 3.5 Flash rewrite test), later GPT-5.6 / Grok 4.5 field reports; summaries that name Fish Slop as an **Insane Aquarium**-inspired project and a recurring AI coding bench.

---

## What Fish Slop is

**Fish Slop** is Theo’s (t3.gg / Theo Browne) small browser aquarium game, used as a real-world AI coding benchmark — not a shipped product.

| Piece | Detail |
| --- | --- |
| Inspiration | Classic Flash game **Insane Aquarium** |
| Core loop | Drop food → fish swim/eat/grow → starve if neglected; coin/upgrade vibes of the original |
| Stack history | Phaser → raw canvas rewrites → Three.js / 3D (or 2.5D) experiments |
| Assets often seen | Fish sprites, submarine, coral, scan-lines; later full 3D tank + “monsters” / aliens |
| Failure modes models hit | Over-aggressive hunger, broken transparency, fish too big, screen-resize bugs, unwanted UI “cards”, inverted controls, weak spatial layout |

He resurrects the same project across model gens (Opus, GPT-5.4, GPT-5.5, Gemini 3.5 Flash, Grok 4.5, GPT-5.6, etc.) to see whether the model can **rewrite**, **preserve assets**, **fix feel**, and later **go 3D** without turning it into slop.

Naming fits his pattern: *quipslop*, *slot slop*, *fish slop* — “AI-generated game junk, but make it a real test.”

---

## Theo’s prompting style (important)

His modern coding prompts are usually **one or two short sentences**, not a design doc. Fish Slop runs are consistent with that: short intent, iterative follow-ups, new thread when context goes bad.

So the “prompt” is less a single system prompt and more a **seed + rewrite + 3D ladder**.

---

## What I think the original create prompt was

Closest to how he’d actually type it into Cursor / Claude / Codex — casual, reference the classic game, name the project, leave mechanics implied:

```text
Build a browser game called Fish Slop, like Insane Aquarium.
Click to drop food, fish swim around and eat, they grow and die if you don't feed them. Keep it simple and fun — Phaser or canvas is fine.
```

Slightly more complete variant (still Theo-short, if he bothered to name the full loop):

```text
Make Fish Slop — an Insane Aquarium clone for the browser.

- Tank full of fish that swim around
- Click/tap to drop food pellets; fish seek and eat them
- Hunger: fish get hungry and die if ignored
- Fish grow when well fed; maybe drop coins or score when happy
- Simple upgrades / buy more fish later if easy
- Cute fish + underwater background; keep code small and playable
```

**Why this is plausible**

1. Every serious writeup says **inspired by Insane Aquarium** — that reference is the real spec.
2. Failure reports always center on **feeding / death timing**, not random RPG systems — so hunger + click-to-feed is the heart of the prompt.
3. Stack was Phaser first; rewrites “drop Phaser for canvas” — original almost certainly said “browser game” without locking Three.js.
4. He doesn’t write long agent.md-style specs for toys; short “make X like Y” matches his published prompting philosophy.

---

## What I think the rewrite / benchmark prompt is

This is the prompt he actually uses **most** when evaluating models on an existing Fish Slop codebase:

```text
Rewrite this Fish Slop game from scratch. Keep it playable and actually better than what we have — fix the feeding feel, keep assets working (transparency, scale), don't break resize.
```

Even shorter form he might use on a cold model with the repo open:

```text
Rewrite Fish Slop. Make the game better.
```

Gemini 3.5 Flash failed this class of prompt (broken transparency, oversized fish, non-functional mechanics). GPT-5.5 did well enough that he escalated to 3D.

---

## Follow-up prompts (the ladder)

After a working 2D rewrite, the next steps he describes look like:

```text
Make Fish Slop 3D. Use Three.js. Same game feel, real 3D tank and fish.
```

When the model ships 2.5D or junk UI:

```text
No. Fully 3D gameplay, not just 3D assets on a 2D plane. And remove the cards in the corners — I told you to remove those.
```

When feeding is too harsh (common Opus / 5.4 failure):

```text
Fish die way too fast. Dial hunger way back so you can actually play without constantly clicking food.
```

Grok-style 3D aquarium push (from writeups of his Grok 4.5 tests — convert prior 2D prototype):

```text
Turn this into a full 3D aquarium game in Three.js — environment, creature models, tank bottom, invaders. Make it actually playable.
```

---

## “Senior engineer / vibe-slop rewrite” cousin

Separately, he talks about a **senior-engineer benchmark**: rewrite a poorly vibe-coded codebase from first principles (delete/rebuild, not patch). Fish Slop is a concrete instance of that genre when the repo is already messy AI output:

```text
This Fish Slop codebase is vibe-coded slop. Rewrite it cleanly from first principles. Fewer files, clear structure, same game. Delete what you don't need.
```

---

## Best single guess (if you only need one string)

If you want **one** prompt that captures “Theo’s Fish Slop prompt” as people mean it — the seed that defines the game:

```text
Build Fish Slop: a browser Insane Aquarium-style game. Click to feed fish in a tank; they swim, eat, grow, and die if you starve them. Keep it simple, cute, and playable.
```

That’s the spirit. The **real** evaluation harness is then: open the repo, say **rewrite / make it better / make it 3D**, and judge whether the model keeps the game alive without inventing purple-gradient UI cards.

---

## Not the same as Quipslop

**Quipslop** (`T3-Content/quipslop`) is a different Theo/T3 project — AI Quiplash (prompt → answers → votes). Its system prompts live in `game.ts` / `prompts.ts`. Fish Slop is the aquarium game bench, not the comedy game.

---

## Confidence

| Claim | Confidence |
| --- | --- |
| Game exists, Insane Aquarium-inspired, used as model bench | High (multiple video summaries) |
| Core loop = feed / swim / hunger / die | High |
| Original create prompt ≈ short “like Insane Aquarium” | Medium-high (style + description; exact text not public) |
| Exact original string as typed in 2025 | Low — reconstruct only |
| Rewrite + 3D follow-ups as stated | Medium-high (behavior + quotes in recaps) |
