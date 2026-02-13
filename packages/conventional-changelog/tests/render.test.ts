import { DynamicLoader, createEnvironment, createRender, forge } from '@/render'
import { describe } from 'vitest'
import { expect } from 'vitest'
import { it } from 'vitest'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

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

  it('renders header with default options', () => {
    const render = createRender()

    expect(render.header()).toContain('##')
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

  it('handles missing template in DynamicLoader', () => {
    const render = createRender()

    expect(() => render.header({
      templatePath: 'non-existent.njk',
    })).toThrow()
  })

  it('supports custom templates and paths', () => {
    const render = createRender()

    expect(forge('Hello {{name}}', { name: 'World' })).toBe('Hello World')

    expect(render.header({ template: 'Custom Header {{version}}', context: { version: '1.1.0' } }))
      .toBe('Custom Header 1.1.0')
  })

  it('supports createEnvironment for default and array paths', () => {
    const withDefault = createEnvironment()
    const withArray = createEnvironment([])

    expect(withDefault.renderString('{{ 1 + 1 }}', {})).toBe('2')
    expect(withArray.renderString('{{ 2 + 2 }}', {})).toBe('4')
  })

  it('loads templates from file system loader', () => {
    const directory = mkdtempSync(join(tmpdir(), 'conventional-changelog-templates-'))
    const template = 'custom-header.njk'

    try {
      writeFileSync(join(directory, template), 'FS Header {{version}}')

      const render = createRender(directory)

      expect(render.header({
        templatePath: template,
        context: { version: '2.0.0' },
      })).toBe('FS Header 2.0.0')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('DynamicLoader.getSource returns null for unknown templates', () => {
    const loader = new DynamicLoader()
    expect(loader.getSource('unknown.njk')).toBeNull()
  })

  it('supports custom templatePath in render', () => {
    const render = createRender()

    expect(render.header({
      templatePath: 'header.md.njk',
      context: { version: '1.2.0' },
    })).toContain('1.2.0')
  })

  it('renders changelog with default context', () => {
    const render = createRender()

    expect(render()).toContain('##')
  })

  it('renders section with custom template', () => {
    const render = createRender()

    expect(render.section({
      title: 'My Section',
      commits: [],
    }, { template: 'SECTION {{section.title}}' })).toBe('SECTION My Section')
  })

  it('renders section without options', () => {
    const render = createRender()

    expect(render.section({
      title: 'Middleware Section',
      commits: [],
    })).toContain('### Middleware Section')
  })
})
