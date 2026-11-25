const params = new URLSearchParams(location.search);

export const DEVICE = {
  touch: params.has('touch') ? params.get('touch') !== '0' : matchMedia('(pointer: coarse)').matches,
};
