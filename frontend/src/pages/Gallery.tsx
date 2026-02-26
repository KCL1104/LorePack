import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import {
  generateImage,
  type ImageAsset,
} from '../api';
import { Button, Card, SectionHeader, Tag } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import styles from './Gallery.module.css';

type AssetFilter = 'all' | 'character' | 'scene';

const FILTER_TABS: { value: AssetFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'character', label: 'Characters' },
  { value: 'scene', label: 'Scenes' },
];

function getVisionTitle(asset: ImageAsset): string {
  if (asset.character_name?.trim()) return asset.character_name.trim();
  if (asset.scene_name?.trim()) return asset.scene_name.trim();
  return 'Untitled Vision';
}

function summarizePrompt(prompt: string): string {
  const normalized = prompt.trim();
  if (!normalized) return 'No prompt metadata.';
  if (normalized.length <= 170) return normalized;
  return `${normalized.slice(0, 167)}...`;
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

function formatAssetType(value: ImageAsset['asset_type']): string {
  return value === 'character' ? 'Character' : 'Scene';
}

function resolveImageUrl(signedUrl: string | null | undefined, fallback: string): string | null {
  const candidate = signedUrl || fallback;
  if (!candidate) return null;
  return candidate.startsWith('http') ? candidate : null;
}

export default function Gallery() {
  const images = useAppStore((state) => state.images);
  const lorebooks = useAppStore((state) => state.lorebooks);
  const fetchImages = useAppStore((state) => state.fetchImages);
  const fetchLorebooks = useAppStore((state) => state.fetchLorebooks);

  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');
  const [selectedLorebookId, setSelectedLorebookId] = useState<string>('all');
  const [pinnedHeroId, setPinnedHeroId] = useState<string | null>(null);
  const [lightboxImageId, setLightboxImageId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadGallery = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([fetchImages(), fetchLorebooks()]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load gallery records.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadGallery();
    return () => {
      cancelled = true;
    };
  }, [fetchImages, fetchLorebooks]);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = window.setTimeout(() => setActionMessage(null), 3600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [actionMessage]);

  const filteredImages = useMemo(() => {
    return images.filter((asset) => {
      if (assetFilter !== 'all' && asset.asset_type !== assetFilter) return false;

      if (selectedLorebookId === 'all') return true;
      const lorebookId = asset.lorebook_id || '';
      return lorebookId === selectedLorebookId;
    });
  }, [assetFilter, images, selectedLorebookId]);

  const heroImage = useMemo(() => {
    if (filteredImages.length === 0) return null;
    if (pinnedHeroId) {
      const pinned = filteredImages.find((asset) => asset.id === pinnedHeroId);
      if (pinned) return pinned;
    }
    return filteredImages[0];
  }, [filteredImages, pinnedHeroId]);

  const gridImages = useMemo(() => {
    if (!heroImage) return filteredImages;
    return filteredImages.filter((asset) => asset.id !== heroImage.id);
  }, [filteredImages, heroImage]);

  const lightboxIndex = useMemo(() => {
    if (!lightboxImageId) return -1;
    return filteredImages.findIndex((asset) => asset.id === lightboxImageId);
  }, [filteredImages, lightboxImageId]);

  const lightboxAsset = lightboxIndex >= 0 ? filteredImages[lightboxIndex] : null;
  const lightboxUrl = lightboxAsset
    ? resolveImageUrl(lightboxAsset.signed_url, lightboxAsset.gs_uri)
    : null;

  useEffect(() => {
    if (!pinnedHeroId) return;
    if (filteredImages.some((asset) => asset.id === pinnedHeroId)) return;
    setPinnedHeroId(null);
  }, [filteredImages, pinnedHeroId]);

  useEffect(() => {
    if (!lightboxImageId) return;
    if (filteredImages.some((asset) => asset.id === lightboxImageId)) return;
    setLightboxImageId(null);
  }, [filteredImages, lightboxImageId]);

  const shiftLightbox = useCallback((delta: -1 | 1) => {
    if (filteredImages.length <= 1 || lightboxIndex < 0) return;
    const nextIndex = (lightboxIndex + delta + filteredImages.length) % filteredImages.length;
    setLightboxImageId(filteredImages[nextIndex].id);
  }, [filteredImages, lightboxIndex]);

  useEffect(() => {
    if (!lightboxAsset) return;

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxImageId(null);
      } else if (event.key === 'ArrowLeft') {
        shiftLightbox(-1);
      } else if (event.key === 'ArrowRight') {
        shiftLightbox(1);
      }
    };

    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('keydown', onKeydown);
    };
  }, [lightboxAsset, shiftLightbox]);

  const handleRegenerate = async () => {
    if (!lightboxAsset || regeneratingId) return;

    const lorebookId = lightboxAsset.lorebook_id;
    if (!lorebookId) {
      setError('Cannot regenerate this vision because lorebook metadata is missing.');
      return;
    }

    const entryName = getVisionTitle(lightboxAsset);

    setRegeneratingId(lightboxAsset.id);
    setError(null);
    setActionMessage('Regeneration started...');

    try {
      for await (const event of generateImage({
        lorebook_id: lorebookId,
        entry_name: entryName,
        image_type: lightboxAsset.asset_type,
        art_style: lightboxAsset.art_style || undefined,
      })) {
        if (event.type === 'done') break;
      }

      await fetchImages();
      setActionMessage('Regeneration complete. Gallery refreshed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed.');
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleOpenInNewTab = () => {
    if (!lightboxUrl) {
      setError('No accessible URL found for this vision.');
      return;
    }
    window.open(lightboxUrl, '_blank', 'noopener,noreferrer');
  };

  const selectedTabIndex = FILTER_TABS.findIndex((tab) => tab.value === assetFilter);
  const heroUrl = heroImage ? resolveImageUrl(heroImage.signed_url, heroImage.gs_uri) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>The Gallery of Visions</p>
        <h1 className={styles.title}>Visual Archive</h1>
        <p className={styles.subtitle}>
          Curate generated character portraits and scene renderings from across your living worlds.
        </p>
      </header>

      <section className={styles.filters}>
        <div className={styles.tabs} role="tablist" aria-label="Gallery type filters">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={assetFilter === tab.value}
              className={`${styles.tabButton}${assetFilter === tab.value ? ` ${styles.tabActive}` : ''}`}
              onClick={() => setAssetFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
          <span
            className={styles.tabIndicator}
            style={{ transform: `translateX(${selectedTabIndex * 100}%)` }}
            aria-hidden="true"
          />
        </div>

        <div className={styles.lorebookFilter}>
          <label className={styles.lorebookLabel} htmlFor="gallery-lorebook-filter">
            Lorebook
          </label>
          <select
            id="gallery-lorebook-filter"
            className={styles.lorebookSelect}
            value={selectedLorebookId}
            onChange={(event) => setSelectedLorebookId(event.target.value)}
          >
            <option value="all">All Lorebooks</option>
            {lorebooks.map((lorebook) => (
              <option key={lorebook.id} value={lorebook.id}>
                {lorebook.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? <div className={styles.errorBanner}>Gallery sync failed: {error}</div> : null}
      {actionMessage ? <div className={styles.infoBanner}>{actionMessage}</div> : null}

      {loading ? (
        <Card hoverable={false} className={styles.loadingCard}>
          <p>Opening the gallery vault...</p>
        </Card>
      ) : filteredImages.length === 0 ? (
        images.length === 0 ? (
          <Card hoverable={false} className={styles.guideCard}>
            <h2 className={styles.guideTitle}>Your gallery is empty — let's fill it with visions</h2>
            <p className={styles.guideSubtitle}>
              Images are generated automatically or on demand. Here are 3 ways to populate your gallery:
            </p>
            <div className={styles.guideSteps}>
              <div className={styles.guideStep}>
                <span className={styles.guideIcon}>✦</span>
                <h3 className={styles.guideStepTitle}>1. Conjure a New Story</h3>
                <p className={styles.guideStepDesc}>
                  Start a tale in <strong>Story Studio</strong>. Character portraits and scene images are generated automatically during world creation.
                </p>
                <Link to="/story-studio" className={styles.guideLink}>Open Story Studio →</Link>
              </div>
              <div className={styles.guideStep}>
                <span className={styles.guideIcon}>◈</span>
                <h3 className={styles.guideStepTitle}>2. Generate from Lorebook</h3>
                <p className={styles.guideStepDesc}>
                  Open the <strong>Lorebook Editor</strong> and click &quot;Generate Image&quot; on any character, location, or event entry.
                </p>
                <Link to="/lorebook" className={styles.guideLink}>Open Lorebook Editor →</Link>
              </div>
              <div className={styles.guideStep}>
                <span className={styles.guideIcon}>↻</span>
                <h3 className={styles.guideStepTitle}>3. Regenerate in Gallery</h3>
                <p className={styles.guideStepDesc}>
                  Once you have images, open any vision in the lightbox and click &quot;Regenerate&quot; for a fresh interpretation.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card hoverable={false} className={styles.emptyCard}>
            <p>No visions match this filter.</p>
            <p className={styles.mutedText}>
              Try selecting &quot;All&quot; or a different lorebook. You have {images.length} total vision{images.length !== 1 ? 's' : ''} in the gallery.
            </p>
          </Card>
        )
      ) : (
        <>
          {heroImage ? (
            <section className={styles.heroSection}>
              <SectionHeader title="Featured Vision">
                <Link to="/story-studio" className={styles.sectionMeta}>
                  Open Writing Desk
                </Link>
              </SectionHeader>

              <div className={styles.heroLayout}>
                <Card className={styles.heroCard} data-gallery-card>
                  {heroUrl ? (
                    <img
                      src={heroUrl}
                      alt={getVisionTitle(heroImage)}
                      className={styles.heroImage}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.imageFallback}>Signed URL unavailable</div>
                  )}

                  <div className={styles.heroOverlay}>
                    <div className={styles.heroTags}>
                      <Tag label={formatAssetType(heroImage.asset_type)} selected />
                      {heroImage.lorebook_id ? <Tag label={`Lorebook ${heroImage.lorebook_id}`} /> : null}
                    </div>
                    <h2 className={styles.heroTitle}>{getVisionTitle(heroImage)}</h2>
                    <p className={styles.heroPrompt}>{summarizePrompt(heroImage.prompt_used)}</p>
                    <Button variant="ghost" onClick={() => setLightboxImageId(heroImage.id)}>
                      View metadata
                    </Button>
                  </div>
                </Card>

                <Card hoverable={false} className={styles.heroMetaCard}>
                  <p className={styles.metaRow}>
                    <span className={styles.metaLabel}>Type</span>
                    <span className={styles.metaValue}>{formatAssetType(heroImage.asset_type)}</span>
                  </p>
                  <p className={styles.metaRow}>
                    <span className={styles.metaLabel}>Art Style</span>
                    <span className={styles.metaValue}>{heroImage.art_style || 'Unknown'}</span>
                  </p>
                  <p className={styles.metaRow}>
                    <span className={styles.metaLabel}>Generated</span>
                    <span className={styles.metaValue}>{formatDate(heroImage.generated_at)}</span>
                  </p>
                  <p className={styles.metaRow}>
                    <span className={styles.metaLabel}>Prompt</span>
                    <span className={styles.metaValue}>{summarizePrompt(heroImage.prompt_used)}</span>
                  </p>
                </Card>
              </div>
            </section>
          ) : null}

          <section className={styles.gridSection}>
            <SectionHeader title="Vision Grid">
              <span className={styles.sectionMeta}>{gridImages.length} entries</span>
            </SectionHeader>

            {gridImages.length === 0 ? (
              <Card hoverable={false} className={styles.emptyCard}>
                <p>No additional visions beyond the featured image.</p>
              </Card>
            ) : (
              <div className={styles.grid}>
                {gridImages.map((asset) => {
                  const src = resolveImageUrl(asset.signed_url, asset.gs_uri);
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={styles.gridButton}
                      onClick={() => setLightboxImageId(asset.id)}
                    >
                      <Card
                        className={`${styles.gridCard} ${
                          asset.asset_type === 'character' ? styles.characterCard : styles.sceneCard
                        }`}
                        data-gallery-card
                      >
                        {src ? (
                          <img
                            src={src}
                            alt={getVisionTitle(asset)}
                            className={styles.gridImage}
                            loading="lazy"
                          />
                        ) : (
                          <div className={styles.imageFallback}>Vision preview unavailable</div>
                        )}

                        <div className={styles.gridOverlay}>
                          <p className={styles.gridTitle}>{getVisionTitle(asset)}</p>
                          <p className={styles.gridMeta}>{formatDate(asset.generated_at)}</p>
                        </div>
                      </Card>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {lightboxAsset ? (
        <div
          className={styles.lightboxBackdrop}
          role="presentation"
          onClick={() => setLightboxImageId(null)}
        >
          <div
            className={styles.lightbox}
            role="dialog"
            aria-modal="true"
            aria-label="Vision details"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={`${styles.navArrow} ${styles.leftArrow}`}
              onClick={() => shiftLightbox(-1)}
              disabled={filteredImages.length <= 1}
              aria-label="Previous vision"
            >
              ‹
            </button>

            <div className={styles.lightboxImagePane}>
              {lightboxUrl ? (
                <img
                  src={lightboxUrl}
                  alt={getVisionTitle(lightboxAsset)}
                  className={styles.lightboxImage}
                />
              ) : (
                <div className={styles.lightboxFallback}>No accessible image URL</div>
              )}
            </div>

            <aside className={styles.lightboxPanel}>
              <h3 className={styles.lightboxTitle}>{getVisionTitle(lightboxAsset)}</h3>
              <div className={styles.panelMeta}>
                <p>
                  <span className={styles.panelLabel}>Type</span>
                  <span className={styles.panelValue}>{formatAssetType(lightboxAsset.asset_type)}</span>
                </p>
                <p>
                  <span className={styles.panelLabel}>Art Style</span>
                  <span className={styles.panelValue}>{lightboxAsset.art_style || 'Unknown'}</span>
                </p>
                <p>
                  <span className={styles.panelLabel}>Pose</span>
                  <span className={styles.panelValue}>{lightboxAsset.pose || 'Not specified'}</span>
                </p>
                <p>
                  <span className={styles.panelLabel}>Generated</span>
                  <span className={styles.panelValue}>{formatDate(lightboxAsset.generated_at)}</span>
                </p>
                <p>
                  <span className={styles.panelLabel}>Lorebook</span>
                  <span className={styles.panelValue}>
                    {lightboxAsset.lorebook_id || 'Unknown'}
                  </span>
                </p>
              </div>

              <p className={styles.lightboxPrompt}>{lightboxAsset.prompt_used || 'No prompt metadata.'}</p>

              <div className={styles.lightboxActions}>
                <Button
                  onClick={handleRegenerate}
                  disabled={
                    regeneratingId === lightboxAsset.id
                    || !lightboxAsset.lorebook_id
                  }
                >
                  {regeneratingId === lightboxAsset.id ? 'Regenerating...' : 'Regenerate'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPinnedHeroId(lightboxAsset.id);
                    setActionMessage('Featured vision updated.');
                  }}
                >
                  Set as Hero
                </Button>
                <Button variant="ghost" onClick={handleOpenInNewTab}>
                  Open in new tab
                </Button>
                <Button
                  variant="ghost"
                  className={styles.closeAction}
                  onClick={() => setLightboxImageId(null)}
                >
                  Close
                </Button>
              </div>
            </aside>

            <button
              type="button"
              className={`${styles.navArrow} ${styles.rightArrow}`}
              onClick={() => shiftLightbox(1)}
              disabled={filteredImages.length <= 1}
              aria-label="Next vision"
            >
              ›
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
