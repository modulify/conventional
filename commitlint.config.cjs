module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'build',
        'ci',
        'perf',
        'docs',
        'refactor',
        'style',
        'test',
        'chore',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'conventional-bump',
        'conventional-changelog',
        'conventional-git',
        'release',
      ],
    ],
    'header-max-length': [2, 'always', 200],
    'body-max-line-length': [2, 'always', 400],
    'footer-max-line-length': [2, 'always', 200],
    'subject-case': [0],
  },
}
