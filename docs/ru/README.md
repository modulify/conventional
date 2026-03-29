# Conventional commits toolkit

[🌐 Translations](../../docs/INDEX.md#readme) • [📜 Code of Conduct](../../CODE_OF_CONDUCT.md)

Монорепозиторий с инструментами для анализа истории git и создания релизов в соответствии со [спецификацией Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

[![Tests Status](https://github.com/modulify/conventional/actions/workflows/tests.yml/badge.svg)](https://github.com/modulify/conventional/actions)
[![codecov](https://codecov.io/gh/modulify/conventional/branch/main/graph/badge.svg)](https://codecov.io/gh/modulify/conventional)

## Пакеты

- [`@modulify/conventional-git`](../../packages/conventional-git) — Тонкая обертка над git с парсингом conventional-коммитов и помощниками для семантических тегов.
- [`@modulify/conventional-bump`](../../packages/conventional-bump) — Помощник для семантических релизов, который рекомендует следующую версию (major/minor/patch).
- [`@modulify/conventional-changelog`](../../packages/conventional-changelog) — Генерация чейнджлога из истории git с использованием шаблонов Nunjucks.
- [`@modulify/conventional-release`](../../packages/conventional-release) — Library-first пакет для оркестрации релизов с конфигурируемым CLI.

## Высокоуровневый release flow

```ts
import { run } from '@modulify/conventional-release'

const result = await run()

if (!result.changed) {
  console.log('Нет изменений с прошлого релиза')
} else {
  for (const slice of result.slices) {
    if (!slice.changed) continue
    console.log(slice.id, slice.nextVersion, slice.tag)
  }
}
```

Пакет `@modulify/conventional-release` объединяет:
- рекомендации по версии из `@modulify/conventional-bump`
- запись changelog из `@modulify/conventional-changelog`
- обновление манифестов пакетов
- создание release-коммита и тегов

Он также поставляет бинарник `conventional-release`, поэтому в потребляющем проекте можно использовать:

```json
{
  "scripts": {
    "release": "conventional-release",
    "release:dry": "conventional-release --dry"
  }
}
```

Полное описание API и CLI находится в README пакета: [`@modulify/conventional-release`](../../packages/conventional-release/README.md)

## Низкоуровневая композиция

Если нужен собственный release flow, низкоуровневые пакеты по-прежнему можно использовать напрямую:

```ts
import { Client } from '@modulify/conventional-git'
import { ReleaseAdvisor } from '@modulify/conventional-bump'
import { createWrite } from '@modulify/conventional-changelog'
import semver from 'semver'

const git = new Client()
const advisor = new ReleaseAdvisor({ git })

const currentVersion = await git.version() ?? '0.0.0'
const recommendation = await advisor.advise({
  preMajor: semver.lt(currentVersion, '1.0.0')
})

if (recommendation) {
  const nextVersion = semver.inc(currentVersion, recommendation.type)
  const write = createWrite({ git, file: 'CHANGELOG.md' })

  await write(nextVersion)
  console.log(`Следующий релиз: ${nextVersion}`)
}
```

## Почему проект появился

Проект возник не как абстрактный эксперимент, а из практической потребности работать с глубоко вложенными деревьями workspaces, включая репозитории с двумя или тремя уровнями вложенности, тогда как большинство release-инструментов на рынке до сих пор предполагают плоскую или почти плоскую монорепу.

## Разработка репозитория

Локальная подготовка:

```bash
make .yarnrc.yml
yarn install
```

Полезные команды:

```bash
make test
make test-coverage
make build
make typecheck
make eslint
```

Предпросмотр релиза для этого репозитория:

```bash
yarn release:dry
```
