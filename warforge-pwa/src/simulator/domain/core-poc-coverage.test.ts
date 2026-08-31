import { describe, expect, it } from 'vitest';
import documentRaw from '../../../data/simulator/core-poc-coverage.json';
import manifestRaw from '../../../data/simulator/manifest.json';
import {
  CORE_POC_TECHNICAL_LIMITATION_IDS,
  compileCorePocCompatibilityV1,
  compileCorePocTechnicalCompatibilityReportV2,
  type CorePocCoverageDocumentV1
} from './core-poc-coverage';

const document = documentRaw as CorePocCoverageDocumentV1;
const environment = {
  manifestVersion: manifestRaw.version,
  registeredSourceIds: manifestRaw.sources.map((source) => source.id)
};

describe('core POC coverage', () => {
  it('accepts the technical POC only with its exact ADR-025 limitations', () => {
    const report = compileCorePocCompatibilityV1(document, environment);

    expect(report.compatible).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.supportedCatalogUnitIds).toEqual([]);
    expect(report.fixtureUnitIds).toHaveLength(6);
    expect(report.blockingRequirementIds).toEqual(document.readiness.blockingRequirementIds);
    expect(report.blockingRequirementIds).toEqual([]);
    expect(report.pendingOwnerActions).toEqual([]);

    const v6Report = compileCorePocTechnicalCompatibilityReportV2(document, environment, 'poc-executable-fingerprint');
    expect(v6Report.compatible).toBe(true);
    expect(v6Report.nonReachableRequirements.map((requirement) => requirement.nodeId).sort()).toEqual(
      [...CORE_POC_TECHNICAL_LIMITATION_IDS].sort()
    );
    expect(v6Report.satisfiedRequirements).toContainEqual(expect.objectContaining({ nodeId: 'poc.offline-ui', satisfied: true }));
  });

  it('rejects any catalog claim or codex source without treating it as POC coverage', () => {
    const forged = {
      ...document,
      catalogPolicy: { ...document.catalogPolicy, supportedUnitIds: ['book-space-marines:unit:18'] },
      canonicalSourceIds: [...document.canonicalSourceIds, 'warforge-faction-pack-space-marines-fr-2026-07']
    } as unknown as CorePocCoverageDocumentV1;
    const report = compileCorePocCompatibilityV1(forged, environment);

    expect(report.compatible).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'catalog-coverage-forbidden',
      'codex-source-forbidden'
    ]));
  });

  it('cannot remain compatible when one explicit technical limitation disappears', () => {
    const forged = { ...document, technicalLimitations: document.technicalLimitations.slice(1) } as CorePocCoverageDocumentV1;
    const report = compileCorePocCompatibilityV1(forged, environment);

    expect(report.compatible).toBe(false);
    expect(report.issues.some((issue) => issue.code === 'technical-limitations-incomplete')).toBe(true);
  });
});
