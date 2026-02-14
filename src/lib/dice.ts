/** Returns a random integer between 1 and 20 */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/** Parses dice notation like "2d6" or "1d6+10" and rolls it */
export function rollDice(notation: string): number {
  const match = notation.match(/^(\d+)d(\d+)(?:\+(\d+))?$/);
  if (!match) return 0;
  const [, count, sides, bonus] = match;
  let total = 0;
  for (let i = 0; i < Number(count); i++) {
    total += Math.floor(Math.random() * Number(sides)) + 1;
  }
  return total + (bonus ? Number(bonus) : 0);
}
