# @modulify/conventional-bump

[![codecov](https://codecov.io/gh/modulify/conventional/branch/main/graph/badge.svg?flag=conventional-bump)](https://codecov.io/gh/modulify/conventional?flags[0]=conventional-bump)

[🌐 Translations](./docs/INDEX.md)

Помощник для семантических релизов, который анализирует conventional-коммиты и рекомендует следующую версию (major/minor/patch) на основе вашей истории git.

- Репозиторий: https://github.com/modulify/conventional
- Спецификация: https://www.conventionalcommits.org/en/v1.0.0/

## Установка

- npm: `npm i @modulify/conventional-bump`
- yarn: `yarn add @modulify/conventional-bump`
- pnpm: `pnpm add @modulify/conventional-bump`

## Быстрый старт

```ts
import { ReleaseAdvisor } from '@modulify/conventional-bump'

const advisor = new ReleaseAdvisor()
const recommendation = await advisor.advise()

if (recommendation) {
  console.log(recommendation.type)   // 'major' | 'minor' | 'patch'
  console.log(recommendation.reason) // человекочитаемое объяснение
}
```

## Публичный API

### Типы

- `type ReleaseType = 'major' | 'minor' | 'patch'`
- `type ReleaseRecommendation = { type: ReleaseType; reason: string }`
- `type CommitType = { type: string; section: string; hidden?: boolean }`

### Константы

- `DEFAULT_COMMIT_TYPES: CommitType[]`
  - Стандартное сопоставление типов коммитов с разделами и видимостью (feat, fix, perf, revert видимы; остальные скрыты).

### ReleaseAdvisor

Создает анализатор, который читает коммиты из git и рекомендует следующую семантическую версию.

Конструктор:

```ts
new ReleaseAdvisor(options?: {
  cwd?: string;         // Рабочая директория для команд git
  git?: Client;         // Кастомный клиент @modulify/conventional-git (для тестов)
  parse?: ParseOptions; // Опции парсера conventional-коммитов (@modulify/conventional-git)
  types?: CommitType[]; // Кастомное сопоставление типов и разделов
})
```

Метод:

```ts
advise(options?: {
  ignore?: (commit: Commit) => boolean; // Пропустить определенные коммиты
  ignoreReverted?: boolean;             // Игнорировать коммиты, которые были позже отменены (по умолчанию: true)
  preMajor?: boolean;                   // Если true, понижает major→minor и minor→patch для версий <1.0.0
  strict?: boolean;                     // Если true, возвращает null при отсутствии значимых изменений
}): Promise<ReleaseRecommendation | null>
```

Особенности поведения:
- Мажорные изменения ("!" или примечания) приводят к `major`, если не включен `preMajor`.
- Новые функции (`feat`/`feature`) приводят к `minor`.
- В остальных случаях рекомендуется `patch`, если есть другие видимые изменения; при `strict: true` и отсутствии изменений возвращается `null`.
- При `ignoreReverted: true` советник исключает коммиты, которые были отменены позже, включая цепочки отмен.

## Пример: рабочий процесс для версий ниже 1.0.0

```ts
const advisor = new ReleaseAdvisor()
const next = await advisor.advise({ preMajor: true })
console.log(next?.type) // 'minor' или 'patch' для проектов <1.0.0
```

## Пример: строгий режим (strict mode)

```ts
const next = await advisor.advise({ strict: true })
if (!next) {
  console.log('Нет значимых изменений с момента последнего тега')
}
```
