import { describe, expect, it } from 'vitest';
import sourcePayload from '../../data/strategy/knowledge-base.json';
import publicPayload from '../../public/data/strategy-knowledge.json';
import catalogPayload from '../../public/data/catalog.json';
import { calculateRosterTotal } from './calculations';
import { normalizeDatabase } from './normalize';
import { claimsForGuide, claimsForSecondaryMissionGuide, detachmentBrief, detachmentSynergies, forceDispositionAxisFit, forceDispositionBrief, layoutContextBrief, matchupGuideForDispositions, matchupGuides, missionBrief, primaryMissionBrief, primaryMissionsForDisposition, referenceRostersForVictoryPlan, resolveRuleGraph, secondaryDecisionExamplesForGuide, secondaryMissionFamilies, secondaryMissionGuide, secondaryMissionRequirements, strategyKnowledge, unitBrief, unitBriefs, unitSynergies, victoryPlansForContext, workedExampleForGuide } from './strategy-knowledge';
import { validateDraft } from './validation';

const validKnowledge = {
  schemaVersion: 'warforge-strategy-knowledge/v5',
  knowledgeVersion: '2.0.0',
  catalogProvenanceSourceId: 'catalog',
  compatibility: {
    gameEdition: '11th',
    catalogSchema: 'warforge-catalog/v2',
    catalogDataVersion: '1.2.13.0',
    missionPackIds: ['gdm-2026-11th']
  },
  sources: [
    { id: 'gdm', kind: 'trusted-mission-archive', authority: 'approved-archive', title: 'GDM archive' },
    { id: 'catalog', kind: 'catalog-manifest', authority: 'local-verified', title: 'Catalog manifest', catalogSchema: 'warforge-catalog/v2', catalogDataVersion: '1.2.13.0' }
  ],
  scenarios: [{
    id: 'primary',
    kind: 'primary-card',
    title: 'Mission',
    missionPackId: 'gdm-2026-11th',
    sourceTier: 'trusted-archive',
    cardSourcePath: '/11th/primary-missions/example',
    forceDispositionId: 'own',
    opponentForceDispositionId: 'opponent',
    victoryAxes: ['primary-scoring', 'board-control'],
    scoringWindows: ['Each battle round — end of your turn.'],
    sourceIds: ['gdm'],
    confidence: 'low',
    status: 'reviewed',
    limitations: ['Archive only.']
  }],
  forceDispositions: [{
    id: 'own',
    title: 'Own disposition',
    missionPackId: 'gdm-2026-11th',
    deck: 'disruption',
    sourceTier: 'trusted-archive',
    sourcePath: '/11th/force-disposition/disruption',
    sourceIds: ['gdm'],
    confidence: 'low',
    status: 'reviewed',
    limitations: ['Archive only.']
  }],
  layoutContexts: [{
    id: 'layout',
    title: 'Layout context',
    missionPackId: 'gdm-2026-11th',
    deck: 'disruption',
    opponentDeck: 'priority-assets',
    sourceTier: 'trusted-archive',
    sourcePath: '/11th/layouts/disruption/priority-assets',
    layoutIds: [1, 2, 3],
    sourceIds: ['gdm'],
    confidence: 'low',
    status: 'reviewed',
    limitations: ['Archive only.']
  }],
  ruleNodes: [],
  unitProfiles: [],
  detachmentProfiles: [],
  synergies: [],
  metaSnapshots: [],
  recommendations: [],
  victoryPlans: [],
  referenceRosters: [],
  tacticalClaims: [],
  matchupGuides: [],
  workedExamples: [],
  secondaryMissionFrameworks: [],
  secondaryMissionFamilies: [],
  secondaryMissionGuides: [],
  secondaryDecisionExamples: []
};

