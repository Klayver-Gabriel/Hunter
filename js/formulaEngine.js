/* ============================================================
   HUNTER'S CODEX — FORMULA ENGINE
   Regras puras de cálculo. Sem DOM aqui — só matemática.
   Fase 3 (Damage Engine) vai expandir este arquivo bastante;
   por enquanto ele cobre o que a Fase 1 precisa: modificadores.
   ============================================================ */

window.HC = window.HC || {};

HC.formula = (function () {

  /**
   * Modificador padrão D&D 5e: floor((score - 10) / 2)
   */
  function mod(score) {
    const n = Number(score);
    if (Number.isNaN(n)) return 0;
    return Math.floor((n - 10) / 2);
  }

  /**
   * Modificador formatado com sinal, ex: +3, -1, +0
   */
  function modStr(score) {
    const m = mod(score);
    return (m >= 0 ? '+' : '') + m;
  }

  /**
   * Bônus de proficiência padrão por nível (D&D 5e).
   */
  function proficiencyBonus(level) {
    const lvl = Math.max(1, Math.min(20, Number(level) || 1));
    return 2 + Math.floor((lvl - 1) / 4);
  }

  /**
   * Clampeia um valor "atual" entre 0 e o máximo.
   */
  function clamp(current, max) {
    const c = Number(current) || 0;
    const m = Number(max) || 0;
    return Math.max(0, Math.min(c, m));
  }

  /**
   * Percentual de preenchimento para barras de recurso.
   */
  function percent(current, max) {
    const m = Number(max) || 0;
    if (m <= 0) return 0;
    return Math.max(0, Math.min(100, (Number(current) / m) * 100));
  }

  return { mod, modStr, proficiencyBonus, clamp, percent };
})();
