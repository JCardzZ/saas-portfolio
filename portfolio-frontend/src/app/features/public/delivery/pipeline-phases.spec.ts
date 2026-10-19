import { JobRun, WORKFLOWS, WorkflowRun } from './delivery-data';
import { PhaseTone, phasesOf, scoreboard } from './pipeline-phases';

const run = (id: string, status: JobRun['status'], durationSeconds: number | null, metrics: JobRun['metrics'] = {}): JobRun =>
  ({ id, status, durationSeconds, runs: 1, metrics });

describe('pipeline phases', () => {
  it('groups every CI job by what it does, in the order they run, and none is left out', () => {
    const phases = phasesOf(WORKFLOWS.ci.jobs, new Map(), () => 'idle');

    expect(phases.map((phase) => phase.id)).toEqual(['detect', 'security', 'contract', 'tests', 'build', 'gate']);
    expect(phases.flatMap((phase) => phase.jobs).length).toBe(WORKFLOWS.ci.jobs.length);
    expect(phases.find((phase) => phase.id === 'tests')!.jobs.map((job) => job.id)).toContain('backend-integration');
  });

  it('gives a phase the state of its jobs: one failure is enough, all skipped is skipped', () => {
    const runs = new Map([
      ['spec-lint', run('spec-lint', 'success', 23)],
      ['spec-breaking', run('spec-breaking', 'failure', 8)],
      ['spec-codegen', run('spec-codegen', 'success', 56)],
    ]);
    const tones: Record<string, PhaseTone> = { 'spec-lint': 'ok', 'spec-breaking': 'failed', 'spec-codegen': 'ok', codeql: 'skipped', gitleaks: 'skipped' };
    const phases = phasesOf(WORKFLOWS.ci.jobs, runs, (id) => tones[id] ?? 'idle');
    const contract = phases.find((phase) => phase.id === 'contract')!;

    expect(contract.tone).toBe('failed');
    expect([contract.passed, contract.ran]).toEqual([2, 3]);
    // Los jobs de una fase corren en paralelo: tarda lo que el más largo.
    expect(contract.durationSeconds).toBe(56);
    expect(phases.find((phase) => phase.id === 'security')!.tone).toBe('skipped');
  });

  it('builds the scoreboard only from figures the run published', () => {
    const ci = {
      runId: 1, runNumber: 27, sha: 'a'.repeat(40), event: 'push', startedAt: '', finishedAt: '', durationSeconds: 900, conclusion: 'success',
      jobs: [
        run('backend-unit', 'success', 60, { tests: 186, failed: 0, coverage: 88.9 }),
        run('frontend-test', 'success', 68, { tests: 315 }),
        run('lighthouse', 'success', 150, { performance: 88, accessibility: 97 }),
        run('docker', 'success', 125, { vulnerabilities: 0 }),
      ],
    } as WorkflowRun;

    expect(scoreboard(ci).map((item) => [item.key, item.value])).toEqual([
      ['tests', '501'], ['coverage', '88.9 %'], ['performance', '88'], ['accessibility', '97'], ['vulnerabilities', '0'],
    ]);
    expect(scoreboard(ci).find((item) => item.key === 'vulnerabilities')!.job).toBe('docker');
    expect(scoreboard(null)).toEqual([]);
  });
});
