import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Multi-Winner Integration Tests', function () {
  let enbBounty: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let david: SignerWithAddress;
  let eve: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, charlie, david, eve] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await ENBBounty.deploy(owner.address);

    await enbBounty.addSupportedToken(await mockToken.getAddress(), 1);

    await mockToken.transfer(alice.address, ethers.parseEther('10000'));
    await mockToken.transfer(bob.address, ethers.parseEther('10000'));
  });

  describe('Solo Multi-Winner Bounties', function () {
    it('Should distribute rewards equally among multiple winners', async function () {
      const bountyAmount = ethers.parseEther('3');
      const maxWinners = 3;

      await enbBounty.connect(alice).createSoloBounty(
        'Multi-Winner Bounty',
        'Three winners allowed',
        maxWinners,
        30,
        { value: bountyAmount }
      );

      // Net bounty amount after 15% creation fee: 3e18 * 1000 / 1150
      const netBountyAmount = bountyAmount * 1000n / 1150n;
      const claimers = [bob, charlie, david];

      for (let i = 0; i < claimers.length; i++) {
        const balanceBefore = await ethers.provider.getBalance(claimers[i].address);
        await enbBounty.connect(alice).acceptClaim(0, claimers[i].address);
        const balanceAfter = await ethers.provider.getBalance(claimers[i].address);

        const perWinnerAmount = netBountyAmount / BigInt(maxWinners);
        const fee = (perWinnerAmount * 100n) / 1000n; // 10% fee
        const expectedAmount = perWinnerAmount - fee;

        expect(balanceAfter - balanceBefore).to.equal(expectedAmount);
      }

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.winnersCount).to.equal(maxWinners);

      const winners = await enbBounty.bountyWinners(0);
      expect(winners.length).to.equal(maxWinners);
    });

    it('Should prevent exceeding max winners', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Limited Winners',
        'Only 2 winners',
        2,
        30,
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(alice).acceptClaim(0, bob.address);
      await enbBounty.connect(alice).acceptClaim(0, charlie.address);

      await expect(
        enbBounty.connect(alice).acceptClaim(0, david.address)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClaimed');

      const remainingSlots = await enbBounty.getRemainingWinnerSlots(0);
      expect(remainingSlots).to.equal(0);
    });

    it('Should track individual winner status', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Track Winners',
        'Description',
        3,
        30,
        { value: ethers.parseEther('3') }
      );

      expect(await enbBounty.hasAddressWon(0, bob.address)).to.be.false;
      expect(await enbBounty.hasAddressWon(0, charlie.address)).to.be.false;

      await enbBounty.connect(alice).acceptClaim(0, bob.address);
      expect(await enbBounty.hasAddressWon(0, bob.address)).to.be.true;
      expect(await enbBounty.hasAddressWon(0, charlie.address)).to.be.false;

      await enbBounty.connect(alice).acceptClaim(0, charlie.address);
      expect(await enbBounty.hasAddressWon(0, charlie.address)).to.be.true;

      const winners = await enbBounty.getBountyWinners(0);
      expect(winners).to.deep.equal([bob.address, charlie.address]);
    });

    it('Should prevent same address from winning multiple times', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'No Double Winners',
        'Description',
        3,
        30,
        { value: ethers.parseEther('3') }
      );

      await enbBounty.connect(alice).acceptClaim(0, bob.address);

      await expect(
        enbBounty.connect(alice).acceptClaim(0, bob.address)
      ).to.be.revertedWithCustomError(enbBounty, 'AlreadyWon');
    });
  });

  describe('Token Multi-Winner Bounties', function () {
    it('Should distribute token rewards among multiple winners', async function () {
      const tokenAmount = ethers.parseEther('3000');
      const maxWinners = 3;

      const approveAmount = tokenAmount * 1150n / 1000n; // 115% for creation fee
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), approveAmount);

      const treasuryBalanceBefore = await mockToken.balanceOf(owner.address);

      await enbBounty.connect(alice).createTokenBounty(
        'Token Multi-Winner',
        'Description',
        maxWinners,
        await mockToken.getAddress(),
        tokenAmount,
        30,
        { value: 0 }
      );

      const claimers = [bob, charlie, david];
      for (let i = 0; i < claimers.length; i++) {
        const balanceBefore = await mockToken.balanceOf(claimers[i].address);
        await enbBounty.connect(alice).acceptClaim(0, claimers[i].address);
        const balanceAfter = await mockToken.balanceOf(claimers[i].address);

        const perWinnerAmount = tokenAmount / BigInt(maxWinners);
        const fee = (perWinnerAmount * 100n) / 1000n; // 10% fee
        const expectedAmount = perWinnerAmount - fee;

        expect(balanceAfter - balanceBefore).to.equal(expectedAmount);
      }

      const treasuryBalanceAfter = await mockToken.balanceOf(owner.address);
      const creationFee = (tokenAmount * 150n) / 1000n; // 15% creation fee
      const platformFees = (tokenAmount * 100n) / 1000n; // 10% platform fee
      const totalTreasuryIncome = creationFee + platformFees;
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(totalTreasuryIncome);
    });

  });

  describe('Edge Cases and Limits', function () {
    it('Should handle bounty with 1 max winner correctly', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Single Winner',
        'Description',
        1,
        30,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(alice).acceptClaim(0, bob.address);

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.winnersCount).to.equal(1);
      expect(bountyData.maxWinners).to.equal(1);

      // After all winners filled, more accepts should fail
      await expect(
        enbBounty.connect(alice).acceptClaim(0, charlie.address)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClaimed');
    });

    it('Should handle very large number of winners', async function () {
      const maxWinners = 100;
      const bountyAmount = ethers.parseEther('100');

      await enbBounty.connect(alice).createSoloBounty(
        'Many Winners',
        'Description',
        maxWinners,
        30,
        { value: bountyAmount }
      );

      const signers = await ethers.getSigners();
      const numClaimers = Math.min(10, signers.length - 2);

      for (let i = 0; i < numClaimers; i++) {
        const claimer = signers[i + 2];
        await enbBounty.connect(alice).acceptClaim(0, claimer.address);
      }

      const remainingSlots = await enbBounty.getRemainingWinnerSlots(0);
      expect(remainingSlots).to.equal(maxWinners - numClaimers);

      const winners = await enbBounty.getBountyWinners(0);
      expect(winners.length).to.equal(numClaimers);
    });

    it('Should calculate rewards correctly with uneven division', async function () {
      const bountyAmount = ethers.parseEther('1');
      const maxWinners = 3;

      await enbBounty.connect(alice).createSoloBounty(
        'Uneven Division',
        'Description',
        maxWinners,
        30,
        { value: bountyAmount }
      );

      const claimers = [bob, charlie, david];
      const receivedAmounts = [];

      for (let i = 0; i < claimers.length; i++) {
        const balanceBefore = await ethers.provider.getBalance(claimers[i].address);
        await enbBounty.connect(alice).acceptClaim(0, claimers[i].address);
        const balanceAfter = await ethers.provider.getBalance(claimers[i].address);

        receivedAmounts.push(balanceAfter - balanceBefore);
      }

      const totalReceived = receivedAmounts.reduce((a, b) => a + b, 0n);
      // Net bounty after 15% creation fee: 1e18 * 1000 / 1150
      const netBountyAmount = bountyAmount * 1000n / 1150n;
      const totalFees = (netBountyAmount * 100n) / 1000n; // 10% fee
      const expectedTotal = netBountyAmount - totalFees;

      expect(totalReceived).to.be.closeTo(expectedTotal, ethers.parseEther('0.001'));
    });
  });

  describe('Partial Cancellation', function () {
    it('Should refund remaining amount when cancelling bounty with some winners', async function () {
      const bountyAmount = ethers.parseEther('3');
      const maxWinners = 3;

      await enbBounty.connect(alice).createSoloBounty(
        'Partial Cancel',
        'Description',
        maxWinners,
        30,
        { value: bountyAmount }
      );

      const netBountyAmount = bountyAmount * 1000n / 1150n;

      // Accept 1 of 3 winners
      await enbBounty.connect(alice).acceptClaim(0, bob.address);

      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);
      const tx = await enbBounty.connect(alice).cancelSoloBounty(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);

      // Should get back 2/3 of the net bounty amount
      const paidOut = netBountyAmount / BigInt(maxWinners);
      const expectedRefund = netBountyAmount - paidOut;

      expect(aliceBalanceAfter - aliceBalanceBefore + gasCost).to.equal(expectedRefund);
    });

    it('Should refund zero when all winners are paid', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Full Winners',
        'Description',
        2,
        30,
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(alice).acceptClaim(0, bob.address);
      await enbBounty.connect(alice).acceptClaim(0, charlie.address);

      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);
      const tx = await enbBounty.connect(alice).cancelSoloBounty(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * tx.gasPrice;
      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);

      // No refund expected since all winners were paid, only gas cost
      // Use closeTo to account for minor gasPrice rounding
      expect(aliceBalanceBefore - aliceBalanceAfter).to.be.closeTo(gasCost, 10);
    });
  });

  describe('InvalidClaimer errors', function () {
    it('Should revert when claimer is zero address', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test',
        'Description',
        1,
        30,
        { value: ethers.parseEther('1') }
      );

      await expect(
        enbBounty.connect(alice).acceptClaim(0, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(enbBounty, 'InvalidClaimer');
    });

    it('Should revert when claimer is bounty issuer', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test',
        'Description',
        1,
        30,
        { value: ethers.parseEther('1') }
      );

      await expect(
        enbBounty.connect(alice).acceptClaim(0, alice.address)
      ).to.be.revertedWithCustomError(enbBounty, 'InvalidClaimer');
    });
  });
});
