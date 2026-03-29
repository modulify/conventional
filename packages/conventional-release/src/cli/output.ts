import chalk from 'chalk'
import figures from 'figures'

import * as util from 'node:util'

export interface MessageOutput {
  write(message: string): void | Promise<void>
  writeError(message: string): void | Promise<void>
}

export type OutputTheme = {
  success: string
  warning: string
  error: string
  info: string
}

export class ConsoleOutput implements MessageOutput {
  write (message: string) {
    console.info(message)
  }

  writeError (message: string) {
    console.error(message)
  }
}

export class BufferedOutput implements MessageOutput {
  readonly messages = [] as string[]
  readonly errors = [] as string[]

  write (message: string) {
    this.messages.push(message)
  }

  writeError (message: string) {
    this.errors.push(message)
  }
}

export class Output {
  private readonly output: MessageOutput
  private readonly theme: OutputTheme

  constructor ({
    dry,
    output = new ConsoleOutput(),
    theme = createDefaultTheme(dry),
  }: {
    dry: boolean;
    output?: MessageOutput;
    theme?: OutputTheme;
  }) {
    this.output = output
    this.theme = theme
  }

  info (template: string, context: unknown[] = [], figure = this.theme.info) {
    this.output.write(format(template, context, figure))
  }

  success (template: string, context: unknown[] = [], figure = this.theme.success) {
    this.output.write(format(template, context, figure))
  }

  warn (template: string, context: unknown[] = [], figure = this.theme.warning) {
    this.output.write(format(template, context, figure))
  }

  error (template: string, context: unknown[] = [], figure = this.theme.error) {
    this.output.writeError(format(template, context, figure))
  }
}

function createDefaultTheme (dry: boolean): OutputTheme {
  return {
    success: dry
      ? chalk.yellow(figures.tick)
      : chalk.green(figures.tick),
    warning: chalk.yellow(figures.warning),
    error: chalk.red(figures.cross),
    info: chalk.blue(figures.info),
  }
}

function format (template: string, context: unknown[], figure: string) {
  const bold = (arg: unknown) => chalk.bold(arg)
  const message = util.format(template, ...context.map(bold))

  return `${figure} ${message}`
}
