import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Canvas, useFrame } from '@react-three/fiber';
import { animate, stagger } from 'animejs';
import { AdditiveBlending, Color } from 'three';
import type { Points, ShaderMaterial } from 'three';

import { getImage, listPublicLorebooks, type PublicLorebook } from '../api';
import { Card, SectionHeader, Tag } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import styles from './Dashboard.module.css';

const PARTICLE_COUNT = 72;

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function formatLabel(value: string): string {
  if (!value) return 'Unknown';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value: string): string {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function getStatusProgress(status: string): number {
  if (status === 'conjuring') return 25;
  if (status === 'active') return 68;
  if (status === 'completed') return 100;
  return 45;
}

function getVisionTitle(characterName: string, sceneName: string): string {
  if (characterName) return characterName;
  if (sceneName) return sceneName;
  return 'Untitled Vision';
}

function resolveImageUrl(primary: string | null | undefined, fallback: string): string | null {
  const candidate = primary || fallback;
  if (!candidate) return null;
  return candidate.startsWith('http') ? candidate : null;
}

function ParticleConstellation() {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<ShaderMaterial>(null);

  const [positions, offsets, sizes] = useMemo(() => {
    const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    const particleOffsets = new Float32Array(PARTICLE_COUNT);
    const particleSizes = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const base = i * 3;
      // Spread out further for macro depth-of-field feel
      particlePositions[base] = (pseudoRandom(i + 11) - 0.5) * 12;
      particlePositions[base + 1] = (pseudoRandom(i + 101) - 0.5) * 8;
      particlePositions[base + 2] = (pseudoRandom(i + 211) - 0.5) * 8;

      particleOffsets[i] = pseudoRandom(i + 31) * Math.PI * 2;
      particleSizes[i] = 2.0 + pseudoRandom(i + 41) * 5.0;
    }

    return [particlePositions, particleOffsets, particleSizes] as const;
  }, []);

  useFrame(({ clock, mouse }) => {
    if (!pointsRef.current || !materialRef.current) return;
    const elapsed = clock.getElapsedTime();
    pointsRef.current.rotation.y = elapsed * 0.035;
    pointsRef.current.rotation.x = 0.1 + mouse.y * 0.1;
    pointsRef.current.position.x += (mouse.x * 0.3 - pointsRef.current.position.x) * 0.04;
    pointsRef.current.position.y += (mouse.y * 0.15 - pointsRef.current.position.y) * 0.04;

    materialRef.current.uniforms.uTime.value = elapsed;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aOffset" args={[offsets, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uColor: { value: new Color('#e8d5a3') },
        }}
        vertexShader={`
          varying float vAlpha;
          attribute float aOffset;
          attribute float aSize;
          uniform float uTime;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            // Pulse alpha based on time and individual offset
            vAlpha = 0.2 + 0.8 * sin(uTime * 1.2 + aOffset);
            // Size attenuation based on depth
            gl_PointSize = aSize * (16.0 / -mvPosition.z);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            vec2 cxy = 2.0 * gl_PointCoord - 1.0;
            float r = dot(cxy, cxy);
            if (r > 1.0) discard;
            // Create a soft glowing edge instead of a hard square
            float glow = exp(-r * 3.0);
            gl_FragColor = vec4(uColor, glow * vAlpha * 0.75);
          }
        `}
      />
    </points>
  );
}

