import { URL } from 'url';
import dayjs from 'dayjs';
import BigNumber from 'bignumber.js';
import seedrandom from 'seedrandom';
import Bluebird from 'bluebird';

export const sleep = (t: number): Promise<void> => Bluebird.delay(t);

export * as consts from './consts';

/**
 * Parse object into JSON object
 * @param o any object
 */
export function parseObj<T>(o: unknown): T {
  if (typeof o !== 'string') {
    return o as T;
  }
  return JSON.parse(o);
}

/**
 * Convert from hex to string
 * @param hex Hex string with prefix `0x`
 * @returns With string back
 */
export function hexToString(hex: string): string {
  return Buffer.from(hex.substring(2), 'hex').toString();
}

/**
 * GB to B
 * number's max value: 9007199254740991
 * so basically we don't need BigNumber at all
 * @param gb GB size
 * @returns Byte size
 */
export function gigaBytesToBytes(gb: number): BigNumber {
  return new BigNumber(gb).multipliedBy(1073741824);
}

/**
 * Parse http address to host and port
 * @param addr http address, format is `https://user:pass@sub.example.com:8080/p/a/t/h?query=string#hash`
 * @returns [host, port]
 */
export function addrToHostPort(addr: string): [string, string] {
  const url = new URL(addr);

  return [url.hostname, url.port];
}

/**
 * Get random second
 * @returns 0-60s
 */
export function getRandSec(seed: number): number {
  return Math.floor((Math.random() * Date.now() + seed) % 60);
}

/**
 * Get random float
 * @returns 0-1
 */
export function rdm(seed: string): number {
  const rng = seedrandom(seed, { entropy: true });
  return rng();
}

/**
 * Reduce string letter to number
 * @param s string
 */
export function lettersToNum(s: string): number {
  let num = 0;
  for (let i = 0; i < s.length; i++) {
    num += s.charCodeAt(i);
  }

  return num;
}

export function getTimestamp(): number {
  return dayjs().unix();
}

const MBBase = 1024 * 1024;
export function bytesToMb(bytes: number): number {
  return bytes / MBBase;
}

export function mbToBytes(mb: number): number {
  return mb * MBBase;
}

export function gbToMb(gb: number): number {
  return gb / 1024;
}

export function toQuotedList<T>(status: T[]): string {
  return status.map((s) => `"${s}"`).join(',');
}

// eslint-disable-next-line
export function formatError(e: any): string {
  return (e as Error).stack || JSON.stringify(e);
}
