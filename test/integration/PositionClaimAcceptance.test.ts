import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Position Claim Acceptance', function () {
  let enbBounty: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let david: SignerWithAddress;

  const tokenAmount = ethers.parseEther('1000');
  const positions = [
    ethers.parseEther('500'), // 1st place
    ethers.parseEther('300'), // 2nd place
    ethers.parseEther('200'), // 3rd place
  ];

  beforeEach(async function () {
    [owner, alice, bob, charlie, david] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await upgrades.deployProxy(ENBBounty, [owner.address], { kind: 'uups' });

    await enbBounty.addSupportedToken(await mockToken.getAddress(), 1);
    await mockToken.transfer(alice.address, ethers.parseEther('100000'));

    // Create position bounty
    const approveAmount = tokenAmount * 1150n / 1000n;
    await mockToken.connect(alice).approve(await enbBounty.getAddress(), approveAmount);
    await enbBounty.connect(alice).createPositionBounty(
      'Position Bounty',
      'Description',
      await mockToken.getAddress(),
      tokenAmount,
      positions,
      30,
      0
    );
  });

  describe('Single claims in order', function () {
    it('Should pay 1st place the correct amount', async function () {
      const balBefore = await mockToken.balanceOf(bob.address);
      await enbBounty.connect(alice).acceptClaim(0, bob.address);
      const balAfter = await mockToken.balanceOf(bob.address);

      const fee = positions[0] * 100n / 1000n; // 10%
      const expectedPayout = positions[0] - fee;
      expect(balAfter - balBefore).to.equal(expectedPayout);
    });

    it('Should pay 2nd place the correct amount', async function () {
      await enbBounty.connect(alice).acceptClaim(0, bob.address); // 1st

      const balBefore = await mockToken.balanceOf(charlie.address);
      await enbBounty.connect(alice).acceptClaim(0, charlie.address); // 2nd
      const balAfter = await mockToken.balanceOf(charlie.address);

      const fee = positions[1] * 100n / 1000n;
      const expectedPayout = positions[1] - fee;
      expect(balAfter - balBefore).to.equal(expectedPayout);
    });

    it('Should pay 3rd place the correct amount', async function () {
      await enbBounty.connect(alice).acceptClaim(0, bob.address);     // 1st
      await enbBounty.connect(alice).acceptClaim(0, charlie.address); // 2nd

      const balBefore = await mockToken.balanceOf(david.address);
      await enbBounty.connect(alice).acceptClaim(0, david.address);   // 3rd
      const balAfter = await mockToken.balanceOf(david.address);

      const fee = positions[2] * 100n / 1000n;
      const expectedPayout = positions[2] - fee;
      expect(balAfter - balBefore).to.equal(expectedPayout);
    });

    it('Should send platform fees to treasury', async function () {
      const treasuryBefore = await mockToken.balanceOf(owner.address);

      await enbBounty.connect(alice).acceptClaim(0, bob.address);
      await enbBounty.connect(alice).acceptClaim(0, charlie.address);
      await enbBounty.connect(alice).acceptClaim(0, david.address);

      const treasuryAfter = await mockToken.balanceOf(owner.address);

      // treasuryBefore is captured after bounty creation, so only platform fees
      const totalPlatformFee = (positions[0] + positions[1] + positions[2]) * 100n / 1000n;
      expect(treasuryAfter - treasuryBefore).to.equal(totalPlatformFee);
    });

    it('Should revert after all positions filled', async function () {
      await enbBounty.connect(alice).acceptClaim(0, bob.address);
      await enbBounty.connect(alice).acceptClaim(0, charlie.address);
      await enbBounty.connect(alice).acceptClaim(0, david.address);

      const signers = await ethers.getSigners();
      await expect(
        enbBounty.connect(alice).acceptClaim(0, signers[5].address)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClaimed');
    });

    it('Should prevent same address from winning twice', async function () {
      await enbBounty.connect(alice).acceptClaim(0, bob.address);
      await expect(
        enbBounty.connect(alice).acceptClaim(0, bob.address)
      ).to.be.revertedWithCustomError(enbBounty, 'AlreadyWon');
    });
  });

  describe('Batch claims', function () {
    it('Should pay each claimer per-position amounts in batch', async function () {
      const bobBefore = await mockToken.balanceOf(bob.address);
      const charlieBefore = await mockToken.balanceOf(charlie.address);
      const davidBefore = await mockToken.balanceOf(david.address);

      await enbBounty.connect(alice).batchAcceptClaims(
        0,
        [bob.address, charlie.address, david.address]
      );

      const bobAfter = await mockToken.balanceOf(bob.address);
      const charlieAfter = await mockToken.balanceOf(charlie.address);
      const davidAfter = await mockToken.balanceOf(david.address);

      for (let i = 0; i < 3; i++) {
        const fee = positions[i] * 100n / 1000n;
        const expected = positions[i] - fee;
        const balances = [bobAfter - bobBefore, charlieAfter - charlieBefore, davidAfter - davidBefore];
        expect(balances[i]).to.equal(expected);
      }
    });

    it('Should send total fees to treasury in single transfer', async function () {
      const treasuryBefore = await mockToken.balanceOf(owner.address);

      await enbBounty.connect(alice).batchAcceptClaims(
        0,
        [bob.address, charlie.address, david.address]
      );

      const treasuryAfter = await mockToken.balanceOf(owner.address);
      // treasuryBefore is captured after bounty creation, so only platform fees
      const totalPlatformFee = (positions[0] + positions[1] + positions[2]) * 100n / 1000n;
      expect(treasuryAfter - treasuryBefore).to.equal(totalPlatformFee);
    });
  });

  describe('Equal-split bounties remain unaffected', function () {
    it('Should still pay equal amounts for non-position bounties', async function () {
      // Create a regular token bounty
      const amount = ethers.parseEther('3000');
      const approveAmount = amount * 1150n / 1000n;
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), approveAmount);

      await enbBounty.connect(alice).createTokenBounty(
        'Regular Bounty',
        'Equal split',
        3,
        await mockToken.getAddress(),
        amount,
        30,
        0,
        { value: 0 }
      );

      const perWinner = amount / 3n;
      const fee = perWinner * 100n / 1000n;
      const expectedPayout = perWinner - fee;

      const balBefore = await mockToken.balanceOf(bob.address);
      await enbBounty.connect(alice).acceptClaim(1, bob.address);
      const balAfter = await mockToken.balanceOf(bob.address);

      expect(balAfter - balBefore).to.equal(expectedPayout);
    });
  });
});
