/**
 * Turns the LaTeX of a function of x — as produced by the widget builder,
 * including whatever the user typed into text cells — into something that can
 * be evaluated, so a plot can be sampled for both the on-screen preview and
 * the PDF.
 *
 * Covers what a function plot realistically needs: numbers, x, e and \pi;
 * + - * / ^ with implicit multiplication ("2x", "3(x+1)", "x\sin x");
 * \frac, \sqrt (with an optional index), absolute values, and the usual
 * named functions. Anything else is reported as an error naming the part it
 * didn't understand, rather than silently plotting something wrong.
 */

export type PlotFn = (x: number) => number

export class PlotParseError extends Error {}

// --- Tokens --------------------------------------------------------------------

type Token =
  | { kind: 'num'; value: number; text: string }
  | { kind: 'letter'; value: string }
  | { kind: 'cmd'; value: string }
  | { kind: 'sym'; value: string }

/** Spacing commands that mean nothing to the value. */
const IGNORED_COMMANDS = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'displaystyle', 'left', 'right'])

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (/\s/.test(ch)) {
      i++
    } else if (/[0-9.]/.test(ch)) {
      const match = /^(\d+\.?\d*|\.\d+)/.exec(source.slice(i))
      if (!match) throw new PlotParseError(`Unexpected "${ch}"`)
      tokens.push({ kind: 'num', value: Number(match[1]), text: match[1] })
      i += match[1].length
    } else if (/[a-zA-Z]/.test(ch)) {
      tokens.push({ kind: 'letter', value: ch })
      i++
    } else if (ch === '\\') {
      const word = /^\\([a-zA-Z]+)/.exec(source.slice(i))
      if (word) {
        i += word[0].length
        // \left and \right only size the delimiter that follows; the
        // delimiter itself is still read as a normal token.
        if (!IGNORED_COMMANDS.has(word[1])) tokens.push({ kind: 'cmd', value: word[1] })
      } else {
        const next = source[i + 1] ?? ''
        i += 2
        if (next === '{' || next === '}') tokens.push({ kind: 'sym', value: next === '{' ? '(' : ')' })
        else if (next === '\\') throw new PlotParseError('A plot is a single expression — remove the New Line')
        else if (!IGNORED_COMMANDS.has(next)) throw new PlotParseError(`Unsupported "\\${next}"`)
      }
    } else if ('+-*/^_()[]{}|,'.includes(ch)) {
      tokens.push({ kind: 'sym', value: ch })
      i++
    } else {
      throw new PlotParseError(`Unexpected "${ch}"`)
    }
  }
  return tokens
}

// --- Parser --------------------------------------------------------------------

const UNARY_FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sec: (v) => 1 / Math.cos(v),
  csc: (v) => 1 / Math.sin(v),
  cot: (v) => 1 / Math.tan(v),
  arcsin: Math.asin,
  arccos: Math.acos,
  arctan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  lg: Math.log10
}

const OPERATOR_COMMANDS: Record<string, string> = { cdot: '*', times: '*', div: '/', ast: '*' }

const FRACTION_COMMANDS = new Set(['frac', 'dfrac', 'tfrac'])

class Parser {
  private pos = 0
  /** How many absolute-value bars are open, so a "|" can be told apart as
   * opening a new one versus closing the current one. */
  private absDepth = 0

  constructor(private readonly tokens: Token[]) {}

