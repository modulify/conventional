# @modulify/conventional-release

[🌐 Translations](../INDEX.md)

Пакет release-core для conventional workflow.

Этот workspace объединяет:
- рекомендацию следующей семантической версии из `@modulify/conventional-bump`,
- рендеринг и запись changelog из `@modulify/conventional-changelog`,
- обновление манифестов пакетов,
- завершение релиза созданием коммита и тегов.

Пакет ориентирован в первую очередь на библиотечное использование. Он предоставляет:
- `createScope()` для просмотра того, что было бы выпущено,
- `run()` для применения release flow,
- `conventional-release` как CLI binary с конфигурацией.

## Область ответственности и нецели

Этот пакет намеренно сфокусирован на обязанностях release-core внутри репозитория:

- обнаружение release scope
- вычисление версий из истории коммитов
- обновление манифестов и changelog-файлов
- завершение релиза коммитом и тегами

Он не пытается быть all-in-one инструментом доставки.
В частности, `npm publish`, GitHub Releases, GitLab Releases, учетные данные registry и специфичные для деплоя шаги CI не входят в область ответственности этого пакета.

Предполагаемое разделение слоев такое:
- `@modulify/conventional-release` занимается планированием и локальным для репозитория завершением релиза
- инструменты уровнем выше могут добавлять публикацию, хостинг или CI-специфичную оркестрацию поверх этого

## Установка

```bash
yarn add -D @modulify/conventional-release
```

Другие пакетные менеджеры:

```bash
npm install -D @modulify/conventional-release
pnpm add -D @modulify/conventional-release
bun add -d @modulify/conventional-release
```

## Ментальная модель

Пакет работает в два этапа:

1. `createScope(options)` обнаруживает release scope для репозитория.
Он разрешает пакеты, фильтрует workspace'ы, определяет затронутые пакеты и формирует упорядоченные release slices.
2. `run(options)` разрешает ту же самую scope и применяет side effects.
Он обновляет манифесты, записывает changelog, создает коммит и создает теги.

На этом заканчивается зона ответственности пакета.
Шаги доставки за пределами репозитория, такие как публикация пакетов или создание hosted release, должны реализовываться над этим слоем.

`Scope` — это декларативное представление релиза.
`Slice` — это одна единица выполнения внутри этой scope.

В режиме `sync` обычно есть один slice для всего репозитория.
В режиме `async` каждый затронутый пакет получает свой собственный slice.
В режиме `hybrid` пакеты могут быть разделены на именованные `partitions`.

## Быстрый старт

```ts
import { run } from '@modulify/conventional-release'

const result = await run()

if (!result.changed) {
  console.log('No changes since last release')
} else {
  for (const slice of result.slices) {
    if (!slice.changed) continue

    console.log(slice.id, slice.nextVersion, slice.tag)
  }
}
```

## CLI

Пакет поставляет binary `conventional-release`.

Типичное использование:

```bash
conventional-release
conventional-release --dry
conventional-release --dry --verbose --tags
```

Из script проекта:

```json
{
  "scripts": {
    "release": "conventional-release",
    "release:dry": "conventional-release --dry"
  }
}
```

Без добавления локального script:

```bash
npx @modulify/conventional-release --dry
npm exec conventional-release -- --dry
yarn dlx @modulify/conventional-release --dry
pnpm dlx @modulify/conventional-release --dry
bunx @modulify/conventional-release --dry
```

Полезные флаги:

- `--dry`: вычислить версии, файлы и теги без side effects записи
- `--verbose`: показать подробный вывод прогресса по slices
- `--tags`: вывести сгенерированные теги в итоговой сводке
- `--release-as <type>`: принудительно указать `major`, `minor` или `patch`
- `--prerelease <channel>`: использовать `alpha`, `beta` или `rc`

CLI читает ту же конфигурацию репозитория, что и библиотечный API, и подключает lifecycle reporter к `run()`.
Он останавливается после локального для репозитория завершения релиза и не публикует артефакты.

## Inspect before running

Используйте `createScope()`, когда нужен сухой и детерминированный вид формы релиза:

```ts
import { createScope } from '@modulify/conventional-release'

const scope = await createScope({
  mode: 'hybrid',
})

console.log(scope.mode)
console.log(scope.packages.map((pkg) => pkg.path))
console.log(scope.slices.map((slice) => slice.id))
```

Это полезно для:
- встроенного package CLI,
- кастомных CLI,
- dashboard'ов,
- approval flow,
- тестов вокруг планирования релиза.

## Запуск релиза

`run()` применяет release flow и возвращает результаты по slices:

```ts
import { run } from '@modulify/conventional-release'

const result = await run({
  mode: 'sync',
  dry: true,
})

console.log(result.changed)
console.log(result.files)
console.log(result.slices)
```

Когда используется `dry: true`, пакет все равно разрешает версии, теги и затронутые файлы, но пропускает side effects записи.

## Источники конфигурации

Конфигурация разрешается в таком порядке:

1. поле `release` в `package.json`
2. `release.config.ts`, `release.config.mjs` или `release.config.js`
3. inline options, переданные в `run()` или `createScope()`

Inline options всегда имеют приоритет.

Пример `package.json`:

```json
{
  "name": "example-repo",
  "version": "1.0.0",
  "release": {
    "mode": "sync",
    "tagPrefix": "v"
  }
}
```

Пример `release.config.ts`:

