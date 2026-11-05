import { expect, test } from 'claude-code/testing'

import { baseName, clip, clock, compactCount, modelLabel, plural, shortModel, usageParts } from '../hooks/format'

test('baseName keeps the last path segment, on Windows and elsewhere', () => {
  expect(baseName('C:\\Users\\me\\cat.tsx')).toBe('cat.tsx')
  expect(baseName('/home/me/cat.tsx')).toBe('cat.tsx')
  expect(baseName('cat.tsx')).toBe('cat.tsx')
})

test('clip makes one line and cuts it with an ellipsis', () => {
  expect(clip('  two\n  lines  ', 20)).toBe('two lines')
  expect(clip('abcdefghij', 5)).toBe('abcd…')
  expect(clip('abcde', 5)).toBe('abcde')
})

test('plural counts in words', () => {
  expect(plural(1, 'step')).toBe('1 step')
  expect(plural(2, 'step')).toBe('2 steps')
  expect(plural(2, 'code search', 'code searches')).toBe('2 code searches')
})

test('clock shows minutes and seconds', () => {
  expect(clock(0)).toBe('0:00')
  expect(clock(9_400)).toBe('0:09')
  expect(clock(72_000)).toBe('1:12')
})

test('compactCount shortens thousands', () => {
  expect(compactCount(950)).toBe('950')
  expect(compactCount(1_234)).toBe('1.2k')
  expect(compactCount(45_300)).toBe('45k')
})

test('a model shows as its short name and effort', () => {
  expect(shortModel('claude-opus-5-5-20261001[1m]')).toBe('opus-5-5')
  expect(modelLabel('claude-opus-5-5', 'high')).toBe('opus-5-5 high')
  expect(modelLabel('claude-haiku-5-5', null)).toBe('haiku-5-5')
  expect(modelLabel(null, 'high')).toBeNull()
})

test('usage shows only once a request has counted', () => {
  expect(usageParts(0, 0)).toEqual([])
  expect(usageParts(45_000, 1_200)).toEqual(['45k ctx', '1.2k out'])
})
