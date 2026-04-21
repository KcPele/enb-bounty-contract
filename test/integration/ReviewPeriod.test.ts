import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('ENBBounty - Review Period & Deadline Extension', function () {
  let enbBounty: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;

  const ONE_DAY = 86400;

  beforeEach(async function () {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await upgrades.deployProxy(ENBBounty, [owner.address], {
      kind: 'uups',
    });
  });

  describe('Review period storage', function () {
    it('Should store review period on creation', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test',
        'Desc',
        1,
        30,
        7, // 7-day review period
        { value: ethers.parseEther('1') }
      );

      const reviewPeriod = await enbBounty.getBountyReviewPeriod(0);
      expect(reviewPeriod).to.equal(7 * ONE_DAY);
    });

    it('Should store zero review period when not specified', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test',
        'Desc',
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );

      expect(await enbBounty.getBountyReviewPeriod(0)).to.equal(0);
    });

    it('Should revert getBountyReviewPeriod for non-existent bounty', async function () {
      await expect(enbBounty.getBountyReviewPeriod(0)).to.be.revertedWith(
        'Bounty not found'
      );
    });
  });

  describe('getBountyStatus', function () {
    beforeEach(async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Active',
        'Desc',
        1,
        30,
        7,
        { value: ethers.parseEther('1') }
      );
    });

    it('Should return 0 (active) when before deadline', async function () {
      expect(await enbBounty.getBountyStatus(0)).to.equal(0);
    });

    it('Should return 1 (inReview) when past deadline but within review period', async function () {
      await time.increase(31 * ONE_DAY);
      expect(await enbBounty.getBountyStatus(0)).to.equal(1);
    });

    it('Should return 2 (ended) when past deadline + review period', async function () {
      await time.increase((30 + 7 + 1) * ONE_DAY);
      expect(await enbBounty.getBountyStatus(0)).to.equal(2);
    });

    it('Should return 2 (ended) when all winners selected', async function () {
      await enbBounty.connect(alice).acceptClaim(0, bob.address);
      expect(await enbBounty.getBountyStatus(0)).to.equal(2);
    });

    it('Should return 3 (cancelled) when cancelled', async function () {
      await enbBounty.connect(alice).cancelSoloBounty(0);
      expect(await enbBounty.getBountyStatus(0)).to.equal(3);
    });

    it('Should return 2 (ended) past deadline when review period is 0', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'NoReview',
        'Desc',
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );

      await time.increase(31 * ONE_DAY);
      expect(await enbBounty.getBountyStatus(1)).to.equal(2);
    });

    it('Should revert for non-existent bounty', async function () {
      await expect(enbBounty.getBountyStatus(99)).to.be.revertedWith(
        'Bounty not found'
      );
    });
  });

  describe('extendDeadline', function () {
    beforeEach(async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test',
        'Desc',
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );
    });

    it('Should allow issuer to extend deadline when active', async function () {
      const before = (await enbBounty.bounties(0)).deadline;
      await enbBounty.connect(alice).extendDeadline(0, 7);
      const after = (await enbBounty.bounties(0)).deadline;
      expect(after - before).to.equal(BigInt(7 * ONE_DAY));
    });

    it('Should emit DeadlineExtended event', async function () {
      const before = (await enbBounty.bounties(0)).deadline;
      await expect(enbBounty.connect(alice).extendDeadline(0, 3))
        .to.emit(enbBounty, 'DeadlineExtended')
        .withArgs(0, before, before + BigInt(3 * ONE_DAY));
    });

    it('Should revert when called by non-issuer', async function () {
      await expect(
        enbBounty.connect(bob).extendDeadline(0, 7)
      ).to.be.revertedWithCustomError(enbBounty, 'WrongCaller');
    });

    it('Should revert when past deadline (in review)', async function () {
      await time.increase(31 * ONE_DAY);
      await expect(
        enbBounty.connect(alice).extendDeadline(0, 7)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyNotActive');
    });

    it('Should revert with zero days', async function () {
      await expect(
        enbBounty.connect(alice).extendDeadline(0, 0)
      ).to.be.revertedWithCustomError(enbBounty, 'InvalidExtension');
    });

    it('Should revert for non-existent bounty', async function () {
      await expect(
        enbBounty.connect(alice).extendDeadline(99, 7)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyNotFound');
    });

    it('Should revert when bounty cancelled', async function () {
      await enbBounty.connect(alice).cancelSoloBounty(0);
      await expect(
        enbBounty.connect(alice).extendDeadline(0, 7)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClosed');
    });

    it('Should allow multiple extensions', async function () {
      const before = (await enbBounty.bounties(0)).deadline;
      await enbBounty.connect(alice).extendDeadline(0, 3);
      await enbBounty.connect(alice).extendDeadline(0, 4);
      const after = (await enbBounty.bounties(0)).deadline;
      expect(after - before).to.equal(BigInt(7 * ONE_DAY));
    });

    it('Should move bounty from review back to active after extension', async function () {
      // Go halfway to deadline, still active
      await time.increase(15 * ONE_DAY);
      expect(await enbBounty.getBountyStatus(0)).to.equal(0);

      // Extend so we stay well inside deadline
      await enbBounty.connect(alice).extendDeadline(0, 30);
      expect(await enbBounty.getBountyStatus(0)).to.equal(0);
    });
  });

  describe('acceptClaim after deadline (review period)', function () {
    beforeEach(async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test',
        'Desc',
        1,
        30,
        7,
        { value: ethers.parseEther('1') }
      );
    });

    it('Should allow owner to accept claim during review period', async function () {
      await time.increase(31 * ONE_DAY);
      expect(await enbBounty.getBountyStatus(0)).to.equal(1);

      await expect(enbBounty.connect(alice).acceptClaim(0, bob.address)).to.not
        .be.reverted;
      expect(await enbBounty.hasAddressWon(0, bob.address)).to.be.true;
    });

    it('Should allow owner to accept claim after review period expires', async function () {
      await time.increase((30 + 7 + 10) * ONE_DAY);
      expect(await enbBounty.getBountyStatus(0)).to.equal(2);

      await expect(enbBounty.connect(alice).acceptClaim(0, bob.address)).to.not
        .be.reverted;
      expect(await enbBounty.hasAddressWon(0, bob.address)).to.be.true;
    });

    it('Should allow batch accept after deadline', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Multi',
        'Desc',
        3,
        30,
        7,
        { value: ethers.parseEther('3') }
      );
      await time.increase(31 * ONE_DAY);

      await expect(
        enbBounty
          .connect(alice)
          .batchAcceptClaims(1, [bob.address, charlie.address])
      ).to.not.be.reverted;
    });

    it('Should still revert non-issuer accept during review', async function () {
      await time.increase(31 * ONE_DAY);
      await expect(
        enbBounty.connect(bob).acceptClaim(0, bob.address)
      ).to.be.revertedWithCustomError(enbBounty, 'WrongCaller');
    });

    it('Should still revert accepting cancelled bounty', async function () {
      await enbBounty.connect(alice).cancelSoloBounty(0);
      await time.increase(31 * ONE_DAY);
      await expect(
        enbBounty.connect(alice).acceptClaim(0, bob.address)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClosed');
    });
  });
});
