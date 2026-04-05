import type { Client } from './Client'

export async function resolveFromTag (
  client: Pick<Client, 'tags'> | { tags?: Pick<Client, 'tags'>['tags']; },
  fromTag?: string,
  tagPrefix?: string | RegExp
) {
  if (fromTag) {
    return fromTag
  }

  if (!client.tags) {
    return null
  }

  return await client.tags({
    ...tagPrefix && { prefix: tagPrefix },
  }).first()
}

export function toRevision (
  from: string | null,
  to: string = 'HEAD'
) {
  return from
    ? `${from}..${to}`
    : to
}

export function parseChangesetPaths (output: string) {
  return output
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => line
      .trim()
      .split('\t')
      .filter(Boolean)
      .slice(1))
}
