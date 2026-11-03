export const MAX_PHOTO_DATA_URL_LENGTH = 600_000;

export function validatePhotoDataUrl(value, label = 'Foto') {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > MAX_PHOTO_DATA_URL_LENGTH
    || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw Error(`${label} inválida ou grande demais. Selecione uma imagem pelo editor.`);
  }
  return value;
}

export const validateEquipmentPhoto = value => validatePhotoDataUrl(value, 'Foto de equipamento');
