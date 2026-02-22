# LOREPACK Frontend Design Document

## Aesthetic Direction: "Arcane Codex"

A medieval magical codex reimagined by a modern UI designer. Structure is modern (clear grid, sidebar, navigation), but every surface has ancient texture and atmosphere.

---

## Color System

```css
/* Surfaces */
--bg-void:      #0a0a0f;   /* deepest, near-black with slight purple */
--bg-primary:   #12121a;   /* main content area */
--bg-elevated:  #1a1a26;   /* cards, panels */
--bg-surface:   #222233;   /* hover, active states */

/* Metallic Accents */
--gold-dim:     #8b7355;   /* borders, dividers */
--gold:         #c4a265;   /* headings, icons, important elements */
--gold-bright:  #e8d5a3;   /* hover, active states */
--gold-glow:    #c4a26540; /* glow effects with transparency */

/* Semantic */
--ink:          #d4cfc4;   /* primary text, warm off-white */
--ink-muted:    #8a8578;   /* secondary text */
--crimson:      #8b2d3a;   /* warnings, delete, conflicts */
--emerald:      #2d5a3d;   /* success, public status */
--arcane-blue:  #3d4f7a;   /* links, RAG citation marks */
```

---

## Typography

| Role    | Font               | Usage                                  |
| ------- | ------------------ | -------------------------------------- |
| Display | Cinzel Decorative  | Logo, page titles                      |
| Heading | Cinzel             | Section headers, card titles           |
| Body    | Cormorant Garamond | Story content, lorebook entries         |
| UI      | Jost               | Buttons, labels, nav, metadata         |
| Mono    | JetBrains Mono     | IDs, API values                        |

All fonts loaded via Google Fonts.

---

## Tech Stack

| Layer     | Choice                                                                                   |
| --------- | ---------------------------------------------------------------------------------------- |
| Build     | Vite                                                                                     |
| Framework | React 19 + TypeScript                                                                    |
| Routing   | React Router v7                                                                          |
| Styling   | CSS Modules + CSS Variables                                                              |
| Animation | anime.js                                                                                 |
| 3D Effects| @react-three/fiber + drei                                                                |
| State     | Zustand                                                                                  |
| API       | FastAPI REST gateway (Type A: direct Firestore CRUD, Type B: ADK agent via SSE)          |
| Fonts     | Google Fonts (Cinzel Decorative, Cinzel, Cormorant Garamond, Jost, JetBrains Mono)       |

---

## Pages

### 1. Dashboard — "The Sanctum"

The landing page after login. Provides an at-a-glance overview of all activity.

#### Background

- Three.js gold particle constellation: 50–80 particles, low density, slow float, mouse parallax
- z-index lowest, opacity 0.3–0.5

#### Sections

- **Welcome Message**: Personalized greeting at the top.
- **Active Tales**: Ongoing story sessions displayed as cards.
  - Card content: story name, genre tag, current chapter, last edited timestamp, ambient progress bar.
  - Max 3 shown.
- **Your Lorebooks**: Card grid showing entry count and public entry count.
  - Last card is a "+ New" card with a dashed border.
- **Recent Visions**: Hero image (latest generation) + 2–3 thumbnails.
- **Whispers from Afar**: Collaboration notification summary — single line + link.

#### Entry Animation Sequence

1. Particles fade-in (300ms)
2. Welcome text (400ms)
3. Sections stagger (150ms each)
4. Cards stagger within sections (60ms each)

---

### 2. Story Studio — "The Writing Desk"

Two phases in a single page with an animated transition between them.

#### Phase 1: "Conjure Your World" (4-Step Wizard)

The sidebar dims to opacity 0.3 during the entire Conjure flow.

##### Step 1/4 — "Choose Your Realm"

Genre selection.

- Large cards with background textures.
- Single-select behavior.
- Selected card: scales to 1.05 + gold border + particle glow.
- Unselected cards: desaturate.

##### Step 2/4 — "Shape the World"

Two selection dimensions:

- **Era** (single-select): Medieval, Futuristic, Post-Apocalyptic, Steampunk, Mythological, Victorian, Ancient, Cosmic + Custom.
- **Essence** (multi-select, max 2–3): Sword & Sorcery, Eldritch Horror, Political Intrigue, Survival, Exploration, Prophecy & Destiny + Custom.
- Chips fill gold when selected.

