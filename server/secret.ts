const REDACTED = '[REDACTED]';

/**
 * Holds a credential so that it cannot leak by accident: string conversion, JSON serialization,
 * and Node's `util.inspect` (used by `console.log`) all print `[REDACTED]`. Only `reveal()` returns
 * the value, and only the provider adapter calls it, to build the Authorization header.
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}
