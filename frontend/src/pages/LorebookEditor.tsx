import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import {
  createEntry,
  deleteEntry,
  enrichEntry,
  generateImage,
  listImages,
  updateEntry,
  updateLorebookMeta,
  validateLorebook,
  type EnrichTask,
  type Entry,
  type ImageAsset,
  type LorebookValidation,
} from '../api';
import { Button, Card, Input, SectionHeader, Tag } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import styles from './LorebookEditor.module.css';

interface EntryDraft {
  category: string;
  name: string;
  content: string;
  tagsText: string;
  visibility: 'public' | 'private';
}

interface CategorySection {
  id: string;
  label: string;
  categories: string[];
}

const CATEGORY_SECTIONS: CategorySection[] = [
  { id: 'characters', label: 'CHARACTERS', categories: ['character', 'characters'] },
  { id: 'locations', label: 'LOCATIONS', categories: ['location', 'locations'] },
  { id: 'events', label: 'EVENTS', categories: ['event', 'events'] },
  {
    id: 'magic_systems',
    label: 'MAGIC SYSTEMS',
    categories: ['magic_system', 'magic systems', 'magic_systems'],
  },
  { id: 'items', label: 'ITEMS', categories: ['item', 'items'] },
  {
    id: 'other',
    label: 'OTHER',
    categories: ['other', 'faction', 'factions', 'technology', 'technologies'],
  },
];

const CATEGORY_OPTIONS = [
  { value: 'character', label: 'Character' },
  { value: 'location', label: 'Location' },
  { value: 'event', label: 'Event' },
  { value: 'magic_system', label: 'Magic System' },
  { value: 'technology', label: 'Technology' },
  { value: 'faction', label: 'Faction' },
  { value: 'item', label: 'Item' },
  { value: 'other', label: 'Other' },
];

const ENRICH_OPTIONS: { task: EnrichTask; label: string; description: string }[] = [
  { task: 'backstory', label: 'Generate Backstory', description: 'Origin, defining events, motivation' },
  { task: 'expand', label: 'Expand Details', description: 'Enrich with vivid, concrete details' },
  { task: 'relationships', label: 'Map Relationships', description: 'Analyze connections to other entries' },
  { task: 'personality', label: 'Personality Profile', description: 'Speech patterns, habits, voice guide' },
];

const EMPTY_DRAFT: EntryDraft = {
  category: 'other',
  name: '',
  content: '',
  tagsText: '',
  visibility: 'private',
};

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase().replace(/\s+/g, '_');
}

function getSectionIdByCategory(category: string): string {
  const normalized = normalizeCategory(category);
  const match = CATEGORY_SECTIONS.find((section) =>
    section.categories.some((item) => normalizeCategory(item) === normalized),
  );
  return match?.id || 'other';
}

