import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Multi-Winner Integration Tests', function () {
  let enbBounty: Contract;
  let enbBountyNft: Contract;
  let mockToken: Contract;
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
        { value: bountyAmount }
      );

      const claimers = [bob, charlie, david];
      for (let i = 0; i < claimers.length; i++) {
        await enbBounty.connect(claimers[i]).createClaim(
          0,
          `Claim ${i}`,
          `uri${i}`,
          `Description ${i}`
        );
      }

      for (let i = 0; i < claimers.length; i++) {
        const balanceBefore = await ethers.provider.getBalance(claimers[i].address);
        await enbBounty.connect(alice).acceptClaim(0, i);
        const balanceAfter = await ethers.provider.getBalance(claimers[i].address);

        const perWinnerAmount = bountyAmount / BigInt(maxWinners);
        const fee = (perWinnerAmount * 25n) / 1000n; // 2.5% fee
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
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim 1', 'uri1', 'Desc1');
      await enbBounty.connect(charlie).createClaim(0, 'Claim 2', 'uri2', 'Desc2');
      await enbBounty.connect(david).createClaim(0, 'Claim 3', 'uri3', 'Desc3');

      await enbBounty.connect(alice).acceptClaim(0, 0);
      await enbBounty.connect(alice).acceptClaim(0, 1);

      await expect(
        enbBounty.connect(alice).acceptClaim(0, 2)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClaimed');

      const remainingSlots = await enbBounty.getRemainingWinnerSlots(0);
      expect(remainingSlots).to.equal(0);
    });

    it('Should track individual winner status', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Track Winners',
        'Description',
        3,
        { value: ethers.parseEther('3') }
      );

      await enbBounty.connect(bob).createClaim(0, 'Bob Claim', 'uri1', 'Desc1');
      await enbBounty.connect(charlie).createClaim(0, 'Charlie Claim', 'uri2', 'Desc2');

      expect(await enbBounty.hasAddressWon(0, bob.address)).to.be.false;
      expect(await enbBounty.hasAddressWon(0, charlie.address)).to.be.false;

      await enbBounty.connect(alice).acceptClaim(0, 0);
      expect(await enbBounty.hasAddressWon(0, bob.address)).to.be.true;
      expect(await enbBounty.hasAddressWon(0, charlie.address)).to.be.false;

      await enbBounty.connect(alice).acceptClaim(0, 1);
      expect(await enbBounty.hasAddressWon(0, charlie.address)).to.be.true;

      const [winners, claims] = await enbBounty.getBountyWinners(0);
      expect(winners).to.deep.equal([bob.address, charlie.address]);
      expect(claims).to.deep.equal([BigInt(0), BigInt(1)]);
    });

    it('Should prevent same address from winning multiple times', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'No Double Winners',
        'Description',
        3,
        { value: ethers.parseEther('3') }
      );

      await enbBounty.connect(bob).createClaim(0, 'First Claim', 'uri1', 'Desc1');
      await enbBounty.connect(alice).acceptClaim(0, 0);

      await enbBounty.connect(bob).createClaim(0, 'Second Claim', 'uri2', 'Desc2');
      
      await expect(
        enbBounty.connect(alice).acceptClaim(0, 1)
      ).to.be.revertedWithCustomError(enbBounty, 'AlreadyWon');
    });
  });

  describe('Open Multi-Winner Bounties with Voting', function () {
    it('Should handle multiple winners through voting', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Multi-Winner',
        'Description',
        2,
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') });

      await enbBounty.connect(charlie).createClaim(0, 'Claim 1', 'uri1', 'Desc1');
      await enbBounty.connect(charlie).submitClaimForVote(0, 0);

      await enbBounty.connect(alice).voteClaim(0, true);
      await enbBounty.connect(bob).voteClaim(0, true);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      await enbBounty.resolveVote(0);

      expect(await enbBounty.hasAddressWon(0, charlie.address)).to.be.true;
      expect(await enbBounty.getRemainingWinnerSlots(0)).to.equal(1);

      await enbBounty.connect(david).createClaim(0, 'Claim 2', 'uri2', 'Desc2');
      await enbBounty.connect(david).submitClaimForVote(0, 1);

      await enbBounty.connect(alice).voteClaim(0, true);
      await enbBounty.connect(bob).voteClaim(0, true);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      await enbBounty.resolveVote(0);

      expect(await enbBounty.hasAddressWon(0, david.address)).to.be.true;
      expect(await enbBounty.getRemainingWinnerSlots(0)).to.equal(0);

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.winnersCount).to.equal(2);
    });

    it('Should close bounty after max winners reached through voting', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Limited Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') });

      await enbBounty.connect(charlie).createClaim(0, 'Winning Claim', 'uri1', 'Desc1');
      await enbBounty.connect(charlie).submitClaimForVote(0, 0);

      await enbBounty.connect(alice).voteClaim(0, true);
      await enbBounty.connect(bob).voteClaim(0, true);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      await enbBounty.resolveVote(0);

      await expect(
        enbBounty.connect(david).createClaim(0, 'Late Claim', 'uri2', 'Desc2')
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClaimed');

      await expect(
        enbBounty.connect(bob).withdrawFromOpenBounty(0)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClaimed');
    });
  });

  describe('Token Multi-Winner Bounties', function () {
    it('Should distribute token rewards among multiple winners', async function () {
      const tokenAmount = ethers.parseEther('3000');
      const maxWinners = 3;

      await mockToken.connect(alice).approve(await enbBounty.getAddress(), tokenAmount);

      await enbBounty.connect(alice).createTokenBounty(
        'Token Multi-Winner',
        'Description',
        maxWinners,
        await mockToken.getAddress(),
        tokenAmount,
        { value: 0 }
      );

      const claimers = [bob, charlie, david];
      for (let i = 0; i < claimers.length; i++) {
        await enbBounty.connect(claimers[i]).createClaim(
          0,
          `Claim ${i}`,
          `uri${i}`,
          `Description ${i}`
        );
      }

      for (let i = 0; i < claimers.length; i++) {
        const balanceBefore = await mockToken.balanceOf(claimers[i].address);
        await enbBounty.connect(alice).acceptClaim(0, i);
        const balanceAfter = await mockToken.balanceOf(claimers[i].address);

        const perWinnerAmount = tokenAmount / BigInt(maxWinners);
        const fee = (perWinnerAmount * 25n) / 1000n; // 2.5% fee
        const expectedAmount = perWinnerAmount - fee;

        expect(balanceAfter - balanceBefore).to.equal(expectedAmount);
      }

      const treasuryBalance = await mockToken.balanceOf(owner.address);
      const totalFees = (tokenAmount * 25n) / 1000n; // 2.5% fee
      expect(treasuryBalance).to.equal(totalFees);
    });

    it('Should handle open token bounty with multiple winners', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('2000'));
      await mockToken.connect(bob).approve(await enbBounty.getAddress(), ethers.parseEther('1000'));

      await enbBounty.connect(alice).createOpenTokenBounty(
        'Open Token Multi',
        'Description',
        2,
        await mockToken.getAddress(),
        ethers.parseEther('2000'),
        { value: 0 }
      );

      await enbBounty.connect(bob).joinOpenBountyWithToken(
        0,
        ethers.parseEther('1000'),
        { value: 0 }
      );

      const totalAmount = ethers.parseEther('3000');

      await enbBounty.connect(charlie).createClaim(0, 'Claim 1', 'uri1', 'Desc1');
      await enbBounty.connect(charlie).submitClaimForVote(0, 0);

      await enbBounty.connect(alice).voteClaim(0, true);
      await enbBounty.connect(bob).voteClaim(0, true);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      const charlieBalanceBefore = await mockToken.balanceOf(charlie.address);
      await enbBounty.resolveVote(0);
      const charlieBalanceAfter = await mockToken.balanceOf(charlie.address);

      const perWinnerAmount = totalAmount / 2n;
      const fee = (perWinnerAmount * 25n) / 1000n; // 2.5% fee
      const expectedAmount = perWinnerAmount - fee;

      expect(charlieBalanceAfter - charlieBalanceBefore).to.equal(expectedAmount);
    });
  });

  describe('Edge Cases and Limits', function () {
    it('Should handle bounty with 1 max winner correctly', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Single Winner',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc');
      await enbBounty.connect(alice).acceptClaim(0, 0);

      const bountyData = await enbBounty.bounties(0);
      expect(bountyData.winnersCount).to.equal(1);
      expect(bountyData.maxWinners).to.equal(1);

      await expect(
        enbBounty.connect(charlie).createClaim(0, 'Late', 'uri2', 'Desc2')
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClaimed');
    });

    it('Should handle very large number of winners', async function () {
      const maxWinners = 100;
      const bountyAmount = ethers.parseEther('100');

      await enbBounty.connect(alice).createSoloBounty(
        'Many Winners',
        'Description',
        maxWinners,
        { value: bountyAmount }
      );

      const signers = await ethers.getSigners();
      const numClaimers = Math.min(10, signers.length - 2);

      for (let i = 0; i < numClaimers; i++) {
        const claimer = signers[i + 2];
        await enbBounty.connect(claimer).createClaim(
          0,
          `Claim ${i}`,
          `uri${i}`,
          `Desc ${i}`
        );
        await enbBounty.connect(alice).acceptClaim(0, i);
      }

      const remainingSlots = await enbBounty.getRemainingWinnerSlots(0);
      expect(remainingSlots).to.equal(maxWinners - numClaimers);

      const [winners, claims] = await enbBounty.getBountyWinners(0);
      expect(winners.length).to.equal(numClaimers);
    });

    it('Should calculate rewards correctly with uneven division', async function () {
      const bountyAmount = ethers.parseEther('1');
      const maxWinners = 3;

      await enbBounty.connect(alice).createSoloBounty(
        'Uneven Division',
        'Description',
        maxWinners,
        { value: bountyAmount }
      );

      const claimers = [bob, charlie, david];
      const receivedAmounts = [];

      for (let i = 0; i < claimers.length; i++) {
        await enbBounty.connect(claimers[i]).createClaim(
          0,
          `Claim ${i}`,
          `uri${i}`,
          `Description ${i}`
        );

        const balanceBefore = await ethers.provider.getBalance(claimers[i].address);
        await enbBounty.connect(alice).acceptClaim(0, i);
        const balanceAfter = await ethers.provider.getBalance(claimers[i].address);

        receivedAmounts.push(balanceAfter - balanceBefore);
      }

      const totalReceived = receivedAmounts.reduce((a, b) => a + b, 0n);
      const totalFees = (bountyAmount * 25n) / 1000n; // 2.5% fee
      const expectedTotal = bountyAmount - totalFees;

      expect(totalReceived).to.be.closeTo(expectedTotal, ethers.parseEther('0.001'));
    });
  });
});