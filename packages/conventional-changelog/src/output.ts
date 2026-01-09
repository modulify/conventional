import { Writable } from 'node:stream'

import { closeSync } from 'node:fs'
import { createReadStream } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { existsSync } from 'node:fs'
import { openSync } from 'node:fs'
import { readSync } from 'node:fs'
import { renameSync } from 'node:fs'
import { statSync } from 'node:fs'
import { unlinkSync } from 'node:fs'

const EMPTY_LINE = '\n\n'

export function createFileWritable (filePath: string, header: string): Writable {
  let chunks: Buffer[] = []

  return new Writable({
    write (chunk, _, callback) {
      chunks.push(Buffer.from(chunk))
      callback()
    },

    final (callback) {
      const buffer = Buffer.concat(chunks)
      chunks = []

      let writer: Writable

      const onError = (error: unknown) => {
        writer?.destroy()
        unlink(filePath + '.tmp')
        callback(error instanceof Error ? error : new Error(String(error)))
      }

      try {
        const size = sizeOf(filePath)

        writer = createWriteStream(filePath + '.tmp')
        writer.on('error', onError)

        const content = {
          header: header.trim(),
          changes: String(buffer).trim(),
        }

        if (content.header) writer.write(content.header)
        if (content.changes) {
          if (content.header) writer.write(EMPTY_LINE)
          writer.write(content.changes)
        }

        const [body, close] = size !== null
          ? openBodyStream(filePath, size, content.header)
          : [null, () => {}]

        const finalize = () => {
          close()
          writer.write(EMPTY_LINE)
          writer.end(() => {
            renameSync(filePath + '.tmp', filePath)
            callback()
          })
        }

        if (body) {
          if (content.header || content.changes) writer.write(EMPTY_LINE)

          body.on('end', finalize)
          body.on('error', (e) => {
            close()
            onError(e)
          })
          body.pipe(writer, { end: false })
        } else {
          finalize()
        }
      } catch (e) {
        onError(e)
      }
    },
  })
}

function openBodyStream (filePath: string, size: number, header: string) {
  const fd = openSync(filePath, 'r')
  const close = () => closeSync(fd)

  let start = 0
  let end = size - 1

  const headerBytes = Buffer.alloc(Buffer.from(header).length)
  if (size >= headerBytes.length
    && readFirst(fd, headerBytes) === headerBytes.length
    && String(headerBytes) === header
  ) {
    start = headerBytes.length
  }

  const char = Buffer.alloc(1)
  const readsSpacing = (at: number) => readOne(fd, char, at) !== 0 && isSpacing(char)

  while (start < size) if (readsSpacing(start)) { start++ } else break
  while (end >= start) if (readsSpacing(end)) { end-- } else break

  if (end >= start) {
    return [createReadStream(filePath, { start, end }), close] as const
  }

  return [null, close] as const
}

function sizeOf (file: string) {
  const stats = existsSync(file) ? statSync(file) : null
  if (stats?.isDirectory()) {
    throw new Error(`EISDIR: illegal operation on a directory, open '${file}'`)
  }

  return stats?.size ?? null
}

function readFirst (fd: number, buffer: Buffer, count: number | null = null) {
  return readSync(fd, buffer, 0, count ?? buffer.length, 0)
}

function readOne (fd: number, buffer: Buffer, at: number) {
  return readSync(fd, buffer, 0, 1, at)
}

function isSpacing (char: Buffer) {
  return /\s/.test(String(char))
}

function unlink (filePath: string) {
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}
