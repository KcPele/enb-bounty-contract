import { run } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Usage:
 *   npx hardhat run scripts/verify.ts --network base \
 *     --ENBBountyNft <ENBBountyNft_address> \
 *     --ENBBounty <ENBBounty_address>
 *
 * Or set the addresses in your .env file as ENB_BOUNTY_NFT_ADDRESS and ENB_BOUNTY_ADDRESS
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
  // ENBBountyNft verification
  const ENBBountyNftAddress = getArg(
    'ENBBountyNft',
    process.env.ENB_BOUNTY_NFT_ADDRESS,
  );
  const treasury = process.env.TREASURY_ADDRESS!;
  const authority = process.env.AUTHORITY_ADDRESS!;
  const royaltyFee = process.env.ROYALTY_FEE_NUMERATOR
    ? parseInt(process.env.ROYALTY_FEE_NUMERATOR)
    : 500; // Default 5% royalty

  console.log('Verifying ENBBountyNft at:', ENBBountyNftAddress);
  console.log('Constructor arguments:');
  console.log(`  Treasury: ${treasury}`);
  console.log(`  Authority: ${authority}`);
  console.log(`  Royalty Fee: ${royaltyFee}`);

  try {
    await run('verify:verify', {
      address: ENBBountyNftAddress,
      constructorArguments: [treasury, authority, royaltyFee],
    });
    console.log('ENBBountyNft verified successfully!');
  } catch (error: any) {
    if (error.message.includes('Already Verified')) {
      console.log('ENBBountyNft is already verified');
    } else {
      console.error('Error verifying ENBBountyNft:', error);
    }
  }

  // ENBBounty verification (constructor: ENBBountyNft, treasury, startClaimIndex)
  const ENBBountyAddress = getArg('ENBBounty', process.env.ENB_BOUNTY_ADDRESS);
  // Prefer START_CLAIM_INDEX;
  const startClaimIndex = process.env.START_CLAIM_INDEX
    ? parseInt(process.env.START_CLAIM_INDEX)
    : 0;

  console.log('\nVerifying ENBBounty at:', ENBBountyAddress);
  console.log('Constructor arguments:');
  console.log(`  ENBBountyNft: ${ENBBountyNftAddress}`);
  console.log(`  Treasury: ${treasury}`);
  console.log(`  Start Claim Index: ${startClaimIndex}`);

  try {
    await run('verify:verify', {
      address: ENBBountyAddress,
      constructorArguments: [ENBBountyNftAddress, treasury, startClaimIndex],
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
