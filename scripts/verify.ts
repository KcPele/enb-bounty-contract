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
  const royaltyFee = process.env.ROYALTY_FEE_NUMERATOR!;

  console.log('Verifying ENBBountyNft...');
  await run('verify:verify', {
    address: ENBBountyNftAddress,
    constructorArguments: [treasury, authority, royaltyFee],
  });

  // ENBBounty verification
  const ENBBountyAddress = getArg('ENBBounty', process.env.ENB_BOUNTY_ADDRESS);
  const startClaimIndex = process.env.START_CLAIM_INDEX!;

  console.log('Verifying ENBBounty...');
  await run('verify:verify', {
    address: ENBBountyAddress,
    constructorArguments: [ENBBountyNftAddress, treasury, startClaimIndex],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
