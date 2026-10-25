import { describe, expect, it } from 'vitest';
import { QueueTimeoutError, Semaphore } from './concurrency';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Semaphore', () => {
  it('never runs more than `max` tasks at once', async () => {
    const sem = new Semaphore(2, 1_000);
    let running = 0;
    let peak = 0;
    const task = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await sleep(10);
      running -= 1;
    };
    await Promise.all(Array.from({ length: 6 }, () => sem.run(task)));
    expect(peak).toBe(2);
    expect(sem.running).toBe(0);
  });

  it('rejects with QueueTimeoutError when the wait is too long', async () => {
    const sem = new Semaphore(1, 20);
    const long = sem.run(() => sleep(100));
    await expect(sem.run(async () => 'late')).rejects.toBeInstanceOf(QueueTimeoutError);
    await long;
    expect(sem.waiting).toBe(0);
    await expect(sem.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('releases the slot when a task throws', async () => {
    const sem = new Semaphore(1, 100);
    await expect(sem.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(sem.run(async () => 1)).resolves.toBe(1);
  });
});
