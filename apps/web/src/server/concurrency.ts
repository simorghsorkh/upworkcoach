/**
 * Small counting semaphore with a queue timeout. Used to cap concurrent argon2 operations
 * per instance (security.md SEC-P5: at most 2; waiting longer than 5 s → 503 BUSY).
 */
export class QueueTimeoutError extends Error {
  constructor() {
    super('semaphore queue timeout');
    this.name = 'QueueTimeoutError';
  }
}

export class Semaphore {
  private active = 0;
  private readonly waiters: Array<{ resolve: () => void; timer: ReturnType<typeof setTimeout> }> =
    [];

  constructor(
    private readonly max: number,
    private readonly queueTimeoutMs: number,
  ) {}

  get running(): number {
    return this.active;
  }

  get waiting(): number {
    return this.waiters.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve: () => {
          clearTimeout(waiter.timer);
          resolve();
        },
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new QueueTimeoutError());
        }, this.queueTimeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      // The slot passes directly to the next waiter; `active` stays the same.
      next.resolve();
      return;
    }
    this.active -= 1;
  }
}