##### Step 3/4 — "Forge Your Protagonist"

- **Archetype** (large cards, single-select): The Seer, The Warrior, The Scholar, The Trickster, The Outcast.
- **Virtues** (tag multi-select, max 3): Cunning, Loyal, Fearless, Empathic, Resolute, Curious, Charismatic, Patient.
- **Shadow** (tag single-select, uses `--crimson` instead of gold): Hubris, Grief, Distrust, Wrath, Obsession, Guilt, Isolation, Apathy.

##### Step 4/4 — "The Spark"

- Large text input styled as parchment writing (Cormorant Garamond italic, no visible border).
- **"Fate's Hand"** button to let AI generate a random spark.
- Conjuration summary showing all previous selections.
- **"Begin Your Tale"** final button.

##### Step Transitions

- Current step content staggers fade-out left (40ms per element).
- Step indicator fills (○ → ●) with gold pulse.
- New step staggers fade-in from right.
- Total duration: 600–800ms. Back navigation reverses direction.

##### Phase Transition (Conjure → Writing Desk)

1. Button border dissolves into particles (anime.js)
2. Ink diffusion shader from center (three.js fragment shader)
3. Preparation panel staggers fade-out upward
4. Ink recedes
5. Context Bar + Writing Desk fade-in from below

Total duration: ~1.8 seconds.

#### Phase 2: "The Writing Desk"

The main story creation workspace.

- **Context Bar** (top, collapsible): Shows genre, world, protagonist summary. Click to expand back to Conjure to modify selections.
- **Left Panel — Narrative Scroll**: Clean story text in Cormorant Garamond. Shows "Your story awaits..." placeholder until first chapter is generated. "Lore cited" marks at the bottom of each chapter (`--arcane-blue`) linking to lorebook entries.
- **Right Panel — Director's Chat**: User gives natural-language directions; AI responds. **Not** ChatGPT-style bubbles. Uses borderless paragraph layout with user/AI distinguished by gold/silver left border lines. Inline `✦ Lorebook updated` notifications appear when AI auto-creates entries.
- **Bottom — Chapter Navigation Bar**: `✦` for completed chapters, `○` for upcoming chapters.

#### AI Generation Visual

Ink diffusion shader activates in background during AI generation.

---

### 3. Lorebook Editor — "The Archive"

Dual-column layout: directory tree on the left, entry detail on the right.

#### Left Column — Directory Tree

- Lorebook name + description (editable inline).
- Entries grouped by category: **CHARACTERS**, **LOCATIONS**, **EVENTS**, **MAGIC SYSTEMS**, **ITEMS**, **OTHER**.
- Category headers: Cinzel, `--gold-dim`, `letter-spacing: 0.15em`.
- Selected entry: gold left border.
- Groups are collapsible.
- Empty categories are hidden.
- Bottom actions: **[+ Add Entry]** and **[⚠ Validate]** buttons.

#### Right Column — Entry Detail

- Entry name in Cinzel (large).
- Category badge.
- Visibility toggle (public/private).
- Tags.
- Content body in Cormorant Garamond with decorative dividers.
- Source metadata: which Story Session auto-generated it, or "manually created".
- Associated portrait thumbnail (if exists).
- **[Edit]** toggles inline editing.
- **[Delete]** with inline confirmation.

#### Design Philosophy

The Lorebook is positioned as a **post-creation organizing tool**. Story Studio auto-populates it during story generation.

---

### 4. Visual Gallery — "The Gallery of Visions"

#### Filter Bar

- Tabs: All / Characters / Scenes — with gold underline animation.
- Lorebook dropdown filter.

#### Hero Image

- Largest/latest generation, 60% width.
- Dark vignette overlay at bottom.
- White text overlay: name + prompt summary.

#### Grid

- 3-column layout, `aspect-ratio: 3/4` for characters.
- Hover: `scale(1.03)` + gold border fade-in + extra info overlay.
- Click opens lightbox.

#### Lightbox

- Dark backdrop: `rgba(0, 0, 0, 0.85)` + `backdrop-filter: blur(...)`.
- Left: full-size image.
- Right: metadata panel (art style, pose, date, full prompt).
- Actions: **[Regenerate]**, **[Set as Hero]**, **[Open in new tab]**.
- Prev/next arrows for navigation.

