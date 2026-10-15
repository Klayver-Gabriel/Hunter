export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const missing = () => new AppError(404, 'not_found', 'Ficha não encontrada.');
export const conflict = () => new AppError(409, 'conflict', 'A ficha mudou em outra aba ou dispositivo. Sua edição foi preservada.');
