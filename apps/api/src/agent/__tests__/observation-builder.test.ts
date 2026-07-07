import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStructuredObservation } from '../observation-builder.js';

test('buildStructuredObservation returns concise findings and file impact', () => {
  const observation = buildStructuredObservation({
    toolCallId: 'tc-1',
    server: 'local-filesystem',
    tool: 'read_file',
    arguments: { path: 'apps/api/package.json' },
    executionDurationMs: 120,
    output: '{"name":"api"}',
    successMetrics: { transportSuccess: true, toolSuccess: true, businessSuccess: true },
    error: undefined,
    filesCreated: [],
    filesModified: [],
  });

  assert.equal(observation.tool, 'local-filesystem/read_file');
  assert.equal(observation.successMetrics.businessSuccess, true);
  assert.ok(observation.importantFindings.length >= 1);
  assert.ok(observation.importantFindings.some((finding) => finding.type === 'data' || finding.type === 'success'));
});
