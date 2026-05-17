import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPONENT_TYPES,
  STYLEABLE_COMPONENTS,
  HIDABLE_COMPONENTS,
  REQUIRED_COMPONENTS,
  validateComponent,
  validateLine,
  validateConfig,
  normalizeComponent,
  normalizeConfig,
  migrateOldConfig,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_LINES
} from '../src/shared/constants.js';

// Component Types
test('should define all expected component types', () => {
  assert.deepStrictEqual(COMPONENT_TYPES, {
    MODEL: 'model',
    PRIMARY: '5h',
    WEEKLY: 'week',
    RESET: 'reset',
    CONTEXT: 'ctx'
  });
});

test('should identify styleable components correctly', () => {
  assert.strictEqual(STYLEABLE_COMPONENTS.has(COMPONENT_TYPES.PRIMARY), true);
  assert.strictEqual(STYLEABLE_COMPONENTS.has(COMPONENT_TYPES.WEEKLY), true);
  assert.strictEqual(STYLEABLE_COMPONENTS.has(COMPONENT_TYPES.CONTEXT), true);
  assert.strictEqual(STYLEABLE_COMPONENTS.has(COMPONENT_TYPES.MODEL), false);
  assert.strictEqual(STYLEABLE_COMPONENTS.has(COMPONENT_TYPES.RESET), false);
});

test('should identify hidable components correctly', () => {
  assert.strictEqual(HIDABLE_COMPONENTS.has(COMPONENT_TYPES.MODEL), true);
  assert.strictEqual(HIDABLE_COMPONENTS.has(COMPONENT_TYPES.WEEKLY), true);
  assert.strictEqual(HIDABLE_COMPONENTS.has(COMPONENT_TYPES.RESET), true);
  assert.strictEqual(HIDABLE_COMPONENTS.has(COMPONENT_TYPES.CONTEXT), true);
  assert.strictEqual(HIDABLE_COMPONENTS.has(COMPONENT_TYPES.PRIMARY), false);
});

test('should identify required components correctly', () => {
  assert.strictEqual(REQUIRED_COMPONENTS.has(COMPONENT_TYPES.PRIMARY), true);
  assert.strictEqual(REQUIRED_COMPONENTS.has(COMPONENT_TYPES.MODEL), false);
});

// Component Validation
test('should validate valid components', () => {
  assert.strictEqual(validateComponent({ type: COMPONENT_TYPES.PRIMARY, style: 'bar' }), true);
  assert.strictEqual(validateComponent({ type: COMPONENT_TYPES.WEEKLY, enabled: false }), true);
  assert.strictEqual(validateComponent({ type: COMPONENT_TYPES.CONTEXT, style: 'text' }), true);
});

test('should reject component without type', () => {
  assert.strictEqual(validateComponent({}), false);
  assert.strictEqual(validateComponent({ type: null }), false);
});

test('should reject 5h component when disabled', () => {
  assert.strictEqual(validateComponent({
    type: COMPONENT_TYPES.PRIMARY,
    enabled: false
  }), false);
});

test('should reject invalid style for non-styleable components', () => {
  assert.strictEqual(validateComponent({
    type: COMPONENT_TYPES.MODEL,
    style: 'bar'
  }), false);
});

test('should reject invalid style values', () => {
  assert.strictEqual(validateComponent({
    type: COMPONENT_TYPES.PRIMARY,
    style: 'invalid'
  }), false);
});

// Configuration Normalization
test('should normalize empty config with defaults', () => {
  const result = normalizeConfig({});
  assert.deepStrictEqual(result.global, DEFAULT_GLOBAL_CONFIG);
  assert.strictEqual(result.lines[0].components.length, DEFAULT_LINES[0].components.length);
});

test('should normalize model component (no style)', () => {
  const result = normalizeComponent({ type: COMPONENT_TYPES.MODEL }, { style: 'bar' });
  assert.strictEqual(result.type, COMPONENT_TYPES.MODEL);
  assert.strictEqual(result.enabled, true);
  assert.strictEqual(result.style, undefined);
});

