/** Each bag contains every book once; adjoining bags cannot repeat their boundary book. */
export function shuffleBooks(count: number, previous = -1): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (order.length > 1 && order[0] === previous) {
    const swap = 1 + Math.floor(Math.random() * (order.length - 1));
    [order[0], order[swap]] = [order[swap]!, order[0]!];
  }
  return order;
}
