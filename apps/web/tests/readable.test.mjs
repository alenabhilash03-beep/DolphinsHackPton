import assert from 'node:assert/strict';
import test from 'node:test';
import { changeLabel, locatorLabel, locatorList, readableText, traceLabel } from '../lib/readable.ts';

test('machine values become readable text', () => {
  assert.equal(readableText('Source-linked candidate inputs: molecular_weight = 148 kDa; pk.clearance_L_h = 0.1'), 'Source-linked candidate inputs: molecular weight = 148 kDa; clearance = 0.1');
  assert.equal(readableText('calculated · conditional_transfer'), 'calculated · conditional transfer');
  assert.equal(readableText('association = 623000 M^-1 s^-1; dissociation = 8.16e-05 s^-1'), 'association = 623000 M⁻¹ s⁻¹; dissociation = 8.16 × 10⁻⁵ s⁻¹');
  assert.equal(readableText('molecular_weight = 148 kDa'), 'Molecular weight = 148 kDa');
  assert.equal(locatorLabel('full_text:block-36:0'), 'Full text, passage 36');
  assert.equal(locatorLabel('abstract:1800'), 'Abstract');
  assert.equal(locatorLabel('Table 1, Vc non-AGC row'), 'Table 1, Vc non-AGC row');
  assert.equal(locatorList(['full_text:block-36:0', 'full_text:block-36:1800', 'abstract:0']), 'Full text, passage 36, Abstract');
  assert.equal(changeLabel('comparison: duration_h = 2880'), 'Observation window: 2,880 h (120 days)');
  assert.equal(changeLabel('comparison: occupancy_threshold = 0.95'), 'Analytical occupancy threshold: 95%');
  assert.equal(traceLabel('recorded_replay'), 'Agent trace');
});
