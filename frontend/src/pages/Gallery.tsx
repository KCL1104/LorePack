import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import {
  generateImage,
  type ImageAsset,
} from '../api';
import { Button, Card, SectionHeader, Tag } from '../components/ui';
import { useI18n } from '../i18n';
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

function formatDate(value: string, dateLocale: string, unknownLabel: string): string {
  if (!value) return unknownLabel;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(dateLocale, {
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

function resolveImageUrl(signedUrl: string | null | undefined, gsUri: string): string | null {
  if (signedUrl && signedUrl.startsWith('http')) return signedUrl;
  if (!gsUri) return null;
  const match = gsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (match) return `https://storage.googleapis.com/${match[1]}/${match[2]}`;
  return null;
}

export default function Gallery() {
  const { dateLocale, t } = useI18n();
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
          setError(err instanceof Error ? err.message : t('Failed to load gallery records.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadGallery();
    return () => {
      cancelled = true;
    };
  }, [fetchImages, fetchLorebooks, t]);

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
      setError(t('Cannot regenerate this vision because lorebook metadata is missing.'));
      return;
    }

    const entryName = getVisionTitle(lightboxAsset);

    setRegeneratingId(lightboxAsset.id);
    setError(null);
    setActionMessage(t('Regeneration started...'));

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
      setActionMessage(t('Regeneration complete. Gallery refreshed.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Regeneration failed.'));
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleOpenInNewTab = () => {
    if (!lightboxUrl) {
      setError(t('No accessible URL found for this vision.'));
      return;
    }
    window.open(lightboxUrl, '_blank', 'noopener,noreferrer');
  };

  const selectedTabIndex = FILTER_TABS.findIndex((tab) => tab.value === assetFilter);
  const heroUrl = heroImage ? resolveImageUrl(heroImage.signed_url, heroImage.gs_uri) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('The Gallery of Visions')}</p>
        <h1 className={styles.title}>{t('Visual Archive')}</h1>
        <p className={styles.subtitle}>
          {t('Curate generated character portraits and scene renderings from across your living worlds.')}
        </p>
      </header>

      <section className={styles.filters}>
        <div className={styles.tabs} role="tablist" aria-label={t('Gallery type filters')}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={assetFilter === tab.value}
              className={`${styles.tabButton}${assetFilter === tab.value ? ` ${styles.tabActive}` : ''}`}
              onClick={() => setAssetFilter(tab.value)}
            >
              {t(tab.label)}
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
            {t('Lorebook')}
          </label>
          <select
            id="gallery-lorebook-filter"
            className={styles.lorebookSelect}
            value={selectedLorebookId}
            onChange={(event) => setSelectedLorebookId(event.target.value)}
          >
            <option value="all">{t('All Lorebooks')}</option>
            {lorebooks.map((lorebook) => (
              <option key={lorebook.id} value={lorebook.id}>
                {lorebook.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? <div className={styles.errorBanner}>{t('Gallery sync failed: {error}', { error })}</div> : null}
      {actionMessage ? <div className={styles.infoBanner}>{actionMessage}</div> : null}

      {loading ? (
        <Card hoverable={false} className={styles.loadingCard}>
          <p>{t('Opening the gallery vault...')}</p>
        </Card>
      ) : filteredImages.length === 0 ? (
        images.length === 0 ? (
          <Card hoverable={false} className={styles.guideCard}>
            <h2 className={styles.guideTitle}>{t("Your gallery is empty — let's fill it with visions")}</h2>
            <p className={styles.guideSubtitle}>
              {t('Images are generated automatically or on demand. Here are 3 ways to populate your gallery:')}
            </p>
            <div className={styles.guideSteps}>
              <div className={styles.guideStep}>
                <span className={styles.guideIcon}>✦</span>
                <h3 className={styles.guideStepTitle}>{t('1. Conjure a New Story')}</h3>
                <p className={styles.guideStepDesc}>
                  {t('Start a tale in Story Studio. Character portraits and scene images are generated automatically during world creation.')}
                </p>
                <Link to="/story-studio" className={styles.guideLink}>{t('Open Story Studio →')}</Link>
              </div>
              <div className={styles.guideStep}>
                <span className={styles.guideIcon}>◈</span>
                <h3 className={styles.guideStepTitle}>{t('2. Generate from Lorebook')}</h3>
                <p className={styles.guideStepDesc}>
                  {t('Open Lorebook Editor and click "Generate Image" on any character, location, or event entry.')}
                </p>
                <Link to="/lorebook" className={styles.guideLink}>{t('Open Lorebook Editor →')}</Link>
              </div>
              <div className={styles.guideStep}>
                <span className={styles.guideIcon}>↻</span>
                <h3 className={styles.guideStepTitle}>{t('3. Regenerate in Gallery')}</h3>
                <p className={styles.guideStepDesc}>
                  {t('Once you have images, open any vision in the lightbox and click "Regenerate" for a fresh interpretation.')}
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card hoverable={false} className={styles.emptyCard}>
            <p>{t('No visions match this filter.')}</p>
            <p className={styles.mutedText}>
              {t('Try selecting "All" or a different lorebook. You have {count} total visions in the gallery.', { count: images.length })}
            </p>
          </Card>
        )
      ) : (
        <>
          {heroImage ? (
            <section className={styles.heroSection}>
              <SectionHeader title={t('Featured Vision')}>
                <Link to="/story-studio" className={styles.sectionMeta}>
                  {t('Open Writing Desk')}
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
                    <div className={styles.imageFallback}>{t('Signed URL unavailable')}</div>
                  )}

                  <div className={styles.heroOverlay}>
                    <div className={styles.heroTags}>
                      <Tag label={formatAssetType(heroImage.asset_type)} selected />
                      {heroImage.lorebook_id ? <Tag label={`Lorebook ${heroImage.lorebook_id}`} /> : null}
                    </div>
                    <h2 className={styles.heroTitle}>{getVisionTitle(heroImage)}</h2>
                    <p className={styles.heroPrompt}>{summarizePrompt(heroImage.prompt_used || t('No prompt metadata.'))}</p>
                    <Button variant="ghost" onClick={() => setLightboxImageId(heroImage.id)}>
                      {t('View metadata')}
                    </Button>
                  </div>
                </Card>

                <Card hoverable={false} className={styles.heroMetaCard}>
                  <p className={styles.metaRow}>
                    <span className={styles.metaLabel}>Type</span>
                    <span className={styles.metaValue}>{t(formatAssetType(heroImage.asset_type))}</span>
                  </p>
                  <p className={styles.metaRow}>
                    <span className={styles.metaLabel}>{t('Art Style')}</span>
                    <span className={styles.metaValue}>{heroImage.art_style || t('Unknown')}</span>
                  </p>
                  <p className={styles.metaRow}>
                    <span className={styles.metaLabel}>{t('Generated')}</span>
                    <span className={styles.metaValue}>{formatDate(heroImage.generated_at, dateLocale, t('Unknown'))}</span>
                  </p>
                  <p className={styles.metaRow}>
                    <span className={styles.metaLabel}>{t('Prompt')}</span>
                    <span className={styles.metaValue}>{summarizePrompt(heroImage.prompt_used || t('No prompt metadata.'))}</span>
                  </p>
                </Card>
              </div>
            </section>
          ) : null}

          <section className={styles.gridSection}>
            <SectionHeader title={t('Vision Grid')}>
              <span className={styles.sectionMeta}>{t('{count} entries', { count: gridImages.length })}</span>
            </SectionHeader>

            {gridImages.length === 0 ? (
              <Card hoverable={false} className={styles.emptyCard}>
                <p>{t('No additional visions beyond the featured image.')}</p>
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
                          <div className={styles.imageFallback}>{t('Vision preview unavailable')}</div>
                        )}

                        <div className={styles.gridOverlay}>
                          <p className={styles.gridTitle}>{getVisionTitle(asset)}</p>
                          <p className={styles.gridMeta}>{formatDate(asset.generated_at, dateLocale, t('Unknown'))}</p>
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
            aria-label={t('Vision details')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.lightboxImagePane}>
              <button
                type="button"
                className={`${styles.navArrow} ${styles.leftArrow}`}
                onClick={() => shiftLightbox(-1)}
                disabled={filteredImages.length <= 1}
                aria-label={t('Previous vision')}
              >
                ‹
              </button>

              {lightboxUrl ? (
                <img
                  src={lightboxUrl}
                  alt={getVisionTitle(lightboxAsset)}
                  className={styles.lightboxImage}
                />
              ) : (
                <div className={styles.lightboxFallback}>{t('No accessible image URL')}</div>
              )}

              <button
                type="button"
                className={`${styles.navArrow} ${styles.rightArrow}`}
                onClick={() => shiftLightbox(1)}
                disabled={filteredImages.length <= 1}
                aria-label={t('Next vision')}
              >
                ›
              </button>
            </div>

            <aside className={styles.lightboxPanel}>
              <h3 className={styles.lightboxTitle}>{getVisionTitle(lightboxAsset)}</h3>
              <div className={styles.panelMeta}>
                <p>
                  <span className={styles.panelLabel}>Type</span>
                  <span className={styles.panelValue}>{t(formatAssetType(lightboxAsset.asset_type))}</span>
                </p>
                <p>
                  <span className={styles.panelLabel}>{t('Art Style')}</span>
                  <span className={styles.panelValue}>{lightboxAsset.art_style || t('Unknown')}</span>
                </p>
                <p>
                  <span className={styles.panelLabel}>{t('Pose')}</span>
                  <span className={styles.panelValue}>{lightboxAsset.pose || t('Not specified')}</span>
                </p>
                <p>
                  <span className={styles.panelLabel}>{t('Generated')}</span>
                  <span className={styles.panelValue}>{formatDate(lightboxAsset.generated_at, dateLocale, t('Unknown'))}</span>
                </p>
                <p>
                  <span className={styles.panelLabel}>{t('Lorebook')}</span>
                  <span className={styles.panelValue}>
                    {lightboxAsset.lorebook_id || t('Unknown')}
                  </span>
                </p>
              </div>

              <p className={styles.lightboxPrompt}>{lightboxAsset.prompt_used || t('No prompt metadata.')}</p>

              <div className={styles.lightboxActions}>
                <Button
                  onClick={handleRegenerate}
                  disabled={
                    regeneratingId === lightboxAsset.id
                    || !lightboxAsset.lorebook_id
                  }
                >
                  {regeneratingId === lightboxAsset.id ? t('Regenerating...') : t('Regenerate')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPinnedHeroId(lightboxAsset.id);
                    setActionMessage(t('Featured vision updated.'));
                  }}
                >
                  {t('Set as Hero')}
                </Button>
                <Button variant="ghost" onClick={handleOpenInNewTab}>
                  {t('Open in new tab')}
                </Button>
                <Button
                  variant="ghost"
                  className={styles.closeAction}
                  onClick={() => setLightboxImageId(null)}
                >
                  {t('Close')}
                </Button>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}
