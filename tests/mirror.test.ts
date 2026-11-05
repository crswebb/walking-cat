// cat.tsx is a surface module and imports no plugin code, so it keeps copies
// of a few values from sprite.ts and format.ts. These tests fail the moment
// a copy and its original disagree.

import { expect, test } from 'claude-code/testing'

import { MIRRORED } from '../hooks/cat'
import { clock, compactCount, shortModel } from '../hooks/format'
import { COATS, KITTEN_COLUMNS, MARGIN, progress, SPRINT_COLUMNS_PER_S, SPRITE_COLUMNS } from '../hooks/sprite'

test("the drawing's sizes and speeds match the sprite's", () => {
  expect(MIRRORED.SPRITE_COLUMNS).toBe(SPRITE_COLUMNS)
  expect(MIRRORED.KITTEN_COLUMNS).toBe(KITTEN_COLUMNS)
  expect(MIRRORED.SPRINT_COLUMNS_PER_S).toBe(SPRINT_COLUMNS_PER_S)
  expect(MIRRORED.MARGIN).toBe(MARGIN)
})

test('the text walks at the same pace as the pixel cat', () => {
  for (const [elapsedMs, expectedMs] of [[0, 20_000], [5_000, 20_000], [20_000, 20_000], [90_000, 30_000], [500, 400]]) {
    expect(MIRRORED.progress(elapsedMs ?? 0, expectedMs ?? 0)).toBe(progress(elapsedMs ?? 0, expectedMs ?? 0))
  }
})

test('the ASCII cat has the same coats as the pixel cat', () => {
  expect([...MIRRORED.coatNames].sort()).toEqual(COATS.map(coat => coat.name).sort())
})

test('times, counts and model names read the same everywhere', () => {
  for (const ms of [0, 9_400, 72_000, 3_600_000]) {
    expect(MIRRORED.clock(ms)).toBe(clock(ms))
  }
  for (const n of [0, 950, 1_234, 45_300]) {
    expect(MIRRORED.compactCount(n)).toBe(compactCount(n))
  }
  expect(MIRRORED.shortModel('claude-opus-5-5-20261001[1m]')).toBe(shortModel('claude-opus-5-5-20261001[1m]'))
})
