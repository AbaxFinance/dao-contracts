import BN from 'bn.js';

export function paramsToInputNumbers(params1: Uint8Array) {
  let ecdStr = '';
  for (let i = 1; i < params1.length; ++i) {
    let stemp = params1[i].toString(16);
    if (stemp.length < 2) {
      stemp = '0' + stemp;
    }
    ecdStr += stemp;
  }
  const selector = hexToNumbers(ecdStr.substring(0, 8));
  const data = hexToNumbers(ecdStr.substring(8));
  return { selector, data };
}

export function hexToNumbers(hex: string): number[] {
  const byteArray = new Uint8Array(hex.length / 2);

  for (let i = 0; i < hex.length; i += 2) {
    byteArray[i / 2] = parseInt(hex.substr(i, 2), 16);
  }

  return Array.from(byteArray);
}

export function numbersToHex(bytes: (string | number | BN)[]): string {
  let hexString = '';

  for (const byte of bytes) {
    const hex = byte.toString(16).padStart(2, '0');
    hexString += hex;
  }

  return hexString;
}
