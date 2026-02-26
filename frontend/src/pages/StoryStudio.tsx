import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Canvas, useFrame } from '@react-three/fiber';
import { animate, stagger } from 'animejs';
import type { ShaderMaterial } from 'three';

import {
  conjureSession,
  getSession as fetchSessionDetail,
  listExampleStories,
  sendMessage,
  type ConjureParams,
  type ExampleStorySeed,
  type SSEEvent,
  type SessionDetail,
} from '../api';
import { Button, Card, Input, SectionHeader, Tag } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import styles from './StoryStudio.module.css';

interface SelectOption {
  id: string;
  label: string;
  description?: string;
}

interface ConjureForm {
  genre: string;
  customGenre: string;
  worldEra: string;
  customWorldEra: string;
  worldEssence: string[];
  customWorldEssence: string;
  protagonistArchetype: string;
  customProtagonistArchetype: string;
  protagonistVirtues: string[];
  customProtagonistVirtues: string;
  protagonistShadow: string;
  customProtagonistShadow: string;
  spark: string;
  chapterLength: string;
  writingStyle: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'system';
  text: string;
}

interface ChapterImage {
  gs_uri: string;
  mime_type: string;
  index: number;
}

interface ChapterSegment {
  id: string;
  title: string;
  body: string;
  loreRefs: string[];
  images: ChapterImage[];
}

interface LoreUpdate {
  id: string;
  entryName: string;
  category: string;
}

const STEP_TITLES = [
  'Choose Your Realm',
  'Shape the World',
  'Forge Your Protagonist',
  'The Spark',
];

const GENRES: SelectOption[] = [
  { id: 'dark_fantasy', label: 'Dark Fantasy', description: 'Haunted kingdoms and forbidden relics.' },
  { id: 'epic_fantasy', label: 'Epic Fantasy', description: 'Great empires, ancient oaths, sweeping destinies.' },
  { id: 'steampunk', label: 'Steampunk', description: 'Brass cities, alchemy engines, sky fleets.' },
  { id: 'sci_fi', label: 'Sci-Fi', description: 'Orbiting citadels and machine prophets.' },
  { id: 'cosmic_sci_fi', label: 'Cosmic Sci-Fi', description: 'Star empires, alien civilizations, the void between worlds.' },
  { id: 'mythic_horror', label: 'Mythic Horror', description: 'Eldritch truths beneath sacred traditions.' },
  { id: 'historical_arcana', label: 'Historical Arcana', description: 'Hidden magic threaded through real history.' },
  { id: 'alternate_history', label: 'Alternate History', description: 'History took a different turn. No magic — just a world that never was.' },
  { id: 'urban_fantasy', label: 'Urban Fantasy', description: 'Modern cities with supernatural undercurrents.' },
  { id: 'wuxia_xianxia', label: 'Wuxia / Xianxia', description: 'Martial arts, spiritual cultivation, heaven-defying heroes.' },
  { id: 'custom', label: 'Custom', description: 'Forge your own path...' },
];

const WORLD_ERAS: SelectOption[] = [
  { id: 'medieval', label: 'Medieval' },
  { id: 'futuristic', label: 'Futuristic' },
  { id: 'post_apocalyptic', label: 'Post-Apocalyptic' },
  { id: 'victorian', label: 'Victorian' },
  { id: 'ancient', label: 'Ancient' },
  { id: 'cosmic', label: 'Cosmic' },
  { id: 'mythological', label: 'Mythological' },
  { id: 'custom', label: 'Custom' },
];

const WORLD_ESSENCES: SelectOption[] = [
  { id: 'sword_and_sorcery', label: 'Sword & Sorcery' },
  { id: 'eldritch_horror', label: 'Eldritch Horror' },
  { id: 'political_intrigue', label: 'Political Intrigue' },
  { id: 'survival', label: 'Survival' },
  { id: 'exploration', label: 'Exploration' },
  { id: 'prophecy_and_destiny', label: 'Prophecy & Destiny' },
  { id: 'custom', label: 'Custom' },
];

const ARCHETYPES: SelectOption[] = [
  { id: 'seer', label: 'The Seer', description: 'Burdened by visions others cannot bear.' },
  { id: 'warrior', label: 'The Warrior', description: 'A blade shaped by duty and old scars.' },
  { id: 'scholar', label: 'The Scholar', description: 'Keeper of dangerous and forgotten knowledge.' },
  { id: 'trickster', label: 'The Trickster', description: 'A smiling force that bends fate sideways.' },
  { id: 'outcast', label: 'The Outcast', description: 'Rejected by the world, chosen by destiny.' },
  { id: 'custom', label: 'Custom', description: 'A unique soul, defying fate and classification.' },
];

const VIRTUES: SelectOption[] = [
  { id: 'cunning', label: 'Cunning' },
  { id: 'loyal', label: 'Loyal' },
  { id: 'fearless', label: 'Fearless' },
  { id: 'empathic', label: 'Empathic' },
  { id: 'resolute', label: 'Resolute' },
  { id: 'curious', label: 'Curious' },
  { id: 'charismatic', label: 'Charismatic' },
  { id: 'patient', label: 'Patient' },
  { id: 'custom', label: 'Custom' },
];

const SHADOWS: SelectOption[] = [
  { id: 'hubris', label: 'Hubris' },
  { id: 'grief', label: 'Grief' },
  { id: 'distrust', label: 'Distrust' },
  { id: 'wrath', label: 'Wrath' },
  { id: 'obsession', label: 'Obsession' },
  { id: 'guilt', label: 'Guilt' },
  { id: 'isolation', label: 'Isolation' },
  { id: 'apathy', label: 'Apathy' },
  { id: 'custom', label: 'Custom' },
];

const CHAPTER_LENGTHS: SelectOption[] = [
  { id: 'short', label: 'Short', description: '~500 words per chapter' },
  { id: 'medium', label: 'Medium', description: '~1000 words per chapter' },
  { id: 'long', label: 'Long', description: '~2000 words per chapter' },
];

