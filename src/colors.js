// The four colors of the Chroma Blaster. Everything in the game refers to a color by its index.
export const COLORS = [
  { id: 'red', name: 'CRIMSON', hex: 0xff3344, css: '#ff3344', freq: 220 },
  { id: 'yellow', name: 'SOLAR', hex: 0xffd23a, css: '#ffd23a', freq: 277 },
  { id: 'green', name: 'VERDANT', hex: 0x3dff7a, css: '#3dff7a', freq: 330 },
  { id: 'blue', name: 'AZURE', hex: 0x3a8bff, css: '#3a8bff', freq: 415 },
];

export const RED = 0;
export const YELLOW = 1;
export const GREEN = 2;
export const BLUE = 3;

export function colorName(i) {
  return COLORS[i].name;
}
