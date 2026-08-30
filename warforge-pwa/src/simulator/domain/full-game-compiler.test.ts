import { describe, expect, it } from 'vitest';
import fullGameCoverageRaw from '../../../data/simulator/full-game-coverage.json';
import simulatorManifestRaw from '../../../data/simulator/manifest.json';
import {
  candidateFactsFromCoverageGraphV1,
  compileClosedCompleteGameCompatibilityV2,
  refuseCompleteGameSessionSetupV1,
  type FullGameCoverageGraphV1
} from './full-game-compiler';

const graph = fullGameCoverageRaw as unknown as FullGameCoverageGraphV1;
const characterInstanceIds = ['blood-angels-captain-1', 'salamanders-captain-1'] as const;
const environment = {
  manifestVersion: simulatorManifestRaw.version,
  registeredSourceIds: simulatorManifestRaw.sources.map((source) => source.id)
};

function compile(currentGraph: FullGameCoverageGraphV1 = graph) {
  return compileClosedCompleteGameCompatibilityV2({
    graph: currentGraph,
    facts: candidateFactsFromCoverageGraphV1(currentGraph, characterInstanceIds),
    environment
  });
}

function fullyCoveredGraph(): FullGameCoverageGraphV1 {
  return {
    ...graph,
    status: 'covered',
    rosterCandidates: graph.rosterCandidates.map((roster) => ({ ...roster, status: 'covered', blockingGapIds: [] })),
    missionCandidate: { ...graph.missionCandidate, status: 'covered', blockingGapIds: [] },
    nodes: graph.nodes.map((node) => ({
      ...node,
      status: node.status === 'deferred' ? node.status : 'covered',
      blockingGapIds: [],
      sourceRefs: node.id === 'coverage.mission' && node.sourceRefs.length === 0
        ? [{ sourceId: graph.canonicalSourceIds[0], references: ['closed-pilot-adversarial-proof'] }]
        : node.sourceRefs
    })),
    gaps: graph.gaps.map((gap) => ({ ...gap, status: 'resolved' })),
    readiness: { ...graph.readiness, compatible: true, blockingNodeIds: [] }
  };
}

