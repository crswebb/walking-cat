// Draws the README's images from the plugin's own sprite:
//   node --experimental-strip-types docs/make-images.ts
// writes docs/demo.svg (the cat strolling with its bubble and stats),
// docs/coats.svg (every coat walking in place) and .claude-plugin/icon.png
// (the directory listing's icon).

import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

import { COATS, KITTEN_COLUMNS, rowsFor, SPRITE_COLUMNS, spritePixels, spriteSvg } from '../hooks/sprite.ts'

const BG = '#262624'
const TEXT = '#E8E6E1'
const DIM = '#9A988F'
const FONT = "font-family=\"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace\""

// The sprite's SVG, looping: its walk repeats instead of ending.
const looping = (svg: string) =>
  svg
    .replace(/repeatDur="[^"]*" fill="freeze"/g, 'repeatCount="indefinite"')
    .replace(/(<animateTransform [^>]*?) fill="freeze"\/>/g, '$1 repeatCount="indefinite"/>')

// Strips the outer <svg> so the drawing nests at a place and size of ours.
const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

// demo.svg: a band 100 columns wide, one column 8 px, as the desktop draws it.
const COLUMNS = 100
const CELL = 8
const LINE = 18
const catRows = rowsFor(SPRITE_COLUMNS)
const kitRows = rowsFor(KITTEN_COLUMNS)
const cat = looping(
  spriteSvg({
    columns: COLUMNS,
    coat: COATS.find(c => c.name === 'orange tabby') ?? COATS[0]!,
    motion: { kind: 'stroll', elapsedMs: 0 },
    isAlert: false,
  }),
)
const kitten = looping(
  spriteSvg({
    columns: COLUMNS,
    coat: COATS.find(c => c.name === 'calico') ?? COATS[0]!,
    motion: { kind: 'stroll', elapsedMs: -4000 },
    isAlert: false,
    spriteColumns: KITTEN_COLUMNS,
  }),
)
const pad = 14
const width = COLUMNS * CELL + pad * 2
const catTop = pad + LINE * 2
const statsTop = catTop + catRows * CELL + 4
const kitTagTop = statsTop + LINE + 10
const kitTop = kitTagTop + 6
const height = kitTop + kitRows * CELL + pad
// Text riding with a sprite `spriteColumns` wide: the same journey, from off
// the left edge to off the right, starting `delayS` in as the sprite does.
const ride = (dy: number, spriteColumns: number, delayS = 0) =>
  `<animateTransform attributeName="transform" type="translate" ` +
  `values="${-spriteColumns * CELL} ${dy};${(COLUMNS + 1) * CELL} ${dy}" ` +
  `dur="${((COLUMNS + 1 + spriteColumns) / 11).toFixed(2)}s" begin="${delayS}s" repeatCount="indefinite"/>`
const demo =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
  `<rect width="${width}" height="${height}" rx="12" fill="${BG}"/>` +
  `<svg x="${pad}" y="${pad}" width="${COLUMNS * CELL}" height="${height - pad * 2}" overflow="hidden">` +
  `<g ${FONT} font-size="13">` +
  `<g transform="translate(-9999 0)">${ride(0, SPRITE_COLUMNS)}` +
  `<text x="${10 * CELL}" y="13" fill="${DIM}">( <tspan fill="${TEXT}">Reading register.tsx</tspan> )</text>` +
  `<text x="${10 * CELL}" y="${13 + LINE}" fill="${DIM}">/</text></g>` +
  `<text x="0" y="${statsTop - pad + 13}" fill="${DIM}">0:12 / ~0:25 · 4 steps · opus-5-5 high · 45k ctx · 1.2k out</text>` +
  `<g transform="translate(-9999 0)">${ride(kitTagTop - pad, KITTEN_COLUMNS, 4)}` +
  `<text x="0" y="12" fill="${DIM}">Find the auth code · 0:09 · 3 steps</text></g>` +
  `</g>` +
  `<svg y="${catTop - pad}" width="${COLUMNS * CELL}" height="${catRows * CELL}" viewBox="0 0 ${COLUMNS} ${catRows}">${inner(cat)}</svg>` +
  `<svg y="${kitTop - pad}" width="${COLUMNS * CELL}" height="${kitRows * CELL}" viewBox="0 0 ${COLUMNS} ${kitRows}">${inner(kitten)}</svg>` +
  `</svg></svg>`
writeFileSync(new URL('./demo.svg', import.meta.url), demo)

// coats.svg: every coat walking in place, five to a row, named below.
const TILE = SPRITE_COLUMNS * 9
const PER_ROW = 5
const tileH = catRows * 9 + 26
const coatsW = PER_ROW * TILE + pad * 2
const coatsH = Math.ceil(COATS.length / PER_ROW) * tileH + pad * 2
const tiles = COATS.map((coat, i) => {
  const x = pad + (i % PER_ROW) * TILE
  const y = pad + Math.floor(i / PER_ROW) * tileH
  // A sprite as wide as its own drawing: the walk goes nowhere, the legs go on.
  const still = looping(
    spriteSvg({
      columns: SPRITE_COLUMNS + 2,
      coat,
      motion: { kind: 'walk', elapsedMs: 0, expectedMs: 1000 },
      isAlert: false,
    }),
  )
    .replace(/<animateTransform [^>]*\/>/, '')
    .replace(/repeatDur="[^"]*"/g, 'repeatCount="indefinite"')
  return (
    `<svg x="${x}" y="${y}" width="${TILE}" height="${catRows * 9}" viewBox="0 0 ${SPRITE_COLUMNS + 2} ${catRows}">${inner(still)}</svg>` +
    `<text x="${x + TILE / 2}" y="${y + catRows * 9 + 16}" text-anchor="middle" fill="${TEXT}" ${FONT} font-size="12">${coat.name}</text>`
  )
}).join('')
const coats =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${coatsW}" height="${coatsH}" viewBox="0 0 ${coatsW} ${coatsH}">` +
  `<rect width="${coatsW}" height="${coatsH}" rx="12" fill="${BG}"/>${tiles}</svg>`
writeFileSync(new URL('./coats.svg', import.meta.url), coats)

// icon.png: the orange tabby standing, square, on the band's dark color.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return c >>> 0
})
const crc32 = (bytes: Buffer) => {
  let c = 0xffffffff
  for (const b of bytes) {
    c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}
const SIZE = 1024
const SCALE = 40
const art = spritePixels(COATS.find(c => c.name === 'orange tabby') ?? COATS[0]!)
const artW = (art[0]?.length ?? 0) * SCALE
const artH = art.length * SCALE
const left = Math.floor((SIZE - artW) / 2)
const top = Math.floor((SIZE - artH) / 2)
const hex = (color: string) => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))
const rows: Buffer[] = []
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.alloc(1 + SIZE * 3)
  for (let x = 0; x < SIZE; x++) {
    const color = art[Math.floor((y - top) / SCALE)]?.[Math.floor((x - left) / SCALE)]
    const inside = x >= left && y >= top && x < left + artW && y < top + artH
    const [r, g, b] = hex(inside && color ? color : BG)
    row.set([r ?? 0, g ?? 0, b ?? 0], 1 + x * 3)
  }
  rows.push(row)
}
const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header.set([8, 2, 0, 0, 0], 8)
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(Buffer.concat(rows))),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync(new URL('../.claude-plugin/icon.png', import.meta.url), png)

console.log(`demo.svg ${demo.length} chars, coats.svg ${coats.length} chars, icon.png ${png.length} bytes`)
