import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import {
  acceptCrossover,
  discoverRemoteAgent,
  importLorebook,
  listPublicLorebooks,
  proposeCrossover,
  sendA2AMessage,
  syncA2AAgents,
  type CrossoverProposal,
  type PublicLorebook,
  type RemoteAgentCard,
  type A2AInteractionResult,
} from '../api';
import { Button, Card, Input, SectionHeader, Tag } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import styles from './Crossroads.module.css';

type ProposalDirection = 'incoming' | 'outgoing';
type ProposalStatus = 'pending' | 'accepted' | 'declined';

interface ProposalRecord {
  id: string;
  createdAt: string;
  direction: ProposalDirection;
  status: ProposalStatus;
  proposal: CrossoverProposal;
  resultSummary?: string;
}

let proposalSeed = 0;

function createProposalId(): string {
  proposalSeed += 1;
  return `proposal-${proposalSeed}`;
}

function parseCharacterNames(value: string): string[] {
  const entries = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(entries));
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

export default function Crossroads() {
  const lorebooks = useAppStore((state) => state.lorebooks);
  const fetchLorebooks = useAppStore((state) => state.fetchLorebooks);
  const a2aAgents = useAppStore((state) => state.a2aAgents);
  const fetchA2AAgents = useAppStore((state) => state.fetchA2AAgents);
  const addToast = useAppStore((state) => state.addToast);

  const [publicLorebooks, setPublicLorebooks] = useState<PublicLorebook[]>([]);
  const [selectedPreviewId, setSelectedPreviewId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [selectedLocalLorebookId, setSelectedLocalLorebookId] = useState('');
  const [proposalMode, setProposalMode] = useState<ProposalDirection>('incoming');
  const [characterNames, setCharacterNames] = useState('');
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [expandedProposalId, setExpandedProposalId] = useState<string | null>(null);

  const [incomingProposals, setIncomingProposals] = useState<ProposalRecord[]>([]);
  const [outgoingProposals, setOutgoingProposals] = useState<ProposalRecord[]>([]);

  // A2A state
  const [discoverUrl, setDiscoverUrl] = useState('');
  const [discoveredCard, setDiscoveredCard] = useState<RemoteAgentCard | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [a2aMessage, setA2aMessage] = useState('');
  const [a2aResult, setA2aResult] = useState<A2AInteractionResult | null>(null);
  const [sendingA2a, setSendingA2a] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadCrossroads = async () => {
      setLoading(true);
      setError(null);

      try {
        await Promise.all([fetchLorebooks(), fetchA2AAgents()]);
        const discovered = await listPublicLorebooks();
        if (!cancelled) {
          setPublicLorebooks(discovered);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to open the crossroads.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadCrossroads();
    return () => {
      cancelled = true;
    };
  }, [fetchLorebooks, fetchA2AAgents]);

  useEffect(() => {
    if (lorebooks.length === 0) {
      setSelectedLocalLorebookId('');
      return;
    }

    if (!selectedLocalLorebookId || !lorebooks.some((item) => item.id === selectedLocalLorebookId)) {
      setSelectedLocalLorebookId(lorebooks[0].id);
    }
  }, [lorebooks, selectedLocalLorebookId]);

  useEffect(() => {
    if (publicLorebooks.length === 0) {
      setSelectedPreviewId('');
      setDrawerOpen(false);
      return;
    }

    if (!selectedPreviewId || !publicLorebooks.some((item) => item.id === selectedPreviewId)) {
      setSelectedPreviewId(publicLorebooks[0].id);
    }
  }, [publicLorebooks, selectedPreviewId]);

  const lorebookNameById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const lorebook of lorebooks) {
      next[lorebook.id] = lorebook.title;
    }
    for (const lorebook of publicLorebooks) {
      if (!next[lorebook.id]) {
        next[lorebook.id] = lorebook.title;
      }
    }
    return next;
  }, [lorebooks, publicLorebooks]);

  const publicCountById = useMemo(() => {
    const next: Record<string, number> = {};
    for (const lorebook of publicLorebooks) {
      next[lorebook.id] = lorebook.public_entry_count;
    }
    return next;
  }, [publicLorebooks]);

  const previewLorebook = useMemo(() => {
    return publicLorebooks.find((item) => item.id === selectedPreviewId) || null;
  }, [publicLorebooks, selectedPreviewId]);

  const sharedWorlds = useMemo(() => {
    return lorebooks.filter((item) => publicCountById[item.id] > 0);
  }, [lorebooks, publicCountById]);

  const refreshData = async () => {
    const [, discovered] = await Promise.all([
      fetchLorebooks(),
      listPublicLorebooks(),
      fetchA2AAgents(),
    ]);
    setPublicLorebooks(discovered);
  };

  const handleDiscover = async () => {
    if (!discoverUrl.trim() || discovering) return;
    setDiscovering(true);
    setDiscoveredCard(null);
    setA2aResult(null);
    try {
      const card = await discoverRemoteAgent(discoverUrl.trim());
      setDiscoveredCard(card);
      addToast({ variant: 'success', message: `Discovered agent: ${card.name}` });
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Discovery failed.',
      });
    } finally {
      setDiscovering(false);
    }
  };

  const handleSendA2a = async () => {
    if (!discoveredCard || !a2aMessage.trim() || sendingA2a) return;
    setSendingA2a(true);
    setA2aResult(null);
    try {
      const result = await sendA2AMessage(discoveredCard.url, a2aMessage.trim());
      setA2aResult(result);
      addToast({ variant: 'success', message: 'A2A response received.' });
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'A2A interaction failed.',
      });
    } finally {
      setSendingA2a(false);
    }
  };

  const handleSyncAgents = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncA2AAgents();
      await fetchA2AAgents();
      addToast({
        variant: 'success',
        message: `Synced: ${result.registered} registered, ${result.total_active} active.`,
      });
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Sync failed.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const openPreviewDrawer = (lorebookId: string) => {
    setSelectedPreviewId(lorebookId);
    setProposalError(null);
    setDrawerOpen(true);
  };

  const handleImport = async (lorebookId: string) => {
    if (importingId) return;

    setImportingId(lorebookId);
    setError(null);

    try {
      const result = await importLorebook(lorebookId);
      addToast({
        variant: 'success',
        message: `Imported ${result.entries_imported} entries into ${result.title}.`,
      });
      await refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed.';
      setError(message);
      addToast({
        variant: 'error',
        message: `Import failed: ${message}`,
      });
    } finally {
      setImportingId(null);
    }
  };

  const handleCreateProposal = async () => {
    if (!previewLorebook || proposing) return;

    const names = parseCharacterNames(characterNames);
    if (names.length === 0) {
      setProposalError('Please provide at least one character name.');
      return;
    }

    if (!selectedLocalLorebookId) {
      setProposalError('No local lorebook available for crossover.');
      return;
    }

    const sourceLorebookId = proposalMode === 'incoming'
      ? previewLorebook.id
      : selectedLocalLorebookId;
    const targetLorebookId = proposalMode === 'incoming'
      ? selectedLocalLorebookId
      : previewLorebook.id;

    if (sourceLorebookId === targetLorebookId) {
      setProposalError('Source and target lorebooks must be different.');
      return;
    }

    setProposing(true);
    setProposalError(null);

    try {
      const proposal = await proposeCrossover(sourceLorebookId, targetLorebookId, names);
      const record: ProposalRecord = {
        id: createProposalId(),
        createdAt: new Date().toISOString(),
        direction: proposalMode,
        status: 'pending',
        proposal,
      };

      if (proposalMode === 'incoming') {
        setIncomingProposals((prev) => [record, ...prev]);
      } else {
        setOutgoingProposals((prev) => [record, ...prev]);
      }

      setExpandedProposalId(record.id);
      setCharacterNames('');

      addToast({
        variant: proposal.has_conflicts ? 'info' : 'success',
        message: `Proposal created with ${proposal.characters.length} matched characters.`,
      });

      if (proposal.not_found.length > 0) {
        addToast({
          variant: 'info',
          message: `${proposal.not_found.length} names were not found in the source lorebook.`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create proposal.';
      setProposalError(message);
      addToast({
        variant: 'error',
        message,
      });
    } finally {
      setProposing(false);
    }
  };

  const markProposalStatus = (
    direction: ProposalDirection,
    proposalId: string,
    status: ProposalStatus,
    resultSummary?: string,
  ) => {
    const updater = (records: ProposalRecord[]) => {
      return records.map((record) => {
        if (record.id !== proposalId) return record;
        return { ...record, status, resultSummary };
      });
    };

    if (direction === 'incoming') {
      setIncomingProposals(updater);
      return;
    }
    setOutgoingProposals(updater);
  };

  const handleDecline = (record: ProposalRecord) => {
    markProposalStatus(record.direction, record.id, 'declined');
    addToast({
      variant: 'info',
      message: 'Proposal declined.',
    });
  };

  const handleAccept = async (record: ProposalRecord) => {
    if (acceptingId || record.status !== 'pending') return;

    setAcceptingId(record.id);
    setError(null);

    try {
      const result = await acceptCrossover(record.proposal);
      markProposalStatus(
        record.direction,
        record.id,
        'accepted',
        `${result.entries_copied} entries copied to target lorebook.`,
      );
      addToast({
        variant: 'success',
        message: `Accepted proposal. ${result.entries_copied} entries copied.`,
      });
      await refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to accept proposal.';
      setError(message);
      addToast({
        variant: 'error',
        message,
      });
    } finally {
      setAcceptingId(null);
    }
  };

  const renderProposalCard = (record: ProposalRecord) => {
    const isExpanded = expandedProposalId === record.id;

    return (
      <Card key={record.id} hoverable={false} className={styles.proposalCard}>
        <div className={styles.proposalHeader}>
          <div>
            <p className={styles.proposalRoute}>
              {lorebookNameById[record.proposal.source_lorebook_id] || record.proposal.source_lorebook_id}
              {' → '}
              {lorebookNameById[record.proposal.target_lorebook_id] || record.proposal.target_lorebook_id}
            </p>
            <p className={styles.proposalTime}>{formatDate(record.createdAt)}</p>
          </div>
          <span className={`${styles.statusBadge} ${styles[`status${record.status}`]}`}>
            {record.status}
          </span>
        </div>

        <p className={styles.proposalSummary}>
          {record.proposal.characters.length} matched · {record.proposal.conflicts.length} conflicts
        </p>

        {record.proposal.has_conflicts ? (
          <p className={styles.warningText}>Conflicts: {record.proposal.conflicts.join(', ')}</p>
        ) : null}

        {record.proposal.not_found.length > 0 ? (
          <p className={styles.mutedText}>Not found: {record.proposal.not_found.join(', ')}</p>
        ) : null}

        {isExpanded ? (
          <div className={styles.reviewPanel}>
            <p className={styles.panelTitle}>Characters in proposal</p>
            {record.proposal.characters.length === 0 ? (
              <p className={styles.mutedText}>No characters matched.</p>
            ) : (
              <ul className={styles.characterList}>
                {record.proposal.characters.map((character) => (
                  <li key={character.id}>{character.name}</li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {record.resultSummary ? <p className={styles.resultText}>{record.resultSummary}</p> : null}

        <div className={styles.proposalActions}>
          <Button
            variant="ghost"
            onClick={() =>
              setExpandedProposalId((prev) => (prev === record.id ? null : record.id))
            }
          >
            {isExpanded ? 'Hide Review' : 'Review'}
          </Button>

          {record.direction === 'incoming' && record.status === 'pending' ? (
            <>
              <Button onClick={() => { void handleAccept(record); }} disabled={acceptingId === record.id}>
                {acceptingId === record.id ? 'Accepting...' : 'Accept'}
              </Button>
              <Button variant="ghost" onClick={() => handleDecline(record)}>
                Decline
              </Button>
            </>
          ) : null}
        </div>
      </Card>
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>The Crossroads</p>
        <h1 className={styles.title}>Collaboration Hub</h1>
        <p className={styles.subtitle}>
          Discover public worlds, import shared lorebooks, and negotiate crossover proposals.
        </p>
      </header>

      {error ? <div className={styles.errorBanner}>Crossroads sync failed: {error}</div> : null}

      {loading ? (
        <Card hoverable={false} className={styles.loadingCard}>
          <p>Opening collaboration channels...</p>
        </Card>
      ) : (
        <>
          <section className={styles.section}>
            <SectionHeader title="Discover">
              <span className={styles.sectionMeta}>{publicLorebooks.length} public worlds</span>
            </SectionHeader>

            {publicLorebooks.length === 0 ? (
              <Card hoverable={false} className={styles.emptyCard}>
                <p>No public lorebooks are visible right now.</p>
              </Card>
            ) : (
              <div className={styles.discoverGrid}>
                {publicLorebooks.map((lorebook) => (
                  <Card key={lorebook.id} hoverable={false} className={styles.worldCard}>
                    <div className={styles.cardHeader}>
                      <Tag label={lorebook.genre || 'Unknown'} />
                      <Tag label={`${lorebook.public_entry_count} Public`} selected />
                    </div>

                    <h3 className={styles.worldTitle}>{lorebook.title}</h3>
                    <p className={styles.worldDescription}>
                      {lorebook.description || 'No description provided by the originating chronicler.'}
                    </p>
                    <p className={styles.worldMeta}>Chronicler unknown · ID {lorebook.id}</p>

                    <div className={styles.cardActions}>
                      <Button variant="ghost" onClick={() => openPreviewDrawer(lorebook.id)}>
                        Preview
                      </Button>
                      <Button
                        onClick={() => { void handleImport(lorebook.id); }}
                        disabled={importingId === lorebook.id}
                      >
                        {importingId === lorebook.id ? 'Importing...' : 'Import'}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <SectionHeader title="Crossover Proposals" />

            <div className={styles.proposalsGrid}>
              <div className={styles.proposalColumn}>
                <h3 className={styles.columnTitle}>Incoming</h3>
                {incomingProposals.length === 0 ? (
                  <Card hoverable={false} className={styles.emptyCard}>
                    <p>No incoming proposals yet.</p>
                  </Card>
                ) : (
                  <div className={styles.proposalList}>
                    {incomingProposals.map((record) => renderProposalCard(record))}
                  </div>
                )}
              </div>

              <div className={styles.proposalColumn}>
                <h3 className={styles.columnTitle}>Outgoing</h3>
                {outgoingProposals.length === 0 ? (
                  <Card hoverable={false} className={styles.emptyCard}>
                    <p>No outgoing proposals yet.</p>
                  </Card>
                ) : (
                  <div className={styles.proposalList}>
                    {outgoingProposals.map((record) => renderProposalCard(record))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <SectionHeader title="Your Shared Worlds" />

            {sharedWorlds.length === 0 ? (
              <Card hoverable={false} className={styles.emptyCard}>
                <p>No local lorebooks with public entries yet.</p>
              </Card>
            ) : (
              <div className={styles.sharedWorlds}>
                {sharedWorlds.map((lorebook) => (
                  <Card key={lorebook.id} hoverable={false} className={styles.sharedWorldCard}>
                    <div className={styles.sharedWorldRow}>
                      <div>
                        <h3 className={styles.sharedWorldTitle}>{lorebook.title}</h3>
                        <p className={styles.sharedWorldMeta}>
                          {publicCountById[lorebook.id]} public entries shared
                        </p>
                      </div>
                      <Link to="/lorebook" className={styles.manageLink}>
                        Manage
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* ─── A2A Network ─── */}
          <section className={styles.section}>
            <SectionHeader title="A2A Network">
              <span className={styles.sectionMeta}>Agent-to-Agent Protocol</span>
            </SectionHeader>

            <Card hoverable={false} className={styles.a2aGuideCard}>
              <h3 className={styles.a2aGuideTitle}>What is A2A?</h3>
              <p className={styles.a2aGuideDesc}>
                The <strong>Agent-to-Agent (A2A) protocol</strong> lets LorePack agents communicate
                with other deployed agents across the network — sharing world lore, answering
                questions about characters, and enabling cross-world collaboration.
              </p>

              <div className={styles.a2aGuideSteps}>
                <div className={styles.a2aGuideStep}>
                  <span className={styles.a2aStepNum}>1</span>
                  <div>
                    <p className={styles.a2aStepTitle}>Deploy your agents</p>
                    <p className={styles.a2aStepDesc}>
                      Run <code>make deploy</code> from the project root to publish your lorebook
                      agents to Google Agent Engine.
                    </p>
                  </div>
                </div>
                <div className={styles.a2aGuideStep}>
                  <span className={styles.a2aStepNum}>2</span>
                  <div>
                    <p className={styles.a2aStepTitle}>Discover remote agents</p>
                    <p className={styles.a2aStepDesc}>
                      Enter a remote agent&apos;s URL below (e.g.
                      <code>https://host/.well-known/agent-card.json</code>) and click Discover.
                    </p>
                  </div>
                </div>
                <div className={styles.a2aGuideStep}>
                  <span className={styles.a2aStepNum}>3</span>
                  <div>
                    <p className={styles.a2aStepTitle}>Send messages</p>
                    <p className={styles.a2aStepDesc}>
                      Once discovered, you can chat with the remote agent — ask about their world&apos;s
                      lore, characters, or propose collaborative story elements.
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <Card hoverable={false} className={styles.a2aDiscoverCard}>
              <p className={styles.a2aLabel}>Discover a remote agent</p>
              <div className={styles.a2aDiscoverRow}>
                <Input
                  value={discoverUrl}
                  onChange={(e) => setDiscoverUrl(e.target.value)}
                  placeholder="https://remote-host/.well-known/agent-card.json"
                />
                <Button
                  onClick={() => { void handleDiscover(); }}
                  disabled={discovering || !discoverUrl.trim()}
                >
                  {discovering ? 'Discovering...' : 'Discover'}
                </Button>
              </div>

              {discoveredCard ? (
                <div className={styles.a2aCardResult}>
                  <h4 className={styles.a2aCardName}>{discoveredCard.name}</h4>
                  <p className={styles.a2aCardDesc}>{discoveredCard.description}</p>
                  <p className={styles.a2aCardUrl}>{discoveredCard.url}</p>

                  {discoveredCard.skills.length > 0 ? (
                    <div className={styles.a2aSkills}>
                      {discoveredCard.skills.map((skill) => (
                        <Tag key={skill.id} label={skill.name} />
                      ))}
                    </div>
                  ) : null}

                  <div className={styles.a2aInteract}>
                    <p className={styles.a2aLabel}>Send a message</p>
                    <Input
                      value={a2aMessage}
                      onChange={(e) => setA2aMessage(e.target.value)}
                      multiline
                      rows={3}
                      placeholder="Ask something about this agent's world..."
                    />
                    <Button
                      onClick={() => { void handleSendA2a(); }}
                      disabled={sendingA2a || !a2aMessage.trim()}
                    >
                      {sendingA2a ? 'Sending...' : 'Send'}
                    </Button>
                  </div>

                  {a2aResult ? (
                    <div className={styles.a2aResponse}>
                      <p className={styles.a2aLabel}>Response</p>
                      <p className={styles.a2aResponseText}>{a2aResult.response}</p>
                      <p className={styles.a2aResponseMeta}>
                        Status: {a2aResult.status}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          </section>

          {/* ─── Your Published Agents ─── */}
          <section className={styles.section}>
            <SectionHeader title="Your Published Agents">
              <Button variant="ghost" onClick={() => { void handleSyncAgents(); }} disabled={syncing}>
                {syncing ? 'Syncing...' : '↻ Sync'}
              </Button>
            </SectionHeader>

            {a2aAgents.length === 0 ? (
              <Card hoverable={false} className={styles.emptyCard}>
                <p>No lorebooks are published as A2A agents yet. Set a lorebook entry to public to auto-register.</p>
              </Card>
            ) : (
              <div className={styles.agentGrid}>
                {a2aAgents.map((agent) => (
                  <Card key={agent.id} hoverable={false} className={styles.agentCard}>
                    <h3 className={styles.agentName}>{agent.name}</h3>
                    <p className={styles.agentDesc}>{agent.description}</p>
                    <div className={styles.agentSkills}>
                      {agent.skills.map((skill) => (
                        <Tag key={skill.id} label={skill.name} selected />
                      ))}
                    </div>
                    <p className={styles.agentUrl}>{agent.url}</p>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {drawerOpen && previewLorebook ? (
        <div className={styles.drawerOverlay} onClick={() => setDrawerOpen(false)} role="presentation">
          <aside
            className={styles.drawer}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Lorebook preview and crossover proposal"
          >
            <header className={styles.drawerHeader}>
              <div>
                <p className={styles.drawerKicker}>Preview</p>
                <h3 className={styles.drawerTitle}>{previewLorebook.title}</h3>
              </div>
              <button
                type="button"
                className={styles.drawerClose}
                onClick={() => setDrawerOpen(false)}
                aria-label="Close preview"
              >
                ×
              </button>
            </header>

            <p className={styles.drawerDescription}>
              {previewLorebook.description || 'No description provided for this public lorebook.'}
            </p>
            <p className={styles.drawerMeta}>{previewLorebook.public_entry_count} public entries available</p>

            <div className={styles.modeToggle}>
              <Tag
                label="Incoming"
                selected={proposalMode === 'incoming'}
                onClick={() => setProposalMode('incoming')}
              />
              <Tag
                label="Outgoing"
                selected={proposalMode === 'outgoing'}
                onClick={() => setProposalMode('outgoing')}
              />
            </div>

            <div className={styles.drawerField}>
              <label htmlFor="crossroads-local-lorebook" className={styles.fieldLabel}>
                {proposalMode === 'incoming' ? 'Target Lorebook' : 'Source Lorebook'}
              </label>
              <select
                id="crossroads-local-lorebook"
                className={styles.select}
                value={selectedLocalLorebookId}
                onChange={(event) => setSelectedLocalLorebookId(event.target.value)}
              >
                {lorebooks.map((lorebook) => (
                  <option key={lorebook.id} value={lorebook.id}>
                    {lorebook.title}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.drawerField}>
              <p className={styles.fieldLabel}>Character Names</p>
              <Input
                value={characterNames}
                onChange={(event) => setCharacterNames(event.target.value)}
                multiline
                rows={4}
                placeholder="Aria Stormwind, Kael Ironforge"
              />
            </div>

            {proposalError ? <p className={styles.drawerError}>{proposalError}</p> : null}

            <div className={styles.drawerActions}>
              <Button
                onClick={() => { void handleCreateProposal(); }}
                disabled={proposing || lorebooks.length === 0}
              >
                {proposing ? 'Creating...' : 'Create Proposal'}
              </Button>
              <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
                Close
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
