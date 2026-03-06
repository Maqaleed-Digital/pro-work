"use strict"

/**
 * Minimal ZIP archive builder — pure Node.js, no external dependencies.
 * Supports DEFLATE (method 8) compression via zlib.deflateRawSync.
 * Handles only the common case: files ≤ 4 GB (no ZIP64).
 *
 * Usage:
 *   const { buildZip } = require("./lib/zip")
 *   const zipBuf = buildZip({ "foo.json": Buffer.from("{}") })
 *   res.writeHead(200, { "content-type": "application/zip" })
 *   res.end(zipBuf)
 */

const zlib = require("zlib")

// ── CRC-32 ────────────────────────────────────────────────────────────────────

const _CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = (_CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0
  return (c ^ 0xffffffff) >>> 0
}

// ── little-endian writers ─────────────────────────────────────────────────────

function u16(buf, off, v) { buf[off] = v & 0xff; buf[off + 1] = (v >>> 8) & 0xff }
function u32(buf, off, v) {
  buf[off]     =  v        & 0xff
  buf[off + 1] = (v >>>  8) & 0xff
  buf[off + 2] = (v >>> 16) & 0xff
  buf[off + 3] = (v >>> 24) & 0xff
}

// ── DOS timestamp ─────────────────────────────────────────────────────────────

function dosDateTime(d) {
  return {
    time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) >>> 0,
    date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) >>> 0
  }
}

// ── ZIP builder ───────────────────────────────────────────────────────────────

/**
 * Build a ZIP archive buffer from a plain object of filename → Buffer entries.
 * @param {Object.<string, Buffer>} files  Map of filename → raw file content
 * @returns {Buffer} ZIP archive
 */
function buildZip(files) {
  const now = dosDateTime(new Date())
  const entries = []
  let localOffset = 0

  // ── local file entries ─────────────────────────────────────────────────
  const localParts = []
  for (const [name, rawData] of Object.entries(files)) {
    const nameBuf    = Buffer.from(name, "utf8")
    const data       = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData)
    const compressed = zlib.deflateRawSync(data, { level: 6 })
    const checksum   = crc32(data)

    const lfh = Buffer.alloc(30 + nameBuf.length)
    u32(lfh,  0, 0x04034b50)          // local file header signature
    u16(lfh,  4, 20)                  // version needed: 2.0
    u16(lfh,  6, 0)                   // general purpose bit flag
    u16(lfh,  8, 8)                   // compression method: deflate
    u16(lfh, 10, now.time)
    u16(lfh, 12, now.date)
    u32(lfh, 14, checksum)
    u32(lfh, 18, compressed.length)   // compressed size
    u32(lfh, 22, data.length)         // uncompressed size
    u16(lfh, 26, nameBuf.length)
    u16(lfh, 28, 0)                   // extra field length
    nameBuf.copy(lfh, 30)

    entries.push({ nameBuf, compressed, checksum, rawLen: data.length, offset: localOffset })
    localOffset += lfh.length + compressed.length
    localParts.push(lfh, compressed)
  }

  // ── central directory ──────────────────────────────────────────────────
  const cdParts = []
  for (const e of entries) {
    const cde = Buffer.alloc(46 + e.nameBuf.length)
    u32(cde,  0, 0x02014b50)          // central directory signature
    u16(cde,  4, 20)                  // version made by
    u16(cde,  6, 20)                  // version needed
    u16(cde,  8, 0)                   // general purpose bit flag
    u16(cde, 10, 8)                   // compression method: deflate
    u16(cde, 12, now.time)
    u16(cde, 14, now.date)
    u32(cde, 16, e.checksum)
    u32(cde, 20, e.compressed.length)
    u32(cde, 24, e.rawLen)
    u16(cde, 28, e.nameBuf.length)
    u16(cde, 30, 0)                   // extra field length
    u16(cde, 32, 0)                   // file comment length
    u16(cde, 34, 0)                   // disk number start
    u16(cde, 36, 0)                   // internal attributes
    u32(cde, 38, 0)                   // external attributes
    u32(cde, 42, e.offset)            // offset of local header
    e.nameBuf.copy(cde, 46)
    cdParts.push(cde)
  }

  const cdBuf = Buffer.concat(cdParts)

  // ── end of central directory record ───────────────────────────────────
  const eocd = Buffer.alloc(22)
  u32(eocd,  0, 0x06054b50)           // EOCD signature
  u16(eocd,  4, 0)                    // disk number
  u16(eocd,  6, 0)                    // start disk of CD
  u16(eocd,  8, entries.length)       // entries on this disk
  u16(eocd, 10, entries.length)       // total entries
  u32(eocd, 12, cdBuf.length)         // size of central directory
  u32(eocd, 16, localOffset)          // offset of CD from start of disk
  u16(eocd, 20, 0)                    // comment length

  return Buffer.concat([...localParts, cdBuf, eocd])
}

module.exports = { buildZip, crc32 }
