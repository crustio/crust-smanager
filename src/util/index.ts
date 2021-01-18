import {URL} from 'url';

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
 * @returns B size
 */
export function gigaBytesToBytes(gb: number): number {
  return gb * 1073741824;
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
 * Sleep XX ms
 * @param time time to wait
 */
export function sleep(time: number) {
  return new Promise(resolve => setTimeout(resolve, time));
}
