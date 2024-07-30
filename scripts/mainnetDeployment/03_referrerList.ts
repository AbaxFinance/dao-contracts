import { readFileSync } from 'fs-extra';
import path from 'path';

const file = readFileSync(path.join(__dirname, '03_referrer_list.json'), 'utf-8');

export const REFERRER_LIST: string[] = JSON.parse(file).map((x: { address: string }) => x.address);
