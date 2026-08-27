/* ============================================================
   HUNTER'S CODEX — D&D 2024 RULE ENGINE
   Cálculos puros da camada D&D. Não acessa o DOM nem salva dados.
   ============================================================ */

window.HC = window.HC || {};

HC.rules = (function () {
  const F = HC.formula;

  function signed(value) {
    const n = Number(value) || 0;
    return `${n >= 0 ? '+' : ''}${n}`;
  }

  function level(character) {
    return Math.max(1, Math.min(20, Number(character.info.level) || 1));
  }

  function proficiency(character) {
    return F.proficiencyBonus(level(character));
  }

  function abilityModifier(character, ability) {
    return F.mod(character.attributes[ability]);
  }

  function skillBreakdown(character, skill) {
    const state = character.dnd.skills[skill.key] || {};
    const ability = abilityModifier(character, skill.ability);
    const profMultiplier = state.expertise ? 2 : state.proficient ? 1 : 0;
    const proficiencyPart = proficiency(character) * profMultiplier;
    const external = (character.buffs || [])
      .filter(buff => buff.skill === skill.key)
      .reduce((total, buff) => total + (Number(buff.skillBonus) || 0), 0);
    const weapon = equippedWeapon(character);
    const mastery = weapon && HC.mastery
      ? (HC.mastery.masteryEffects(character, weapon).skills[skill.key] || 0)
      : 0;
    return {
      ability,
      proficiency: proficiencyPart,
      external,
      mastery,
      total: ability + proficiencyPart + external + mastery,
      profMultiplier
    };
  }

  function saveBreakdown(character, ability) {
    const abilityPart = abilityModifier(character, ability);
    const proficiencyPart = character.dnd.saves[ability] ? proficiency(character) : 0;
    return { ability: abilityPart, proficiency: proficiencyPart, total: abilityPart + proficiencyPart };
  }

  function buffTotals(character) {
    return (character.buffs || []).reduce((totals, buff) => {
      Object.keys(totals).forEach(key => {
        totals[key] += Number(buff[key]) || 0;
      });
      return totals;
    }, {
      attack: 0, damage: 0, armorClass: 0, initiative: 0, hp: 0
    });
  }

  function equippedArmor(character) {
    const armorLibrary = character.library.armors || [];
    const equipped = character.equipment.armor || {};
    return HC.data.ARMOR_SLOTS.map(slot => armorLibrary.find(item => item.id === equipped[slot.key])).filter(Boolean);
  }

  function armorClassBreakdown(character) {
    const armor = character.dnd.armor;
    const type = HC.data.ARMOR_TYPES.find(item => item.value === armor.type) || HC.data.ARMOR_TYPES[0];
    const rawDex = abilityModifier(character, 'des');
    const dex = type.value === 'heavy' ? 0 : type.dexCap == null ? rawDex : Math.min(rawDex, type.dexCap);
    const equipment = equippedArmor(character).reduce((sum, item) => sum + (Number(item.acBonus) || 0), 0);
    const buffs = buffTotals(character).armorClass + (Number(armor.buffs) || 0);
    const base = Number(armor.base) || 10;
    const armorBonus = Number(armor.armorBonus) || 0;
    const shield = Number(armor.shield) || 0;
    return { base, dex, armor: armorBonus + equipment, shield, buffs, total: base + dex + armorBonus + equipment + shield + buffs };
  }

  function initiativeBreakdown(character) {
    const dex = abilityModifier(character, 'des');
    const weapon = equippedWeapon(character);
    const mastery = weapon && HC.mastery ? HC.mastery.masteryEffects(character, weapon).initiative : 0;
    const buffs = buffTotals(character).initiative + (Number(character.dnd.initiative.buffs) || 0) + mastery;
    const feats = Number(character.dnd.initiative.feats) || 0;
    return { dex, buffs, feats, total: dex + buffs + feats };
  }

  function hitDieSides(character) {
    return Number(String(character.dnd.vitality.hitDie || 'd8').replace(/\D/g, '')) || 8;
  }

  function maxHpBreakdown(character) {
    const lvl = level(character);
    const die = hitDieSides(character);
    const vitality = character.dnd.vitality;
    const con = abilityModifier(character, 'con');
    const firstFormula = vitality.firstLevelFormula || `${die} + CON`;
    const laterFormula = vitality.laterLevelFormula || `${Math.floor(die / 2) + 1} + CON`;
    const variables = { CON: con, CON_MOD: con, LEVEL: lvl, NIVEL: lvl };
    const errors = [];
    let firstLevel;
    let laterPerLevel;

    try { firstLevel = Math.floor(F.evaluate(firstFormula, variables)); }
    catch (err) { firstLevel = die + con; errors.push(`1º nível: ${err.message}`); }
    try { laterPerLevel = Math.floor(F.evaluate(laterFormula, variables)); }
    catch (err) { laterPerLevel = Math.floor(die / 2) + 1 + con; errors.push(`níveis seguintes: ${err.message}`); }

    const laterLevels = Math.max(0, lvl - 1) * laterPerLevel;
    const feats = Number(character.dnd.vitality.featBonus) || 0;
    const buffs = (Number(character.dnd.vitality.buffs) || 0) + buffTotals(character).hp;
    return {
      firstFormula, laterFormula, firstLevel, laterPerLevel, laterLevels,
      feats, buffs, errors,
      total: Math.max(1, firstLevel + laterLevels + feats + buffs)
    };
  }

  function equippedWeapon(character) {
    return (character.library.weapons || []).find(weapon => weapon.id === character.equipment.weaponId) || null;
  }

  function attackBreakdown(character, weapon) {
    if (!weapon) return { ability: 0, proficiency: 0, buffs: 0, mastery: 0, total: 0 };
    const ability = abilityModifier(character, weapon.ability || 'for');
    const proficiencyPart = weapon.proficient === false ? 0 : proficiency(character);
    const buffs = buffTotals(character).attack;
    const mastery = HC.mastery ? HC.mastery.masteryEffects(character, weapon).attack : 0;
    return { ability, proficiency: proficiencyPart, buffs, mastery, total: ability + proficiencyPart + buffs + mastery };
  }

  function damageBreakdown(character, weapon) {
    if (!weapon) return { dice: '—', ability: 0, buffs: 0, mastery: 0, totalBonus: 0, additionalDice: [], expression: '—' };
    const ability = abilityModifier(character, weapon.ability || 'for');
    const buffs = buffTotals(character).damage;
    const mastery = HC.mastery ? HC.mastery.masteryEffects(character, weapon).damage : 0;
    const totalBonus = ability + buffs + mastery;
    const additionalDice = (character.buffs || [])
      .map(buff => String(buff.damageDice || '').trim())
      .filter(Boolean);
    const baseExpression = `${weapon.damageDice || '1d6'}${totalBonus === 0 ? '' : signed(totalBonus)}`;
    return {
      dice: weapon.damageDice || '1d6', ability, buffs, mastery, totalBonus, additionalDice,
      expression: [baseExpression, ...additionalDice].join(' + ')
    };
  }

  return {
    signed, level, proficiency, abilityModifier, skillBreakdown, saveBreakdown,
    buffTotals, equippedArmor, armorClassBreakdown, initiativeBreakdown,
    maxHpBreakdown, equippedWeapon, attackBreakdown, damageBreakdown
  };
})();