```ts
import type { Options } from '@modulify/conventional-release'

const config: Options = {
  mode: 'hybrid',
  partitions: {
    core: {
      mode: 'sync',
      workspaces: ['@scope/core-*'],
    },
    plugins: {
      mode: 'async',
      workspaces: ['packages/plugins/*'],
      tagPrefix: 'plugin-',
    },
  },
}

export default config
```

## Основные опции

Наиболее важные публичные опции:

- `mode`: стратегия релиза, одна из `sync`, `async` или `hybrid`
- `releaseAs`: явное переопределение semver bump, например `major`, `minor` или `patch`
- `prerelease`: prerelease-канал, один из `alpha`, `beta` или `rc`
- `fromTag`: явная нижняя граница тега для анализа advisory commit
- `tagPrefix`: matcher тегов, используемый при анализе advisory commit
- `workspaces`: фильтры include и exclude для обнаружения workspace'ов
- `partitions`: именованные hybrid slices для смешанных стратегий релиза
- `dependencyPolicy`: как обновлять ranges внутренних зависимостей, одно из `preserve`, `caret` или `exact`
- `install`: должен ли запускаться install после обновления манифестов
- `tagName`, `tagMessage`, `commitMessage`: кастомные форматтеры для release output
- `changelogFile`: путь к changelog output относительно корня репозитория

Важно:
- `tagPrefix` влияет на обнаружение релиза и границы анализа коммитов.
- `tagPrefix` сам по себе не форматирует имя нового тега.
- Чтобы изменить создаваемые имена тегов, используйте `tagName`.

## Репозиторий с одним пакетом

```ts
import { run } from '@modulify/conventional-release'

await run({
  mode: 'sync',
  fromTag: 'v1.0.0',
})
```

Это самая простая настройка и обычно она создает один slice:
- одну следующую версию,
- один коммит,
- один тег.

По умолчанию изменившийся `sync` slice создает тег вида `v1.2.3`.

## Монорепа с независимыми пакетами

```ts
import { run } from '@modulify/conventional-release'

await run({
  mode: 'async',
  workspaces: {
    include: ['packages/*'],
  },
})
```

Это создает по одному slice на каждый затронутый пакет.

По умолчанию каждый изменившийся `async` slice создает тег вида `package-name@1.2.3`.

## Монорепа с группированным поведением релиза

```ts
import { run } from '@modulify/conventional-release'

await run({
  mode: 'hybrid',
  partitions: {
    app: {
      mode: 'sync',
      workspaces: ['@scope/app', '@scope/web'],
    },
    plugins: {
      mode: 'async',
      workspaces: ['packages/plugins/*'],
    },
  },
})
```

Это полезно, когда часть пакетов должна двигаться синхронно, а остальные могут выпускаться независимо.

По умолчанию slices разделов используют теги вида `partition-name@1.2.3`.

## Форма результата

`run()` возвращает:

- `changed`: изменилась ли версия хотя бы у одного slice
- `files`: все файлы, затронутые изменившимися slices
- `packages`: все пакеты в разрешенной scope
- `affected`: пакеты, затронутые текущим working tree
- `slices`: упорядоченные результаты slices с:
  - `id`
  - `kind`
  - `mode`
  - `packages`
  - `currentVersion`
  - `nextVersion`
  - `releaseType`
  - `tag`
  - `commitMessage`
  - `tagMessage`

Пример:

```ts
const result = await run({ dry: true })

for (const slice of result.slices) {
  console.log({
    id: slice.id,
    changed: slice.changed,
    nextVersion: slice.nextVersion,
    tag: slice.tag,
  })
}
```

## Поведение install

После обновления манифестов пакет может запустить команду install для package manager репозитория.

`install` поддерживает три формы:

- `false`: полностью пропустить install
- `true` или без указания: запустить install со стандартными дополнительными аргументами для обнаруженного package manager
- `string[]`: запустить install и добавить эти дополнительные аргументы после подкоманды `install`

Пример:

```ts
await run({
  install: ['--mode=skip-build'],
})
```

Концептуально это превращается в:

```bash
<package-manager> install --mode=skip-build
```

## Определение package manager

Пакет определяет package manager в таком порядке:

1. `package.json#packageManager`
2. lockfiles в корне репозитория
3. fallback на `npm`

Распознаваемые lockfiles:

- `yarn.lock`
- `pnpm-lock.yaml`
- `package-lock.json`
- `bun.lock`
- `bun.lockb`

Стандартные дополнительные аргументы install:

- `yarn`: `--no-immutable`
- `npm`: без дополнительных аргументов
- `pnpm`: без дополнительных аргументов
- `bun`: без дополнительных аргументов

## Кастомизация тегов и сообщений

Кастомные форматтеры получают объект `TagContext`:

```ts
import { run } from '@modulify/conventional-release'

await run({
  tagName: ({ version, partition, packages }) => {
    const name = partition ?? packages[0]?.name ?? 'release'

    return `${name}@${version}`
  },
  commitMessage: ({ tag }) => `chore(release): ${tag}`,
  tagMessage: ({ tag }) => `chore(release): ${tag}`,
})
```

## Примечания

- Пакет определяет package manager по `package.json#packageManager` или lockfiles.
- Package manager по умолчанию при fallback — `npm`.
- Пакет не выполняет `git push`.
- Подсказки о push в стиле CLI должны находиться в слое CLI, а не в результате библиотеки.
