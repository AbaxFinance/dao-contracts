import { readFileSync } from 'fs-extra';
import path from 'path';
export interface BonusListElement {
  address: string[];
  xp: string;
}

const file = readFileSync(path.join(__dirname, '01_bonus_list.json'), 'utf-8');

export const BONUS_LIST: BonusListElement[] = JSON.parse(file);
