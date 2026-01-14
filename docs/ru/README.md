# Conventional commits toolkit

[🌐 Translations](../../docs/INDEX.md#readme)

Набор инструментов для анализа истории git и создания новых релизов в соответствии со [спецификацией conventional commits](https://www.conventionalcommits.org/en/v1.0.0/).

[![Tests Status](https://github.com/modulify/conventional/actions/workflows/tests.yml/badge.svg)](https://github.com/modulify/conventional/actions)
[![codecov](https://codecov.io/gh/modulify/conventional/branch/main/graph/badge.svg)](https://codecov.io/gh/modulify/conventional)

## Пакеты

- [`@modulify/conventional-git`](../../packages/conventional-git) — Тонкая обертка над git с парсингом conventional-коммитов и помощниками для семантических тегов.
- [`@modulify/conventional-bump`](../../packages/conventional-bump) — Помощник для семантических релизов, который рекомендует следующую версию (major/minor/patch).
- [`@modulify/conventional-changelog`](../../packages/conventional-changelog) — Генерация чейнджлога из истории git с использованием шаблонов Nunjucks.

## Пример использования

```ts
import { Client } from '@modulify/conventional-git'
import { ReleaseAdvisor } from '@modulify/conventional-bump'
import { createWrite } from '@modulify/conventional-changelog'
import semver from 'semver'

const git = new Client()
const advisor = new ReleaseAdvisor({ git })

// 1. Получение текущей версии и рекомендации следующей
const currentVersion = await git.version() ?? '0.0.0'
const recommendation = await advisor.advise({
  preMajor: semver.lt(currentVersion, '1.0.0')
})

if (recommendation) {
  const nextVersion = semver.inc(currentVersion, recommendation.type)

  // 2. Генерация и запись чейнджлога
  const write = createWrite({ git, file: 'CHANGELOG.md' })
  await write(nextVersion)

  // 3. Теперь вы можете обновить package.json, закомитить и создать тег
  console.log(`Следующий релиз: ${nextVersion}`)
}
```
