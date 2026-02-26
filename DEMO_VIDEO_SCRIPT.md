# LorePack — 3-Minute Demo Video Script

## Pre-Recording Checklist

### Data Preparation

- [ ] **Create a polished lorebook** — Have a world titled something evocative (e.g., *"The Shattered Dominion"*) with 4–6 entries across categories (characters, locations, factions, magic system). Mark **at least 2 entries as Public**.
- [ ] **Have one completed story session** — At least 2–3 chapters generated with inline illustrations so the Writing Desk has content to show.
- [ ] **Gallery images** — Ensure 3+ character portraits and 2+ scene illustrations exist in the Gallery.
- [ ] **Second test account** (optional but recommended) — Create a separate lorebook (e.g., *"Iron Meridian"*) with public entries so the Crossroads page has a discoverable world to demo import/crossover.

### Environment

- [ ] Backend running: `uv run uvicorn app.api.main:app --reload --port 8000`
- [ ] Frontend running: `cd frontend && npm run dev` → `http://localhost:5173`
- [ ] Logged in via Firebase Auth — user avatar visible in sidebar.
- [ ] Browser: Chrome, 1920×1080 resolution, 100% zoom, bookmarks bar hidden.
- [ ] Close all unrelated browser tabs.
- [ ] Set system to Do Not Disturb.

### Recording Setup

- [ ] Screen recorder: OBS or QuickTime, 1080p 60fps.
- [ ] Microphone: test audio levels, minimize background noise.
- [ ] Have the script visible on a second monitor or teleprompter.

---

## Script & Demo Flow

> **Total runtime target: 3:00**
> Timestamps are approximate. Practice to calibrate pacing.

---

### Opening — Landing Page (0:00 – 0:20)

**Show:** Landing page with particle animation background and hero text.

**Script:**

> "LorePack is an AI-powered collaborative worldbuilding and story generation platform. Instead of asking an AI to write a story from scratch, LorePack follows a *world-building first* approach — you define your world's lore, characters, and rules, and the AI generates stories that stay faithful to your creation. Let me show you how it works."

**Action:** Click **"Enter the Sanctum"** → transition to Dashboard.

---

### Act 1 — Dashboard Overview (0:20 – 0:40)

**Show:** The Sanctum (Dashboard) with session cards, lorebook stats, and public worlds summary.

**Script:**

> "This is the Sanctum — your home base. You can see your active story sessions, your lorebooks, recent illustrations, and a glimpse of public worlds shared by other creators. Let's create a brand new story."

**Action:** Click **"Story Studio"** in the sidebar → navigate to Story Studio.

---

### Act 2 — Story Conjuring Wizard (0:40 – 1:30)

**Show:** The 5-step conjuring wizard.

**Step 1 — Genre (0:40 – 0:50)**

**Script:**

> "The Story Studio guides you through a five-step wizard. First, pick a genre."

**Action:** Select **"Dark Fantasy"**. Click **Next**.

**Step 2 — World Era & Essence (0:50 – 1:00)**

**Script:**

> "Then choose an era and flavor for your world."

**Action:** Select **"Medieval"** era, pick **"Political Intrigue"** + **"Sword & Sorcery"** as essences. Click **Next**.

**Step 3 — Protagonist (1:00 – 1:10)**

**Script:**

> "Forge your protagonist — pick an archetype, virtues, and flaws."

**Action:** Select archetype (e.g., "Fallen Noble"), check a virtue and a shadow. Click **Next**.

**Step 4 — Spark & Title (1:10 – 1:20)**

**Script:**

> "Write a one-line spark — the inciting idea — and name your tale. The AI can also suggest titles for you."

**Action:** Type a short spark sentence. Click **"Suggest Titles"**, pick one. Click **Conjure**.

**Conjuring in Progress (1:20 – 1:30)**

**Script:**

> "Now the AI agents take over. The Narrative Director builds the world, the World Architect populates the lorebook, and the Visual Artist generates character portraits — all running in parallel."