test('should normalize styleable component with style', () => {
  const result = normalizeComponent(
    { type: COMPONENT_TYPES.WEEKLY, style: 'text' },
    { style: 'bar' }
  );
  assert.strictEqual(result.type, COMPONENT_TYPES.WEEKLY);
  assert.strictEqual(result.enabled, true);
  assert.strictEqual(result.style, 'text');
});

// Migration
test('should migrate old config with all settings', () => {
  const oldConfig = {
    theme: 'light',
    displayMode: 'used',
    style: 'text',
    ctxEnabled: false
  };

  const result = migrateOldConfig(oldConfig);

  assert.strictEqual(result.global.theme, 'light');
  assert.strictEqual(result.global.displayMode, 'used');
  assert.strictEqual(result.global.minimalist, false);
  assert.strictEqual(result.global.rawValues, false);

  assert.strictEqual(result.lines[0].components.length, 5);
  assert.strictEqual(result.lines[0].components[0].type, COMPONENT_TYPES.MODEL);
  assert.strictEqual(result.lines[0].components[1].type, COMPONENT_TYPES.PRIMARY);
  assert.strictEqual(result.lines[0].components[2].type, COMPONENT_TYPES.WEEKLY);
  assert.strictEqual(result.lines[0].components[3].type, COMPONENT_TYPES.RESET);
  assert.strictEqual(result.lines[0].components[4].type, COMPONENT_TYPES.CONTEXT);

  assert.strictEqual(result.lines[0].components[4].enabled, false);
  assert.strictEqual(result.lines[0].components[1].style, 'text');
  assert.strictEqual(result.lines[0].components[2].style, 'text');
  assert.strictEqual(result.lines[0].components[4].style, 'text');
});

test('should handle missing ctxEnabled in old config', () => {
  const oldConfig = { theme: 'dark', style: 'bar' };
  const result = migrateOldConfig(oldConfig);
  assert.strictEqual(result.lines[0].components[4].enabled, true);
});

test('should handle empty old config', () => {
  const result = migrateOldConfig({});
  assert.strictEqual(result.global.theme, DEFAULT_GLOBAL_CONFIG.theme);
  assert.strictEqual(result.lines[0].components[4].enabled, true);
});

// Line Validation
test('should validate a valid line', () => {
  const line = {
    components: [
      { type: COMPONENT_TYPES.PRIMARY },
      { type: COMPONENT_TYPES.MODEL }
    ]
  };
  assert.strictEqual(validateLine(line), true);
});

test('should reject line without 5h component', () => {
  const line = {
    components: [{ type: COMPONENT_TYPES.MODEL }]
  };
  assert.strictEqual(validateLine(line), false);
});

test('should reject line without components', () => {
  assert.strictEqual(validateLine({ components: [] }), false);
});

test('should accept line with unknown component type (structural validation only)', () => {
  const line = {
    components: [
      { type: COMPONENT_TYPES.PRIMARY },
      { type: 'unknown' }
    ]
  };
  // validateComponent only checks structure, not known types
  assert.strictEqual(validateLine(line), true);
});

// Complete Config Validation
test('should validate complete valid config', () => {
  const config = {
    global: { theme: 'dark', displayMode: 'left' },
    lines: [{
      components: [
        { type: COMPONENT_TYPES.MODEL, enabled: true },
        { type: COMPONENT_TYPES.PRIMARY, style: 'bar' },
        { type: COMPONENT_TYPES.WEEKLY, enabled: true, style: 'bar' }
      ]
    }]
  };
  assert.strictEqual(validateConfig(config), true);
});

test('should reject config without lines', () => {
  assert.strictEqual(validateConfig({ global: {} }), false);
});

test('should reject config with invalid lines', () => {
  const config = {
    global: {},
    lines: [{ components: [{ type: COMPONENT_TYPES.MODEL }] }]
  };
  assert.strictEqual(validateConfig(config), false);
});

// Migration edge cases
test('migrateOldConfig ignores workDays (new field with no old equivalent)', () => {
  const result = migrateOldConfig({ workDays: 5, ctxEnabled: true });
  assert.strictEqual(result.global.minimalist, false);
  assert.strictEqual(result.global.rawValues, false);
  assert.strictEqual('workDays' in result.global, false);
  assert.strictEqual(result.lines[0].components[4].enabled, true);
});
