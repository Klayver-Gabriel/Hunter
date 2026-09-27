import * as D from '../domain/catalog.js';

function emptyEffects() {
  return { attack: 0, damage: 0, initiative: 0, skills: {} };
}

function resolveSkillKey(value) {
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const skill = D.SKILLS.find(item =>
    item.key.toLowerCase() === normalized ||
    item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === normalized
  );
  return skill ? skill.key : value;
}

function parseUnlocks(weapon) {
  return String(weapon.masteryUnlocks || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [levelText, name, effectText] = line.split('|').map(part => (part || '').trim());
      const effects = emptyEffects();

      String(effectText || '').split(',').forEach(pair => {
        let [key, value] = pair.split(':').map(part => (part || '').trim());
        const amount = Number(value) || 0;

        // Compatibilidade: o antigo bônus percentual Hunter passa a ser
        if (key === 'hunterAttackPercent') key = 'damage';

        if (key === 'attack' || key === 'damage' || key === 'initiative') {
          effects[key] += amount;
          return;
        }

        const rawSkillKey = key.startsWith('skill.')
          ? key.slice(6)
          : key.startsWith('pericia.') ? key.slice(8) : '';
        const skillKey = resolveSkillKey(rawSkillKey);
        if (skillKey) effects.skills[skillKey] = (effects.skills[skillKey] || 0) + amount;
      });

      return {
        level: Math.max(1, Number(levelText) || 1),
        name: name || 'Técnica',
        effects,
        description: effectText || ''
      };
    });
}

function masteryState(character, weapon) {
  return character.masteries[weapon.id] || { level: 1, xp: 0, xpToNext: 100 };
}

function masteryEffects(character, weapon) {
  if (!weapon) return emptyEffects();
  const currentLevel = masteryState(character, weapon).level;

  return parseUnlocks(weapon)
    .filter(unlock => unlock.level <= currentLevel)
    .reduce((total, unlock) => {
      total.attack += unlock.effects.attack;
      total.damage += unlock.effects.damage;
      total.initiative += unlock.effects.initiative;
      Object.entries(unlock.effects.skills).forEach(([skill, value]) => {
        total.skills[skill] = (total.skills[skill] || 0) + value;
      });
      return total;
    }, emptyEffects());
}

export { parseUnlocks, masteryState, masteryEffects };