**Action:** Show the SSE streaming — thinking indicators, lore entries appearing, world review card rendering in real time. *(If generation takes long, cut to the pre-prepared session.)*

---

### Act 3 — The Writing Desk & Chapter Generation (1:30 – 1:55)

**Show:** Switch to the **pre-prepared session** that already has chapters.

**Script:**

> "Once the world is approved, you enter the Writing Desk. Here you can generate chapters one by one. Each chapter is grounded in your lorebook through RAG retrieval — the AI cites your own lore entries as it writes."

**Action:** Scroll through a generated chapter. **Point out:**
1. The chapter text with inline prose.
2. An inline **scene illustration** embedded in the chapter.
3. The **lore citation badges** in the sidebar showing which entries were referenced.

**Script (continued):**

> "You can also customize the writing style — literary, cinematic, poetic — and control chapter length. Everything stays consistent because the AI reads from your lorebook, not from memory."

**Action:** Briefly open the style/length selector to show the options, then close it.

---

### Act 4 — The Archive (Lorebook Editor) (1:55 – 2:15)

**Show:** Navigate to **The Archive** via sidebar.

**Script:**

> "The Archive is your lorebook — a structured database of everything in your world. Characters, locations, factions, magic systems — all auto-populated during story generation, and fully editable."

**Action:** Click through a few entries in the left panel. Select a character entry to show its content.

**Script (continued):**

> "Each entry has a visibility toggle. Set it to Public, and other creators can discover and import it."

**Action:** Click the **"Public"** tag on one entry to demonstrate the visibility toggle.

---

### Act 5 — Gallery of Visions (2:15 – 2:30)

**Show:** Navigate to **The Gallery** via sidebar.

**Script:**

> "Every portrait and scene illustration generated during your story is collected here in the Gallery. You can filter by characters or scenes, and click to view full resolution."

**Action:** Toggle filter between **Characters** and **Scenes**. Click one image to open the lightbox. Close it.

---

### Act 6 — The Crossroads (Collaboration) (2:30 – 2:50)

**Show:** Navigate to **The Crossroads** via sidebar.

**Script:**

> "This is where things get really interesting. The Crossroads lets you discover public worlds from other creators. You can import an entire lorebook into your own collection — or propose a *character crossover*."

**Action:**
1. Show the **public lorebooks list** with at least one entry visible.
2. Click **Import** on a public lorebook — show the success confirmation.
3. (If time allows) Show the **crossover proposal form** — select source and target lorebooks, enter character names.

**Script (continued):**

> "The AI evaluates compatibility between universes and negotiates the crossover, preserving each creator's canon. It's like building your own Marvel-style shared universe."

---

### Closing (2:50 – 3:00)

**Show:** Return to Dashboard, or show the Landing Page hero section.

**Script:**

> "LorePack is built on Google ADK with Gemini for narrative intelligence, Imagen for visual generation, Firestore for persistence, and the A2A protocol for cross-agent collaboration — all running on Google Cloud. Thank you for watching."

**Action:** End on the Dashboard or Landing Page. Fade to black / show logo.

---

## Quick-Reference: Page Names

| Sidebar Label | Internal Page | What to Show |
|---|---|---|
| The Sanctum | Dashboard | Session cards, lorebook count, public worlds |
| Story Studio | StoryStudio | 5-step wizard → chapter generation |
| The Archive | LorebookEditor | Entry list, inline editing, visibility toggle |
| Gallery of Visions | Gallery | Image grid, filters, lightbox |
| The Crossroads | Crossroads | Public worlds, import, crossover proposal |

## Timing Summary

| Segment | Duration | Cumulative |
|---|---|---|
| Opening (Landing) | 20s | 0:20 |
| Dashboard | 20s | 0:40 |
| Conjuring Wizard | 50s | 1:30 |
| Writing Desk | 25s | 1:55 |
| Lorebook Editor | 20s | 2:15 |
| Gallery | 15s | 2:30 |
| Crossroads | 20s | 2:50 |
| Closing | 10s | 3:00 |
