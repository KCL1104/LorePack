/* API response types — aligned with the FastAPI backend */

export interface Lorebook {
  id: string;
  title: string;
  genre: string;
  description: string;
  entry_count: number;
  updated_at: string;
}

export interface Entry {
  id: string;
  category: string;
  name: string;
  content: string;
  tags: string[];
  visibility: 'public' | 'private';
  created_at: string;
  source?: string;
  source_session_id?: string;
}

export interface EntryCreate {
  category: string;
  name: string;
  content: string;
  tags?: string[];
  visibility?: 'public' | 'private';
}

export interface LorebookDetail extends Omit<Lorebook, 'entry_count'> {
  entries: Entry[];
  created_at: string;
}

export interface EntryUpdate {
  category?: string;
  name?: string;
  content?: string;
  tags?: string[];
  visibility?: 'public' | 'private';
}

export interface ImageAsset {
  id: string;
  asset_type: 'character' | 'scene';
  lorebook_id?: string;
  character_name: string;
  scene_name: string;
  prompt_used: string;
  gs_uri: string;
  art_style: string;
  generated_at: string;
}

export interface ImageDetail extends ImageAsset {
  signed_url: string | null;
  pose?: string;
  mood?: string;
}

export interface SessionSummary {
  id: string;
  genre: string;
  world_era: string;
  world_essence: string[];
  protagonist_archetype: string;
  status: 'conjuring' | 'active' | 'completed';
  lorebook_id: string;
  created_at: string;
  updated_at: string;
}

export interface InlineImage {
  index: number;
  gs_uri: string;
  mime_type?: string;
  position?: number;
}

export interface Chapter {
  chapter_number: number;
  chapter_title: string;
  body: string;
  characters_featured: string[];
  lore_referenced: string[];
  inline_images?: InlineImage[];
}

export interface SessionDetail extends SessionSummary {
  protagonist_virtues: string[];
  protagonist_shadow: string;
  spark: string;
  chapters: Chapter[];
}

export interface ConjureParams {
  genre: string;
  world_era: string;
  world_essence: string[];
  protagonist_archetype: string;
  protagonist_virtues: string[];
  protagonist_shadow: string;
  spark?: string;
  chapter_length?: string;
  writing_style?: string;
}

export interface GenerateImageParams {
  lorebook_id: string;
  entry_name: string;
  art_style?: string;
  image_type?: 'character' | 'scene';
}

export interface PublicLorebook {
  id: string;
  title: string;
  genre: string;
  description: string;
  public_entry_count: number;
}

export interface ImportResult {
  lorebook_id: string;
  title: string;
  entries_imported: number;
  status: string;
}

export interface CrossoverProposal {
  source_lorebook_id: string;
  target_lorebook_id: string;
  characters: Entry[];
  not_found: string[];
  conflicts: string[];
  has_conflicts: boolean;
}

export interface CrossoverResult {
  target_lorebook_id: string;
  entries_copied: number;
  copied: { name: string; entry_id: string }[];
  status: string;
}

export interface LorebookValidation {
  lorebook_id: string;
  total_entries: number;
  issues_found: number;
  issues: string[];
  status: 'passed' | 'has_warnings';
}

export type EnrichTask = 'backstory' | 'expand' | 'relationships' | 'personality';

export interface SSEEvent {
  type: 'thinking' | 'text_chunk' | 'image_generated' | 'lore_cited' | 'lorebook_updated' | 'done';
  text?: string;
  full_text?: string;
  // lorebook_updated
  entry_name?: string;
  category?: string;
  // image_generated
  gs_uri?: string;
  mime_type?: string;
  index?: number;
  // lore_cited
  entries?: string[];
}

export interface Toast {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'info';
}

// A2A types

export interface AgentSkillSummary {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface A2AAgent {
  id: string;
  name: string;
  description: string;
  url: string;
  lorebook_id: string;
  skills: AgentSkillSummary[];
  status: 'active' | 'inactive';
}

export interface RemoteAgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  skills: AgentSkillSummary[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
}

export interface A2AInteractionResult {
  status: string;
  response: string;
}
