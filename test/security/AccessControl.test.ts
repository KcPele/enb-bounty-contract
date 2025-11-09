import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Access Control Security Tests', function () {
  let enbBounty: Contract;
  let enbBountyNft: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;
  let treasury: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, eve, treasury] = await ethers.getSigners();

    const ENBBountyNft = await ethers.getContractFactory('ENBBountyNft');
    enbBountyNft = await ENBBountyNft.deploy(treasury.address, treasury.address, '500');

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await ENBBounty.deploy(
      await enbBountyNft.getAddress(),
      treasury.address,
      0,
      await mockToken.getAddress(),
      ethers.ZeroAddress
    );

    await enbBountyNft.connect(treasury).setENBBountyContract(await enbBounty.getAddress(), true);
  });

  describe('Owner-Only Functions', function () {
    it('Should only allow treasury to add supported tokens', async function () {
      const newToken = await ethers.getContractFactory('MockERC20');
      const token = await newToken.deploy('New Token', 'NTK', ethers.parseEther('1000'));

      await expect(
        enbBounty.connect(alice).addSupportedToken(await token.getAddress(), 2)
      ).to.be.revertedWith('Not authorized');

      await expect(
        enbBounty.connect(treasury).addSupportedToken(await token.getAddress(), 2)
      ).to.not.be.reverted;
    });

    it('Should only allow treasury to remove supported tokens', async function () {
      await expect(
        enbBounty.connect(alice).removeSupportedToken(await mockToken.getAddress())
      ).to.be.revertedWith('Not authorized');

      await expect(
        enbBounty.connect(treasury).removeSupportedToken(await mockToken.getAddress())
      ).to.not.be.reverted;
    });

    it('Should prevent unauthorized treasury modification', async function () {
      const currentTreasury = await enbBounty.treasury();
      expect(currentTreasury).to.equal(treasury.address);
      
      const treasurySlot = 1;
      await expect(
        alice.sendTransaction({
          to: await enbBounty.getAddress(),
          data: ethers.zeroPadValue(alice.address, 32)
        })
      ).to.be.reverted;
    });
  });

  describe('Bounty Issuer Privileges', function () {
    it('Should only allow issuer to cancel solo bounty', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await expect(
        enbBounty.connect(bob).cancelSoloBounty(0)
      ).to.be.revertedWithCustomError(enbBounty, 'WrongCaller');

      await expect(
        enbBounty.connect(alice).cancelSoloBounty(0)
      ).to.not.be.reverted;
    });

    it('Should only allow issuer to accept claims on solo bounty', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc');

      await expect(
        enbBounty.connect(bob).acceptClaim(0, 0)
      ).to.be.revertedWithCustomError(enbBounty, 'WrongCaller');

      await expect(
        enbBounty.connect(alice).acceptClaim(0, 0)
      ).to.not.be.reverted;
    });

    it('Should prevent issuer from claiming their own bounty', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await expect(
        enbBounty.connect(alice).createClaim(0, 'Self Claim', 'uri', 'Desc')
      ).to.be.revertedWithCustomError(enbBounty, 'IssuerCannotClaim');
    });

    it('Should prevent issuer from accepting claims on multi-participant bounty', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });
      await enbBounty.connect(eve).createClaim(0, 'Claim', 'uri', 'Desc');

      await expect(
        enbBounty.connect(alice).acceptClaim(0, 0)
      ).to.be.revertedWithCustomError(enbBounty, 'NotSoloBounty');
    });
  });

  describe('Participant Access Control', function () {
    it('Should only allow participants to vote', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });
      await enbBounty.connect(eve).createClaim(0, 'Claim', 'uri', 'Desc');
      await enbBounty.connect(eve).submitClaimForVote(0, 0);

      // Eve is not a participant, should fail
      await expect(
        enbBounty.connect(eve).voteClaim(0, true)
      ).to.be.revertedWithCustomError(enbBounty, 'NotActiveParticipant');

      // Alice is a participant (creator), should succeed
      await expect(
        enbBounty.connect(alice).voteClaim(0, true)
      ).to.not.be.reverted;
    });

    it('Should only allow participants to withdraw from open bounty', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });

      // Eve is not a participant, should revert with NotAParticipant error
      await expect(
        enbBounty.connect(eve).withdrawFromOpenBounty(0)
      ).to.be.revertedWithCustomError(enbBounty, 'NotAParticipant');

      // Bob is a participant, should succeed
      await expect(
        enbBounty.connect(bob).withdrawFromOpenBounty(0)
      ).to.not.be.reverted;
    });

    it('Should only allow claim issuer to submit for vote', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });
      await enbBounty.connect(eve).createClaim(0, 'Claim', 'uri', 'Desc');

      // Alice is not the claim issuer
      await expect(
        enbBounty.connect(alice).submitClaimForVote(0, 0)
      ).to.be.revertedWithCustomError(enbBounty, 'WrongCaller');

      // Eve is the claim issuer
      await expect(
        enbBounty.connect(eve).submitClaimForVote(0, 0)
      ).to.not.be.reverted;
    });
  });

  describe('Cross-Bounty Access Prevention', function () {
    it('Should prevent accepting claim from different bounty', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Bounty 1',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).createSoloBounty(
        'Bounty 2',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(eve).createClaim(0, 'Claim for Bounty 1', 'uri', 'Desc');

      await expect(
        enbBounty.connect(bob).acceptClaim(1, 0)
      ).to.be.revertedWithCustomError(enbBounty, 'ClaimNotFound');
    });

    it('Should prevent voting on claims from different bounties', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Bounty 1',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).createOpenBounty(
        'Bounty 2',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      // Eve creates a claim on bounty 1 and submits it for vote
      await enbBounty.connect(eve).createClaim(1, 'Claim', 'uri', 'Desc');
      await enbBounty.connect(eve).submitClaimForVote(1, 0);

      // Alice is trying to vote on bounty 1 where she's not a participant (only on bounty 0)
      await expect(
        enbBounty.connect(alice).voteClaim(1, true)
      ).to.be.revertedWithCustomError(enbBounty, 'NotActiveParticipant');
    });
  });

  describe('NFT Contract Access Control', function () {
    it('Should only allow authorized contracts to mint NFTs', async function () {
      const unauthorizedContract = await ethers.getContractFactory('ENBBounty');
      const unauthorized = await unauthorizedContract.deploy(
        await enbBountyNft.getAddress(),
        treasury.address,
        0,
        await mockToken.getAddress(),
        ethers.ZeroAddress
      );

      await unauthorized.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await expect(
        unauthorized.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc')
      ).to.be.reverted;
    });

    it('Should prevent direct NFT minting bypassing bounty contract', async function () {
      await expect(
        enbBountyNft.connect(alice).mint(alice.address, 999, 'direct-uri')
      ).to.be.reverted;
    });
  });

  describe('Voting Period Reset Access', function () {
    it('Should only allow issuer to reset voting period', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });
      await enbBounty.connect(eve).createClaim(0, 'Claim', 'uri', 'Desc');
      await enbBounty.connect(eve).submitClaimForVote(0, 0);
      
      // Wait for voting period to end
      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      // Bob is not the issuer
      await expect(
        enbBounty.connect(bob).resetVotingPeriod(0)
      ).to.be.revertedWithCustomError(enbBounty, 'WrongCaller');

      // Alice is the issuer
      await expect(
        enbBounty.connect(alice).resetVotingPeriod(0)
      ).to.not.be.reverted;
    });
  });
});
