import fs from 'fs';
import path from 'path';

const DIR = path.resolve(__dirname, '../../src/database/migrations');

export interface Migration {
  name: string;
  up: string;
  down: string;
}

/** Reads node-pg-migrate style SQL files ("-- Up Migration" / "-- Down Migration"). */
export function loadMigrations(): Migration[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => {
      const content = fs.readFileSync(path.join(DIR, name), 'utf8');
      const [upPart = '', downPart = ''] = content.split(/^-- Down Migration\s*$/m);
      return { name, up: upPart.replace(/^-- Up Migration\s*$/m, ''), down: downPart };
    });
}
