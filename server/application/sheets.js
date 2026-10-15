import { AppError, missing, conflict } from '../domain/errors.js';

/** Persistence and document validation are injected dependencies. */
export function createSheets({ repository, normalize, fingerprint, newId }) {
  function content(raw) {
    let document;
    try { document = normalize(raw); }
    catch { throw new AppError(400, 'invalid_document', 'Documento inválido ou incompatível.'); }
    const title = document.character.info.name || 'Sem título';
    if (typeof title !== 'string' || title.length > 200) throw new AppError(400, 'invalid_title', 'Nome deve ter até 200 caracteres.');
    return { document, title, schemaVersion: document.character.schemaVersion, fingerprint: fingerprint(document), creationFingerprint: fingerprint(raw) };
  }
  const revision = value => {
    if (!Number.isSafeInteger(value) || value < 1) throw new AppError(400, 'invalid_revision', 'Revisão inválida.');
    return value;
  };
  const key = value => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-]{16,100}$/.test(value)) throw new AppError(400, 'invalid_key', 'Chave de requisição inválida.');
    return value;
  };
  return {
    list: owner => repository.list(owner),
    async get(owner, id) { const result = await repository.get(owner, id); if (!result) throw missing(); return result; },
    async create(owner, input) {
      const value = content(input.document);
      const result = await repository.create(owner, { ...value, id: newId(), key: key(input.key) });
      if (!result) throw conflict();
      return result;
    },
    async update(owner, id, input) {
      const value = content(input.document);
      const result = await repository.update(owner, id, { ...value, revision: revision(input.revision), mutation: key(input.mutation) });
      if (!result) { if (!await repository.get(owner, id)) throw missing(); throw conflict(); }
      return result;
    },
    async remove(owner, id, input) {
      const result = await repository.remove(owner, id, revision(input.revision), key(input.mutation));
      if (!result) { if (!await repository.get(owner, id)) throw missing(); throw conflict(); }
    }
  };
}