describe('strategy knowledge access', () => {
  it('accepts the delivered source and requires its generated mirror to match', () => {
    const knowledge = strategyKnowledge(sourcePayload);

    expect(publicPayload).toEqual(sourcePayload);
    expect(knowledge).not.toBeNull();
    expect(knowledge?.unitProfiles).toHaveLength(27);
    expect(knowledge?.detachmentProfiles).toHaveLength(9);
    expect(knowledge?.ruleNodes).toHaveLength(30);
    expect(knowledge?.synergies).toHaveLength(24);
    expect(knowledge?.metaSnapshots).toHaveLength(1);
    expect(knowledge?.victoryPlans).toHaveLength(2);
    expect(knowledge?.referenceRosters).toHaveLength(2);
    expect(knowledge?.tacticalClaims).toHaveLength(298);
    expect(secondaryMissionFamilies(knowledge)).toHaveLength(4);
    const secondary = secondaryMissionGuide(knowledge, 'gdm-2026-secondary-cleanse');
    expect(secondary).not.toBeNull();
    expect(claimsForSecondaryMissionGuide(knowledge, secondary?.id ?? '')).toHaveLength(8);
    expect(secondaryDecisionExamplesForGuide(knowledge, secondary?.id ?? '')[0]?.branches).toHaveLength(2);
    expect(secondaryMissionRequirements(knowledge, 'gdm-2026-secondary-cleanse').map((entry) => entry.capability)).toContain('action-capacity');
    expect(matchupGuides(knowledge)).toHaveLength(15);
    const finalGuide = matchupGuideForDispositions(knowledge, 'reconnaissance', 'priority assets');
    expect(finalGuide?.slug).toBe('reconnaissance-vs-priority-assets');
    expect(claimsForGuide(knowledge, finalGuide?.id ?? '')).toHaveLength(10);
    expect(workedExampleForGuide(knowledge, finalGuide?.id ?? '')?.rounds).toHaveLength(5);
    expect(forceDispositionAxisFit(knowledge, 'book-tau-empire:detachment:0', 'purge-the-foe')).toMatchObject({
      deck: 'purge-the-foe',
      scenarioCount: 5
    });
    expect(unitBriefs(knowledge, 'book-tau-empire:unit:41')).toHaveLength(1);
    expect(unitBrief(knowledge, 'book-tau-empire:unit:41', 'detachment-profile-tau-empire-advanced-acquisition-cadre')?.roles).toContain('action-with-fire-support');
    expect(unitBrief(knowledge, 'book-tau-empire:unit:41', 'detachment-profile-orks-equatorial-hordes')).toBeNull();
    expect(unitSynergies(knowledge, 'book-tau-empire:unit:41')).toHaveLength(1);
    expect(unitSynergies(knowledge, 'book-tau-empire:unit:20')).toHaveLength(1);
    expect(unitBriefs(knowledge, 'book-tau-empire:unit:18')).toHaveLength(1);
    expect(unitSynergies(knowledge, 'book-tau-empire:unit:18')).toHaveLength(1);
    expect(detachmentSynergies(knowledge, 'book-tau-empire:detachment:0')).toHaveLength(3);
    expect(primaryMissionsForDisposition(knowledge, 'PRIORITY ASSETS').map((scenario) => scenario.id)).toContain('gdm-2026-primary-secure-asset-priority-assets-vs-take-and-hold');
    expect(primaryMissionBrief(knowledge, 'gdm-2026-primary-secure-asset-priority-assets-vs-take-and-hold')?.title).toContain('Secure Asset');
    expect(victoryPlansForContext(knowledge, 'book-space-marines:detachment:4', 'gdm-2026-primary-secure-asset-priority-assets-vs-take-and-hold').map((plan) => plan.id)).toEqual(['victory-plan-space-marines-firestorm-secure-asset']);
    expect(referenceRostersForVictoryPlan(knowledge, 'victory-plan-salamanders-forgefather-secure-asset')).toHaveLength(1);
    const firestormPlan = victoryPlansForContext(knowledge, 'book-space-marines:detachment:4', 'gdm-2026-primary-secure-asset-priority-assets-vs-take-and-hold')[0];
    const forgefatherPlan = victoryPlansForContext(knowledge, 'book-salamanders:detachment:0', 'gdm-2026-primary-secure-asset-priority-assets-vs-take-and-hold')[0];
    expect(firestormPlan?.operationalStages).toHaveLength(3);
    expect(firestormPlan?.decisionBranches.map((branch) => branch.id)).toContain('immolation-cp-threshold');
    expect(forgefatherPlan?.operationalStages.map((stage) => stage.id)).toContain('verify-the-action-engine');
    expect(forgefatherPlan?.decisionBranches.map((branch) => branch.id)).toContain('incoming-charge-on-torrent-holder');
  });

  it('only activates graph edges whose units and selected enhancements are present in the roster', () => {
    const knowledge = strategyKnowledge(sourcePayload);
    const context = {
      detachmentIds: ['book-tau-empire:detachment:0'],
      unitIds: ['book-tau-empire:unit:18', 'book-tau-empire:unit:20'],
      units: [
        { id: 'book-tau-empire:unit:18', factionName: 'Tau Empire', Keywords: ['Vehicle', 'Walker', 'Fly'], FactionKeywords: ['Tau Empire'] },
        { id: 'book-tau-empire:unit:20', factionName: 'Tau Empire', Keywords: ['Infantry', 'Pathfinder Team'], FactionKeywords: ['Tau Empire'] }
      ]
    };

    const withoutEnhancement = resolveRuleGraph(knowledge, context);
    expect(withoutEnhancement.activeSynergies.map((synergy) => synergy.id)).toContain('synergy-tau-empire-advanced-acquisition-cadre-pathfinders');
    expect(withoutEnhancement.activeSynergies.map((synergy) => synergy.id)).not.toContain('synergy-tau-empire-advanced-acquisition-cadre-ghostkeel-battlesuit');
    expect(withoutEnhancement.pendingSynergies.find((entry) => entry.synergy.id === 'synergy-tau-empire-advanced-acquisition-cadre-ghostkeel-battlesuit')?.blockedRuleIds).toEqual(['rule-tau-advanced-acquisition-unmasking-suite']);

    const withEnhancement = resolveRuleGraph(knowledge, {
      ...context,
      selectedEnhancements: [{ detachmentId: 'book-tau-empire:detachment:0', name: 'Unmasking Suite' }]
    });
    expect(withEnhancement.activeRules.find((entry) => entry.rule.id === 'rule-tau-advanced-acquisition-unmasking-suite')?.eligibleUnitIds).toContain('book-tau-empire:unit:18');
    expect(withEnhancement.activeSynergies.map((synergy) => synergy.id)).toContain('synergy-tau-empire-advanced-acquisition-cadre-ghostkeel-battlesuit');

    const psykerWithoutRobot = resolveRuleGraph(knowledge, {
      detachmentIds: ['book-thousand-sons:detachment:1'],
      unitIds: ['book-thousand-sons:unit:4'],
      units: [{ id: 'book-thousand-sons:unit:4', factionName: 'Thousand Sons', Keywords: ['Infantry', 'Character', 'Psyker'], FactionKeywords: ['Thousand Sons'] }],
      selectedEnhancements: [{ detachmentId: 'book-thousand-sons:detachment:1', name: 'Occulus Infernum' }]
    });
    expect(psykerWithoutRobot.activeSynergies.map((synergy) => synergy.id)).not.toContain('synergy-thousand-sons-sekhetar-cohort-exalted-sorcerer');

    const psykerWithRobot = resolveRuleGraph(knowledge, {
      detachmentIds: ['book-thousand-sons:detachment:1'],
      unitIds: ['book-thousand-sons:unit:4', 'book-thousand-sons:unit:9'],
      units: [
        { id: 'book-thousand-sons:unit:4', factionName: 'Thousand Sons', Keywords: ['Infantry', 'Character', 'Psyker'], FactionKeywords: ['Thousand Sons'] },
        { id: 'book-thousand-sons:unit:9', factionName: 'Thousand Sons', Keywords: ['Vehicle', 'Sekhetar Robots'], FactionKeywords: ['Thousand Sons'] }
      ],
      selectedEnhancements: [{ detachmentId: 'book-thousand-sons:detachment:1', name: 'Occulus Infernum' }]
    });
    expect(psykerWithRobot.activeSynergies.map((synergy) => synergy.id)).toContain('synergy-thousand-sons-sekhetar-cohort-exalted-sorcerer');

    const forgefatherWithoutVulkan = resolveRuleGraph(knowledge, {
      detachmentIds: ['book-salamanders:detachment:0'],
      unitIds: ['book-space-marines:unit:17'],
      units: [{ id: 'book-space-marines:unit:17', factionName: 'Space Marines', Keywords: ['Infantry', 'Infernus Squad'], FactionKeywords: ['Adeptus Astartes'] }]
    });
    expect(forgefatherWithoutVulkan.activeRules.map((entry) => entry.rule.id)).not.toContain('rule-salamanders-forgefather-seekers-companions');

    const forgefatherWithVulkan = resolveRuleGraph(knowledge, {
      detachmentIds: ['book-salamanders:detachment:0'],
      unitIds: ['book-salamanders:unit:1', 'book-space-marines:unit:17'],
      units: [
        { id: 'book-salamanders:unit:1', factionName: 'Salamanders', Keywords: ['Infantry', 'Character', 'Vulkan He’stan'], FactionKeywords: ['Adeptus Astartes', 'Salamanders'] },
        { id: 'book-space-marines:unit:17', factionName: 'Space Marines', Keywords: ['Infantry', 'Infernus Squad'], FactionKeywords: ['Adeptus Astartes'] }
      ]
    });
    expect(forgefatherWithVulkan.activeRules.map((entry) => entry.rule.id)).toContain('rule-salamanders-forgefather-seekers-companions');
    expect(forgefatherWithVulkan.activeSynergies.map((synergy) => synergy.id)).toContain('synergy-salamanders-forgefather-vulkan-infernus');
  });

  it('keeps every delivered reference roster legal at exactly its declared points total', () => {
    const knowledge = strategyKnowledge(sourcePayload);
    const database = normalizeDatabase(JSON.stringify(catalogPayload));

    for (const reference of knowledge?.referenceRosters ?? []) {
      const draft = {
        ...reference.draft,
        id: `test-${reference.id}`,
        name: reference.title,
        items: reference.draft.items.map((item, index) => ({ ...item, id: `test-${index}` }))
      };
      expect(calculateRosterTotal(database, draft.items, draft.detachmentIds)).toBe(draft.battleSizePoints);
      expect(validateDraft(database, draft).filter((issue) => issue.level === 'error')).toEqual([]);
    }
  });

  it('accepts reviewed sourced mission context and resolves each neutral briefing', () => {
    const knowledge = strategyKnowledge(validKnowledge);

    expect(knowledge).not.toBeNull();
    expect(missionBrief(knowledge, 'gdm-2026-11th', '/11th/primary-missions/example')?.victoryAxes).toContain('board-control');
    expect(forceDispositionBrief(knowledge, 'gdm-2026-11th', '/11th/force-disposition/disruption')?.deck).toBe('disruption');
    expect(layoutContextBrief(knowledge, 'gdm-2026-11th', '/11th/layouts/disruption/priority-assets')?.layoutIds).toEqual([1, 2, 3]);
  });

  it('does not expose drafts or a malformed knowledge payload', () => {
    const draft = structuredClone(validKnowledge);
    draft.scenarios[0].status = 'draft';
    const invalidCatalogProvenance = structuredClone(sourcePayload);
    invalidCatalogProvenance.catalogProvenanceSourceId = 'missing-catalog-manifest';
    const invalidUnitDetachmentLink = structuredClone(sourcePayload);
    invalidUnitDetachmentLink.unitProfiles[0].detachmentProfileIds = ['missing-detachment-profile'];
    const invalidPlaybook = structuredClone(sourcePayload);
    invalidPlaybook.victoryPlans[0].operationalStages = [];
    const knowledge = strategyKnowledge(draft);

    expect(missionBrief(knowledge, 'gdm-2026-11th', '/11th/primary-missions/example')).toBeNull();
    expect(strategyKnowledge({ ...validKnowledge, scenarios: [{ ...validKnowledge.scenarios[0], sourceTier: 'unverified' }] })).toBeNull();
    expect(strategyKnowledge({ ...validKnowledge, catalogProvenanceSourceId: 7 })).toBeNull();
    expect(strategyKnowledge(invalidCatalogProvenance)).toBeNull();
    expect(strategyKnowledge(invalidUnitDetachmentLink)).toBeNull();
    expect(strategyKnowledge(invalidPlaybook)).toBeNull();
  });

  it('resolves reviewed detachment profiles and their sourced synergies only', () => {
    const knowledge = strategyKnowledge({
      ...validKnowledge,
      detachmentProfiles: [{
        id: 'profile',
        catalogDetachmentId: 'book-example:detachment:0',
        catalogDataVersion: '1.2.13.0',
        faction: 'Example',
        title: 'Example profile',
        sourceTier: 'inference',
        sourceIds: ['gdm'],
        sourcePages: [2],
        confidence: 'medium',
        status: 'reviewed',
        roles: ['test-role'],
        axisRatings: [{ axis: 'board-control', score: 2, basis: 'Positioning tool.' }],
        rationale: 'A bounded tactical conclusion.',
        preconditions: ['A condition.'],
        limitations: ['A limitation.'],
        reviewBy: '2026-09-01'
      }],
      ruleNodes: [{
        id: 'rule',
        title: 'Example rule',
        kind: 'detachment-rule',
        owner: { type: 'detachment', catalogId: 'book-example:detachment:0' },
        sourceTier: 'official',
        sourceIds: ['gdm'],
        sourcePages: [2],
        confidence: 'medium',
        status: 'reviewed',
        fact: 'An explicit factual rule.',
        timing: 'A known timing.',
        activation: 'detachment',
        target: { unitIds: ['book-example:unit:0'] },
        effectTags: ['positioning'],
        limitations: ['A limitation.'],
        reviewBy: '2026-09-01'
      }],
      synergies: [{
        id: 'synergy',
        title: 'Example synergy',
        evidenceKind: 'rules-supported',
        participants: [{ type: 'detachment', catalogId: 'book-example:detachment:0' }, { type: 'unit', catalogId: 'book-example:unit:0' }],
        ruleIds: ['rule'],
        relationKind: 'enables',
        sourceTier: 'inference',
        sourceIds: ['gdm'],
        sourcePages: [2],
        confidence: 'medium',
        status: 'reviewed',
        claim: 'The two records have a bounded interaction.',
        preconditions: ['A condition.'],
        timing: 'A known timing.',
        counterplay: ['An answer.'],
        tradeoffs: ['A cost.'],
        axisEffects: [{ axis: 'mobility', score: 2, basis: 'Positioning tool.' }],
        limitations: ['A limitation.'],
        reviewBy: '2026-09-01'
      }]
    });

    expect(detachmentBrief(knowledge, 'book-example:detachment:0')?.roles).toEqual(['test-role']);
    expect(detachmentSynergies(knowledge, 'book-example:detachment:0')).toHaveLength(1);
    expect(forceDispositionAxisFit(knowledge, 'book-example:detachment:0', 'disruption')).toMatchObject({
      deck: 'disruption',
      scenarioCount: 1,
      matches: [{ axis: 'board-control', detachmentScore: 2, scenarioCount: 1 }],
      cautions: ['primary-scoring']
    });
  });

  it('excludes draft secondary guides and examples from public selectors', () => {
    const draftPayload = structuredClone(sourcePayload);
    draftPayload.secondaryMissionGuides[0].status = 'draft';
    draftPayload.secondaryDecisionExamples[0].status = 'draft';
    const knowledge = strategyKnowledge(draftPayload);

    expect(knowledge).not.toBeNull();
    expect(secondaryMissionGuide(knowledge, draftPayload.secondaryMissionGuides[0].scenarioId)).toBeNull();
    expect(secondaryDecisionExamplesForGuide(knowledge, draftPayload.secondaryMissionGuides[0].id)).toEqual([]);
  });

  it('rejects unresolved secondary guide and example references in V5', () => {
    const invalidGuidePayload = JSON.parse(JSON.stringify(sourcePayload));
    invalidGuidePayload.secondaryMissionGuides[0].claimIds[0] = 'missing-claim';
    expect(strategyKnowledge(invalidGuidePayload)).toBeNull();

    const invalidExamplePayload = JSON.parse(JSON.stringify(sourcePayload));
    invalidExamplePayload.secondaryDecisionExamples[0].branches[0].claimIds[0] = 'missing-claim';
    expect(strategyKnowledge(invalidExamplePayload)).toBeNull();
  });
});
