import type { Commit } from '@modulify/conventional-git/types/commit'
import type { ILoader } from 'nunjucks'

import {
  Environment,
  FileSystemLoader,
  Loader,
  LoaderSource,
} from 'nunjucks'

import changelogTemplate from './templates/changelog.md.njk?raw'
import commitTemplate from './templates/commit.md.njk?raw'
import headerTemplate from './templates/header.md.njk?raw'
import sectionTemplate from './templates/section.md.njk?raw'

import { defaultContext } from './defaults'

const arraify = <T>(value: T | T[]): T[] => Array.isArray(value) ? value : [value]

export type Note = {
  commit: Commit;
  text: string;
}

export type Section = {
  title: string;
  commits: Commit[];
}

export interface RenderContext {
  title?: string;
  version?: string;
  date?: string;
  linkCompare?: boolean;
  compareUrlFormat?: string;
  commitUrlFormat?: string;
  issueUrlFormat?: string;
  linkReferences?: boolean;
  sections: Section[];
  highlights: { title: string; notes: Note[] }[];
}

export type RenderFunction = (context: RenderContext) => string

export class DynamicLoader extends Loader implements ILoader {
  private templates: Map<string, string> = new Map()

  constructor(known: {
    changelog?: string;
    commit?: string;
    header?: string;
    section?: string;
  } = {}) {
    super()
    this.templates.set('changelog.md.njk', known.changelog ?? changelogTemplate)
    this.templates.set('commit.md.njk', known.commit ?? commitTemplate)
    this.templates.set('header.md.njk', known.header ?? headerTemplate)
    this.templates.set('section.md.njk', known.section ?? sectionTemplate)
  }

  getSource(name: string): LoaderSource {
    const source = this.templates.get(name)
    if (source === undefined) {
      return null as unknown as LoaderSource
    }

    return {
      src: source,
      path: name,
      noCache: true,
    }
  }
}

export const forge = (
  template: string,
  replacements: Record<string, unknown>
) => Object.entries(replacements).reduce(
  (result, [key, value]) => result.replace(new RegExp(`{{${key}}}`, 'g'), String(value)),
  template
)

export const createEnvironment = (templatesPaths: string|string[] = '') => {
  const paths = arraify(templatesPaths).filter(Boolean)
  const env = new Environment([
    new DynamicLoader(),
    ...(paths ? [new FileSystemLoader(paths)] : []),
  ], {
    autoescape: false,
    lstripBlocks: true,
    trimBlocks: true,
  })

  env.addFilter('forge', forge)
  env.addFilter('shorten', (hash: string, length: number) => hash.substring(0, length))

  return env
}

export const createRender = (templatesPaths: string|string[] = '') => {
  const env = createEnvironment(templatesPaths)

  const commit = (commit: Commit, options: {
    context?: object;
    template?: string;
    templatePath?: string;
  } = {}) => {
    const { template, templatePath, context = {} } = options

    return render(env, {
      context: { ...defaultContext, ...context, commit: { ...commit } },
      template: template ?? commitTemplate,
      templatePath,
    })
  }

  const header = <T extends object = object>(options: {
    context?: T;
    template?: string;
    templatePath?: string;
  } = {}) => {
    const { template, templatePath, context = {} } = options

    return render(env, {
      context: { ...defaultContext, ...context },
      template: template ?? headerTemplate,
      templatePath,
    })
  }

  const section = <T extends object = object>(section: Section, options: {
    context?: T;
    template?: string;
    templatePath?: string;
  }) => {
    const { template, templatePath, context = {} } = options

    return render(env, {
      context: { ...defaultContext, ...context, section: { ...section } },
      template: template ?? sectionTemplate,
      templatePath,
    })
  }

  return Object.assign((context: RenderContext = {
    sections: [],
    highlights: [],
  }) => render(env, {
    context: { ...defaultContext, ...context },
    template: changelogTemplate,
  }), {
    commit,
    header,
    section,
  })
}

function render<T extends object = object>(env: Environment, options: {
  context?: T;
  template?: string;
  templatePath?: string;
} = {}) {
  const {
    context = {},
    template,
    templatePath,
  } = options

  return templatePath
    ? env.render(templatePath, context)
    : env.renderString(template ?? '', context)
}
