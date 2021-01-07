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
