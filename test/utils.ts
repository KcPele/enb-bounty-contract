import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';

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

export const createSoloBounty = async (
  poidhV2: Contract,
  name: string,
  description: string,
  amount: string,
) => {
  await poidhV2.createSoloBounty(name, description, 1, {
    value: ethers.parseEther(amount),
  });
};

export const createOpenBounty = async (
  poidhV2: Contract,
  name: string,
  description: string,
  amount: string,
) => {
  await poidhV2.createOpenBounty(name, description, 1, {
    value: ethers.parseEther(amount),
  });
};

export const cancelSoloBounty = async (poidhV2: Contract, bountyId: string) => {
  await poidhV2.cancelSoloBounty(bountyId);
};

export const cancelOpenBounty = async (poidhV2: Contract, bountyId: string) => {
  await poidhV2.cancelOpenBounty(bountyId);
};

export const joinOpenBounty = async (
  poidhV2: Contract,
  bountyId: string,
  amount: string,
) => {
  await poidhV2.joinOpenBounty(bountyId, {
    value: ethers.parseEther(amount),
  });
};

export const createClaim = async (
  poidhV2: Contract,
  bountyId: string,
  name: string,
  uri: string,
  description: string,
) => {
  await poidhV2.createClaim(bountyId, name, uri, description);
};

export const submitClaimForVote = async (
  poidhV2: Contract,
  bountyId: string,
  claimId: string,
) => {
  await poidhV2.submitClaimForVote(bountyId, claimId);
};

export const voteClaim = async (
  poidhV2: Contract,
  bountyId: string,
  vote: boolean,
) => {
  await poidhV2.voteClaim(bountyId, vote);
};

export const resetVotingPeriod = async (
  poidhV2: Contract,
  bountyId: string,
) => {
  await poidhV2.resetVotingPeriod(bountyId);
};

export const withdrawFromOpenBounty = async (
  poidhV2: Contract,
  bountyId: string,
) => {
  await poidhV2.withdrawFromOpenBounty(bountyId);
};

export const acceptClaim = async (
  poidhV2: Contract,
  bountyId: string,
  claimId: string,
) => {
  await poidhV2.acceptClaim(bountyId, claimId);
};
