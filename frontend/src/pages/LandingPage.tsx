import { useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { animate, stagger } from 'animejs';
import * as THREE from 'three';
import { Divider } from '../components/ui';
import { useI18n } from '../i18n';
import styles from './LandingPage.module.css';

// Pre-generate particle data outside the component to avoid impure calls during render
function createParticles(count: number) {
    const temp = [];
    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * 20;
        const y = (Math.random() - 0.5) * 20;
        const z = (Math.random() - 0.5) * 10;
        const factor = Math.random() * 0.5 + 0.1;
        const speed = Math.random() * 0.01 + 0.005;
        temp.push({ t: Math.random() * 100, x, y, z, factor, speed });
    }
    return temp;
}

const DEFAULT_PARTICLES = createParticles(80);

// Particle Background — reacts to scroll position
function ParticleSystem({ count = 80 }) {
    const mesh = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const scrollY = useRef(0);

    useEffect(() => {
        const onScroll = () => { scrollY.current = window.scrollY; };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const particlesRef = useRef(count === 80 ? DEFAULT_PARTICLES : createParticles(count));
    const particles = particlesRef.current;

    useFrame(() => {
        if (!mesh.current) return;

        const scrollOffset = scrollY.current * 0.001;

        particles.forEach((particle, i) => {
            const { factor, speed, x, y, z } = particle;
            const t = particle.t + speed;
            particle.t = t;

            dummy.position.set(
                x + Math.cos(t + scrollOffset) * factor,
                y + Math.sin(t) * factor + scrollOffset * 2,
                z + Math.cos(t * 0.5) * factor
            );
            dummy.rotation.set(t, t, t);

            const scale = Math.max(0.1, Math.sin(t)) * 0.05;
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();
            mesh.current!.setMatrixAt(i, dummy.matrix);
        });
        mesh.current.instanceMatrix.needsUpdate = true;
        mesh.current.rotation.y += 0.0005;
    });

    return (
        <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color="#c4a265" transparent opacity={0.6} />
        </instancedMesh>
    );
}

// Ambient glow that shifts with scroll
function AmbientGlow() {
    const meshRef = useRef<THREE.Mesh>(null);
    const scrollY = useRef(0);
    const { viewport } = useThree();

    useEffect(() => {
        const onScroll = () => { scrollY.current = window.scrollY; };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useFrame(({ clock }) => {
        if (!meshRef.current) return;
        const t = clock.getElapsedTime();
        const scrollNorm = Math.min(scrollY.current / 2000, 1);
        meshRef.current.position.y = -scrollNorm * 4 + Math.sin(t * 0.3) * 0.5;
        meshRef.current.position.x = Math.cos(t * 0.2) * 1.5;
        const mat = meshRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.08 + Math.sin(t * 0.5) * 0.03;
    });

    return (
        <mesh ref={meshRef} position={[0, 0, -3]}>
            <circleGeometry args={[viewport.width * 0.4, 64]} />
            <meshBasicMaterial color="#c4a265" transparent opacity={0.08} />
        </mesh>
    );
}

// Decorative step number component
function StepNumber({ n }: { n: number }) {
    return <span className={styles.stepNumber}>{String(n).padStart(2, '0')}</span>;
}

// Scroll-triggered animation hook
function useScrollReveal() {
    const observerRef = useRef<IntersectionObserver | null>(null);
    const animatedSet = useRef(new Set<string>());

    const setupObserver = useCallback(() => {
        if (observerRef.current) observerRef.current.disconnect();

        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target as HTMLElement;
                    const id = el.dataset.scrollReveal;
                    if (!id || animatedSet.current.has(id)) return;
                    animatedSet.current.add(id);
                    observerRef.current?.unobserve(el);

                    switch (id) {
                        case 'how-it-works': {
                            animate(el, {
                                opacity: [0, 1],
                                translateY: [40, 0],
                                duration: 600,
                                ease: 'outQuad',
                            });
                            const steps = el.querySelectorAll('[data-landing-step]');
                            animate(steps, {
                                opacity: [0, 1],
                                translateX: [30, 0],
                                delay: stagger(100, { start: 300 }),
                                duration: 500,
                                ease: 'outQuad',
                            });
                            break;
                        }
                        case 'feature-0':
                        case 'feature-2': {
                            const visual = el.querySelector('[data-feature-visual]');
                            const text = el.querySelector('[data-feature-text]');
                            if (visual) {
                                animate(visual, {
                                    opacity: [0, 1],
                                    translateX: [-40, 0],
                                    duration: 700,
                                    ease: 'outQuad',
                                });
                            }
                            if (text) {
                                animate(text, {
                                    opacity: [0, 1],
                                    translateX: [40, 0],
                                    duration: 700,
                                    delay: 150,
                                    ease: 'outQuad',
                                });
                            }
                            // Animate mockup lines
                            const lines = el.querySelectorAll('[data-mockup-line]');
                            animate(lines, {
                                scaleX: [0, 1],
                                opacity: [0, 1],
                                delay: stagger(60, { start: 400 }),
                                duration: 400,
                                ease: 'outQuad',
                            });
                            break;
                        }
                        case 'feature-1': {
                            const visual = el.querySelector('[data-feature-visual]');
                            const text = el.querySelector('[data-feature-text]');
                            if (visual) {
                                animate(visual, {
                                    opacity: [0, 1],
                                    translateX: [40, 0],
                                    duration: 700,
                                    ease: 'outQuad',
                                });
                            }
                            if (text) {
                                animate(text, {
                                    opacity: [0, 1],
                                    translateX: [-40, 0],
                                    duration: 700,
                                    delay: 150,
                                    ease: 'outQuad',
                                });
                            }
                            const lines = el.querySelectorAll('[data-mockup-line]');
                            animate(lines, {
                                scaleX: [0, 1],
                                opacity: [0, 1],
                                delay: stagger(60, { start: 400 }),
                                duration: 400,
                                ease: 'outQuad',
                            });
                            break;
                        }
                        case 'final-cta': {
                            animate(el, {
                                opacity: [0, 1],
                                translateY: [30, 0],
                                duration: 700,
                                ease: 'outQuad',
                            });
                            const btn = el.querySelector('[data-cta-btn]');
                            if (btn) {
                                animate(btn, {
                                    opacity: [0, 1],
                                    scale: [0.9, 1],
                                    delay: 300,
                                    duration: 500,
                                    ease: 'outBack(1.4)',
                                });
                            }
                            break;
                        }
                        case 'divider': {
                            const svg = el.querySelector('svg');
                            if (svg) {
                                const lines = svg.querySelectorAll('line');
                                animate(lines, {
                                    strokeDashoffset: [100, 0],
                                    opacity: [0, 1],
                                    duration: 800,
                                    ease: 'outQuad',
                                });
                            }
                            animate(el, {
                                opacity: [0, 1],
                                duration: 600,
                                ease: 'outQuad',
                            });
                            break;
                        }
                    }
                });
            },
            { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
        );

        document.querySelectorAll('[data-scroll-reveal]').forEach((el) => {
            const id = el.getAttribute('data-scroll-reveal')!;
            if (!animatedSet.current.has(id)) {
                observerRef.current!.observe(el);
            }
        });
    }, []);

    useEffect(() => {
        setupObserver();
        return () => observerRef.current?.disconnect();
    }, [setupObserver]);
}

export default function LandingPage() {
    const mainRef = useRef<HTMLElement>(null);
    const { t } = useI18n();

    // Hero entrance animation (above fold — fires immediately)
    useEffect(() => {
        const heroEls = document.querySelectorAll('[data-landing-hero]');

        animate(heroEls, {
            opacity: [0, 1],
            translateY: [30, 0],
            delay: stagger(120, { start: 300 }),
            duration: 600,
            ease: 'outQuad',
        });
    }, []);

    // Scroll-triggered animations for below-fold content
    useScrollReveal();

    return (
        <div className={styles.landingContainer}>
            {/* 3D Background */}
            <div className={styles.canvasContainer}>
                <Canvas camera={{ position: [0, 0, 8], fov: 75 }}>
                    <fog attach="fog" args={['#0a0a0f', 5, 15]} />
                    <ParticleSystem />
                    <AmbientGlow />
                </Canvas>
            </div>

            <nav className={styles.navbar} data-landing-hero>
                <div className={styles.logo}>✦ LOREPACK</div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {/* Language switcher hidden; i18n kept for future use */}
                    <Link to="/auth" className={styles.loginBtn}>{t('Enter the Sanctum')}</Link>
                </div>
            </nav>

            <main className={styles.mainContent} ref={mainRef}>
                {/* ── Hero ── */}
                <section className={styles.hero}>
                    <p className={styles.eyebrow} data-landing-hero>{t('AI-Powered Worldbuilding')}</p>
                    <h1 className={styles.title} data-landing-hero>
                        {t('Your stories deserve')}<br />{t('a living universe.')}
                    </h1>
                    <p className={styles.subtitle} data-landing-hero>
                        {t('LorePack is an interactive writing studio that co-creates stories with you — building lorebooks, tracking characters, and illustrating scenes as your narrative unfolds.')}
                    </p>
                    <div className={styles.ctaGroup} data-landing-hero>
                        <Link to="/auth" className={styles.ctaBtn}>{t('Enter the Writing Desk')}</Link>
                    </div>
                </section>

                <div data-scroll-reveal="divider" className={styles.sectionDivider}>
                    <Divider />
                </div>

                {/* ── How It Works ── */}
                <section className={styles.howItWorks} data-scroll-reveal="how-it-works">
                    <h2 className={styles.sectionTitle}>{t('How It Works')}</h2>
                    <p className={styles.sectionSubtitle}>{t('Three steps from blank page to living world')}</p>

                    <div className={styles.steps}>
                        <div className={styles.step} data-landing-step>
                            <StepNumber n={1} />
                            <div className={styles.stepContent}>
                                <h3 className={styles.stepTitle}>Conjure Your World</h3>
                                <p className={styles.stepDesc}>
                                    {t('Pick a genre, era, and protagonist archetype. The wizard guides you through world setup in under a minute.')}
                                </p>
                            </div>
                        </div>

                        <div className={styles.stepConnector} data-landing-step>
                            <svg viewBox="0 0 2 40" className={styles.connectorSvg}>
                                <line x1="1" y1="0" x2="1" y2="40" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                            </svg>
                        </div>

                        <div className={styles.step} data-landing-step>
                            <StepNumber n={2} />
                            <div className={styles.stepContent}>
                                <h3 className={styles.stepTitle}>Write with an AI Co-Author</h3>
                                <p className={styles.stepDesc}>
                                    {t('Give natural-language directions. The AI writes prose, auto-extracts characters & locations into your lorebook, and keeps continuity tight.')}
                                </p>
                            </div>
                        </div>

                        <div className={styles.stepConnector} data-landing-step>
                            <svg viewBox="0 0 2 40" className={styles.connectorSvg}>
                                <line x1="1" y1="0" x2="1" y2="40" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                            </svg>
                        </div>

                        <div className={styles.step} data-landing-step>
                            <StepNumber n={3} />
                            <div className={styles.stepContent}>
                                <h3 className={styles.stepTitle}>Share & Crossover</h3>
                                <p className={styles.stepDesc}>
                                    {t("Publish lorebook entries, discover other creators' worlds, and propose crossover stories that merge your universes.")}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <div data-scroll-reveal="divider" className={styles.sectionDivider}>
                    <Divider />
                </div>

                {/* ── Features — alternating layout ── */}
                <section className={styles.features}>
                    <div className={styles.featureRow} data-scroll-reveal="feature-0">
                        <div className={styles.featureVisual} data-feature-visual>
                            <div className={styles.mockupFrame}>
                                <div className={styles.mockupBar}>
                                    <span className={styles.mockupDot} />
                                    <span className={styles.mockupDot} />
                                    <span className={styles.mockupDot} />
                                </div>
                                <div className={styles.mockupBody}>
                                    <div className={styles.mockupSidebar}>
                                        <div className={styles.mockupLine} data-mockup-line style={{ width: '80%' }} />
                                        <div className={styles.mockupLine} data-mockup-line style={{ width: '60%' }} />
                                        <div className={styles.mockupLine} data-mockup-line style={{ width: '70%' }} />
                                        <div className={styles.mockupLine} data-mockup-line style={{ width: '50%' }} />
                                    </div>
                                    <div className={styles.mockupContent}>
                                        <div className={styles.mockupLine} data-mockup-line style={{ width: '90%' }} />
                                        <div className={styles.mockupLine} data-mockup-line style={{ width: '100%' }} />
                                        <div className={styles.mockupLine} data-mockup-line style={{ width: '75%' }} />
                                        <div className={styles.mockupLine} data-mockup-line style={{ width: '85%' }} />
                                        <div className={styles.mockupLine} data-mockup-line style={{ width: '60%' }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.featureText} data-feature-text>
                            <span className={styles.featureLabel}>{t('The Writing Desk')}</span>
                            <h3 className={styles.featureTitle}>{t('A studio, not a chatbot')}</h3>
                            <p className={styles.featureDesc}>
                                {t("Split-pane workspace with your narrative on the left and a director's panel on the right. Give directions in plain language — the AI writes prose that stays consistent with your world.")}
                            </p>
                        </div>
                    </div>

                    <div className={`${styles.featureRow} ${styles.featureRowReverse}`} data-scroll-reveal="feature-1">
                        <div className={styles.featureVisual} data-feature-visual>
                            <div className={styles.mockupFrame}>
                                <div className={styles.mockupBar}>
                                    <span className={styles.mockupDot} />
                                    <span className={styles.mockupDot} />
                                    <span className={styles.mockupDot} />
                                </div>
                                <div className={styles.mockupBody}>
                                    <div className={styles.mockupTreeView}>
                                        <div className={styles.mockupCategoryLabel} data-mockup-line />
                                        <div className={styles.mockupTreeItem} data-mockup-line />
                                        <div className={styles.mockupTreeItem} data-mockup-line />
                                        <div className={styles.mockupCategoryLabel} data-mockup-line />
                                        <div className={styles.mockupTreeItem} data-mockup-line />
                                        <div className={styles.mockupCategoryLabel} data-mockup-line />
                                        <div className={styles.mockupTreeItem} data-mockup-line />
                                        <div className={styles.mockupTreeItem} data-mockup-line />
                                        <div className={styles.mockupTreeItem} data-mockup-line />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.featureText} data-feature-text>
                            <span className={styles.featureLabel}>{t('The Archive')}</span>
                            <h3 className={styles.featureTitle}>{t('Your world, auto-organized')}</h3>
                            <p className={styles.featureDesc}>
                                {t('Characters, locations, magic systems — extracted and categorized automatically as you write. Edit, tag, and cross-reference entries like a personal wiki.')}
                            </p>
                        </div>
                    </div>

                    <div className={styles.featureRow} data-scroll-reveal="feature-2">
                        <div className={styles.featureVisual} data-feature-visual>
                            <div className={styles.mockupFrame}>
                                <div className={styles.mockupBar}>
                                    <span className={styles.mockupDot} />
                                    <span className={styles.mockupDot} />
                                    <span className={styles.mockupDot} />
                                </div>
                                <div className={styles.mockupBody}>
                                    <div className={styles.mockupGrid}>
                                        <div className={styles.mockupGridItem} data-mockup-line />
                                        <div className={styles.mockupGridItem} data-mockup-line />
                                        <div className={styles.mockupGridItem} data-mockup-line />
                                        <div className={styles.mockupGridItem} data-mockup-line />
                                        <div className={styles.mockupGridItem} data-mockup-line />
                                        <div className={styles.mockupGridItem} data-mockup-line />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.featureText} data-feature-text>
                            <span className={styles.featureLabel}>{t('The Crossroads')}</span>
                            <h3 className={styles.featureTitle}>{t('Worlds collide on purpose')}</h3>
                            <p className={styles.featureDesc}>
                                {t('Browse public lorebooks from other creators. Propose crossovers — the AI evaluates compatibility and weaves your characters into shared adventures.')}
                            </p>
                        </div>
                    </div>
                </section>

                {/* ── Final CTA ── */}
                <section className={styles.finalCta} data-scroll-reveal="final-cta">
                    <div data-scroll-reveal="divider" className={styles.sectionDivider}>
                        <Divider />
                    </div>
                    <h2 className={styles.finalCtaTitle}>{t('Your world is waiting.')}</h2>
                    <Link to="/auth" className={styles.ctaBtn} data-cta-btn>{t('Begin Your Tale')}</Link>
                </section>
            </main>

            <footer className={styles.footer}>
                © {new Date().getFullYear()} LorePack
            </footer>
        </div>
    );
}