function formatDate(value: string): string {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function toDraft(entry: Entry): EntryDraft {
  return {
    category: normalizeCategory(entry.category || 'other'),
    name: entry.name,
    content: entry.content,
    tagsText: entry.tags.join(', '),
    visibility: entry.visibility,
  };
}

function parseTags(tagsText: string): string[] {
  return tagsText
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function LorebookEditor() {
  const [searchParams, setSearchParams] = useSearchParams();
  const lorebooks = useAppStore((state) => state.lorebooks);
  const currentLorebook = useAppStore((state) => state.currentLorebook);
  const fetchLorebooks = useAppStore((state) => state.fetchLorebooks);
  const fetchLorebook = useAppStore((state) => state.fetchLorebook);
  const addToast = useAppStore((state) => state.addToast);

  const [selectedLorebookId, setSelectedLorebookId] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [draft, setDraft] = useState<EntryDraft>(EMPTY_DRAFT);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const [editingMeta, setEditingMeta] = useState(false);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');

  const [validationResult, setValidationResult] = useState<LorebookValidation | null>(null);
  const [portraitAssets, setPortraitAssets] = useState<ImageAsset[]>([]);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enriching, setEnriching] = useState(false);
  const [enrichMenuOpen, setEnrichMenuOpen] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState('');
  const [enrichResponse, setEnrichResponse] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);

  const activeLorebook = useMemo(() => {
    if (!currentLorebook) return null;
    if (currentLorebook.id !== selectedLorebookId) return null;
    return currentLorebook;
  }, [currentLorebook, selectedLorebookId]);

  const selectedEntry = useMemo(() => {
    if (!activeLorebook) return null;
    return activeLorebook.entries.find((entry) => entry.id === selectedEntryId) || null;
  }, [activeLorebook, selectedEntryId]);

  const groupedEntries = useMemo(() => {
    const entries = activeLorebook?.entries || [];
    return CATEGORY_SECTIONS.map((section) => {
      const sectionEntries = entries
        .filter((entry) => getSectionIdByCategory(entry.category) === section.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      return { ...section, entries: sectionEntries };
    }).filter((section) => section.entries.length > 0);
  }, [activeLorebook]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchLorebooks();
        const characterAssets = await listImages({ asset_type: 'character', include_signed_url: true });
        if (!cancelled) {
          setPortraitAssets(characterAssets);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load archive data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [fetchLorebooks]);

  useEffect(() => {
    if (lorebooks.length === 0) {
      setSelectedLorebookId('');
      return;
    }

    // Support ?id=<lorebookId> from Dashboard navigation
    const queryId = searchParams.get('id');
    if (queryId && lorebooks.some((item) => item.id === queryId)) {
      setSelectedLorebookId(queryId);
      setSearchParams({}, { replace: true });
      return;
    }

    if (!selectedLorebookId || !lorebooks.some((item) => item.id === selectedLorebookId)) {
      setSelectedLorebookId(lorebooks[0].id);
    }
  }, [lorebooks, selectedLorebookId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedLorebookId) return;
    let cancelled = false;

    const loadLorebook = async () => {
      setError(null);
      try {
        await fetchLorebook(selectedLorebookId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load lorebook details.');
        }
      }
    };

    void loadLorebook();
    return () => {
      cancelled = true;
    };
  }, [fetchLorebook, selectedLorebookId]);

  useEffect(() => {
    if (!activeLorebook) return;
    if (isCreating) return;

    if (activeLorebook.entries.length === 0) {
      setSelectedEntryId('');
      setIsEditing(false);
      return;
    }

    if (!activeLorebook.entries.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(activeLorebook.entries[0].id);
      setIsEditing(false);
    }
  }, [activeLorebook, isCreating, selectedEntryId]);

  useEffect(() => {
    if (isCreating) {
      setDraft(EMPTY_DRAFT);
      return;
    }

    if (selectedEntry) {
      setDraft(toDraft(selectedEntry));
    }
  }, [isCreating, selectedEntry]);

  useEffect(() => {
    let cancelled = false;

    const loadPortrait = async () => {
      setPortraitUrl(null);

      if (!selectedEntry) return;
      if (getSectionIdByCategory(selectedEntry.category) !== 'characters') return;

      const matched = portraitAssets.find(
        (asset) =>
          asset.character_name.trim().toLowerCase() === selectedEntry.name.trim().toLowerCase(),
      );

      if (!matched) return;

      const candidate = matched.signed_url || matched.gs_uri;
      if (!cancelled && candidate && candidate.startsWith('http')) {
        setPortraitUrl(candidate);
      }
    };

    void loadPortrait();
    return () => {
      cancelled = true;
    };
  }, [portraitAssets, selectedEntry]);

  const selectEntry = (entryId: string) => {
    setIsCreating(false);
    setIsEditing(false);
    setPendingDelete(false);
    setEnrichMenuOpen(false);
    setEnrichResponse('');
    setEnrichStatus('');
    setSelectedEntryId(entryId);
  };

  const handleNewEntry = () => {
    if (!selectedLorebookId) return;
    setIsCreating(true);
    setIsEditing(true);
    setPendingDelete(false);
    setSelectedEntryId('');
    setDraft(EMPTY_DRAFT);
  };

  const refreshSelectedLorebook = async () => {
    if (!selectedLorebookId) return;
    await Promise.all([fetchLorebook(selectedLorebookId), fetchLorebooks()]);
  };

  const handleSave = async () => {
    if (!selectedLorebookId || busy) return;

    const payload = {
      category: normalizeCategory(draft.category),
      name: draft.name.trim(),
      content: draft.content.trim(),
      tags: parseTags(draft.tagsText),
      visibility: draft.visibility,
    };

    if (!payload.name || !payload.content) {
      setError('Entry name and content are required.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (isCreating) {
        const created = await createEntry(selectedLorebookId, payload);
        setIsCreating(false);
        setIsEditing(false);
        setSelectedEntryId(created.id);
      } else if (selectedEntryId) {
        await updateEntry(selectedLorebookId, selectedEntryId, payload);
        setIsEditing(false);
      }

      await refreshSelectedLorebook();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedLorebookId || !selectedEntryId || busy) return;

    setBusy(true);
    setError(null);

    try {
      await deleteEntry(selectedLorebookId, selectedEntryId);
      setPendingDelete(false);
      setIsEditing(false);
      setSelectedEntryId('');
      await refreshSelectedLorebook();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry.');
    } finally {
      setBusy(false);
    }
  };

  const handleValidate = async () => {
    if (!selectedLorebookId || validating) return;

    setValidating(true);
    setError(null);
    try {
      const result = await validateLorebook(selectedLorebookId);
      setValidationResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed.');
    } finally {
      setValidating(false);
    }
  };

  const handleEnrich = async (task: EnrichTask) => {
    if (!selectedLorebookId || !selectedEntryId || enriching) return;

    setEnrichMenuOpen(false);
    setEnriching(true);
    setEnrichStatus('Summoning the World Architect...');
    setEnrichResponse('');
    setError(null);

    try {
      const stream = enrichEntry(selectedLorebookId, selectedEntryId, task);
      let buffer = '';

      for await (const event of stream) {
        if (event.type === 'thinking' && event.text) {
          setEnrichStatus(event.text);
        }
        if (event.type === 'text_chunk' && event.text) {
          buffer += event.text;
          setEnrichResponse(buffer);
        }
        if (event.type === 'done') {
          setEnrichStatus('');
          await refreshSelectedLorebook();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrichment failed.');
      setEnrichStatus('');
    } finally {
      setEnriching(false);
    }
  };

  const applyVisibility = async (visibility: 'public' | 'private') => {
    if (isCreating || isEditing) {
      setDraft((prev) => ({ ...prev, visibility }));
      return;
    }

    if (!selectedLorebookId || !selectedEntryId || selectedEntry?.visibility === visibility || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await updateEntry(selectedLorebookId, selectedEntryId, { visibility });
      await refreshSelectedLorebook();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update visibility.');
    } finally {
      setBusy(false);
    }
  };

  const sourceText = useMemo(() => {
    if (!selectedEntry) return '—';
    if (selectedEntry.source_session_id) {
      return `Auto-generated from Story Session ${selectedEntry.source_session_id}`;
    }
    if (selectedEntry.source) return selectedEntry.source;
    return 'Manually created or source metadata unavailable';
  }, [selectedEntry]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>The Archive</p>
        <h1 className={styles.title}>Lorebook Editor</h1>
      </header>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      {loading ? (
        <Card hoverable={false}>
          <p>Opening archive records...</p>
        </Card>
      ) : (
        <div className={styles.layout}>
          <Card hoverable={false} className={styles.treeColumn}>
            <SectionHeader title="Directory Tree" />

            {lorebooks.length === 0 ? (
              <p className={styles.muted}>No lorebooks available yet.</p>
            ) : (
              <>
                <label className={styles.label} htmlFor="lorebook-select">Lorebook</label>
                <select
                  id="lorebook-select"
                  className={styles.select}
                  value={selectedLorebookId}
                  onChange={(event) => {
                    setSelectedLorebookId(event.target.value);
                    setIsEditing(false);
                    setIsCreating(false);
                    setPendingDelete(false);
                    setValidationResult(null);
                  }}
                >
                  {lorebooks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>

                {activeLorebook ? (
                  <div className={styles.lorebookMeta}>
                    {editingMeta ? (
                      <>
                        <input
                          className={styles.metaTitleInput}
                          value={metaTitle}
                          onChange={(e) => setMetaTitle(e.target.value)}
                          placeholder="Lorebook title"
                        />
                        <input
                          className={styles.metaDescInput}
                          value={metaDescription}
                          onChange={(e) => setMetaDescription(e.target.value)}
                          placeholder="Description"
                        />
                        <div className={styles.metaActions}>
                          <Button
                            onClick={async () => {
                              if (!selectedLorebookId || busy) return;
                              setBusy(true);
                              try {
                                await updateLorebookMeta(selectedLorebookId, {
                                  title: metaTitle.trim() || undefined,
                                  description: metaDescription.trim() || undefined,
                                });
                                setEditingMeta(false);
                                await refreshSelectedLorebook();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : 'Failed to update lorebook.');
                              } finally {
                                setBusy(false);
                              }
                            }}
                            disabled={busy}
                          >
                            {busy ? 'Saving...' : 'Save'}
                          </Button>
                          <Button variant="ghost" onClick={() => setEditingMeta(false)} disabled={busy}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3
                          className={styles.metaTitleClickable}
                          onClick={() => {
                            setEditingMeta(true);
                            setMetaTitle(activeLorebook.title);
                            setMetaDescription(activeLorebook.description || '');
                          }}
                          title="Click to edit"
                        >
                          {activeLorebook.title}
                        </h3>
                        <p
                          className={`${styles.muted} ${styles.metaDescClickable}`}
                          onClick={() => {
                            setEditingMeta(true);
                            setMetaTitle(activeLorebook.title);
                            setMetaDescription(activeLorebook.description || '');
                          }}
                          title="Click to edit"
                        >
                          {activeLorebook.description || 'No description provided. Click to add.'}
                        </p>
                      </>
                    )}
                  </div>
                ) : null}

                <div className={styles.categoryTree}>
                  {groupedEntries.length === 0 ? (
                    <p className={styles.muted}>This lorebook has no entries yet.</p>
                  ) : (
                    groupedEntries.map((section) => {
                      const isCollapsed = collapsedSections[section.id] || false;
                      return (
                        <div key={section.id} className={styles.categorySection}>
                          <button
                            type="button"
                            className={styles.categoryHeader}
                            onClick={() =>
                              setCollapsedSections((prev) => ({
                                ...prev,
                                [section.id]: !isCollapsed,
                              }))
                            }
                          >
                            <span>{section.label}</span>
                            <span>{isCollapsed ? '＋' : '−'}</span>
                          </button>

                          {!isCollapsed ? (
                            <ul className={styles.entryList}>
                              {section.entries.map((entry) => (
                                <li key={entry.id}>
                                  <button
                                    type="button"
                                    className={`${styles.entryItem}${selectedEntryId === entry.id && !isCreating ? ` ${styles.entryItemActive}` : ''}`}
                                    onClick={() => selectEntry(entry.id)}
                                  >
                                    {entry.name}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className={styles.treeActions}>
                  <Button onClick={handleNewEntry} disabled={!selectedLorebookId || busy}>+ Add Entry</Button>
                  <Button variant="ghost" onClick={handleValidate} disabled={!selectedLorebookId || validating}>
                    {validating ? 'Validating...' : '⚠ Validate'}
                  </Button>
                </div>

                {validationResult ? (
                  <Card hoverable={false} className={styles.validationCard}>
                    <p className={styles.validationTitle}>
                      Validation {validationResult.status === 'passed' ? 'Passed' : 'Warnings'}
                    </p>
                    <p className={styles.muted}>
                      {validationResult.total_entries} entries · {validationResult.issues_found} issues
                    </p>
                    {validationResult.issues_found > 0 ? (
                      <ul className={styles.validationList}>
                        {validationResult.issues.slice(0, 5).map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    ) : null}
                  </Card>
                ) : null}
              </>
            )}
          </Card>

          <Card hoverable={false} className={styles.detailColumn}>
            <SectionHeader title="Entry Detail" />

            {!selectedLorebookId ? (
              <p className={styles.muted}>Select a lorebook to begin editing.</p>
            ) : !isCreating && !selectedEntry ? (
              <p className={styles.muted}>Choose an entry from the directory tree.</p>
            ) : (
              <div className={styles.detailBody}>
                <div className={styles.rowTop}>
                  <Input
                    value={draft.name}
                    onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Entry name"
                    className={styles.nameInput}
                  />

                  <select
                    className={styles.select}
                    value={draft.category}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        category: normalizeCategory(event.target.value),
                      }))
                    }
                    disabled={!isEditing && !isCreating}
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.visibilityRow}>
                  <p className={styles.label}>Visibility</p>
                  <div className={styles.visibilityToggle}>
                    <Tag
                      label="Public"
                      selected={draft.visibility === 'public'}
                      onClick={() => applyVisibility('public')}
                    />
                    <Tag
                      label="Private"
                      selected={draft.visibility === 'private'}
                      onClick={() => applyVisibility('private')}
                    />
                  </div>
                </div>

                <div>
                  <p className={styles.label}>Tags (comma-separated)</p>
                  <Input
                    value={draft.tagsText}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, tagsText: event.target.value }))
                    }
                    placeholder="prophecy, relic, covenant"
                    disabled={!isEditing && !isCreating}
                  />
                </div>

                <div>
                  <p className={styles.label}>Content</p>
                  <Input
                    value={draft.content}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, content: event.target.value }))
                    }
                    multiline
                    rows={12}
                    placeholder="Describe this lore entry..."
                    disabled={!isEditing && !isCreating}
                    className={styles.contentInput}
                  />
                </div>

                <div className={styles.metaPanel}>
                  <p className={styles.label}>Source Metadata</p>
                  <p className={styles.metaText}>Source: {sourceText}</p>
                  <p className={styles.metaText}>
                    Created at: {selectedEntry ? formatDate(selectedEntry.created_at) : 'Pending save'}
                  </p>
                </div>

                {portraitUrl ? (
                  <div className={styles.portraitWrap}>
                    <p className={styles.label}>Associated Portrait</p>
                    <img src={portraitUrl} alt={draft.name || 'Entry portrait'} className={styles.portrait} />
                  </div>
                ) : null}

                <div className={styles.detailActions}>
                  {isEditing || isCreating ? (
                    <>
                      <Button onClick={handleSave} disabled={busy}>
                        {busy ? 'Saving...' : isCreating ? 'Create Entry' : 'Save'}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setIsCreating(false);
                          setIsEditing(false);
                          setPendingDelete(false);
                          if (selectedEntry) {
                            setDraft(toDraft(selectedEntry));
                          } else {
                            setDraft(EMPTY_DRAFT);
                          }
                        }}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => setIsEditing(true)} disabled={!selectedEntry || busy}>
                        Edit
                      </Button>

                      <Button
                        variant="ghost"
                        onClick={async () => {
                          if (!selectedEntry || !selectedLorebookId || generatingImage) return;
                          setGeneratingImage(true);
                          try {
                            const cat = normalizeCategory(selectedEntry.category);
                            const imageType = ['character', 'characters'].includes(cat) ? 'character' : 'scene';
                            for await (const event of generateImage({
                              lorebook_id: selectedLorebookId,
                              entry_name: selectedEntry.name,
                              image_type: imageType,
                            })) {
                              if (event.type === 'done') break;
                            }
                            addToast({ variant: 'success', message: `Image generated for ${selectedEntry.name}` });
                            const freshAssets = await listImages({ asset_type: 'character', include_signed_url: true });
                            setPortraitAssets(freshAssets);
                          } catch (err) {
                            addToast({ variant: 'error', message: err instanceof Error ? err.message : 'Image generation failed.' });
                          } finally {
                            setGeneratingImage(false);
                          }
                        }}
                        disabled={!selectedEntry || busy || generatingImage}
                      >
                        {generatingImage ? 'Generating...' : 'Generate Image'}
                      </Button>

                      <div className={styles.enrichWrapper}>
                        <Button
                          variant="ghost"
                          onClick={() => setEnrichMenuOpen((prev) => !prev)}
                          disabled={!selectedEntry || busy || enriching}
                        >
                          {enriching ? 'Enriching...' : '✦ Enrich with AI'}
                        </Button>

                        {enrichMenuOpen ? (
                          <div className={styles.enrichMenu}>
                            {ENRICH_OPTIONS.map((option) => (
                              <button
                                key={option.task}
                                type="button"
                                className={styles.enrichMenuItem}
                                onClick={() => handleEnrich(option.task)}
                              >
                                <span className={styles.enrichMenuLabel}>{option.label}</span>
                                <span className={styles.enrichMenuDesc}>{option.description}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      {!pendingDelete ? (
                        <Button
                          variant="ghost"
                          onClick={() => setPendingDelete(true)}
                          disabled={!selectedEntry || busy}
                        >
                          Delete
                        </Button>
                      ) : (
                        <>
                          <Button onClick={handleDelete} disabled={busy}>
                            {busy ? 'Deleting...' : 'Confirm Delete'}
                          </Button>
                          <Button variant="ghost" onClick={() => setPendingDelete(false)} disabled={busy}>
                            Cancel
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>

                {enrichStatus || enrichResponse ? (
                  <div className={styles.enrichPanel}>
                    {enrichStatus ? (
                      <p className={styles.enrichStatus}>{enrichStatus}</p>
                    ) : null}
                    {enrichResponse ? (
                      <div className={styles.enrichResponse}>{enrichResponse}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
