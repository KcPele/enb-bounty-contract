import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('ENBBounty - Batch claim acceptance', function () {
  let enbBounty: Contract;
  let enbBountyNft: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let david: SignerWithAddress;
  let eve: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, charlie, david, eve] = await ethers.getSigners();

    const ENBBountyNft = await ethers.getContractFactory('ENBBountyNft');
    enbBountyNft = await ENBBountyNft.deploy(owner.address, owner.address, '500');

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await ENBBounty.deploy(
      await enbBountyNft.getAddress(),
      owner.address,
      0,
      owner.address,
      alice.address
    );

    await enbBountyNft.setENBBountyContract(await enbBounty.getAddress(), true);
  });

  async function createSoloBounty(maxWinners: number, amount = '10') {
    await enbBounty.connect(alice).createSoloBounty(
      'Batch Bounty',
      'Description',
      maxWinners,
      { value: ethers.parseEther(amount) }
    );
  }

  async function createClaims(count: number, bountyId = 0) {
    const signers = await ethers.getSigners();
    const claimers = signers.slice(2, 2 + count);
    for (let i = 0; i < claimers.length; i++) {
      await enbBounty.connect(claimers[i]).createClaim(
        bountyId,
        `Claim ${i}`,
        `uri${i}`,
        `Description ${i}`
      );
    }
  }

  it('accepts multiple claims within one transaction for solo bounties', async function () {
    const winners = 4;
    await createSoloBounty(winners, '4');
    await createClaims(winners);

    await enbBounty.connect(alice).acceptClaims(0, [0, 1, 2, 3]);

    const bountyData = await enbBounty.bounties(0);
    expect(bountyData.winnersCount).to.equal(winners);

    const signers = await ethers.getSigners();
    const claimers = signers.slice(2, 2 + winners);
    for (const claimer of claimers) {
      expect(await enbBounty.hasAddressWon(0, claimer.address)).to.be.true;
    }
  });

  it('reverts when no claim ids are provided', async function () {
    await createSoloBounty(2, '2');
    await expect(
      enbBounty.connect(alice).acceptClaims(0, [])
    ).to.be.revertedWithCustomError(enbBounty, 'NoClaimsProvided');
  });

  it('reverts when duplicate claim ids are sent', async function () {
    await createSoloBounty(2, '2');
    await enbBounty.connect(bob).createClaim(0, 'Claim 1', 'uri1', 'Desc1');
    await enbBounty.connect(charlie).createClaim(0, 'Claim 2', 'uri2', 'Desc2');

    await expect(
      enbBounty.connect(alice).acceptClaims(0, [0, 0])
    ).to.be.revertedWithCustomError(enbBounty, 'DuplicateClaimIds');
  });

  it('reverts when batch size exceeds the limit exposed on-chain', async function () {
    const limit = Number(await enbBounty.batchAcceptLimit());
    await createSoloBounty(limit + 2, '20');
    await createClaims(limit + 1);

    const claimIds = Array.from({ length: limit + 1 }, (_, i) => i);
    await expect(
      enbBounty.connect(alice).acceptClaims(0, claimIds)
    )
      .to.be.revertedWithCustomError(enbBounty, 'TooManyClaims')
      .withArgs(limit + 1, limit);
  });

  it('reverts if claim from another bounty is included', async function () {
    await createSoloBounty(2, '2');
    await createSoloBounty(2, '2');

    await enbBounty.connect(bob).createClaim(1, 'Other bounty claim', 'uri', 'Desc');

    await expect(
      enbBounty.connect(alice).acceptClaims(0, [0])
    ).to.be.revertedWithCustomError(enbBounty, 'ClaimNotFound');
  });

  it('reverts when batch would exceed remaining winner slots', async function () {
    await createSoloBounty(2, '2');
    await enbBounty.connect(bob).createClaim(0, 'Claim 1', 'uri1', 'Desc1');
    await enbBounty.connect(charlie).createClaim(0, 'Claim 2', 'uri2', 'Desc2');
    await enbBounty.connect(david).createClaim(0, 'Claim 3', 'uri3', 'Desc3');

    await expect(
      enbBounty.connect(alice).acceptClaims(0, [0, 1, 2])
    ).to.be.revertedWithCustomError(enbBounty, 'BountyClaimed');
  });

  it('enforces voting flow for open bounties', async function () {
    await enbBounty.connect(alice).createOpenBounty(
      'Open Batch',
      'Description',
      2,
      { value: ethers.parseEther('2') }
    );

    await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') });
    await enbBounty.connect(charlie).createClaim(0, 'Claim 1', 'uri1', 'Desc1');

    await expect(
      enbBounty.connect(alice).acceptClaims(0, [0])
    ).to.be.revertedWithCustomError(enbBounty, 'NotSoloBounty');
  });
});