const WRITING_STYLES: SelectOption[] = [
  { id: 'literary_fiction', label: 'Literary Fiction', description: 'Nuanced prose with psychological depth.' },
  { id: 'light_novel', label: 'Light Novel', description: 'Dialogue-driven, fast-paced, character-centric.' },
  { id: 'epic_fantasy', label: 'Epic Fantasy', description: 'Rich descriptions, grand scale, formal tone.' },
  { id: 'pulp_adventure', label: 'Pulp Adventure', description: 'Action-forward, vivid, cinematic pacing.' },
  { id: 'poetic_prose', label: 'Poetic Prose', description: 'Lyrical, metaphor-rich, atmospheric.' },
];

const DEFAULT_SPARKS = [
  'An eclipse seals the city gates, and only one bloodline can open them again.',
  'A forbidden atlas reveals lands that appear only when no one remembers them.',
  'A royal heir wakes with memories of a war that has not happened yet.',
  'A pact-bound guardian breaks their oath to save the one person they should never trust.',
  'An ancient observatory begins naming citizens in its prophecies, one per night.',
  'A forgotten god asks the protagonist for sanctuary in exchange for a single miracle.',
];

const INITIAL_FORM: ConjureForm = {
  genre: '',
  customGenre: '',
  worldEra: '',
  customWorldEra: '',
  worldEssence: [],
  customWorldEssence: '',
  protagonistArchetype: '',
  customProtagonistArchetype: '',
  protagonistVirtues: [],
  customProtagonistVirtues: '',
  protagonistShadow: '',
  customProtagonistShadow: '',
  spark: '',
  chapterLength: 'medium',
  writingStyle: 'literary_fiction',
};

