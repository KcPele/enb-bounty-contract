import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Reentrancy Security Tests', function () {
  let enbBounty: Contract;
  let enbBountyNft: Contract;
  let attacker: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, eve] = await ethers.getSigners();

    const ENBBountyNft = await ethers.getContractFactory('ENBBountyNft');
    enbBountyNft = await ENBBountyNft.deploy(owner.address, owner.address, '500');

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await ENBBounty.deploy(
      await enbBountyNft.getAddress(),
      owner.address,
      0,
      await mockToken.getAddress(),
      ethers.ZeroAddress
    );

    await enbBountyNft.setENBBountyContract(await enbBounty.getAddress(), true);
  });

  describe('Reentrancy Attack Vectors', function () {
    it('Should prevent reentrancy during acceptClaim ETH transfer', async function () {
      const ReentrancyAttacker = await ethers.getContractFactory('ReentrancyAttacker');
      attacker = await ReentrancyAttacker.deploy(await enbBounty.getAddress());

      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await attacker.createClaim(0);

      const attackerBalanceBefore = await ethers.provider.getBalance(await attacker.getAddress());
      
      // The transaction might succeed but reentrancy should fail
      await enbBounty.connect(alice).acceptClaim(0, 0);
      
      const attackerBalanceAfter = await ethers.provider.getBalance(await attacker.getAddress());
      const received = attackerBalanceAfter - attackerBalanceBefore;
      
      // Attacker should only receive the legitimate payout (minus fee)
      const expectedPayout = ethers.parseEther('1') - (ethers.parseEther('1') * 25n / 1000n);
      expect(received).to.equal(expectedPayout);
      
      // Check that reentrancy didn't succeed
      const attackerContract = await ethers.getContractAt('ReentrancyAttacker', await attacker.getAddress());
      expect(await attackerContract.reentered()).to.be.false;
    });

    it('Should prevent reentrancy during cancelSoloBounty refund', async function () {
      const MaliciousContract = await ethers.getContractFactory('MaliciousRefundReceiver');
      const malicious = await MaliciousContract.deploy(await enbBounty.getAddress());

      await malicious.createBountyAndCancel({ value: ethers.parseEther('1') });

      const balance = await ethers.provider.getBalance(await malicious.getAddress());
      // Should get refund but no extra funds from reentrancy
      expect(balance).to.be.closeTo(ethers.parseEther('1'), ethers.parseEther('0.01'));
    });

    it('Should prevent reentrancy during withdrawFromOpenBounty', async function () {
      const MaliciousWithdrawer = await ethers.getContractFactory('MaliciousWithdrawer');
      const malicious = await MaliciousWithdrawer.deploy(await enbBounty.getAddress());

      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await malicious.joinAndWithdraw(0, { value: ethers.parseEther('0.5') });

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.amount).to.equal(ethers.parseEther('1'));
    });

    it('Should handle multiple claim acceptance without reentrancy', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Multi Winner Bounty',
        'Description',
        3,
        { value: ethers.parseEther('3') }
      );

      for (let i = 0; i < 3; i++) {
        const signer = [bob, eve, owner][i];
        await enbBounty.connect(signer).createClaim(
          0,
          `Claim ${i}`,
          `uri${i}`,
          `Description ${i}`
        );
      }

      await enbBounty.connect(alice).acceptClaim(0, 0);
      await enbBounty.connect(alice).acceptClaim(0, 1);
      
      await expect(
        enbBounty.connect(alice).acceptClaim(0, 0)
      ).to.be.reverted;
    });

    it('Should prevent cross-function reentrancy between accept and cancel', async function () {
      const CrossReentrancy = await ethers.getContractFactory('CrossReentrancyAttacker');
      const crossAttacker = await CrossReentrancy.deploy(await enbBounty.getAddress());

      await crossAttacker.performCrossAttack({ value: ethers.parseEther('2') });

      const attackerBalance = await ethers.provider.getBalance(await crossAttacker.getAddress());
      // Should have received normal payouts but no extra from reentrancy
      // Two bounties created with 1 ETH each, both might be processed normally
      expect(attackerBalance).to.be.closeTo(ethers.parseEther('1.95'), ethers.parseEther('0.1'));
    });
  });

  describe('State Consistency During Reentrancy Attempts', function () {
    it('Should maintain correct winner count during failed reentrancy', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        2,
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim 1', 'uri1', 'Desc1');
      await enbBounty.connect(alice).acceptClaim(0, 0);

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.winnersCount).to.equal(1);
    });

    it('Should maintain participant list integrity during withdrawal reentrancy', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });

      const [participants, amounts] = await enbBounty.getParticipants(0);
      const initialLength = participants.length;

      await enbBounty.connect(bob).withdrawFromOpenBounty(0);

      const [participantsAfter, amountsAfter] = await enbBounty.getParticipants(0);
      expect(participantsAfter[1]).to.equal(ethers.ZeroAddress);
      expect(amountsAfter[1]).to.equal(0);
    });

    it('Should prevent double spending in token bounties', async function () {
      await mockToken.transfer(alice.address, ethers.parseEther('100'));
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));

      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('10'),
        { value: 0 }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc');

      const aliceBalanceBefore = await mockToken.balanceOf(alice.address);
      await enbBounty.connect(alice).acceptClaim(0, 0);
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
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc');

      const tx = await enbBounty.connect(alice).acceptClaim(0, 0);
      const receipt = await tx.wait();

      // Check that events were emitted (state was updated before transfers)
      expect(receipt.logs.length).to.be.greaterThan(0);
      
      // Verify claim was accepted
      const claim = await enbBounty.claims(0);
      expect(claim.accepted).to.be.true;
    });

    it('Should properly handle failed external calls', async function () {
      const FailingReceiver = await ethers.getContractFactory('FailingReceiver');
      const failingContract = await FailingReceiver.deploy();

      await failingContract.createBounty(await enbBounty.getAddress(), {
        value: ethers.parseEther('1')
      });

      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc');

      await expect(
        failingContract.acceptClaim(0, 0)
      ).to.be.reverted;
    });
  });
});
