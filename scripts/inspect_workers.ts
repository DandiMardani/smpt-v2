import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

function getEnv() {
  const env: Record<string, string> = {};
  const fullPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
          env[k] = v;
        }
      }
    });
  }
  return env;
}

const env = getEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase
    .from('workers')
    .select('id, worker_code, name, department, position, pay_system, daily_wage')
    .order('id');
  if (error) {
    console.error('Error fetching workers:', error);
  } else {
    console.log(`Found ${data?.length} workers in database:`);
    console.log(data?.slice(0, 10));
  }
}

main();
