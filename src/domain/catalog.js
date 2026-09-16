
const ABILITIES = [
  { key: 'for', label: 'Força', short: 'FOR' },
  { key: 'des', label: 'Destreza', short: 'DES' },
  { key: 'con', label: 'Constituição', short: 'CON' },
  { key: 'int', label: 'Inteligência', short: 'INT' },
  { key: 'sab', label: 'Sabedoria', short: 'SAB' },
  { key: 'car', label: 'Carisma', short: 'CAR' }
];

const SKILLS = [
  { key: 'athletics', name: 'Atletismo', ability: 'for' },
  { key: 'acrobatics', name: 'Acrobacia', ability: 'des' },
  { key: 'sleightOfHand', name: 'Prestidigitação', ability: 'des' },
  { key: 'stealth', name: 'Furtividade', ability: 'des' },
  { key: 'arcana', name: 'Arcanismo', ability: 'int' },
  { key: 'history', name: 'História', ability: 'int' },
  { key: 'investigation', name: 'Investigação', ability: 'int' },
  { key: 'nature', name: 'Natureza', ability: 'int' },
  { key: 'religion', name: 'Religião', ability: 'int' },
  { key: 'animalHandling', name: 'Lidar com Animais', ability: 'sab' },
  { key: 'insight', name: 'Intuição', ability: 'sab' },
  { key: 'medicine', name: 'Medicina', ability: 'sab' },
  { key: 'perception', name: 'Percepção', ability: 'sab' },
  { key: 'survival', name: 'Sobrevivência', ability: 'sab' },
  { key: 'deception', name: 'Enganação', ability: 'car' },
  { key: 'intimidation', name: 'Intimidação', ability: 'car' },
  { key: 'performance', name: 'Atuação', ability: 'car' },
  { key: 'persuasion', name: 'Persuasão', ability: 'car' }
];

const ARMOR_TYPES = [
  { value: 'none', label: 'Sem armadura', dexCap: null },
  { value: 'light', label: 'Armadura leve', dexCap: null },
  { value: 'medium', label: 'Armadura média', dexCap: 2 },
  { value: 'heavy', label: 'Armadura pesada', dexCap: 0 }
];

const ARMOR_SLOTS = [
  { key: 'helm', label: 'Elmo' },
  { key: 'chest', label: 'Peitoral' },
  { key: 'gloves', label: 'Luvas' },
  { key: 'waist', label: 'Cintura' },
  { key: 'legs', label: 'Pernas' }
];

const WEAPON_ICONS = ['⚔', '🗡', '🪓', '🔨', '🏹', '🛡'];

export { ABILITIES, SKILLS, ARMOR_TYPES, ARMOR_SLOTS, WEAPON_ICONS };
