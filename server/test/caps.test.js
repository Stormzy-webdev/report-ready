import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capsLevel, trendFlag, overallFlag } from '../src/lib/caps.js';

test('capsLevel uses the CAPS boundaries', () => {
  assert.equal(capsLevel(100), 7);
  assert.equal(capsLevel(80), 7);
  assert.equal(capsLevel(79.9), 6);
  assert.equal(capsLevel(50), 4);
  assert.equal(capsLevel(49.9), 3);
  assert.equal(capsLevel(30), 2);
  assert.equal(capsLevel(29.9), 1);
  assert.equal(capsLevel(0), 1);
  assert.equal(capsLevel(null), null);
});

test('trendFlag compares with last term', () => {
  assert.equal(trendFlag(58, 49), 'improving');
  assert.equal(trendFlag(72, 81), 'slipping');
  assert.equal(trendFlag(62, 60), 'steady');
  assert.equal(trendFlag(65, null), 'steady');
});

test('trendFlag marks a low average as struggling even when improving', () => {
  assert.equal(trendFlag(35, 20), 'struggling');
  assert.equal(trendFlag(39.9, 50), 'struggling');
});

test('overallFlag picks the most serious flag', () => {
  assert.equal(overallFlag(['improving', 'struggling', 'slipping']), 'struggling');
  assert.equal(overallFlag(['improving', 'slipping', 'steady']), 'slipping');
  assert.equal(overallFlag(['steady', 'improving']), 'improving');
  assert.equal(overallFlag([null, null]), null);
});
