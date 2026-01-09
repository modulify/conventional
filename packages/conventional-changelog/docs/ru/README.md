# @modulify/conventional-changelog

Генерация changelog из истории git на основе conventional-коммитов.
Группирует записи по разделам и пропускает коммиты, которые были отменены позже.
Настраивается с помощью шаблонов Nunjucks.

- Репозиторий: https://github.com/modulify/conventional
- Спецификация: https://www.conventionalcommits.org/en/v1.0.0/

## Установка

- npm: `npm i @modulify/conventional-changelog`
- yarn: `yarn add @modulify/conventional-changelog`
- pnpm: `pnpm add @modulify/conventional-changelog`

## Быстрый старт

```ts
import { createWrite } from '@modulify/conventional-changelog'

const write = createWrite({
  types: [
    { type: 'feat', section: 'Features' },
    { type: 'fix', section: 'Bug Fixes' },
  ],
})

const content = await write('1.0.0')
console.log(content)
```

Вы также можете записывать результат напрямую в файл, при этом он будет добавлен в начало с сохранением заголовка:

```ts
const write = createWrite({
  file: 'CHANGELOG.md',
  header: '# My Changelog',
})

await write('1.1.0')
```

## Публичный API

### createWrite

Фабричная функция, которая создает функцию для записи чейнджлога.

```ts
createWrite(options?: ChangelogOptions): (version?: string) => Promise<string>
```

#### ChangelogOptions

- `cwd?: string` — Рабочая директория для команд git.
- `git?: Client` — Кастомный клиент `@modulify/conventional-git`.
- `types?: CommitType[]` — Кастомное сопоставление типов коммитов и разделов.
- `header?: string` — Статический заголовок для файла чейнджлога (по умолчанию: `# Changelog`).
- `context?: RenderContext` — Дополнительный контекст для шаблона (host, owner, repository и т.д.).
- `render?: RenderFunction` — Кастомная функция рендеринга.
- `file?: string` — Опциональный путь к файлу для записи/добавления чейнджлога.
- `output?: Writable` — Опциональный поток Node.js Writable для записи чейнджлога.

### createRender

Создает функцию рендеринга на основе шаблонов Nunjucks.

```ts
createRender(templatesPaths?: string | string[]): RenderFunction
```

Вы можете указать кастомные пути к вашим собственным `.njk` шаблонам, чтобы переопределить стандартные (`changelog.md.njk`, `commit.md.njk`, `header.md.njk`, `section.md.njk`).

### createEnvironment

Создает окружение Nunjucks с предустановленными фильтрами (`forge`, `shorten`).

Особенности поведения:

- Группирует коммиты в разделы в соответствии с `types`.
- Пропускает коммиты, которые были позже отменены; цепочки отмен обрабатываются корректно.
- Автоматически определяет URL репозитория из git remote для генерации ссылок на коммиты и задачи (поддерживается GitHub).
- Если указан `file`, новая версия добавляется в начало существующего контента файла, сохраняя заголовок сверху.