---

### 5. Collaboration Hub — "The Crossroads"

#### Discover

- Horizontal scroll or 3-column grid of public lorebook cards.
- Card content: name, genre badge, author, public entry count.
- **[Preview]** opens a side drawer.
- **[Import]** triggers import + success toast.

#### Crossover Proposals

- Split into **Incoming** and **Outgoing** sections.
- Incoming: shows characters, conflict warnings, **[Review]** / **[Accept]** / **[Decline]** actions.
- Outgoing: shows current proposal status.

#### Your Shared Worlds

- Simple list of user's lorebooks that have public entries.
- **[Manage]** link for each.

---

### 6. Sidebar — "The Spine"

#### Behavior

- Default: collapsed (64px wide).
- Hover: expands (220px wide, anime.js 250ms ease-out).

#### Styling

- Background: `--bg-void`.
- Right border: `1px solid var(--gold-dim)`.
- Active page indicator: 2px `--gold` left line.
- Hover item: background lightens to `--bg-surface`.

#### Logo

- Collapsed: `✦`
- Expanded: `✦ LOREPACK` (Cinzel Decorative)

#### Notifications

- Notification badge on Crossroads icon: `--crimson` dot for pending proposals.

---

## Shared Component Design Language

| Component      | Design                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Button (primary) | Gold border `1px var(--gold)`, transparent bg. Hover: fills `--gold` + dark text. No border-radius or 2px max. |
| Button (ghost) | No border, text `--gold-dim`. Hover: `--gold` + underline.                                                     |
| Card           | bg `--bg-elevated`, border `1px var(--bg-surface)`. Hover: border `--gold-dim`. No or 2px border-radius.       |
| Input/Textarea | bg `--bg-primary`, bottom `1px var(--gold-dim)` underline (not 4-side border). Focus: underline `--gold` + glow. |
| Tag/Chip       | Unselected: border `--gold-dim` + text `--ink-muted`. Selected: bg `--gold` + text `--bg-void`.               |
| Divider        | SVG decorative line with central diamond/cross symbol. `--gold-dim` color.                                     |
| Toast          | Slides in from top-right, bg `--bg-elevated` + left border `3px` accent (`--emerald` / `--crimson` / `--gold`). |
| Section header | Cinzel, `--gold`, `letter-spacing: 0.15em`, decorative divider below.                                         |

---

## API Architecture

Single FastAPI server with two endpoint categories.

### Type A — Direct Firestore CRUD

No agent needed. Standard REST endpoints.

| Method | Endpoint                              | Description                    |
| ------ | ------------------------------------- | ------------------------------ |
| GET    | `/api/lorebooks`                      | List all lorebooks             |
| GET    | `/api/lorebooks/:id`                  | Get lorebook details           |
| PUT    | `/api/lorebooks/:id/entries/:eid`     | Update a lorebook entry        |
| DELETE | `/api/lorebooks/:id/entries/:eid`     | Delete a lorebook entry        |
| GET    | `/api/gallery`                        | List all generated images      |
| GET    | `/api/sessions`                       | List story sessions            |
| GET    | `/api/collaboration/public`           | List public lorebooks          |

### Type B — Agent-Powered via ADK (SSE Streaming)

These endpoints invoke ADK agents and stream responses via Server-Sent Events.

| Method | Endpoint                              | Description                    |
| ------ | ------------------------------------- | ------------------------------ |
| POST   | `/api/sessions/conjure`               | Create a new story session     |
| POST   | `/api/sessions/:id/message`           | Send direction, get AI response|
| POST   | `/api/images/generate`                | Generate image from entry      |
| POST   | `/api/collaboration/crossover`        | Evaluate crossover proposal    |

### SSE Event Types (Story Generation)

| Event              | Description                              |
| ------------------ | ---------------------------------------- |
| `thinking`         | Status updates during processing         |
| `lore_cited`       | Lorebook entries referenced              |
| `chapter_chunk`    | Incremental text stream                  |
| `lorebook_updated` | New auto-created lorebook entries        |
| `done`             | Completion signal with `chapter_id`      |
