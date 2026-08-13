import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  acceptMilestone,
  addEvidence,
  blockTask,
  checkProject,
  loadProject,
  markTaskScopeUpdated,
  projectProgress,
  recordExecution,
  renderStatus,
  transitionTask,
  unblockTask,
  validateProjectState,
  validateRouting
} from './simulator-project.mjs';

const root = resolve(import.meta.dirname, '..');
const fixedNow = new Date('2026-08-13T12:00:00.000Z');

function resetTask(state, taskId, status = 'planned') {
  for (const entry of state.tasks) {
    if (entry.id !== taskId && entry.status === 'in_progress') entry.status = 'ready';
  }
  const task = state.tasks.find((entry) => entry.id === taskId);
  task.status = status;
  task.evidence = [];
  task.actualExecution = null;
  delete task.scopeUpdatedAt;
  for (const criterion of task.acceptanceCriteria) criterion.evidenceIds = [];
  state.currentTaskId = status === 'in_progress' ? taskId : null;
  return task;
}

describe('simulator project tracker', () => {
  it('keeps the committed project state and generated status in sync', async () => {
    const project = await checkProject(root);
    const committedStatus = await readFile(project.paths.status, 'utf8');

    expect(validateRouting(project.routing)).toEqual([]);
    expect(validateProjectState(project.state, project.routing, project.plan, project.decisions)).toEqual([]);
    expect(committedStatus).toBe(renderStatus(project.state));
    expect(projectProgress(project.state)).toMatchObject({
      milestones: { total: 6 },
      tasks: { total: 19 }
    });
  });

  it('refuses to ready a task before its dependencies are complete', async () => {
    const { state } = await loadProject(root);
    resetTask(state, 'SIM-M0-T01', 'planned');
    resetTask(state, 'SIM-M0-T02', 'planned');

    expect(() => transitionTask(state, 'SIM-M0-T02', 'ready', { now: fixedNow })).toThrow('dépendances');
  });

  it('requires evidence before a task may be completed', async () => {
    const { state } = await loadProject(root);
    resetTask(state, 'SIM-M0-T01', 'in_progress');

    expect(() => transitionTask(state, 'SIM-M0-T01', 'done', { now: fixedNow })).toThrow('critères');
    const evidence = addEvidence(state, 'SIM-M0-T01', {
      command: 'pnpm simulator:project:check',
      result: 'passed',
      scope: 'docs/simulator',
      criteria: ['AC-01', 'AC-02'],
      independentReview: true,
      reviewer: 'tracker-test-reviewer',
      now: fixedNow
    });
    recordExecution(state, 'SIM-M0-T01', { model: 'gpt-5.6-sol', reasoningEffort: 'high', context: 'Review of M0 governance artifacts.', now: fixedNow });

    expect(evidence.id).toBe('EVD-M0-T01-001');
    expect(() => transitionTask(state, 'SIM-M0-T01', 'done', { now: fixedNow })).not.toThrow();
  });

  it('expires prior evidence when the task scope changes', async () => {
    const { state } = await loadProject(root);
    resetTask(state, 'SIM-M0-T01', 'in_progress');
    addEvidence(state, 'SIM-M0-T01', {
      command: 'pnpm simulator:project:check', result: 'passed', scope: 'docs/simulator', criteria: ['AC-01', 'AC-02'], independentReview: true, reviewer: 'tracker-test-reviewer', now: fixedNow
    });
    recordExecution(state, 'SIM-M0-T01', { model: 'gpt-5.6-sol', reasoningEffort: 'high', context: 'Governance review.', now: fixedNow });
    markTaskScopeUpdated(state, 'SIM-M0-T01', { files: ['docs/simulator/PLAN.md'], now: new Date('2026-08-13T12:01:00.000Z') });

    expect(() => transitionTask(state, 'SIM-M0-T01', 'done', { now: fixedNow })).toThrow('preuve');
  });

  it('tracks and resolves an explicit blocker', async () => {
    const { state } = await loadProject(root);
    resetTask(state, 'SIM-M0-T01', 'planned');
    state.blockers = [];
    transitionTask(state, 'SIM-M0-T01', 'ready', { now: fixedNow });
    const blocker = blockTask(state, 'SIM-M0-T01', 'Revue humaine requise.', { now: fixedNow });

    expect(blocker.id).toBe('BLK-001');
    expect(state.resumeContext.taskId).toBe('SIM-M0-T01');
    unblockTask(state, 'SIM-M0-T01', { now: fixedNow, note: 'Revue reçue.' });
    expect(state.tasks[0].status).toBe('ready');
    expect(state.blockers[0].resolvedAt).toBe(fixedNow.toISOString());
  });

  it('requires all tasks and an independent audit to accept a milestone', async () => {
    const { state } = await loadProject(root);
    for (const task of state.tasks.filter((entry) => entry.milestoneId === 'M0')) task.status = 'done';
    state.currentTaskId = null;
    const milestone = state.milestones.find((entry) => entry.id === 'M0');
    milestone.status = 'in_progress';

    expect(() => acceptMilestone(state, 'M0', { command: '', scope: 'M0', reviewer: 'audit-agent', now: fixedNow })).toThrow('audit');
    acceptMilestone(state, 'M0', { command: 'independent audit', scope: 'M0 artifacts and evidence', reviewer: 'audit-agent', now: fixedNow });
    expect(milestone.status).toBe('accepted');
    expect(milestone.acceptanceEvidence.reviewer).toBe('audit-agent');
  });

  it('can require independent review from the execution profile', async () => {
    const { state } = await loadProject(root);
    const task = resetTask(state, 'SIM-M2-T01', 'in_progress');
    task.dependencies = [];
    state.tasks.filter((entry) => entry.id !== task.id && entry.status === 'in_progress').forEach((entry) => { entry.status = 'ready'; });
    addEvidence(state, task.id, { command: 'ui tests', result: 'passed', scope: 'simulator UI', criteria: ['AC-01'], now: fixedNow });
    recordExecution(state, task.id, { model: 'gpt-5.6-terra', reasoningEffort: 'xhigh', context: 'UI implementation.', now: fixedNow });

    expect(() => transitionTask(state, task.id, 'done', { now: fixedNow, requiresIndependentReview: true })).toThrow('revue indépendante');
  });

  it('lets a successful rerun supersede a failed criterion proof', async () => {
    const { state } = await loadProject(root);
    resetTask(state, 'SIM-M0-T01', 'in_progress');
    addEvidence(state, 'SIM-M0-T01', { command: 'first run', result: 'failed', scope: 'M0', criteria: ['AC-01', 'AC-02'], independentReview: true, reviewer: 'audit-agent', now: fixedNow });
    addEvidence(state, 'SIM-M0-T01', { command: 'rerun', result: 'passed', scope: 'M0', criteria: ['AC-01', 'AC-02'], independentReview: true, reviewer: 'audit-agent', now: new Date('2026-08-13T12:01:00.000Z') });
    recordExecution(state, 'SIM-M0-T01', { model: 'gpt-5.6-sol', reasoningEffort: 'high', context: 'Governance review.', now: fixedNow });

    expect(() => transitionTask(state, 'SIM-M0-T01', 'done', { now: fixedNow })).not.toThrow();
  });

  it('rejects blocked tasks without exactly one open blocker and unknown execution settings', async () => {
    const project = await loadProject(root);
    const task = resetTask(project.state, 'SIM-M0-T01', 'blocked');
    project.state.resumeContext = { taskId: task.id, lastCompleted: 'Blocked.', nextAction: 'Resolve.', files: [], updatedAt: fixedNow.toISOString() };
    expect(validateProjectState(project.state, project.routing, project.plan, project.decisions)).toContain('Tâche SIM-M0-T01 bloquée doit avoir exactement un bloqueur ouvert.');

    task.status = 'ready';
    task.actualExecution = { model: 'invented-model', reasoningEffort: 'banana', context: 'Invalid.', recordedAt: fixedNow.toISOString() };
    const errors = validateProjectState(project.state, project.routing, project.plan, project.decisions);
    expect(errors.some((error) => error.includes('modèle indisponible'))).toBe(true);
    expect(errors.some((error) => error.includes('effort de raisonnement inconnu'))).toBe(true);
  });

  it('atomically reopens an accepted milestone when one task is reopened', async () => {
    const { state } = await loadProject(root);
    for (const task of state.tasks.filter((entry) => entry.milestoneId === 'M0')) task.status = 'done';
    state.currentTaskId = null;
    const milestone = state.milestones.find((entry) => entry.id === 'M0');
    milestone.status = 'in_progress';
    acceptMilestone(state, 'M0', { command: 'audit', scope: 'M0', reviewer: 'audit-agent', now: fixedNow });

    transitionTask(state, 'SIM-M0-T01', 'ready', { now: fixedNow });
    expect(milestone.status).toBe('in_progress');
    expect(milestone.acceptanceEvidence).toBeUndefined();
  });

  it('atomically reopens a completed task when its accepted scope changes', async () => {
    const project = await loadProject(root);
    const { state } = project;
    const activeTask = state.tasks.find((entry) => entry.status === 'in_progress');
    // Treat unrelated live work as completed in this synthetic graph so the
    // transitive invalidation exercised below can reopen it deterministically.
    if (activeTask) activeTask.status = 'done';
    for (const task of state.tasks.filter((entry) => entry.milestoneId === 'M0')) task.status = 'done';
    state.currentTaskId = null;
    const milestone = state.milestones.find((entry) => entry.id === 'M0');
    milestone.status = 'in_progress';
    acceptMilestone(state, 'M0', { command: 'audit', scope: 'M0', reviewer: 'audit-agent', now: fixedNow });

    markTaskScopeUpdated(state, 'SIM-M0-T01', { files: ['docs/simulator/PLAN.md'], now: new Date('2026-08-13T12:01:00.000Z') });
    expect(milestone.status).toBe('in_progress');
    expect(state.tasks.find((entry) => entry.id === 'SIM-M0-T01').status).toBe('ready');
    expect(state.tasks.find((entry) => entry.id === 'SIM-M0-T02').status).toBe('planned');
    expect(state.tasks.find((entry) => entry.id === 'SIM-M0-T03').status).toBe('planned');
    expect(validateProjectState(state, project.routing, project.plan, project.decisions)).toEqual([]);
  });

  it('rejects unavailable routing selections and mismatched blocked resume context', async () => {
    const project = await loadProject(root);
    project.routing.profiles.mechanical.preferred = { model: 'invented-model', reasoningEffort: 'banana' };
    const routingErrors = validateRouting(project.routing);
    expect(routingErrors.some((error) => error.includes('modèle indisponible'))).toBe(true);
    expect(routingErrors.some((error) => error.includes('effort inconnu'))).toBe(true);

    const task = resetTask(project.state, 'SIM-M0-T01', 'blocked');
    project.state.blockers = [{ id: 'BLK-001', taskId: task.id, reason: 'Review.', recordedAt: fixedNow.toISOString() }];
    project.state.resumeContext = { taskId: 'SIM-M0-T02', lastCompleted: 'Blocked.', nextAction: 'Resolve.', files: [], updatedAt: fixedNow.toISOString() };
    expect(validateProjectState(project.state, project.routing, project.plan, project.decisions)).toContain('resumeContext.taskId doit correspondre à la tâche bloquée.');
  });
});
