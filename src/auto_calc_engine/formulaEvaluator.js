

function mod(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return NaN;
  return Math.floor((n - 10) / 2);
}

function modStr(score) {
  const m = mod(score);
  return (m >= 0 ? '+' : '') + m;
}

function proficiencyBonus(level) {
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  return 2 + Math.floor((lvl - 1) / 4);
}

function clamp(current, max) {
  const c = Number(current) || 0;
  const m = Number(max) || 0;
  return Math.max(0, Math.min(c, m));
}

function percent(current, max) {
  const m = Number(max) || 0;
  if (m <= 0) return 0;
  return Math.max(0, Math.min(100, (Number(current) / m) * 100));
}

/** Arithmetic grammar only: unknown variables, member access and non-finite results are rejected. */
function evaluate(expression, variables) {
  const source = String(expression ?? '').replace(/\s+/g, '');
  if (source.length > 2000) throw new Error('A fórmula é muito longa.');
  if (!source) throw new Error('A fórmula está vazia.');

  const tokens = source.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/,]/g) || [];
  if (tokens.join('') !== source) throw new Error('A fórmula contém caracteres inválidos.');

  const context = Object.keys(variables || {}).reduce((result, key) => {
    result[key.toUpperCase()] = Number(variables[key]);
    return result;
  }, {});
  const functions = {
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    abs: Math.abs,
    min: Math.min,
    max: Math.max
  };
  let index = 0;

  function consume(expected) {
    const token = tokens[index];
    if (expected && token !== expected) throw new Error(`Esperado "${expected}".`);
    index += 1;
    return token;
  }

  function primary() {
    const token = tokens[index];
    if (token === '(') {
      consume('(');
      const value = addition();
      consume(')');
      return value;
    }
    if (/^\d/.test(token || '')) {
      consume();
      return Number(token);
    }
    if (/^[A-Za-z_]/.test(token || '')) {
      consume();
      const name = token.toUpperCase();
      if (tokens[index] !== '(') {
        if (!Object.prototype.hasOwnProperty.call(context, name)) throw new Error(`Variável desconhecida: ${token}.`);
        if (!Number.isFinite(context[name])) throw new Error(`Variável sem valor numérico válido: ${token}.`);
        return context[name];
      }
      const fn = functions[token.toLowerCase()];
      if (!fn) throw new Error(`Função desconhecida: ${token}.`);
      consume('(');
      const args = [addition()];
      while (tokens[index] === ',') { consume(','); args.push(addition()); }
      consume(')');
      if (!['min', 'max'].includes(token.toLowerCase()) && args.length !== 1) throw new Error(`A função ${token} exige um argumento.`);
      return fn(...args);
    }
    throw new Error('Valor esperado na fórmula.');
  }

  function unary() {
    if (tokens[index] === '+') { consume('+'); return unary(); }
    if (tokens[index] === '-') { consume('-'); return -unary(); }
    return primary();
  }

  function multiplication() {
    let value = unary();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = consume();
      const right = unary();
      if (operator === '/' && right === 0) throw new Error('Divisão por zero.');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }

  function addition() {
    let value = multiplication();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = consume();
      const right = multiplication();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = addition();
  if (index !== tokens.length) throw new Error(`Token inesperado: ${tokens[index]}.`);
  if (!Number.isFinite(result)) throw new Error('A fórmula não produziu um número válido.');
  return result;
}

export { mod, modStr, proficiencyBonus, clamp, percent, evaluate };

export function formulaReferences(expression) {
  return [...new Set((String(expression).match(/[A-Za-z_][A-Za-z0-9_]*(?![A-Za-z0-9_])/g) || []).filter(name => !['floor', 'ceil', 'round', 'abs', 'min', 'max'].includes(name.toLowerCase())).map(name => name.toUpperCase()))];
}
