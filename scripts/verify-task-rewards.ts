import { run } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Verify ENBTaskRewards contract on block explorer (e.g. BaseScan).
 *
 * Usage:
 *   npx hardhat run scripts/verify-task-rewards.ts --network base
 *
 * Requires in .env:
 *   ENB_TASK_REWARDS_ADDRESS, TREASURY_ADDRESS, ENB_BOUNTY_ADDRESS
 */

async function main() {
  const taskRewardsAddress = process.env.ENB_TASK_REWARDS_ADDRESS;
  const treasury = process.env.TREASURY_ADDRESS;
  const bountyContract = process.env.ENB_BOUNTY_ADDRESS;

  if (!taskRewardsAddress) throw new Error('ENB_TASK_REWARDS_ADDRESS not set in .env');
  if (!treasury) throw new Error('TREASURY_ADDRESS not set in .env');
  if (!bountyContract) throw new Error('ENB_BOUNTY_ADDRESS not set in .env');

  console.log('Verifying ENBTaskRewards at:', taskRewardsAddress);
  console.log('Constructor arguments:');
  console.log(`  Treasury:        ${treasury}`);
  console.log(`  Bounty Contract: ${bountyContract}`);

  try {
    await run('verify:verify', {
      address: taskRewardsAddress,
      constructorArguments: [treasury, bountyContract],
    });
    console.log('ENBTaskRewards verified successfully!');
  } catch (error: any) {
    if (error.message.includes('Already Verified')) {
      console.log('ENBTaskRewards is already verified');
    } else {
      console.error('Error verifying ENBTaskRewards:', error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
