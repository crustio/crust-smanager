import {URL} from 'url';
import BigNumber from 'bignumber.js';

export const sleep = require('util').promisify(setTimeout);

export * as consts from './consts';

/**
 * Parse object into JSON object
 * @param o any object
 */
export function parseObj(o: any) {
  return JSON.parse(JSON.stringify(o));
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
  return Math.round((Math.random() * Date.now() + seed) % 60);
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
