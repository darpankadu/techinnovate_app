import fs from 'fs';
import path from 'path';

export function getServiceAccountKey(envVarName) {
  let raw = process.env[envVarName];
  
  if (!raw || !raw.trim().startsWith('{')) {
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const regex = new RegExp(`${envVarName}\\s*=\\s*([\\s\\S]*?)(?:\\n\\s*\\w+\\s*=|$)`);
        const match = envContent.match(regex);
        if (match && match[1]) {
          raw = match[1].trim();
        }
      }
    } catch (e) {
      console.warn(`[envLoader] Direct file read fallback failed for ${envVarName}:`, e.message);
    }
  }

  if (!raw) return null;

  let cleaned = raw.trim();

  // Safely strip outer single quotes recursively (JSON keys never use single quotes)
  while (cleaned.startsWith("'")) {
    cleaned = cleaned.slice(1).trim();
  }
  while (cleaned.endsWith("'")) {
    cleaned = cleaned.slice(0, -1).trim();
  }

  // Ensure JSON wrapping braces are present
  if (!cleaned.startsWith('{')) {
    cleaned = '{' + cleaned;
  }
  if (!cleaned.endsWith('}')) {
    cleaned = cleaned + '}';
  }

  // Clean raw newlines inside double-quoted string values (especially the private_key value)
  cleaned = cleaned.replace(/"([^"]*)"/g, (match, p1) => {
    return '"' + p1.replace(/\r?\n/g, '\\n') + '"';
  });

  // Replace literal newlines between fields with spaces
  cleaned = cleaned.replace(/\r?\n/g, ' ');

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`[envLoader] Failed to parse JSON credential for ${envVarName}:`, err.message);
    return null;
  }
}