describe('M6 closed complete-game compatibility compiler', () => {
  it('compiles the exact two three-unit candidates and draft scenario into an exhaustive blocked report', () => {
    const report = compile();

    expect(report).toMatchObject({
      schemaVersion: 'warforge-compatibility-report/v2',
      reportVersion: '2.0.0',
      coverageScope: 'closed-complete-game-pilot-v1',
      coverageVersion: '0.8.0',
      compatible: false,
      missionCandidate: {
        id: 'closed-complete-game-disruption-v1',
        primaryMission: 'Disruption',
        executable: false
      }
    });
    expect(report.rosterCandidates).toEqual([
      expect.objectContaining({
        id: 'closed-complete-game-blood-angels-v1',
        attachmentPolicy: 'all-characters-unattached',
        characterInstanceIds: ['blood-angels-captain-1'],
        expectedPoints: 240,
        executable: false,
        units: expect.arrayContaining([
          expect.objectContaining({ instanceId: 'blood-angels-captain-1', unitId: 'book-blood-angels:unit:12', modelCount: 1, points: 80 }),
          expect.objectContaining({ instanceId: 'blood-angels-assault-intercessors-1', unitId: 'book-blood-angels:unit:33', modelCount: 5, points: 80 }),
          expect.objectContaining({ instanceId: 'blood-angels-assault-intercessors-2', unitId: 'book-blood-angels:unit:33', modelCount: 5, points: 80 })
        ])
      }),
      expect.objectContaining({
        id: 'closed-complete-game-salamanders-v1',
        attachmentPolicy: 'all-characters-unattached',
        characterInstanceIds: ['salamanders-captain-1'],
        expectedPoints: 235,
        executable: false,
        units: expect.arrayContaining([
          expect.objectContaining({ instanceId: 'salamanders-captain-1', unitId: 'book-space-marines:unit:3', modelCount: 1, points: 80 }),
          expect.objectContaining({ instanceId: 'salamanders-assault-intercessors-1', unitId: 'book-space-marines:unit:18', modelCount: 5, points: 75 }),
          expect.objectContaining({ instanceId: 'salamanders-bladeguard-1', unitId: 'book-space-marines:unit:28', modelCount: 3, points: 80 })
        ])
      })
    ]);
    expect(report.unmetRequirements.map((requirement) => requirement.nodeId)).toEqual([
      'coverage.charge-phase', 'coverage.complete-game', 'coverage.core-foundations',
      'coverage.fight-phase', 'coverage.mission', 'coverage.movement-phase', 'coverage.rosters',
      'coverage.shooting-phase', 'coverage.stratagems', 'coverage.terrain-objectives'
    ]);
    expect(report.blockingGaps.map((gap) => gap.gapId)).toEqual([
      'GAP-M6-DETACHMENT-001', 'GAP-M6-NONCORE-001', 'GAP-M6-PHYSICAL-001', 'GAP-M6-ROSTER-001', 'GAP-M6-ROSTER-002'
    ]);
    expect(report.humanDecisions.map((decision) => decision.subjectId)).toEqual([
      'GAP-M6-DETACHMENT-001', 'GAP-M6-PHYSICAL-001', 'GAP-M6-ROSTER-001', 'GAP-M6-ROSTER-002',
      'closed-complete-game-blood-angels-v1', 'closed-complete-game-salamanders-v1'
    ]);
    expect(report.missingSources.map((source) => source.subjectId)).toEqual([
      'GAP-M6-NONCORE-001'
    ]);
    expect(report.issues).toHaveLength(23);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'coverage-graph-not-covered', subjectId: 'closed-complete-game-pilot-v1' }));
  });

  it('is deterministic under input ordering changes and keeps compilation diagnostic-only', () => {
    const reordered = {
      ...graph,
      rosterCandidates: [...graph.rosterCandidates].reverse(),
      nodes: [...graph.nodes].reverse(),
      gaps: [...graph.gaps].reverse()
    };
    const report = compile();
    const reorderedReport = compile(reordered);
    expect(reorderedReport).toEqual(report);

    expect(refuseCompleteGameSessionSetupV1(report)).toEqual({
      accepted: false,
      code: 'complete-game-setup-not-produced-by-m6-compiler',
      message: 'SIM-M6-T03 compile un rapport de compatibilité ; il ne produit jamais de CompleteGameSessionSetupV1 et n’active pas la mission draft.',
      reportFingerprint: report.canonicalFingerprint
    });
  });

  it('turns any candidate identity or attachment change into a blocker instead of guessing', () => {
    const facts = candidateFactsFromCoverageGraphV1(graph, characterInstanceIds);
    const alteredFacts = {
      ...facts,
      rosterCandidates: facts.rosterCandidates.map((roster) => roster.id === 'closed-complete-game-salamanders-v1'
        ? { ...roster, units: roster.units.map((unit) => unit.instanceId === 'salamanders-captain-1' ? { ...unit, unitId: 'invented-captain' } : unit) }
        : roster),
      characterInstanceIds: ['blood-angels-captain-1']
    };
    const report = compileClosedCompleteGameCompatibilityV2({ graph, facts: alteredFacts, environment });
    expect(report.compatible).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'candidate-identity-mismatch', subjectId: 'rosterCandidates' }),
      expect.objectContaining({ code: 'candidate-identity-mismatch', subjectId: 'attachment-policy' })
    ]));
  });

  it('rejects a covered-looking graph when a canonical node is omitted or made unreachable', () => {
    const removedNodeId = 'coverage.shooting-phase';
    const covered = fullyCoveredGraph();
    const coveredLookingGraph = {
      ...covered,
      nodes: covered.nodes
        .filter((node) => node.id !== removedNodeId)
        .map((node) => ({
          ...node,
          dependsOn: node.dependsOn.filter((dependencyId) => dependencyId !== removedNodeId)
        }))
    };

    const report = compile(coveredLookingGraph);
    expect(report.compatible).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-coverage-graph', subjectId: removedNodeId })
    ]));
  });

  it('locks the exact reachable set, node kinds and runtime statuses of graph v0.8.0', () => {
    const covered = fullyCoveredGraph();
    const malformed = {
      ...covered,
      missionCandidate: { ...covered.missionCandidate, status: 'bogus' },
      nodes: covered.nodes.map((node) => node.id === 'coverage.complete-game'
        ? { ...node, dependsOn: [...node.dependsOn, 'coverage.out-of-scope-zones'] }
        : node.id === 'coverage.mission'
          ? { ...node, kind: 'scenario', sourceRefs: [] }
          : node.id === 'coverage.out-of-scope-zones'
            ? { ...node, status: 'covered' }
            : node)
    } as unknown as FullGameCoverageGraphV1;

    const report = compile(malformed);
    expect(report.compatible).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-coverage-graph', subjectId: 'coverage.complete-game' }),
      expect.objectContaining({ code: 'invalid-coverage-graph', subjectId: 'coverage.mission' }),
      expect.objectContaining({ code: 'invalid-coverage-graph', subjectId: 'closed-complete-game-disruption-v1' })
    ]));
  });

  it('fingerprints provenance for the intentionally non-reachable M10 node', () => {
    const baseline = compile();
    const changedDeferredProvenance = {
      ...graph,
      nodes: graph.nodes.map((node) => node.id === 'coverage.out-of-scope-zones'
        ? { ...node, sourceRefs: node.sourceRefs.map((sourceRef) => ({ ...sourceRef, references: [...sourceRef.references, 'changed-reference'] })) }
        : node)
    };

    expect(compile(changedDeferredProvenance).canonicalFingerprint).not.toBe(baseline.canonicalFingerprint);
  });

  it('rejects and fingerprints duplicate secondaries or invented candidate gaps', () => {
    const covered = fullyCoveredGraph();
    const duplicateSecondary = {
      ...covered,
      missionCandidate: {
        ...covered.missionCandidate,
        fixedSecondaryIds: [...covered.missionCandidate.fixedSecondaryIds, 'Assassination']
      }
    };
    const inventedMissionGap = {
      ...covered,
      missionCandidate: { ...covered.missionCandidate, blockingGapIds: ['GAP-INVENTED'] }
    };
    const baseline = compile(covered);
    const duplicateReport = compile(duplicateSecondary);
    const inventedGapReport = compile(inventedMissionGap);

    expect(duplicateReport.compatible).toBe(false);
    expect(inventedGapReport.compatible).toBe(false);
    expect(duplicateReport.canonicalFingerprint).not.toBe(baseline.canonicalFingerprint);
    expect(inventedGapReport.canonicalFingerprint).not.toBe(baseline.canonicalFingerprint);
    expect(inventedGapReport.issues).toContainEqual(expect.objectContaining({ code: 'invalid-coverage-graph', subjectId: 'closed-complete-game-disruption-v1' }));
  });

  it('uses explicit character facts and does not depend on an instance-name suffix', () => {
    const renamedId = 'salamanders-force-commander-alpha';
    const renamedGraph = {
      ...graph,
      rosterCandidates: graph.rosterCandidates.map((roster) => roster.id === 'closed-complete-game-salamanders-v1'
        ? { ...roster, units: roster.units.map((unit) => unit.instanceId === 'salamanders-captain-1' ? { ...unit, instanceId: renamedId } : unit) }
        : roster)
    };
    const report = compileClosedCompleteGameCompatibilityV2({
      graph: renamedGraph,
      facts: candidateFactsFromCoverageGraphV1(renamedGraph, ['blood-angels-captain-1', renamedId]),
      environment
    });

    expect(report.rosterCandidates.find((roster) => roster.side === 'salamanders')?.characterInstanceIds).toEqual([renamedId]);
    expect(report.issues).not.toContainEqual(expect.objectContaining({ code: 'candidate-identity-mismatch', subjectId: 'attachment-policy' }));
  });
});
