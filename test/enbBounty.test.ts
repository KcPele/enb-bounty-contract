import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract, ContractFactory } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import {
  compareBountyData,
  createSoloBounty,
  createOpenBounty,
  cancelSoloBounty,
  joinOpenBounty,
  withdrawFromOpenBounty,
  createClaim,
} from './utils';
import * as testData from './test-data.json';

describe('ENBBounty', function () {
  let enbBounty: Contract;
  let enbBountyFactory: ContractFactory;
  let enbBountyNft: Contract;
  let enbBountyNftFactory: ContractFactory;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  before(async function () {
    [owner, alice] = await ethers.getSigners();

    // create nft contract
    enbBountyNftFactory = await ethers.getContractFactory('ENBBountyNft');
    enbBountyNft = (await enbBountyNftFactory.deploy(
      owner.address,
      owner.address,
      '500',
    )) as Contract;

    enbBountyFactory = await ethers.getContractFactory('ENBBounty');
    enbBounty = (await enbBountyFactory.deploy(
      await enbBountyNft.getAddress(),
      owner.address,
      0,
    )) as Contract;

    await enbBountyNft.setENBBountyContract(await enbBounty.getAddress(), true);
  });

  describe('Deployment', function () {
    it('Sets the right owner', async function () {
      expect(await enbBounty.treasury()).to.equal(owner.address);
    });
  });
  describe('Creating Solo Bounties', function () {
    it('should revert if no ether is sent', async function () {
      await expect(
        createSoloBounty(enbBounty, 'Bounty', 'Description', '0'),
      ).to.be.revertedWithCustomError(enbBounty, 'NoEther()');
    });

    it('should allow creating an open bounty', async function () {
      const bounty = testData.bounties[0];

      await createSoloBounty(
        enbBounty,
        bounty.name,
        bounty.description,
        bounty.amount,
      );

      const bounties = await enbBounty.getBounties(0);
      compareBountyData(bounty, bounties[0]);
    });
  });
  describe('Creating Group Bounties', function () {
    it('should revert if no ether is sent', async function () {
      await expect(
        createOpenBounty(enbBounty, 'Bounty', 'Description', '0'),
      ).to.be.revertedWithCustomError(enbBounty, 'NoEther()');
    });

    it('should allow creating an open bounty', async function () {
      const bounty = testData.bounties[1];

      await createOpenBounty(
        enbBounty,
        bounty.name,
        bounty.description,
        bounty.amount,
      );

      const bounties = await enbBounty.getBounties(0);
      compareBountyData(bounty, bounties[1]);

      const bountyLength = await enbBounty.getBountiesLength();
      expect(bountyLength).to.equal(2);

      const participants = await enbBounty.participants(1, 0);
      expect(participants).to.equal(owner.address);

      const participantAmounts = await enbBounty.participantAmounts(1, 0);
      expect(participantAmounts).to.equal(ethers.parseEther(bounty.amount));
    });
  });
  describe('Canceling Solo Bounties', function () {
    it('should revert if the bounty does not exist', async function () {
      await expect(
        cancelSoloBounty(enbBounty, '10'),
      ).to.be.revertedWithCustomError(enbBounty, 'BountyNotFound()');
    });

    it('should revert if wrong caller', async function () {
      const enbBountyAsAlice = enbBounty.connect(alice) as Contract;
      await expect(
        cancelSoloBounty(enbBountyAsAlice, '1'),
      ).to.be.revertedWithCustomError(enbBounty, 'WrongCaller()');
    });

    it('should revert if cancel function for solo bounties called on an open bounty', async function () {
      await expect(
        cancelSoloBounty(enbBounty, '1'),
      ).to.be.revertedWithCustomError(enbBounty, 'NotSoloBounty()');
    });

    it('should allow canceling a bounty', async function () {
      const balanceBefore = await ethers.provider.getBalance(owner.address);
      await cancelSoloBounty(enbBounty, '0');
      const balanceAfter = await ethers.provider.getBalance(owner.address);
      expect(balanceAfter - balanceBefore).to.be.approximately(
        ethers.parseEther('1'),
        ethers.parseEther('0.1'),
      );
    });

    it('should revert if the bounty is already canceled', async function () {
      await expect(
        cancelSoloBounty(enbBounty, '0'),
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClosed()');
    });
  });

  describe('Join Open Bounties', function () {
    it('should revert if the bounty does not exist', async function () {
      await expect(enbBounty.joinOpenBounty('10')).to.be.revertedWithCustomError(
        enbBounty,
        'BountyNotFound()',
      );
    });

    it('should revert if no ether is sent', async function () {
      await expect(enbBounty.joinOpenBounty('1')).to.be.revertedWithCustomError(
        enbBounty,
        'NoEther()',
      );
    });

    it('should revert if the bounty is a solo bounty', async function () {
      await createSoloBounty(enbBounty, 'Bounty', 'Description', '1');
      await expect(
        enbBounty.joinOpenBounty('2', { value: ethers.parseEther('1') }),
      ).to.be.revertedWithCustomError(enbBounty, 'NotOpenBounty()');
    });

    it('should revert if user already joined, or is issuer', async function () {
      await expect(
        enbBounty.joinOpenBounty('1', { value: ethers.parseEther('1') }),
      ).to.be.revertedWithCustomError(enbBounty, 'WrongCaller()');
    });

    it('should allow joining a bounty', async function () {
      const balanceBefore = await ethers.provider.getBalance(alice.address);
      await joinOpenBounty(enbBounty.connect(alice) as Contract, '1', '1');
      const balanceAfter = await ethers.provider.getBalance(alice.address);
      expect(balanceBefore - balanceAfter).to.be.approximately(
        ethers.parseEther('1'),
        ethers.parseEther('0.1'),
      );
    });
    it('should allow the issuer to accept a claim if there is only one active participant', async function () {
      await createOpenBounty(enbBounty, 'Open Bounty', 'Description', '1');

      const bountyLength = await enbBounty.getBountiesLength();
      expect(bountyLength).to.equal(4);

      await joinOpenBounty(enbBounty.connect(alice) as Contract, '3', '1');

      await withdrawFromOpenBounty(enbBounty.connect(alice) as Contract, '3');

      await createClaim(
        enbBounty.connect(alice) as Contract,
        '3',
        'Claim',
        'Description',
        'lololol',
      );

      await enbBounty.acceptClaim('3', '0');
    });
  });
});
