import Bluebird from 'bluebird';

export async function timeout<T>(
  p: Promise<T>,
  timeout: number,
  timeoutValue: T | (() => T),
): Promise<T> {
  const emptyResult = {} as any; // eslint-disable-line
  const v = await Bluebird.race([p, Bluebird.delay(timeout, emptyResult)]);
  if (v === emptyResult) {
    if (typeof timeoutValue === 'function') {
      return (timeoutValue as () => T)();
    }
    return timeoutValue;
  }
  return v;
}

export async function timeoutOrError<T>(
  p: Promise<T>,
  time: number,
): Promise<T> {
  return timeout(p, time, () => {
    throw new Error(`failed to resolve in ${time}ms`);
  });
}
