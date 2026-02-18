// Test fixes for ENBBounty contract
// Platform fee is 7.5% (75/1000)
// Creation fee is 10% (100/1000), charged on top of deposits

export const FEE_DENOMINATOR = 1000n;
export const PLATFORM_FEE_RATE = 75n; // 7.5%
export const CREATION_FEE_RATE = 100n; // 10%

export const calculateFee = (amount: bigint): bigint => {
  return (amount * PLATFORM_FEE_RATE) / FEE_DENOMINATOR; // 7.5% fee
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

// Creation fee helpers
export const calculateCreationFee = (depositAmount: bigint): bigint => {
  return (depositAmount * CREATION_FEE_RATE) / FEE_DENOMINATOR;
};

// For ETH: given msg.value, calculate the net bounty amount after creation fee
export const calculateNetBountyAmountETH = (msgValue: bigint): bigint => {
  return (msgValue * FEE_DENOMINATOR) / (FEE_DENOMINATOR + CREATION_FEE_RATE);
};

// For ETH: given msg.value, calculate the creation fee
export const calculateCreationFeeETH = (msgValue: bigint): bigint => {
  const netAmount = calculateNetBountyAmountETH(msgValue);
  return msgValue - netAmount;
};
