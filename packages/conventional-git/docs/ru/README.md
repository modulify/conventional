# @modulify/conventional-git

Тонкая обертка над git, которая добавляет парсинг conventional-коммитов и помощники для семантических тегов.

- Репозиторий: https://github.com/modulify/conventional
- Спецификация: https://www.conventionalcommits.org/en/v1.0.0/

## Установка

- npm: `npm i @modulify/conventional-git`
- yarn: `yarn add @modulify/conventional-git`
- pnpm: `pnpm add @modulify/conventional-git`

## Быстрый старт

```ts
import { Client, packagePrefix } from '@modulify/conventional-git'

const git = new Client()

// Чтение распарсенных коммитов (async iterable)
for await (const c of git.commits()) {
  console.log(c.type, c.scope, c.subject)
}

// Получение semver тегов (async iterable)
for await (const t of git.tags({ clean: true })) {
  console.log('tag:', t)
}

// Получение последней версии из тегов
console.log(await git.version())

// Работа с тегами, ограниченными областью видимости пакета
const prefix = packagePrefix('my-package') // => 'my-package@'
for await (const t of git.tags({ prefix, clean: true })) {
  console.log('my-package version:', t)
}
```

## Публичный API

### Функции

- `packagePrefix(packageName?: string): string | RegExp`
  - Возвращает префикс для специфичных для пакета semver тегов. Если имя не указано, возвращает RegExp, который соответствует любому префиксу `<name>@`.

### Client

Конструктор:

```ts
new Client(options?: { cwd?: string; git?: GitClient })
```

Свойства:
* `git` — доступ к базовому низкоуровневому клиенту.

Методы:

* `commits` – Возвращает асинхронный итерируемый объект с распарсенными conventional-коммитами.
* `tags` – Стрим semver тегов. Если указан `prefix`, учитываются только теги с этим префиксом.
  `skipUnstable` пропускает пре-релизы. При `clean: true` возвращаются очищенные версии (например, `1.2.3`).
* `version` – Возвращает последнюю семантическую версию (отсортированную с помощью semver) или `null`, если тег semver не найден.
* `url` – Возвращает URL репозитория (из git remote). Удаленный репозиторий по умолчанию — `origin`.
