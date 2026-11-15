import { AppError } from '../domain/errors.js';
import { createDefaultSystems, validateSystemProfile } from '../../src/domain/gameSystems.js';

const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const validRevision = value => {
  if (!Number.isSafeInteger(value) || value < 1) throw new AppError(400, 'invalid_revision', 'Revisão inválida.');
  return value;
};

export function createSystems({ repository, newId }) {
  function normalize(raw, id, revision = 1) {
    try { return validateSystemProfile({ ...raw, id, revision }); }
    catch (error) { throw new AppError(400, 'invalid_system', error.message || 'Sistema inválido.'); }
  }
  async function seed(owner) {
    await repository.seed(owner, createDefaultSystems());
  }
  return {
    async list(owner) { await seed(owner); return repository.list(owner); },
    async create(owner, input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError(400, 'invalid_system', 'Sistema inválido.');
      const profile = normalize(input, `sys_${newId()}`);
      const result = await repository.create(owner, profile);
      if (!result) throw new AppError(409, 'conflict', 'Esse sistema já existe.');
      return result;
    },
    async update(owner, id, input) {
      if (!idPattern.test(id) || !input || typeof input !== 'object' || Array.isArray(input)) throw new AppError(400, 'invalid_system', 'Sistema inválido.');
      const revision = validRevision(input.revision);
      const profile = normalize(input, id, revision + 1);
      const result = await repository.update(owner, id, revision, profile);
      if (!result) { if (!await repository.get(owner, id)) throw new AppError(404, 'not_found', 'Sistema não encontrado.'); throw new AppError(409, 'conflict', 'O sistema mudou em outra aba ou dispositivo.'); }
      return result;
    },
    async remove(owner, id, input) {
      if (!idPattern.test(id)) throw new AppError(404, 'not_found', 'Sistema não encontrado.');
      if (['dnd5e', 'tormenta20'].includes(id)) throw new AppError(409, 'system_default', 'Os sistemas padrão podem ser editados, mas não excluídos.');
      const revision = validRevision(input?.revision);
      const removed = await repository.remove(owner, id, revision);
      if (removed === 'used') throw new AppError(409, 'system_in_use', 'Este sistema está vinculado a uma ou mais fichas.');
      if (!removed) { if (!await repository.get(owner, id)) throw new AppError(404, 'not_found', 'Sistema não encontrado.'); throw new AppError(409, 'conflict', 'O sistema está sendo editado em outra aba ou dispositivo.'); }
    }
  };
}
