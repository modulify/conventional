import { createRender } from '@/render'
import { describe } from 'vitest'
import { expect } from 'vitest'
import { it } from 'vitest'

describe('render', () => {
  it('renders header', () => {
    const render = createRender()

    expect(render.header({
      context: {
        version: '1.0.0',
        host: 'https://github.com',
        owner: 'owner',
        repository: 'repo',
        previousTag: 'v0.9.0',
        currentTag: 'v1.0.0',
        linkCompare: true,
      },
    })).toBe('## [1.0.0](https://github.com/owner/repo/compare/v0.9.0...v1.0.0)')
  })

  it('renders commit', () => {
    const render = createRender()

    expect(render.commit({
      hash: 'aa64d4ff8934e2b4304aee621bdd7562cb995e03',
      type: 'feat',
      scope: 'scope',
      subject: 'Subject',
      merge: null,
      revert: null,
      header: 'feat(scope): Subject',
      body: null,
      footer: null,
      notes: [],
      mentions: [],
      references: [],
      fields: {},
      meta: {},
    }, {
      context: {
        host: 'https://github.com',
        owner: 'owner',
        repository: 'repo',
      },
    })).toBe('* **scope:** Subject ([aa64d4f](https://github.com/owner/repo/commit/aa64d4ff8934e2b4304aee621bdd7562cb995e03))')
  })

  it('renders section', () => {
    const render = createRender()

    expect(render.section({
      title: 'Features',
      commits: [{
        hash: 'aa64d4ff8934e2b4304aee621bdd7562cb995e03',
        type: 'feat',
        scope: 'i18n',
        subject: 'Added es-ES locale',
        merge: null,
        revert: null,
        header: 'feat(i18n): Added es-ES locale',
        body: null,
        footer: null,
        notes: [],
        mentions: [],
        references: [],
        fields: {},
        meta: {},
      }, {
        hash: 'db05cd487f476ec747be61bdcade04fc7fa2c38c',
        type: 'feat',
        scope: 'routing',
        subject: 'Added navigation guards',
        merge: null,
        revert: null,
        header: 'feat(routing): Added navigation guards',
        body: null,
        footer: null,
        notes: [],
        mentions: [],
        references: [],
        fields: {},
        meta: {},
      }],
    }, {
      context: {
        host: 'https://github.com',
        owner: 'owner',
        repository: 'repo',
      },
    })).toBe(
      '### Features\n' +
      '\n' +
      '* **i18n:** Added es-ES locale ([aa64d4f](https://github.com/owner/repo/commit/aa64d4ff8934e2b4304aee621bdd7562cb995e03))\n' +
      '* **routing:** Added navigation guards ([db05cd4](https://github.com/owner/repo/commit/db05cd487f476ec747be61bdcade04fc7fa2c38c))'
    )
  })
})
