import { run, upgrades } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Verify ENBBounty UUPS proxy on BaseScan.
 *
 * Usage:
 *   npx hardhat run scripts/verify.ts --network base -- --ENBBounty <proxy_address>
 * Or set ENB_BOUNTY_ADDRESS in .env
 *
 * This verifies BOTH the implementation contract and the proxy contract.
 * BaseScan auto-detects the proxy and links it to the implementation.
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
  const proxyAddress = getArg('ENBBounty', process.env.ENB_BOUNTY_ADDRESS);
  const implAddress = await upgrades.erc1967.getImplementationAddress(
    proxyAddress
  );

  console.log('Verifying ENBBounty UUPS proxy:');
  console.log(`  Proxy:          ${proxyAddress}`);
  console.log(`  Implementation: ${implAddress}`);

  // Verify implementation (no constructor args — initialize is used)
  try {
    console.log('\n→ Verifying implementation...');
    await run('verify:verify', {
      address: implAddress,
      constructorArguments: [],
    });
    console.log('  Implementation verified');
  } catch (error: any) {
    if (error.message.includes('Already Verified')) {
      console.log('  Implementation already verified');
    } else {
      console.error('  Error verifying implementation:', error.message);
    }
  }

  // Verify proxy (ERC1967Proxy) — hardhat-upgrades plugin handles this
  try {
    console.log('\n→ Verifying proxy...');
    await run('verify:verify', {
      address: proxyAddress,
      constructorArguments: [],
    });
    console.log('  Proxy verified');
  } catch (error: any) {
    if (error.message.includes('Already Verified')) {
      console.log('  Proxy already verified');
    } else {
      console.error('  Error verifying proxy:', error.message);
    }
  }

  console.log('\nDone. Visit BaseScan and use "More Options > Is this a proxy?" to link if not auto-detected.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