  parse(): PlotFn {
    if (this.tokens.length === 0) throw new PlotParseError('The function is empty')
    const fn = this.expression()
    if (this.pos < this.tokens.length) throw new PlotParseError(`Unexpected "${describe(this.peek())}"`)
    return fn
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private isSym(value: string): boolean {
    const t = this.peek()
    return t?.kind === 'sym' && t.value === value
  }

  private isOperatorCmd(op: string): boolean {
    const t = this.peek()
    return t?.kind === 'cmd' && OPERATOR_COMMANDS[t.value] === op
  }

  private expect(value: string): void {
    if (!this.isSym(value)) {
      const t = this.peek()
      throw new PlotParseError(t ? `Expected "${value}" before "${describe(t)}"` : `Missing "${value}"`)
    }
    this.pos++
  }

  private expression(): PlotFn {
    let left = this.term()
    for (;;) {
      if (this.isSym('+')) {
        this.pos++
        const a = left
        const b = this.term()
        left = (x) => a(x) + b(x)
      } else if (this.isSym('-')) {
        this.pos++
        const a = left
        const b = this.term()
        left = (x) => a(x) - b(x)
      } else {
        return left
      }
    }
  }

  private term(): PlotFn {
    let left = this.unary()
    for (;;) {
      if (this.isSym('*') || this.isOperatorCmd('*')) {
        this.pos++
        const a = left
        const b = this.unary()
        left = (x) => a(x) * b(x)
      } else if (this.isSym('/') || this.isOperatorCmd('/')) {
        this.pos++
        const a = left
        const b = this.unary()
        left = (x) => a(x) / b(x)
      } else if (this.startsFactor()) {
        // Implicit multiplication: "2x", "3(x+1)", "x\sin x".
        const a = left
        const b = this.power()
        left = (x) => a(x) * b(x)
      } else {
        return left
      }
    }
  }

  private unary(): PlotFn {
    if (this.isSym('-')) {
      this.pos++
      const a = this.unary()
      return (x) => -a(x)
    }
    if (this.isSym('+')) {
      this.pos++
      return this.unary()
    }
    return this.power()
  }

  /** Whether the next token can begin a factor of an implicit product. */
  private startsFactor(): boolean {
    const t = this.peek()
    if (!t) return false
    if (t.kind === 'num' || t.kind === 'letter') return true
    if (t.kind === 'cmd') return !(t.value in OPERATOR_COMMANDS)
    if (t.value === '(' || t.value === '[') return true
    return t.value === '|' && this.absDepth === 0
  }

  private power(): PlotFn {
    const base = this.primary()
    if (!this.isSym('^')) return base
    this.pos++
    const exponent = this.scriptArgument()
    return (x) => Math.pow(base(x), exponent(x))
  }

  /** What follows ^ or _: a braced group, or — as in LaTeX — a single
   * character, so "x^23" is x² times 3. */
  private scriptArgument(): PlotFn {
    const t = this.peek()
    if (!t) throw new PlotParseError('Missing exponent')
    if (t.kind === 'sym' && (t.value === '{' || t.value === '(')) return this.primary()
    if (t.kind === 'num' && t.text.length > 1) {
      const digit = Number(t.text[0])
      const rest = t.text.slice(1)
      this.tokens[this.pos] = { kind: 'num', value: Number(rest), text: rest }
      return () => digit
    }
    if (t.kind === 'sym' && t.value === '-') {
      this.pos++
      const a = this.scriptArgument()
      return (x) => -a(x)
    }
    return this.primary()
  }

  private group(open: string, close: string): PlotFn {
    this.expect(open)
    // An empty group is almost always a widget box not filled in yet, e.g.
    // a fraction just dropped in — say so rather than "Unexpected }".
    if (this.isSym(close)) throw new PlotParseError('Fill in the empty box')
    const inner = this.expression()
    this.expect(close)
    return inner
  }

  private primary(): PlotFn {
    const t = this.peek()
    if (!t) throw new PlotParseError('The function ends too early')

    if (t.kind === 'num') {
      this.pos++
      return () => t.value
    }

    if (t.kind === 'letter') {
      this.pos++
      if (t.value === 'x') return (x) => x
      if (t.value === 'e') return () => Math.E
      throw new PlotParseError(`Unknown variable "${t.value}" — use x`)
    }

    if (t.kind === 'sym') {
      if (t.value === '(') return this.group('(', ')')
      if (t.value === '{') return this.group('{', '}')
      if (t.value === '[') return this.group('[', ']')
      if (t.value === '|') {
        this.pos++
        this.absDepth++
        const inner = this.expression()
        this.absDepth--
        this.expect('|')
        return (x) => Math.abs(inner(x))
      }
      throw new PlotParseError(`Unexpected "${t.value}"`)
    }

    // Commands.
    this.pos++
    const name = t.value
    if (name === 'pi') return () => Math.PI
    if (FRACTION_COMMANDS.has(name)) {
      const num = this.group('{', '}')
      const den = this.group('{', '}')
      return (x) => num(x) / den(x)
    }
    if (name === 'sqrt') {
      let index: PlotFn | null = null
      if (this.isSym('[')) index = this.group('[', ']')
      const radicand = this.group('{', '}')
      if (!index) return (x) => Math.sqrt(radicand(x))
      const n = index
      // Odd roots of negatives are real (∛-8 = -2); Math.pow alone gives NaN.
      return (x) => {
        const k = n(x)
        const v = radicand(x)
        return v < 0 && Number.isInteger(k) && k % 2 === 1 ? -Math.pow(-v, 1 / k) : Math.pow(v, 1 / k)
      }
    }
    if (name === 'min' || name === 'max') {
      this.expect('(')
      const args = [this.expression()]
      while (this.isSym(',')) {
        this.pos++
        args.push(this.expression())
      }
      this.expect(')')
      const pick = name === 'min' ? Math.min : Math.max
      return (x) => pick(...args.map((a) => a(x)))
    }
    const fn = UNARY_FUNCTIONS[name]
    if (fn) return this.functionCall(name, fn)
    if (name === 'text' || name === 'mathrm') throw new PlotParseError('Text can’t be plotted')
    throw new PlotParseError(`Unsupported "\\${name}"`)
  }

  /** \sin x, \sin(2x), \sin^2 x, \log_2 x. Without parentheses the argument
   * is the product that follows, as in "\sin 2x" meaning sin(2x). */
  private functionCall(name: string, fn: (v: number) => number): PlotFn {
    let base: PlotFn | null = null
    let exponent: PlotFn | null = null
    for (;;) {
      if (this.isSym('_') && name === 'log' && !base) {
        this.pos++
        base = this.scriptArgument()
      } else if (this.isSym('^') && !exponent) {
        this.pos++
        exponent = this.scriptArgument()
      } else {
        break
      }
    }
    if (!this.startsFactor()) throw new PlotParseError(`\\${name} needs an argument`)
    const arg = this.isSym('(') ? this.power() : this.implicitProduct()
    const b = base
    const applied: PlotFn = b ? (x) => Math.log(arg(x)) / Math.log(b(x)) : (x) => fn(arg(x))
    if (!exponent) return applied
    const e = exponent
    return (x) => Math.pow(applied(x), e(x))
  }

  private implicitProduct(): PlotFn {
    let left = this.power()
    while (this.startsFactor() && this.peek()?.kind !== 'cmd') {
      const a = left
      const b = this.power()
      left = (x) => a(x) * b(x)
    }
    return left
  }
}

function describe(t: Token | undefined): string {
  if (!t) return 'end'
  if (t.kind === 'cmd') return `\\${t.value}`
  if (t.kind === 'num') return t.text
  return t.value
}

/** Compiles a function of x from its LaTeX, or throws PlotParseError. */
export function compileFunction(latex: string): PlotFn {
  return new Parser(tokenize(latex)).parse()
}
