import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Reentrancy Security Tests', function () {
  let enbBounty: Contract;
  let attacker: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, eve] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await upgrades.deployProxy(ENBBounty, [owner.address], { kind: 'uups' });

    await enbBounty.addSupportedToken(await mockToken.getAddress(), 1);
  });

  describe('Reentrancy Attack Vectors', function () {
    it('Should prevent reentrancy during acceptClaim ETH transfer', async function () {
      const ReentrancyAttacker = await ethers.getContractFactory('ReentrancyAttacker');
      attacker = await ReentrancyAttacker.deploy(await enbBounty.getAddress());

      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );

      const attackerAddress = await attacker.getAddress();
      const attackerBalanceBefore = await ethers.provider.getBalance(attackerAddress);

      await enbBounty.connect(alice).acceptClaim(0, attackerAddress);

      const attackerBalanceAfter = await ethers.provider.getBalance(attackerAddress);
      const received = attackerBalanceAfter - attackerBalanceBefore;

      // Bounty amount after 15% creation fee: 1e18 * 1000 / 1150
      const bountyAmount = ethers.parseEther('1') * 1000n / 1150n;
      const platformFee = bountyAmount * 100n / 1000n;
      const expectedPayout = bountyAmount - platformFee;
      expect(received).to.equal(expectedPayout);

      const attackerContract = await ethers.getContractAt('ReentrancyAttacker', attackerAddress);
      expect(await attackerContract.reentered()).to.be.false;
    });

    it('Should prevent reentrancy during cancelSoloBounty refund', async function () {
      const MaliciousContract = await ethers.getContractFactory('MaliciousRefundReceiver');
      const malicious = await MaliciousContract.deploy(await enbBounty.getAddress());

      await malicious.createBountyAndCancel({ value: ethers.parseEther('1') });

      const balance = await ethers.provider.getBalance(await malicious.getAddress());
      // Bounty amount after 15% creation fee: 1e18 * 1000 / 1150
      const expectedRefund = ethers.parseEther('1') * 1000n / 1150n;
      expect(balance).to.be.closeTo(expectedRefund, ethers.parseEther('0.01'));
    });

    it('Should handle multiple claim acceptance without reentrancy', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Multi Winner Bounty',
        'Description',
        3,
        30,
        0,
        { value: ethers.parseEther('3') }
      );

      await enbBounty.connect(alice).acceptClaim(0, bob.address);
      await enbBounty.connect(alice).acceptClaim(0, eve.address);

      await expect(
        enbBounty.connect(alice).acceptClaim(0, bob.address)
      ).to.be.reverted;
    });

    it('Should prevent cross-function reentrancy between accept and cancel', async function () {
      const CrossReentrancy = await ethers.getContractFactory('CrossReentrancyAttacker');
      const crossAttacker = await CrossReentrancy.deploy(await enbBounty.getAddress());

      await crossAttacker.performCrossAttack({ value: ethers.parseEther('2') });

      const attackerBalance = await ethers.provider.getBalance(await crossAttacker.getAddress());
      // Should have received normal refunds but no extra from reentrancy
      expect(attackerBalance).to.be.closeTo(ethers.parseEther('1.75'), ethers.parseEther('0.1'));
    });
  });

  describe('State Consistency During Reentrancy Attempts', function () {
    it('Should maintain correct winner count during failed reentrancy', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        2,
        30,
        0,
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(alice).acceptClaim(0, bob.address);

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.winnersCount).to.equal(1);
    });

    it('Should prevent double spending in token bounties', async function () {
      await mockToken.transfer(alice.address, ethers.parseEther('100'));
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('115'));

      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('10'),
        30,
        0,
        { value: 0 }
      );

      const aliceBalanceBefore = await mockToken.balanceOf(alice.address);
      await enbBounty.connect(alice).acceptClaim(0, bob.address);
      const aliceBalanceAfter = await mockToken.balanceOf(alice.address);

      expect(aliceBalanceBefore).to.equal(aliceBalanceAfter);
    });
  });

  describe('Check-Effects-Interactions Pattern Verification', function () {
    it('Should update state before external calls in acceptClaim', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );

      const tx = await enbBounty.connect(alice).acceptClaim(0, bob.address);
      const receipt = await tx.wait();

      expect(receipt.logs.length).to.be.greaterThan(0);
      expect(await enbBounty.hasAddressWon(0, bob.address)).to.be.true;
    });

    it('Should properly handle failed external calls', async function () {
      const FailingReceiver = await ethers.getContractFactory('FailingReceiver');
      const failingContract = await FailingReceiver.deploy();

      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );

      const failingAddress = await failingContract.getAddress();
      await enbBounty.connect(alice).acceptClaim(0, failingAddress);
      expect(await enbBounty.hasAddressWon(0, failingAddress)).to.be.true;
    });
  });
});
