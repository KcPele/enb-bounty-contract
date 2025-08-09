// Test fixes for ENBBounty contract
// Fee is 2.5% (25/1000), not 5%

export const calculateFee = (amount: bigint): bigint => {
  return (amount * 25n) / 1000n; // 2.5% fee
};

export const calculatePayout = (amount: bigint): bigint => {
  const fee = calculateFee(amount);
  return amount - fee;
};

export const calculatePerWinnerAmount = (totalAmount: bigint, maxWinners: bigint): bigint => {
  return totalAmount / maxWinners;
};

export const calculatePerWinnerPayout = (totalAmount: bigint, maxWinners: bigint): bigint => {
  const perWinner = calculatePerWinnerAmount(totalAmount, maxWinners);
  return calculatePayout(perWinner);
};