# ✦ LorePack

**Collaborative Worldbuilding & Story Generation Platform**

LorePack is an AI-powered platform where users conjure rich story worlds, generate illustrated chapters grounded in persistent lore, and collaborate across universes. Built on [Google ADK](https://github.com/google/adk-python) with multi-agent orchestration, A2A protocol support, and a React frontend styled as an "Arcane Codex."

> Built for the **Google Cloud Hackathon** with Agent Starter Pack v0.38.0.

---

## Features

- **Story Studio** — 4-step wizard (genre → era/essence → protagonist → spark) that conjures a new world, then transitions into a writing desk with chapter-by-chapter generation.
- **World Review & Approval** — After conjuring, the AI presents the world for review. Users can request revisions before approving and beginning chapter generation.
- **Illustrated Chapters** — Chapters are generated with inline scene illustrations via Imagen, streamed to the frontend over SSE.
- **Lorebook (The Archive)** — Persistent worldbuilding database auto-populated during story generation. Supports manual CRUD, inline editing, category grouping, and RAG-powered citation in chapters.
- **Visual Gallery** — Browse, filter, and manage all AI-generated character portraits and scene art with a lightbox viewer.
- **Collaboration Hub (The Crossroads)** — Discover and import public lorebooks; propose character crossovers with automatic conflict detection.
- **Configurable Writing Style** — Choose chapter length (short / medium / long / epic) and writing style (literary / cinematic / poetic / minimalist / pulp) per story session.

---

## Architecture

### Multi-Agent System (Google ADK)

```
root_agent (Orchestrator)
├── narrative_director   — Conjures worlds, generates chapters, auto-populates lore
├── world_architect      — Creates & validates lorebook entries
├── visual_artist        — Generates character portraits & scene illustrations (Imagen)
└── collaboration        — Handles lorebook sharing & crossover negotiation
```

- **Model**: Gemini 3 Flash Preview with configurable temperature (0.9 for narrative generation).
- **Agent Callbacks**: `before_agent_callback` (logging), `on_model_error_callback` (retry), `on_tool_error_callback` (graceful fallback).
- **A2A Protocol**: Full agent card with skills — `lorebook_sharing`, `character_crossover`, `story_generation`.

### Backend (FastAPI)

| Type | Description |
|------|-------------|
| **Type A** — REST | Direct Firestore CRUD: lorebooks, gallery, sessions, collaboration |
| **Type B** — SSE  | Agent-powered endpoints that stream ADK responses via Server-Sent Events |

**SSE Event Types**: `thinking`, `text_chunk`, `lore_cited`, `lorebook_updated`, `image_generated`, `done`

### Frontend (React)

| Layer     | Choice                              |
|-----------|-------------------------------------|
| Build     | Vite                                |
| Framework | React 19 + TypeScript               |
| Routing   | React Router v7                     |
| Styling   | CSS Modules + CSS Variables          |
| State     | Zustand                             |
| Animation | anime.js + @react-three/fiber       |

**Pages**: Dashboard (The Sanctum) · Story Studio (The Writing Desk) · Lorebook Editor (The Archive) · Visual Gallery (The Gallery of Visions) · Collaboration Hub (The Crossroads)

### Persistence

- **Firestore** — Lorebooks, lorebook entries, story sessions, chapters, gallery metadata.
- **Google Cloud Storage** — Generated images (Imagen output).

---

## Project Structure

```
lorepack/
├── app/
│   ├── agent.py                  # Root orchestrator agent
│   ├── agent_engine_app.py       # Agent Engine (A2A) entry point
│   ├── agents/
│   │   ├── narrative_director.py # Story conjuring & chapter generation
│   │   ├── world_architect.py    # Lorebook management & validation
│   │   ├── visual_artist.py      # Image generation agent
│   │   └── collaboration.py      # Sharing & crossover agent
│   ├── tools/
│   │   ├── story_tools.py        # Conjure, continue_story, chapter CRUD
│   │   ├── lorebook_tools.py     # Lorebook & entry CRUD
│   │   ├── image_tools.py        # Imagen generation & GCS upload
│   │   ├── rag_tools.py          # RAG search over lorebook entries
│   │   ├── collaboration_tools.py# Sharing & crossover tools
│   │   ├── session_tools.py      # Session management
│   │   ├── gcs_tools.py          # GCS utilities
│   │   └── user_context.py       # User context helpers
│   ├── api/
│   │   ├── main.py               # FastAPI app (CORS, routers)
│   │   ├── sse.py                # SSE runner for local dev
│   │   └── routers/              # REST & SSE endpoint routers
│   └── app_utils/                # Telemetry, deploy scripts, typing
├── frontend/
│   └── src/
│       └── pages/
│           ├── Dashboard.tsx      # The Sanctum — overview & activity
│           ├── StoryStudio.tsx    # The Writing Desk — conjure + chapters
│           ├── LorebookEditor.tsx # The Archive — lorebook management
│           ├── Gallery.tsx        # Gallery of Visions — image browser
│           └── Crossroads.tsx     # The Crossroads — collaboration hub
├── deployment/                    # Terraform & deployment configs
├── tests/                         # Unit, integration, and eval tests
├── FRONTEND_DESIGN.md             # Full frontend design specification
├── Makefile                       # Development commands
└── pyproject.toml                 # Python dependencies (uv)
```

---

## Getting Started

### Prerequisites

- **Python 3.13** — Required runtime
- **uv** — Python package manager ([install](https://docs.astral.sh/uv/getting-started/installation/))
- **Node.js 18+** — For the frontend
- **Google Cloud SDK** — For GCP services ([install](https://cloud.google.com/sdk/docs/install))
- **Google Cloud Project** with Firestore, Vertex AI, and Cloud Storage enabled

### Setup

```bash
# 1. Clone and install backend dependencies
git clone <repo-url> && cd lorepack
make install

# 2. Authenticate with Google Cloud
gcloud auth application-default login
gcloud config set project <your-project-id>

# 3. Install frontend dependencies
cd frontend && npm install && cd ..

# 4. Start the backend (FastAPI + ADK)
uv run uvicorn app.api.main:app --reload --port 8000

# 5. Start the frontend (in another terminal)
cd frontend && npm run dev
```

The frontend runs at `http://localhost:5173` and proxies API calls to the backend at `http://localhost:8000`.

### ADK Playground

To interact with the agents directly via the ADK web UI:

```bash
make playground
```

---

## Commands

| Command | Description |
|---------|-------------|
| `make install` | Install Python dependencies via uv |
| `make playground` | Launch ADK web playground |
| `make deploy` | Deploy agent to Vertex AI Agent Engine |
| `make inspector` | Launch A2A Protocol Inspector |
| `make test` | Run unit and integration tests |
| `make lint` | Run code quality checks (ruff, codespell, ty) |
| `make eval` | Run agent evaluation with ADK eval |
| `make setup-dev-env` | Provision dev infrastructure via Terraform |

---

## Deployment

```bash
gcloud config set project <your-project-id>
make deploy
```

This deploys the agent to **Vertex AI Agent Engine** with A2A protocol support. For full CI/CD setup:

```bash
uvx agent-starter-pack setup-cicd
```

See the [deployment guide](https://googlecloudplatform.github.io/agent-starter-pack/guide/deployment) for details.

---

## Key Technologies

- [Google ADK](https://github.com/google/adk-python) — Multi-agent orchestration framework
- [A2A Protocol](https://a2a-protocol.org/) — Agent-to-Agent interoperability
- [Gemini](https://ai.google.dev/) — LLM for story generation & orchestration
- [Imagen](https://cloud.google.com/vertex-ai/generative-ai/docs/image/overview) — AI image generation
- [Firestore](https://firebase.google.com/docs/firestore) — NoSQL persistence
- [FastAPI](https://fastapi.tiangolo.com/) — Backend REST/SSE gateway
- [React 19](https://react.dev/) + [Vite](https://vite.dev/) — Frontend framework
- [Agent Starter Pack](https://github.com/GoogleCloudPlatform/agent-starter-pack) — Project scaffolding & deployment

---

## License

Apache 2.0
