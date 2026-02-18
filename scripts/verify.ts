import { run } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Verify ENBBounty contract on block explorer (e.g. BaseScan).
 *
 * Usage:
 *   npx hardhat run scripts/verify.ts --network base \
 *     --ENBBounty <ENBBounty_address>
 *
 * Or set the address in your .env file as ENB_BOUNTY_ADDRESS
 */

function getArg(name: string, fallback?: string): string {
  const cliArg = process.argv.find((arg) => arg.startsWith(`--${name}`));
  if (cliArg) {
    const idx = process.argv.indexOf(cliArg);
    return process.argv[idx + 1];
  }
  if (process.env[name]) return process.env[name]!;
  if (fallback) return fallback;
  throw new Error(`Missing required argument: ${name}`);
}

async function main() {
  const treasury = process.env.TREASURY_ADDRESS;
  if (!treasury) throw new Error('TREASURY_ADDRESS not set in .env');

  const ENBBountyAddress = getArg('ENBBounty', process.env.ENB_BOUNTY_ADDRESS);

  console.log('Verifying ENBBounty at:', ENBBountyAddress);
  console.log('Constructor arguments:');
  console.log(`  Treasury: ${treasury}`);

  try {
    await run('verify:verify', {
      address: ENBBountyAddress,
      constructorArguments: [treasury],
    });
    console.log('ENBBounty verified successfully!');
  } catch (error: any) {
    if (error.message.includes('Already Verified')) {
      console.log('ENBBounty is already verified');
    } else {
      console.error('Error verifying ENBBounty:', error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