function formatLabel(value: string): string {
  if (!value) return 'Unset';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function InkDiffusionField() {
  const materialRef = useRef<ShaderMaterial>(null);

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <planeGeometry args={[5.4, 3.4]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform float uTime;

          // 2D Random
          float random(vec2 st) {
              return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
          }

          // 2D Noise
          float noise(vec2 st) {
              vec2 i = floor(st);
              vec2 f = fract(st);

              float a = random(i);
              float b = random(i + vec2(1.0, 0.0));
              float c = random(i + vec2(0.0, 1.0));
              float d = random(i + vec2(1.0, 1.0));

              vec2 u = f * f * (3.0 - 2.0 * f);

              return mix(a, b, u.x) +
                      (c - a)* u.y * (1.0 - u.x) +
                      (d - b) * u.x * u.y;
          }

          // Fractional Brownian Motion
          float fbm(vec2 st) {
              float value = 0.0;
              float amplitude = 0.5;
              vec2 shift = vec2(100.0);
              // Rotate to reduce axial bias
              mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
              for (int i = 0; i < 5; i++) {
                  value += amplitude * noise(st);
                  st = rot * st * 2.0 + shift;
                  amplitude *= 0.5;
              }
              return value;
          }

          void main() {
            vec2 center = vec2(0.5, 0.5);
            float dist = distance(vUv, center);
            
            // Generate flowing organic fBM noise
            vec2 q = vec2(0.);
            q.x = fbm(vUv * 3.0 + 0.00 * uTime);
            q.y = fbm(vUv * 3.0 + vec2(1.0));

            vec2 r = vec2(0.);
            r.x = fbm(vUv * 3.0 + 1.0 * q + vec2(1.7, 9.2) + 0.15 * uTime);
            r.y = fbm(vUv * 3.0 + 1.0 * q + vec2(8.3, 2.8) + 0.126 * uTime);

            float f = fbm(vUv * 3.0 + r);

            // Shape it into a central expanding vignette/blob
            float radial = smoothstep(1.0, 0.1, dist);
            
            // Mix noise with radial gradient
            float alpha = clamp(radial * f * 2.5, 0.0, 1.0);
            
            // Gold ink mixed with dark void
            vec3 darkInk = vec3(0.04, 0.04, 0.06);
            vec3 goldInk = vec3(0.77, 0.64, 0.40);
            
            vec3 color = mix(darkInk, goldInk, clamp(f * f * 1.8, 0.0, 1.0));

            gl_FragColor = vec4(color, alpha * 0.90);
          }
        `}
      />
    </mesh>
  );
}

export default function StoryStudio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [phase, setPhase] = useState<'select' | 'conjure' | 'desk'>('select');
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<ConjureForm>(INITIAL_FORM);
  const [exampleStories, setExampleStories] = useState<ExampleStorySeed[]>([]);

  const [sessionId, setSessionId] = useState('');
  const [lorebookId, setLorebookId] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState('Awaiting your conjuration parameters.');
  const [error, setError] = useState<string | null>(null);

  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chapters, setChapters] = useState<ChapterSegment[]>([]);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [loreUpdates, setLoreUpdates] = useState<LoreUpdate[]>([]);
  const [messageDraft, setMessageDraft] = useState('');

  const [stepTransitioning, setStepTransitioning] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [worldApproved, setWorldApproved] = useState(true);
  const [worldPreview, setWorldPreview] = useState<{
    text: string;
    loreRefs: string[];
    images: ChapterImage[];
  } | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);

  const stepDirectionRef = useRef(1);
  const previousStepRef = useRef(0);
  const idCounterRef = useRef(0);
  const autoResumeAttempted = useRef(false);

  const sessions = useAppStore((state) => state.sessions);
  const fetchSessions = useAppStore((state) => state.fetchSessions);
  const fetchSession = useAppStore((state) => state.fetchSession);
  const setSidebarDimmed = useAppStore((state) => state.setSidebarDimmed);
  const addToast = useAppStore((state) => state.addToast);

  // Load sessions on mount for the select phase
  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    let cancelled = false;

    const loadExampleStories = async () => {
      try {
        const seeds = await listExampleStories();
        if (!cancelled) {
          setExampleStories(seeds);
        }
      } catch {
        if (!cancelled) {
          setExampleStories([]);
        }
      }
    };

    void loadExampleStories();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-resume from ?session= query param (e.g. clicked from Dashboard)
  useEffect(() => {
    if (autoResumeAttempted.current) return;
    const resumeId = searchParams.get('session');
    if (!resumeId) return;

    autoResumeAttempted.current = true;
    void handleResumeSession(resumeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Dim sidebar during conjure phase
  useEffect(() => {
    setSidebarDimmed(phase === 'conjure');
    return () => setSidebarDimmed(false);
  }, [phase, setSidebarDimmed]);

  const handleResumeSession = async (sid: string) => {
    setLoadingSession(true);
    setError(null);
    try {
      const detail: SessionDetail = await fetchSessionDetail(sid);
      setSessionId(detail.id);
      setLorebookId(detail.lorebook_id);

      // Populate form context from session data
      setForm((prev) => ({
        ...prev,
        genre: detail.genre || prev.genre,
        worldEra: detail.world_era || prev.worldEra,
        protagonistArchetype: detail.protagonist_archetype || prev.protagonistArchetype,
        protagonistShadow: detail.protagonist_shadow || prev.protagonistShadow,
        protagonistVirtues: detail.protagonist_virtues?.length ? detail.protagonist_virtues : prev.protagonistVirtues,
      }));

      // Load chapters from backend
      if (detail.chapters && detail.chapters.length > 0) {
        setChapters(
          detail.chapters.map((ch, idx) => ({
            id: createId('chapter'),
            title: ch.chapter_title || `Chapter ${ch.chapter_number || idx + 1}`,
            body: ch.body,
            loreRefs: ch.lore_referenced || [],
            images: (ch.inline_images || []).map((img) => ({
              gs_uri: img.gs_uri,
              mime_type: img.mime_type || 'image/png',
              index: img.index,
            })),
          })),
        );
      }

      setWorldApproved(true);
      setPhase('desk');
      setStatusText('Session resumed. The Narrative Director awaits your next instruction.');
      addToast({ variant: 'success', message: `Resumed: ${formatLabel(detail.genre)} · ${formatLabel(detail.world_era)}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load session.';
      setError(msg);
      addToast({ variant: 'error', message: msg });
    } finally {
      setLoadingSession(false);
      // Clear the query param
      setSearchParams({}, { replace: true });
    }
  };

  const canProceedStep = useMemo(() => {
    if (stepIndex === 0) return Boolean(form.genre) && (form.genre !== 'custom' || Boolean(form.customGenre.trim()));
    if (stepIndex === 1) {
      const eraValid = Boolean(form.worldEra) && (form.worldEra !== 'custom' || Boolean(form.customWorldEra.trim()));
      const essenceValid = form.worldEssence.length > 0 && (!form.worldEssence.includes('custom') || Boolean(form.customWorldEssence.trim()));
      return eraValid && essenceValid;
    }
    if (stepIndex === 2) {
      const archetypeValid = Boolean(form.protagonistArchetype) && (form.protagonistArchetype !== 'custom' || Boolean(form.customProtagonistArchetype.trim()));
      const virtuesValid = form.protagonistVirtues.length > 0 && (!form.protagonistVirtues.includes('custom') || Boolean(form.customProtagonistVirtues.trim()));
      const shadowValid = Boolean(form.protagonistShadow) && (form.protagonistShadow !== 'custom' || Boolean(form.customProtagonistShadow.trim()));
      return archetypeValid && virtuesValid && shadowValid;
    }
    return true;
  }, [form, stepIndex]);

  const selectedChapter = chapters[activeChapterIndex] || null;

  const createId = (prefix: string): string => {
    const next = idCounterRef.current;
    idCounterRef.current += 1;
    return `${prefix}-${next}`;
  };

  useEffect(() => {
    if (phase !== 'conjure') return;

    const panel = document.querySelector('[data-step-panel]');
    const cards = document.querySelectorAll('[data-step-item]');
    const indicators = document.querySelectorAll('[data-step-indicator]');
    const direction = stepDirectionRef.current;

    const panelAnimation = panel
      ? animate(panel, {
        opacity: [0, 1],
        translateX: [direction > 0 ? 24 : -24, 0],
        duration: 420,
        ease: 'outQuad',
      })
      : null;

    const cardAnimation = animate(cards, {
      opacity: [0, 1],
      translateX: [direction > 0 ? 18 : -18, 0],
      delay: stagger(38),
      duration: 380,
      ease: 'outQuad',
    });

    const activeIndicator = indicators.item(stepIndex);
    const indicatorAnimation = activeIndicator
      ? animate(activeIndicator, {
        scale: [1, 1.2, 1],
        boxShadow: ['0 0 0 0 rgba(196, 162, 101, 0)', '0 0 12px 2px rgba(196, 162, 101, 0.5)', '0 0 0 0 rgba(196, 162, 101, 0)'],
        duration: 360,
        ease: 'outQuad',
      })
      : null;

    previousStepRef.current = stepIndex;

    return () => {
      panelAnimation?.pause();
      cardAnimation.pause();
      indicatorAnimation?.pause();
    };
  }, [phase, stepIndex]);

  useEffect(() => {
    if (phase !== 'desk') return;
    const targets = document.querySelectorAll('[data-desk-reveal]');
    const animation = animate(targets, {
      opacity: [0, 1],
      translateY: [20, 0],
      delay: stagger(100, { start: 80 }),
      duration: 460,
      ease: 'outQuad',
    });

    return () => {
      animation.pause();
    };
  }, [phase]);

  useEffect(() => {
    if (chatLog.length === 0) return;
    const latest = chatLog[chatLog.length - 1];
    const target = document.querySelector(`[data-chat-id="${latest.id}"]`);
    if (!target) return;

    const animation = animate(target, {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 260,
      ease: 'outQuad',
    });

    return () => {
      animation.pause();
    };
  }, [chatLog]);

  useEffect(() => {
    if (chapters.length > 0) {
      setActiveChapterIndex(chapters.length - 1);
    }
  }, [chapters.length]);

  const updateForm = <K extends keyof ConjureForm>(key: K, value: ConjureForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleMultiValue = (
    values: string[],
    nextValue: string,
    maxSelected: number,
  ): string[] => {
    if (values.includes(nextValue)) {
      return values.filter((value) => value !== nextValue);
    }
    if (values.length >= maxSelected) {
      return values;
    }
    return [...values, nextValue];
  };

  const appendChatMessage = (message: ChatMessage) => {
    setChatLog((prev) => [...prev, message]);
  };

  const updateChatMessageText = (messageId: string, text: string) => {
    setChatLog((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, text } : msg)),
    );
  };

  const recordLoreUpdate = (event: SSEEvent) => {
    const entryName = event.entry_name;
    if (!entryName) return;
    const category = event.category || 'other';
    const refText = `${entryName} (${category})`;

    setLoreUpdates((prev) => [
      { id: createId('lore'), entryName, category },
      ...prev,
    ].slice(0, 12));

    appendChatMessage({
      id: createId('sys'),
      role: 'system',
      text: `✦ Lorebook updated: ${refText}`,
    });
  };

  const consumeStoryStream = async (
    stream: AsyncGenerator<SSEEvent>,
    aiMessageId: string,
    mode: 'conjure' | 'review' | 'chapter',
  ) => {
    let streamBuffer = '';
    const streamLoreRefs = new Set<string>();
    const streamImages: ChapterImage[] = [];
    let completed = false;

    try {
      for await (const event of stream) {
        if (event.type === 'error') {
          throw new Error(event.message || 'Narrative stream failed.');
        }

        if (event.type === 'thinking') {
          if (event.text) setStatusText(event.text);
        }

        if (event.type === 'text_chunk' && event.text) {
          streamBuffer += event.text;
          updateChatMessageText(aiMessageId, streamBuffer);
        }

        if (event.type === 'lore_cited' && event.entries) {
          for (const name of event.entries) {
            streamLoreRefs.add(name);
          }
        }

        if (event.type === 'lorebook_updated') {
          recordLoreUpdate(event);
        }

        if (event.type === 'image_generated' && event.gs_uri) {
          streamImages.push({
            gs_uri: event.gs_uri,
            mime_type: event.mime_type || 'image/png',
            index: event.index ?? streamImages.length,
          });
        }

        if (event.type === 'done') {
          completed = true;
          const finalText = (event.full_text || streamBuffer).trim();
          updateChatMessageText(aiMessageId, finalText || 'No response text was returned by the director.');

          if (finalText) {
            if (mode === 'conjure') {
              setWorldPreview({
                text: finalText,
                loreRefs: Array.from(streamLoreRefs),
                images: streamImages,
              });
            } else if (mode === 'chapter') {
              setChapters((prev) => [
                ...prev,
                {
                  id: createId('chapter'),
                  title: `Chapter ${Math.max(prev.length, 1)}`,
                  body: finalText,
                  loreRefs: Array.from(streamLoreRefs),
                  images: streamImages,
                },
              ]);
            }
            // mode === 'review' → chat-only, no chapter or preview mutation
          }

          if (mode === 'conjure') {
            setStatusText('World conjured. Review the lore, then approve or request changes.');
            addToast({ variant: 'success', message: 'World conjured successfully! Review and approve to begin.' });
          } else if (mode === 'chapter') {
            setStatusText('The Narrative Director awaits your next instruction.');
            addToast({ variant: 'success', message: `Chapter generated successfully!` });
          } else {
            setStatusText('The Narrative Director awaits your next instruction.');
          }
          break;
        }
      }
    } catch (streamError) {
      if (streamBuffer.trim()) {
        updateChatMessageText(aiMessageId, streamBuffer.trim());
        addToast({ variant: 'info', message: 'Connection interrupted. Partial response was preserved.' });
      }
      throw streamError;
    }

    if (!completed) {
      if (streamBuffer.trim()) {
        updateChatMessageText(aiMessageId, streamBuffer.trim());
      }
      throw new Error('Stream ended before completion. Please retry.');
    }
  };

  const resolveCustomSingle = (val: string, customVal: string) => {
    return val === 'custom' && customVal.trim() ? customVal.trim() : val;
  };

  const resolveCustomMulti = (vals: string[], customVal: string) => {
    return vals.map(v => v === 'custom' && customVal.trim() ? customVal.trim() : v).filter(Boolean);
  };

  const getConjurePayload = (): ConjureParams => ({
    genre: resolveCustomSingle(form.genre, form.customGenre),
    world_era: resolveCustomSingle(form.worldEra, form.customWorldEra),
    world_essence: resolveCustomMulti(form.worldEssence, form.customWorldEssence),
    protagonist_archetype: resolveCustomSingle(form.protagonistArchetype, form.customProtagonistArchetype),
    protagonist_virtues: resolveCustomMulti(form.protagonistVirtues, form.customProtagonistVirtues),
    protagonist_shadow: resolveCustomSingle(form.protagonistShadow, form.customProtagonistShadow),
    spark: form.spark.trim() || undefined,
    chapter_length: form.chapterLength,
    writing_style: form.writingStyle.replace(/_/g, ' '),
  });

  const handleBeginTale = async () => {
    if (!canProceedStep || stepTransitioning) return;

    setError(null);
    setStatusText('Preparing conjuration ritual...');

    // Animate conjure panel exit
    const panelElements = document.querySelectorAll('[data-step-panel], [data-step-item], [data-step-indicator]');
    if (panelElements.length > 0) {
      await new Promise<void>((resolve) => {
        animate(panelElements, {
          opacity: [1, 0],
          translateY: [0, -20],
          delay: stagger(30),
          duration: 320,
          ease: 'inQuad',
          onComplete: () => resolve(),
        });
      });
    }

    setPhase('desk');
    setContextCollapsed(false);
    setWorldApproved(false);
    setWorldPreview(null);
    setIsGenerating(true);

    const aiMessageId = createId('ai');
    setChatLog([{ id: aiMessageId, role: 'ai', text: '' }]);

    let openedSessionId = '';

    try {
      const stream = conjureSession(getConjurePayload(), {
        onOpen: (response) => {
          openedSessionId = response.headers.get('X-Session-Id') || '';
          const openedLorebookId = response.headers.get('X-Lorebook-Id') || '';
          if (openedSessionId) setSessionId(openedSessionId);
          if (openedLorebookId) setLorebookId(openedLorebookId);
        },
      });

      await consumeStoryStream(stream, aiMessageId, 'conjure');

      if (openedSessionId) {
        await fetchSession(openedSessionId);
      }
      await fetchSessions();
    } catch (streamError) {
      const message = streamError instanceof Error ? streamError.message : 'Conjuration failed.';
      setError(message);
      appendChatMessage({ id: createId('sys'), role: 'system', text: `Conjuration failed: ${message}` });
      setStatusText('Conjuration interrupted. You may retry.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendDirection = async () => {
    const trimmed = messageDraft.trim();
    if (!trimmed || !sessionId || isGenerating) return;

    setError(null);
    setMessageDraft('');
    setIsGenerating(true);
    setStatusText('Sending direction to the Narrative Director...');

    appendChatMessage({ id: createId('user'), role: 'user', text: trimmed });
    const aiMessageId = createId('ai');
    appendChatMessage({ id: aiMessageId, role: 'ai', text: '' });

    try {
      await consumeStoryStream(sendMessage(sessionId, trimmed), aiMessageId, worldApproved ? 'chapter' : 'review');
      await fetchSession(sessionId);
      await fetchSessions();
    } catch (streamError) {
      const message = streamError instanceof Error ? streamError.message : 'Message streaming failed.';
      setError(message);
      appendChatMessage({ id: createId('sys'), role: 'system', text: `Message failed: ${message}` });
      setStatusText('Transmission interrupted.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveWorld = async () => {
    if (!sessionId || isGenerating) return;

    if (worldPreview) {
      setChapters((prev) => [
        {
          id: createId('chapter'),
          title: 'Prologue — World Conjuration',
          body: worldPreview.text,
          loreRefs: worldPreview.loreRefs,
          images: worldPreview.images,
        },
        ...prev,
      ]);
      setWorldPreview(null);
    }

    setWorldApproved(true);
    setError(null);
    setIsGenerating(true);
    setStatusText('The Narrative Director begins your tale...');

    const beginText = 'The world is approved. Begin writing the first chapter.';
    appendChatMessage({ id: createId('user'), role: 'user', text: beginText });
    const aiMessageId = createId('ai');
    appendChatMessage({ id: aiMessageId, role: 'ai', text: '' });

    try {
      await consumeStoryStream(sendMessage(sessionId, beginText), aiMessageId, 'chapter');
      await fetchSession(sessionId);
      await fetchSessions();
    } catch (streamError) {
      const message = streamError instanceof Error ? streamError.message : 'Failed to begin chapter.';
      setError(message);
      appendChatMessage({ id: createId('sys'), role: 'system', text: `Error: ${message}` });
      setStatusText('Chapter generation interrupted.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStepChange = (nextStep: number) => {
    if (nextStep === stepIndex || stepTransitioning) return;
    const direction = nextStep > previousStepRef.current ? 1 : -1;
    stepDirectionRef.current = direction;
    setStepTransitioning(true);

    const cards = document.querySelectorAll('[data-step-item]');
    const panel = document.querySelector('[data-step-panel]');

    const targets = [...(panel ? [panel] : []), ...Array.from(cards)];
    if (targets.length > 0) {
      animate(targets, {
        opacity: [1, 0],
        translateX: [0, direction > 0 ? -24 : 24],
        delay: stagger(30),
        duration: 200,
        ease: 'inQuad',
        onComplete: () => {
          setStepIndex(nextStep);
          setStepTransitioning(false);
        },
      });
    } else {
      setStepIndex(nextStep);
      setStepTransitioning(false);
    }
  };

  const handleRandomSpark = () => {
    if (exampleStories.length > 0) {
      const seed = exampleStories[Math.floor(Math.random() * exampleStories.length)];
      setForm((prev) => ({
        ...prev,
        genre: seed.genre,
        customGenre: '',
        worldEra: seed.world_era,
        customWorldEra: '',
        worldEssence: [...seed.world_essence],
        customWorldEssence: '',
        protagonistArchetype: seed.protagonist_archetype,
        customProtagonistArchetype: '',
        protagonistVirtues: [...seed.protagonist_virtues],
        customProtagonistVirtues: '',
        protagonistShadow: seed.protagonist_shadow,
        customProtagonistShadow: '',
        spark: seed.spark,
        chapterLength: seed.chapter_length,
        writingStyle: seed.writing_style,
      }));
      addToast({ variant: 'info', message: `Loaded example seed: ${seed.title}` });
      return;
    }

    const index = Math.floor(Math.random() * DEFAULT_SPARKS.length);
    updateForm('spark', DEFAULT_SPARKS[index]);
  };

  const renderConjureStep = () => {
    if (stepIndex === 0) {
      return (
        <div className={styles.optionGridLarge}>
          {GENRES.map((genre) => (
            <Card
              key={genre.id}
              className={`${styles.optionCard}${form.genre === genre.id ? ` ${styles.optionCardSelected}` : ''}`}
              onClick={() => updateForm('genre', genre.id)}
              data-step-item
            >
              <h3 className={styles.optionTitle}>{genre.label}</h3>
              <p className={styles.optionDescription}>{genre.description}</p>
            </Card>
          ))}
          {form.genre === 'custom' && (
            <div style={{ gridColumn: '1 / -1', marginTop: 'var(--space-md)' }}>
              <Input
                value={form.customGenre}
                onChange={(event) => updateForm('customGenre', event.target.value)}
                placeholder="Describe your custom genre..."
                autoFocus
              />
            </div>
          )}
        </div>
      );
    }

    if (stepIndex === 1) {
      return (
        <div className={styles.stepSplit}>
          <div>
            <p className={styles.blockLabel}>Era (single-select)</p>
            <div className={styles.optionGridCompact}>
              {WORLD_ERAS.map((era) => (
                <Card
                  key={era.id}
                  className={`${styles.optionCardCompact}${form.worldEra === era.id ? ` ${styles.optionCardSelected}` : ''}`}
                  onClick={() => updateForm('worldEra', era.id)}
                  data-step-item
                >
                  {era.label}
                </Card>
              ))}
            </div>
            {form.worldEra === 'custom' && (
              <div style={{ marginTop: 'var(--space-md)' }}>
                <Input
                  value={form.customWorldEra}
                  onChange={(event) => updateForm('customWorldEra', event.target.value)}
                  placeholder="Describe your custom era..."
                  autoFocus
                />
              </div>
            )}
          </div>

          <div>
            <p className={styles.blockLabel}>Essence (multi-select, up to 3)</p>
            <div className={styles.tagRow}>
              {WORLD_ESSENCES.map((essence) => (
                <Tag
                  key={essence.id}
                  label={essence.label}
                  selected={form.worldEssence.includes(essence.id)}
                  onClick={() =>
                    updateForm('worldEssence', toggleMultiValue(form.worldEssence, essence.id, 3))
                  }
                />
              ))}
            </div>
            {form.worldEssence.includes('custom') && (
              <div style={{ marginTop: 'var(--space-md)' }}>
                <Input
                  value={form.customWorldEssence}
                  onChange={(event) => updateForm('customWorldEssence', event.target.value)}
                  placeholder="Describe your custom essence..."
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (stepIndex === 2) {
      return (
        <div className={styles.stepSplit}>
          <div>
            <p className={styles.blockLabel}>Archetype</p>
            <div className={styles.optionGridLarge}>
              {ARCHETYPES.map((archetype) => (
                <Card
                  key={archetype.id}
                  className={`${styles.optionCard}${form.protagonistArchetype === archetype.id ? ` ${styles.optionCardSelected}` : ''}`}
                  onClick={() => updateForm('protagonistArchetype', archetype.id)}
                  data-step-item
                >
                  <h3 className={styles.optionTitle}>{archetype.label}</h3>
                  <p className={styles.optionDescription}>{archetype.description}</p>
                </Card>
              ))}
            </div>
            {form.protagonistArchetype === 'custom' && (
              <div style={{ marginTop: 'var(--space-md)' }}>
                <Input
                  value={form.customProtagonistArchetype}
                  onChange={(event) => updateForm('customProtagonistArchetype', event.target.value)}
                  placeholder="Describe your custom archetype..."
                  autoFocus
                />
              </div>
            )}
          </div>

          <div>
            <p className={styles.blockLabel}>Virtues (up to 3)</p>
            <div className={styles.tagRow}>
              {VIRTUES.map((virtue) => (
                <Tag
                  key={virtue.id}
                  label={virtue.label}
                  selected={form.protagonistVirtues.includes(virtue.id)}
                  onClick={() =>
                    updateForm(
                      'protagonistVirtues',
                      toggleMultiValue(form.protagonistVirtues, virtue.id, 3),
                    )
                  }
                />
              ))}
            </div>
            {form.protagonistVirtues.includes('custom') && (
              <div style={{ marginTop: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                <Input
                  value={form.customProtagonistVirtues}
                  onChange={(event) => updateForm('customProtagonistVirtues', event.target.value)}
                  placeholder="Describe a custom virtue..."
                  autoFocus
                />
              </div>
            )}

            <p className={styles.blockLabel}>Shadow (single-select)</p>
            <div className={styles.tagRow}>
              {SHADOWS.map((shadow) => (
                <Tag
                  key={shadow.id}
                  label={shadow.label}
                  variant="crimson"
                  selected={form.protagonistShadow === shadow.id}
                  onClick={() => updateForm('protagonistShadow', shadow.id)}
                />
              ))}
            </div>
            {form.protagonistShadow === 'custom' && (
              <div style={{ marginTop: 'var(--space-md)' }}>
                <Input
                  value={form.customProtagonistShadow}
                  onChange={(event) => updateForm('customProtagonistShadow', event.target.value)}
                  placeholder="Describe a custom shadow..."
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={styles.stepSplit}>
        <div>
          <p className={styles.blockLabel}>Story Spark</p>
          <Input
            value={form.spark}
            onChange={(event) => updateForm('spark', event.target.value)}
            placeholder="Describe the event that ignites your tale..."
            multiline
            rows={5}
          />

          <div className={styles.sparkActions}>
            <Button variant="ghost" onClick={handleRandomSpark}>
              Fate&apos;s Hand
            </Button>
          </div>

          <p className={styles.blockLabel}>Chapter Length</p>
          <div className={styles.tagRow}>
            {CHAPTER_LENGTHS.map((opt) => (
              <Tag
                key={opt.id}
                label={`${opt.label} (${opt.description})`}
                selected={form.chapterLength === opt.id}
                onClick={() => updateForm('chapterLength', opt.id)}
              />
            ))}
          </div>

          <p className={styles.blockLabel}>Writing Style</p>
          <div className={styles.tagRow}>
            {WRITING_STYLES.map((opt) => (
              <Tag
                key={opt.id}
                label={opt.label}
                selected={form.writingStyle === opt.id}
                onClick={() => updateForm('writingStyle', opt.id)}
              />
            ))}
          </div>
        </div>

        <Card hoverable={false} className={styles.summaryCard}>
          <p className={styles.blockLabel}>Conjuration Summary</p>
          <ul className={styles.summaryList}>
            <li><strong>Genre:</strong> {formatLabel(form.genre)} {form.genre === 'custom' && form.customGenre ? `(${form.customGenre})` : ''}</li>
            <li><strong>Era:</strong> {formatLabel(form.worldEra)} {form.worldEra === 'custom' && form.customWorldEra ? `(${form.customWorldEra})` : ''}</li>
            <li><strong>Essence:</strong> {form.worldEssence.map(formatLabel).join(', ') || 'Unset'} {form.worldEssence.includes('custom') && form.customWorldEssence ? `(${form.customWorldEssence})` : ''}</li>
            <li><strong>Archetype:</strong> {formatLabel(form.protagonistArchetype)} {form.protagonistArchetype === 'custom' && form.customProtagonistArchetype ? `(${form.customProtagonistArchetype})` : ''}</li>
            <li><strong>Virtues:</strong> {form.protagonistVirtues.map(formatLabel).join(', ') || 'Unset'} {form.protagonistVirtues.includes('custom') && form.customProtagonistVirtues ? `(${form.customProtagonistVirtues})` : ''}</li>
            <li><strong>Shadow:</strong> {formatLabel(form.protagonistShadow)} {form.protagonistShadow === 'custom' && form.customProtagonistShadow ? `(${form.customProtagonistShadow})` : ''}</li>
            <li><strong>Length:</strong> {formatLabel(form.chapterLength)}</li>
            <li><strong>Style:</strong> {formatLabel(form.writingStyle)}</li>
          </ul>
        </Card>
      </div>
    );
  };

  const renderChapterBody = (text: string, chapterImages: ChapterImage[] = []) => {
    // Split on [illustration:N] markers and paragraph breaks
    const segments = text.split(/(\[illustration:\d+\])/g);
    return segments.map((segment, idx) => {
      const illustrationMatch = segment.match(/^\[illustration:(\d+)\]$/);
      if (illustrationMatch) {
        const imgIdx = parseInt(illustrationMatch[1], 10);
        const img = chapterImages.find((i) => i.index === imgIdx);
        return (
          <div key={`ill-${idx}`} className={styles.illustrationPlaceholder}>
            {img ? (
              <p className={styles.illustrationLabel}>Scene illustration generated</p>
            ) : (
              <p className={styles.illustrationLabel}>Illustration {imgIdx + 1}</p>
            )}
          </div>
        );
      }
      // Render paragraphs from double newlines
      const paragraphs = segment.split(/\n\n+/).filter((p) => p.trim());
      return paragraphs.map((para, pIdx) => (
        <p key={`p-${idx}-${pIdx}`} className={styles.chapterParagraph}>{para}</p>
      ));
    });
  };

  return (
    <div className={styles.page}>
      {isGenerating && phase === 'desk' ? (
        <div className={styles.inkLayer} aria-hidden="true">
          <Canvas camera={{ position: [0, 0, 2.2], fov: 50 }} dpr={[1, 1.5]}>
            <InkDiffusionField />
          </Canvas>
          <div className={styles.loadingOverlay}>
            <span className={styles.loadingIcon}>✦</span>
            <p className={styles.loadingText}>{statusText}</p>
          </div>
        </div>
      ) : null}

      {phase === 'select' ? (
        <section className={styles.conjurePanel}>
          <header className={styles.header}>
            <p className={styles.kicker}>The Writing Desk</p>
            <h1 className={styles.title}>Story Studio</h1>
            <p className={styles.subtitle}>
              Begin a new tale from scratch, or continue weaving an existing story.
            </p>
          </header>

          {error ? <div className={styles.errorBanner}>{error}</div> : null}
          {loadingSession ? (
            <Card hoverable={false} className={styles.stepCard}>
              <p className={styles.placeholderText}>Loading session…</p>
            </Card>
          ) : (
            <>
              <div className={styles.selectGrid}>
                <Card className={styles.selectCard} onClick={() => setPhase('conjure')}>
                  <span className={styles.selectIcon}>✦</span>
                  <h3 className={styles.selectCardTitle}>Begin a New Tale</h3>
                  <p className={styles.selectCardDesc}>
                    Conjure a fresh world with genre, era, protagonist, and spark.
                  </p>
                </Card>

                <Card hoverable={false} className={styles.selectCard}>
                  <span className={styles.selectIcon}>↻</span>
                  <h3 className={styles.selectCardTitle}>Continue an Existing Tale</h3>
                  <p className={styles.selectCardDesc}>
                    Resume a previous story session and keep writing.
                  </p>
                </Card>
              </div>

              {sessions.length > 0 ? (
                <div className={styles.sessionList}>
                  <SectionHeader title="Your Stories" />
                  {sessions.map((s) => (
                    <Card
                      key={s.id}
                      className={styles.sessionRow}
                      onClick={() => { void handleResumeSession(s.id); }}
                    >
                      <div className={styles.sessionRowLeft}>
                        <Tag label={formatLabel(s.genre)} selected />
                        <Tag label={formatLabel(s.world_era)} />
                        <Tag label={formatLabel(s.status)} />
                      </div>
                      <p className={styles.sessionRowMeta}>
                        {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : 'Unknown'}
                      </p>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card hoverable={false} className={styles.emptySessionCard}>
                  <p className={styles.placeholderText}>No existing stories yet. Begin a new tale to get started.</p>
                </Card>
              )}
            </>
          )}
        </section>
      ) : phase === 'conjure' ? (
        <section className={styles.conjurePanel} data-step-panel>
          <header className={styles.header}>
            <p className={styles.kicker}>Conjure Your World</p>
            <h1 className={styles.title}>The Writing Desk</h1>
            <p className={styles.subtitle}>
              Shape genre, world, protagonist, and spark. When ready, summon the Narrative Director.
            </p>
          </header>

          <div className={styles.stepIndicatorRow}>
            {STEP_TITLES.map((stepTitle, index) => {
              const active = index === stepIndex;
              const completed = index < stepIndex;
              return (
                <button
                  key={stepTitle}
                  type="button"
                  className={`${styles.stepIndicator}${active ? ` ${styles.stepActive}` : ''}${completed ? ` ${styles.stepCompleted}` : ''}`}
                  onClick={() => handleStepChange(index)}
                  data-step-indicator
                >
                  <span className={styles.stepDot}>{completed || active ? '●' : '○'}</span>
                  <span className={styles.stepText}>{stepTitle}</span>
                </button>
              );
            })}
          </div>

          <Card hoverable={false} className={styles.stepCard}>
            <SectionHeader title={`Step ${stepIndex + 1}/4 — ${STEP_TITLES[stepIndex]}`} />
            {renderConjureStep()}
          </Card>

          <footer className={styles.stepActions}>
            <Button
              variant="ghost"
              onClick={() => handleStepChange(Math.max(stepIndex - 1, 0))}
              disabled={stepIndex === 0 || isGenerating || stepTransitioning}
            >
              Back
            </Button>

            {stepIndex < STEP_TITLES.length - 1 ? (
              <Button
                onClick={() => handleStepChange(Math.min(stepIndex + 1, STEP_TITLES.length - 1))}
                disabled={!canProceedStep || isGenerating || stepTransitioning}
              >
                Continue
              </Button>
            ) : (
              <Button onClick={handleBeginTale} disabled={!canProceedStep || isGenerating || stepTransitioning}>
                Begin Your Tale
              </Button>
            )}
          </footer>
        </section>
      ) : (
        <section className={styles.deskPanel}>
          <Card hoverable={false} className={styles.contextBar} data-desk-reveal>
            <div className={styles.contextHeader}>
              <p className={styles.blockLabel}>Context Bar</p>
              <Button
                variant="ghost"
                onClick={() => {
                  setPhase('conjure');
                  handleStepChange(0);
                }}
                disabled={isGenerating}
              >
                Return to Conjure
              </Button>
            </div>

            {!contextCollapsed ? (
              <div className={styles.contextContent}>
                <Tag label={formatLabel(form.genre)} selected />
                <Tag label={formatLabel(form.worldEra)} selected />
                <Tag label={formatLabel(form.protagonistArchetype)} selected />
                <Tag label={formatLabel(form.protagonistShadow)} variant="crimson" selected />
                <p className={styles.contextMeta}>
                  Session: {sessionId || 'pending'} · Lorebook: {lorebookId || 'pending'}
                </p>
              </div>
            ) : null}

            <button
              type="button"
              className={styles.contextToggle}
              onClick={() => setContextCollapsed((prev) => !prev)}
            >
              {contextCollapsed ? 'Expand context' : 'Collapse context'}
            </button>
          </Card>

          {error ? <div className={styles.errorBanner}>{error}</div> : null}

          <div className={styles.workspace} data-desk-reveal>
            <Card hoverable={false} className={styles.scrollPanel}>
              <SectionHeader title="Narrative Scroll" />

              {!worldApproved && worldPreview ? (
                <article className={styles.chapterBody}>
                  <span className={styles.previewBadge}>World Preview</span>
                  {renderChapterBody(worldPreview.text, worldPreview.images)}

                  {worldPreview.loreRefs.length > 0 ? (
                    <div className={styles.loreCited}>
                      <p className={styles.blockLabel}>Lore referenced</p>
                      <ul>
                        {worldPreview.loreRefs.map((ref) => (
                          <li key={ref}>{ref}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              ) : selectedChapter ? (
                <article className={styles.chapterBody}>
                  <h3 className={styles.chapterTitle}>{selectedChapter.title}</h3>
                  {renderChapterBody(selectedChapter.body, selectedChapter.images)}

                  {selectedChapter.loreRefs.length > 0 ? (
                    <div className={styles.loreCited}>
                      <p className={styles.blockLabel}>Lore cited</p>
                      <ul>
                        {selectedChapter.loreRefs.map((ref) => (
                          <li key={ref}>{ref}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              ) : (
                <p className={styles.placeholderText}>Your story awaits the first chapter.</p>
              )}
            </Card>

            <Card hoverable={false} className={styles.chatPanel}>
              <SectionHeader title="Director's Chat" />
              <p className={styles.statusLine}>{statusText}</p>

              <div className={styles.chatLog}>
                {chatLog.length === 0 ? (
                  <p className={styles.placeholderText}>No exchange yet.</p>
                ) : (
                  chatLog.map((message) => (
                    <div
                      key={message.id}
                      data-chat-id={message.id}
                      className={`${styles.chatEntry} ${styles[message.role]}`}
                    >
                      <p>{message.text}</p>
                    </div>
                  ))
                )}
              </div>

              {!worldApproved ? (
                <div className={styles.reviewActions}>
                  <p className={styles.reviewPrompt}>
                    Review the conjured world. Request changes below, or approve to begin your tale.
                  </p>
                  <div className={styles.chatComposer}>
                    <Input
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      placeholder="Request adjustments to the world, characters, or lore..."
                      multiline
                      rows={3}
                      className={styles.chatInput}
                    />
                    <Button
                      variant="ghost"
                      onClick={handleSendDirection}
                      disabled={!sessionId || isGenerating || !messageDraft.trim()}
                    >
                      Send Revisions
                    </Button>
                  </div>
                  <Button
                    onClick={handleApproveWorld}
                    disabled={!sessionId || isGenerating}
                  >
                    Approve World & Begin First Chapter
                  </Button>
                </div>
              ) : (
                <div className={styles.chatComposer}>
                  {worldApproved && chapters.length > 0 && !messageDraft.trim() && !isGenerating ? (
                    <Button
                      variant="ghost"
                      className={styles.continueButton}
                      onClick={() => {
                        setMessageDraft('Continue to the next chapter.');
                      }}
                    >
                      ✦ Continue Story
                    </Button>
                  ) : null}
                  <Input
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    placeholder="Direct the next scene, challenge, or character turn..."
                    multiline
                    rows={4}
                    className={styles.chatInput}
                  />
                  <Button onClick={handleSendDirection} disabled={!sessionId || isGenerating || !messageDraft.trim()}>
                    Send Direction
                  </Button>
                </div>
              )}
            </Card>
          </div>

          <Card hoverable={false} className={styles.bottomBar} data-desk-reveal>
            <div className={styles.chapterNav}>
              {!worldApproved && worldPreview ? (
                <span className={styles.navHint}>✦ World preview — awaiting approval</span>
              ) : chapters.length === 0 ? (
                <span className={styles.navHint}>○ No chapters yet</span>
              ) : null}
              {chapters.map((chapter, index) => (
                <button
                  key={chapter.id}
                  type="button"
                  className={`${styles.chapterDot}${index === activeChapterIndex ? ` ${styles.chapterDotActive}` : ''}`}
                  onClick={() => setActiveChapterIndex(index)}
                  title={chapter.title}
                >
                  {index <= activeChapterIndex ? '✦' : '○'} {chapter.title.length > 20 ? `${chapter.title.slice(0, 18)}…` : chapter.title}
                </button>
              ))}
            </div>

            <div className={styles.loreUpdateStream}>
              {loreUpdates.length === 0 ? (
                <span className={styles.navHint}>No lorebook updates yet.</span>
              ) : (
                loreUpdates.slice(0, 3).map((update) => (
                  <span key={update.id} className={styles.updateBadge}>
                    Lorebook updated · {update.entryName} ({update.category})
                  </span>
                ))
              )}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
