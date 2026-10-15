import { parseEnv } from 'node:util';

/** Merge configuration defaults while retaining existing values and comments. */
export function prepareDockerEnv(current, template, generatePassword) {
  let content = current.trim() ? current : template;
  const defaults = parseEnv(template), existing = parseEnv(content);
  for (const [key, value] of Object.entries(defaults)) {
    if (!Object.hasOwn(existing, key)) content += `${content.endsWith('\n') ? '' : '\n'}${key}=${JSON.stringify(value)}\n`;
  }
  const values = parseEnv(content);
  for (const key of ['POSTGRES_ADMIN_PASSWORD', 'POSTGRES_RUNTIME_PASSWORD']) {
    if (values[key]) {
      if (!/^[A-Za-z0-9_-]{32,}$/.test(values[key])) throw Error(`${key} deve conter pelo menos 32 caracteres: letras, números, _ ou -.`);
      continue;
    }
    const password = generatePassword();
    content = content.replace(new RegExp(`^[\\t ]*(?:export[\\t ]+)?${key}[\\t ]*=.*$`, 'gm'), `${key}=${password}`);
  }
  return content.endsWith('\n') ? content : content + '\n';
}
