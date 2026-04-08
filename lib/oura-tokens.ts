import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const TOKEN_FILE = path.join(process.cwd(), '.oura-tokens.json');

export type OuraTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms since epoch
};

export function readTokens(): OuraTokens | null {
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, 'utf-8')) as OuraTokens;
  } catch {
    return null;
  }
}

export function writeTokens(tokens: OuraTokens) {
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}