function getDisplayName(email: string | null | undefined): string {
  if (!email) return 'Chronicler';
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const sessions = useAppStore((state) => state.sessions);
  const lorebooks = useAppStore((state) => state.lorebooks);
  const images = useAppStore((state) => state.images);
  const fetchSessions = useAppStore((state) => state.fetchSessions);
  const fetchLorebooks = useAppStore((state) => state.fetchLorebooks);
  const fetchImages = useAppStore((state) => state.fetchImages);

  const [publicLorebooks, setPublicLorebooks] = useState<PublicLorebook[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeSessions = useMemo(() => sessions.slice(0, 3), [sessions]);
  const visibleLorebooks = useMemo(() => lorebooks.slice(0, 5), [lorebooks]);
  const recentVisions = useMemo(() => images.slice(0, 4), [images]);
  const heroVision = recentVisions[0] || null;
  const thumbVisions = recentVisions.slice(1);

  useEffect(() => {
    let cancelled = false;

    const loadDashboardData = async () => {
      setLoading(true);
      setError(null);

      try {
        await Promise.all([fetchSessions(), fetchLorebooks(), fetchImages()]);
        const publicEntries = await listPublicLorebooks();
        if (!cancelled) setPublicLorebooks(publicEntries);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load sanctum data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadDashboardData();
    return () => {
      cancelled = true;
    };
  }, [fetchImages, fetchLorebooks, fetchSessions]);

  useEffect(() => {
    let cancelled = false;

    const loadSignedUrls = async () => {
      if (recentVisions.length === 0) {
        setImageUrls({});
        return;
      }

      const urlEntries = await Promise.all(
        recentVisions.map(async (asset) => {
          try {
            const detail = await getImage(asset.id);
            return [asset.id, detail.signed_url || detail.gs_uri] as const;
          } catch {
            return [asset.id, asset.gs_uri] as const;
          }
        }),
      );

      if (cancelled) return;

      const nextMap: Record<string, string> = {};
      for (const [id, url] of urlEntries) {
        if (url && url.startsWith('http')) {
          nextMap[id] = url;
        }
      }
      setImageUrls(nextMap);
    };

    void loadSignedUrls();
    return () => {
      cancelled = true;
    };
  }, [recentVisions]);

  useEffect(() => {
    if (loading) return;

    const revealTargets = document.querySelectorAll('[data-dashboard-reveal]');
    const cardTargets = document.querySelectorAll('[data-dashboard-card]');

    const revealAnimation = animate(revealTargets, {
      opacity: [0, 1],
      translateY: [20, 0],
      delay: stagger(140, { start: 140 }),
      duration: 500,
      ease: 'outQuad',
    });

    const cardAnimation = animate(cardTargets, {
      opacity: [0, 1],
      translateY: [14, 0],
      delay: stagger(60, { start: 360 }),
      duration: 380,
      ease: 'outQuad',
    });

    return () => {
      revealAnimation.pause();
      cardAnimation.pause();
    };
  }, [loading]);

  return (
    <div className={styles.page}>
      <div className={styles.constellationLayer} aria-hidden="true">
        <Canvas camera={{ position: [0, 0, 4], fov: 55 }} dpr={[1, 1.5]}>
          <ParticleConstellation />
        </Canvas>
      </div>

      <header className={styles.welcome} data-dashboard-reveal>
        <p className={styles.kicker}>The Sanctum</p>
        <h1 className={styles.title}>Welcome back, {getDisplayName(user?.email)}</h1>
        <p className={styles.subtitle}>
          Observe your active tales, curate your lorebooks, and follow the latest visions
          shaping your world.
        </p>
      </header>

      {error ? (
        <div className={styles.errorBanner} data-dashboard-reveal>
          Failed to sync sanctum data: {error}
        </div>
      ) : null}

      {loading ? (
        <Card hoverable={false} className={styles.loadingCard}>
          <p>Attuning the sanctum...</p>
        </Card>
      ) : (
        <>
          <section className={styles.section} data-dashboard-reveal>
            <SectionHeader title="Active Tales">
              <Link to="/story-studio" className={styles.sectionLink}>
                Open Writing Desk
              </Link>
            </SectionHeader>

            <div className={styles.gridThree}>
              {activeSessions.length === 0 ? (
                <Card hoverable={false} className={styles.emptyCard}>
                  <p>No active story sessions yet.</p>
                  <p className={styles.mutedText}>Begin a new conjuration to awaken your first tale.</p>
                </Card>
              ) : (
                activeSessions.map((session) => (
                  <Card key={session.id} className={styles.taleCard} data-dashboard-card>
                    <div className={styles.cardHeader}>
                      <Tag label={formatLabel(session.genre)} selected />
                      <Tag label={formatLabel(session.status)} />
                    </div>
                    <h3 className={styles.cardTitle}>{formatLabel(session.world_era)} Chronicle</h3>
                    <p className={styles.mutedText}>Lorebook {session.lorebook_id}</p>
                    <p className={styles.metaText}>Last edited {formatDate(session.updated_at)}</p>
                    <div className={styles.progressTrack}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${getStatusProgress(session.status)}%` }}
                      />
                    </div>
                  </Card>
                ))
              )}
            </div>
          </section>

          <section className={styles.section} data-dashboard-reveal>
            <SectionHeader title="Your Lorebooks">
              <Link to="/lorebook" className={styles.sectionLink}>
                Open Archive
              </Link>
            </SectionHeader>

            <div className={styles.gridThree}>
              {visibleLorebooks.map((lorebook) => (
                <Card key={lorebook.id} className={styles.lorebookCard} data-dashboard-card>
                  <div className={styles.cardHeader}>
                    <Tag label={formatLabel(lorebook.genre)} />
                  </div>
                  <h3 className={styles.cardTitle}>{lorebook.title}</h3>
                  <p className={styles.mutedText}>{lorebook.description || 'No description yet.'}</p>
                  <p className={styles.metaText}>{lorebook.entry_count} entries recorded</p>
                </Card>
              ))}

              <Link to="/lorebook" className={styles.newLorebookLink}>
                <Card className={styles.newLorebookCard} data-dashboard-card>
                  <h3 className={styles.cardTitle}>+ New</h3>
                  <p className={styles.mutedText}>Create another codex section for your worlds.</p>
                </Card>
              </Link>
            </div>
          </section>

          <section className={styles.section} data-dashboard-reveal>
            <SectionHeader title="Recent Visions">
              <Link to="/gallery" className={styles.sectionLink}>
                Open Gallery
              </Link>
            </SectionHeader>

            {heroVision ? (
              <div className={styles.visionLayout}>
                <Card className={styles.heroVisionCard} data-dashboard-card>
                  {resolveImageUrl(imageUrls[heroVision.id], heroVision.gs_uri) ? (
                    <img
                      className={styles.heroVisionImage}
                      src={resolveImageUrl(imageUrls[heroVision.id], heroVision.gs_uri) || ''}
                      alt={getVisionTitle(heroVision.character_name, heroVision.scene_name)}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.visionFallback}>Vision pending signed URL</div>
                  )}
                  <div className={styles.heroOverlay}>
                    <h3 className={styles.cardTitle}>
                      {getVisionTitle(heroVision.character_name, heroVision.scene_name)}
                    </h3>
                    <p className={styles.mutedText}>{heroVision.prompt_used || 'No prompt metadata.'}</p>
                  </div>
                </Card>

                <div className={styles.thumbColumn}>
                  {thumbVisions.length === 0 ? (
                    <Card hoverable={false} className={styles.emptyCard}>
                      <p>No additional visions yet.</p>
                    </Card>
                  ) : (
                    thumbVisions.map((vision) => {
                      const src = resolveImageUrl(imageUrls[vision.id], vision.gs_uri);
                      return (
                        <Card key={vision.id} className={styles.thumbCard} data-dashboard-card>
                          {src ? (
                            <img
                              className={styles.thumbImage}
                              src={src}
                              alt={getVisionTitle(vision.character_name, vision.scene_name)}
                              loading="lazy"
                            />
                          ) : (
                            <div className={styles.thumbFallback} />
                          )}
                          <p className={styles.thumbLabel}>
                            {getVisionTitle(vision.character_name, vision.scene_name)}
                          </p>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <Card hoverable={false} className={styles.emptyCard}>
                <p>No generated visions yet.</p>
                <p className={styles.mutedText}>Generate a character or scene image to illuminate this section.</p>
              </Card>
            )}
          </section>

          <section className={styles.section} data-dashboard-reveal>
            <SectionHeader title="Whispers from Afar">
              <Link to="/crossroads" className={styles.sectionLink}>
                Enter Crossroads
              </Link>
            </SectionHeader>

            <Card className={styles.whispersCard} data-dashboard-card>
              {publicLorebooks.length === 0 ? (
                <p className={styles.mutedText}>
                  No public lorebooks detected yet. The roads are quiet for now.
                </p>
              ) : (
                <>
                  <p className={styles.whisperHeadline}>
                    {publicLorebooks.length} public worlds are available for discovery.
                  </p>
                  <ul className={styles.whisperList}>
                    {publicLorebooks.slice(0, 3).map((item) => (
                      <li key={item.id}>
                        {item.title} · {item.public_entry_count} public entries
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
