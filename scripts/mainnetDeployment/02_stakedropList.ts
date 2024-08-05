import { readFileSync } from 'fs-extra';
import path from 'path';

export interface StakedropElement {
  abaxReward: string;
  contributedAzero: string;
}

const file = readFileSync(path.join(__dirname, '02_stakedrop_result.json'), 'utf-8');
export const STAKEDROP_LIST: Record<string, StakedropElement> = JSON.parse(file);
