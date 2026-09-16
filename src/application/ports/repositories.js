/**
 * @template T
 * @typedef {{ok: true, value?: T} | {ok: false, error: Error}} Result
 *
 * @typedef {Object} SheetRepository
 * @property {() => ({ok: true, empty: boolean, raw: string|null, value: object|null, source: string}|{ok: false, raw: string|null, error: Error})} load
 * @property {(document: object) => Result<void>} save
 * @property {(raw: string) => Result<void>} backup
 *
 * @typedef {Object} PreferencesRepository
 * @property {() => Result<{theme: 'light'|'dark'|null}>} load
 * @property {(theme: 'light'|'dark') => Result<void>} save
 */
export {};
