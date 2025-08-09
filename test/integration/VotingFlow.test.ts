import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Voting Flow Integration Tests', function () {
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
  });

  describe('Complete Voting Lifecycle', function () {
    it('Should handle a complete voting cycle with acceptance', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Community Bounty',
        'Build a feature',
        1,
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') });
      await enbBounty.connect(charlie).joinOpenBounty(0, { value: ethers.parseEther('0.5') });

      await enbBounty.connect(david).createClaim(0, 'Feature Implementation', 'ipfs://claim1', 'Complete implementation');
      await enbBounty.connect(david).submitClaimForVote(0, 0);

      await enbBounty.connect(alice).voteClaim(0, true);
      await enbBounty.connect(bob).voteClaim(0, true);
      await enbBounty.connect(charlie).voteClaim(0, false);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      const davidBalanceBefore = await ethers.provider.getBalance(david.address);
      const treasuryBalanceBefore = await ethers.provider.getBalance(owner.address);

      const tx = await enbBounty.connect(eve).resolveVote(0); // Use eve to avoid gas costs affecting owner
      await tx.wait();

      const davidBalanceAfter = await ethers.provider.getBalance(david.address);
      const treasuryBalanceAfter = await ethers.provider.getBalance(owner.address);

      const totalAmount = ethers.parseEther('3.5');
      const fee = (totalAmount * 25n) / 1000n; // 2.5% fee
      const claimerAmount = totalAmount - fee;

      expect(davidBalanceAfter - davidBalanceBefore).to.equal(claimerAmount);
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(fee);

      const claim = await enbBounty.claims(0);
      expect(claim.accepted).to.be.true;
    });

    it('Should handle a complete voting cycle with rejection', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Community Bounty',
        'Build a feature',
        1,
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') });
      await enbBounty.connect(charlie).joinOpenBounty(0, { value: ethers.parseEther('0.5') });

      await enbBounty.connect(david).createClaim(0, 'Bad Implementation', 'ipfs://claim1', 'Poor quality');
      await enbBounty.connect(david).submitClaimForVote(0, 0);

      await enbBounty.connect(alice).voteClaim(0, false);
      await enbBounty.connect(bob).voteClaim(0, false);
      await enbBounty.connect(charlie).voteClaim(0, true);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      const contractBalanceBefore = await ethers.provider.getBalance(await enbBounty.getAddress());
      
      await enbBounty.resolveVote(0);

      const contractBalanceAfter = await ethers.provider.getBalance(await enbBounty.getAddress());
      expect(contractBalanceAfter).to.equal(contractBalanceBefore);

      const claim = await enbBounty.claims(0);
      expect(claim.accepted).to.be.false;

      await enbBounty.connect(eve).createClaim(0, 'Better Implementation', 'ipfs://claim2', 'High quality');
      expect((await enbBounty.claims(1)).id).to.equal(1);
    });

    it('Should handle voting period reset correctly', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Community Bounty',
        'Build a feature',
        1,
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') });

      await enbBounty.connect(david).createClaim(0, 'Implementation', 'ipfs://claim1', 'Description');
      await enbBounty.connect(david).submitClaimForVote(0, 0);

      await enbBounty.connect(alice).voteClaim(0, true);
      
      // Wait for voting period to end
      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      await enbBounty.connect(alice).resetVotingPeriod(0);

      // Alice is a participant, so she gets NoActiveVoting error
      await expect(
        enbBounty.connect(alice).voteClaim(0, true)
      ).to.be.revertedWithCustomError(enbBounty, 'NoActiveVoting');

      await enbBounty.connect(david).submitClaimForVote(0, 0);
      
      await expect(
        enbBounty.connect(alice).voteClaim(0, false)
      ).to.not.be.reverted;
    });
  });

  describe('Multiple Claims Voting', function () {
    it('Should handle sequential voting on different claims', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Multi-Claim Bounty',
        'Description',
        1,
        { value: ethers.parseEther('3') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') });

      await enbBounty.connect(charlie).createClaim(0, 'Claim 1', 'uri1', 'First attempt');
      await enbBounty.connect(david).createClaim(0, 'Claim 2', 'uri2', 'Second attempt');

      await enbBounty.connect(charlie).submitClaimForVote(0, 0);
      await enbBounty.connect(alice).voteClaim(0, false);
      await enbBounty.connect(bob).voteClaim(0, false);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      await enbBounty.resolveVote(0);

      await enbBounty.connect(david).submitClaimForVote(0, 1);
      await enbBounty.connect(alice).voteClaim(0, true);
      await enbBounty.connect(bob).voteClaim(0, true);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      await enbBounty.resolveVote(0);

      const claim1 = await enbBounty.claims(0);
      const claim2 = await enbBounty.claims(1);
      expect(claim1.accepted).to.be.false;
      expect(claim2.accepted).to.be.true;
    });

    it('Should prevent voting on non-submitted claims', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Test Bounty',
        'Description',
        1,
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') });

      await enbBounty.connect(charlie).createClaim(0, 'Claim 1', 'uri1', 'First');
      await enbBounty.connect(david).createClaim(0, 'Claim 2', 'uri2', 'Second');

      await enbBounty.connect(charlie).submitClaimForVote(0, 0);

      await expect(
        enbBounty.connect(david).submitClaimForVote(0, 1)
      ).to.be.reverted;
    });
  });

  describe('Weighted Voting', function () {
    it('Should weight votes by participant contribution', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Weighted Voting Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('2') });
      await enbBounty.connect(charlie).joinOpenBounty(0, { value: ethers.parseEther('0.5') });
      await enbBounty.connect(david).joinOpenBounty(0, { value: ethers.parseEther('0.5') });

      await enbBounty.connect(eve).createClaim(0, 'Claim', 'uri', 'Description');
      await enbBounty.connect(eve).submitClaimForVote(0, 0);

      await enbBounty.connect(alice).voteClaim(0, false);
      await enbBounty.connect(bob).voteClaim(0, true);
      await enbBounty.connect(charlie).voteClaim(0, false);
      await enbBounty.connect(david).voteClaim(0, false);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      const eveBefore = await ethers.provider.getBalance(eve.address);
      await enbBounty.resolveVote(0);
      const eveAfter = await ethers.provider.getBalance(eve.address);

      // Vote weights: Alice(1 ETH)=NO, Bob(2 ETH)=YES, Charlie(0.5 ETH)=NO, David(0.5 ETH)=NO
      // Total: 2 ETH NO, 2 ETH YES - it's a tie, so claim should be rejected
      expect(eveAfter - eveBefore).to.equal(0); // Eve should not receive anything
    });

    it('Should handle tie votes correctly', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Tie Vote Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') });

      await enbBounty.connect(charlie).createClaim(0, 'Claim', 'uri', 'Description');
      await enbBounty.connect(charlie).submitClaimForVote(0, 0);

      await enbBounty.connect(alice).voteClaim(0, true);
      await enbBounty.connect(bob).voteClaim(0, false);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      await enbBounty.resolveVote(0);

      const claim = await enbBounty.claims(0);
      expect(claim.accepted).to.be.false;
    });
  });

  describe('Edge Cases in Voting', function () {
    it('Should handle single participant voting', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Single Voter Bounty',
        'Description',
        1,
        { value: ethers.parseEther('2') }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Description');
      
      // With only one participant, the issuer can accept directly without voting
      const bobBefore = await ethers.provider.getBalance(bob.address);
      await enbBounty.connect(alice).acceptClaim(0, 0);
      const bobAfter = await ethers.provider.getBalance(bob.address);
      
      const totalAmount = ethers.parseEther('2');
      const fee = (totalAmount * 25n) / 1000n; // 2.5% fee
      const claimerAmount = totalAmount - fee;
      
      expect(bobAfter - bobBefore).to.equal(claimerAmount);
      
      const claim = await enbBounty.claims(0);
      expect(claim.accepted).to.be.true;
    });

    it('Should prevent early vote resolution', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Test Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') });
      await enbBounty.connect(charlie).createClaim(0, 'Claim', 'uri', 'Description');
      await enbBounty.connect(charlie).submitClaimForVote(0, 0);

      await enbBounty.connect(alice).voteClaim(0, true);
      await enbBounty.connect(bob).voteClaim(0, true);

      await expect(
        enbBounty.resolveVote(0)
      ).to.be.reverted;

      await ethers.provider.send('evm_increaseTime', [24 * 60 * 60]);
      await ethers.provider.send('evm_mine', []);

      await expect(
        enbBounty.resolveVote(0)
      ).to.be.reverted;

      await ethers.provider.send('evm_increaseTime', [24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      await expect(
        enbBounty.resolveVote(0)
      ).to.not.be.reverted;
    });

    it('Should handle participant withdrawal during voting', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Withdrawal During Vote',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('1') });
      await enbBounty.connect(charlie).joinOpenBounty(0, { value: ethers.parseEther('1') });

      await enbBounty.connect(david).createClaim(0, 'Claim', 'uri', 'Description');
      await enbBounty.connect(david).submitClaimForVote(0, 0);

      await enbBounty.connect(alice).voteClaim(0, true);
      
      await expect(
        enbBounty.connect(bob).withdrawFromOpenBounty(0)
      ).to.be.revertedWithCustomError(enbBounty, 'VotingOngoing');

      await enbBounty.connect(charlie).voteClaim(0, true);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      await enbBounty.resolveVote(0);

      await expect(
        enbBounty.connect(bob).withdrawFromOpenBounty(0)
      ).to.be.revertedWithCustomError(enbBounty, 'BountyClaimed');
    });
  });
});