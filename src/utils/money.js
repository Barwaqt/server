export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const shares = weights.map((w) => Math.floor((total * w) / sum));
  let remainder = total - shares.reduce((a, b) => a + b, 0);
  for (let i = 0; remainder > 0; i++, remainder--) shares[i % shares.length]++;
  return shares;
}
export const percentage = (amount, bps) => Math.floor((amount * bps) / 10000);
