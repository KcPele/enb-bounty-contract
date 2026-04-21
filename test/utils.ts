import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';

type Bounty = {
  name: string;
  description: string;
  amount: string;
};

export const compareBountyData = (testBounty: Bounty, evmBounty: Bounty) => {
  const evmBountyAmount = Number(ethers.formatEther(evmBounty.amount)).toFixed(
    0,
  );
  expect(testBounty.name).to.equal(evmBounty.name);
  expect(testBounty.description).to.equal(evmBounty.description);
  expect(testBounty.amount).to.equal(evmBountyAmount);
};

export const deployENBBounty = async (treasuryAddress: string) => {
  const ENBBounty = await ethers.getContractFactory('ENBBounty');
  const proxy = await upgrades.deployProxy(ENBBounty, [treasuryAddress], {
    kind: 'uups',
  });
  await proxy.waitForDeployment();
  return proxy;
};

export const createSoloBounty = async (
  poidhV2: Contract,
  name: string,
  description: string,
  amount: string,
  durationInDays: number = 30,
) => {
  await poidhV2.createSoloBounty(name, description, 1, durationInDays, 0, {
    value: ethers.parseEther(amount),
  });
};

export const cancelSoloBounty = async (poidhV2: Contract, bountyId: string) => {
  await poidhV2.cancelSoloBounty(bountyId);
};

export const acceptClaim = async (
  poidhV2: Contract,
  bountyId: string,
  claimerAddress: string,
) => {
  await poidhV2.acceptClaim(bountyId, claimerAddress);
};
