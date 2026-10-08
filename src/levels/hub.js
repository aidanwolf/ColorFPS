// THE HUB — a calm atrium joining every color world. See LAYOUT.md for its ports.
// TODO(hub agent): build it.

export function buildHub(B) {
  const { W, room, devStart } = B;
  // placeholder so the red exit doesn't open onto a void
  room({ x1: -24, x2: 24, zS: -100, zN: -148, y: 4, h: 12, zone: 'hub', s: [{ c: 0, w: 3, h: 3.2 }] });
  devStart('hub', [0, 4, -103], 0, [0]);
}
