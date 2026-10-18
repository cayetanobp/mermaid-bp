const safeCharacters=/^[A-Za-z0-9._+-]+$/;

export function normalizeReleaseAssetName(name){
  if(typeof name!=='string'||name.length===0||/[\\/\u0000-\u001f\u007f]/.test(name))throw new Error('El nombre del asset debe ser un nombre de archivo simple.');
  const normalized=name.replaceAll(' ','.');
  if(!safeCharacters.test(normalized))throw new Error('El nombre normalizado contiene caracteres no seguros para una release.');
  return normalized;
}
