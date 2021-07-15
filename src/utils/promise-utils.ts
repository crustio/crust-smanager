import Bluebird from 'bluebird';

export function timeout<T>(
  p: Promise<T>,
  timeout: number,
  timeoutValue: T,
): Promise<T> {
  return Bluebird.any([p, Bluebird.delay(timeout, timeoutValue)]);
}
