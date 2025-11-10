import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Gas Optimization Tests', function () {
  let enbBounty: Contract;
  let enbBountyNft: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, charlie] = await ethers.getSigners();

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

  describe('Gas Usage Measurements', function () {
    it('Should measure gas for solo bounty creation', async function () {
      const tx = await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );
      
      const receipt = await tx.wait();
      console.log(`Solo bounty creation gas used: ${receipt.gasUsed.toString()}`);
      
      expect(receipt.gasUsed).to.be.lessThan(350000); // Updated threshold for coverage
    });

    it('Should measure gas for open bounty creation', async function () {
      const tx = await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );
      
      const receipt = await tx.wait();
      console.log(`Open bounty creation gas used: ${receipt.gasUsed.toString()}`);
      
      expect(receipt.gasUsed).to.be.lessThan(380000); // Slightly higher after schedule tracking
    });

    it('Should measure gas for claim creation', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      const tx = await enbBounty.connect(bob).createClaim(
        0,
        'Claim',
        'ipfs://uri',
        'Description'
      );
      
      const receipt = await tx.wait();
      console.log(`Claim creation gas used: ${receipt.gasUsed.toString()}`);
      
      expect(receipt.gasUsed).to.be.lessThan(400000); // Updated threshold
    });

    it('Should measure gas for claim acceptance', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc');

      const tx = await enbBounty.connect(alice).acceptClaim(0, 0);
      const receipt = await tx.wait();
      console.log(`Claim acceptance gas used: ${receipt.gasUsed.toString()}`);
      
      expect(receipt.gasUsed).to.be.lessThan(350000); // Updated threshold for coverage
    });

    it('Should measure gas for voting operations', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });
      
      // Get the current claim counter
      const claimsBefore = await enbBounty.getClaimsLength();
      
      await enbBounty.connect(charlie).createClaim(0, 'Claim', 'uri', 'Desc');
      
      // Use the actual claim ID
      const claimId = claimsBefore;
      await enbBounty.connect(charlie).submitClaimForVote(0, claimId);

      const tx = await enbBounty.connect(alice).voteClaim(0, true);
      const receipt = await tx.wait();
      console.log(`Vote submission gas used: ${receipt.gasUsed.toString()}`);
      
      expect(receipt.gasUsed).to.be.lessThan(150000); // Updated threshold
    });

    it('Should measure gas for vote resolution', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });
      
      // Get the current claim counter
      const claimsBefore = await enbBounty.getClaimsLength();
      
      await enbBounty.connect(charlie).createClaim(0, 'Claim', 'uri', 'Desc');
      
      // Use the actual claim ID
      const claimId = claimsBefore;
      await enbBounty.connect(charlie).submitClaimForVote(0, claimId);

      await enbBounty.connect(alice).voteClaim(0, true);
      await enbBounty.connect(bob).voteClaim(0, true);

      await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);

      const tx = await enbBounty.resolveVote(0);
      const receipt = await tx.wait();
      console.log(`Vote resolution gas used: ${receipt.gasUsed.toString()}`);
      
      expect(receipt.gasUsed).to.be.lessThan(350000); // Updated threshold for coverage
    });
  });

  describe('Batch Operations Efficiency', function () {
    it('Should compare gas costs for multiple single winners vs one multi-winner bounty', async function () {
      let totalGasSingleWinners = 0n;

      for (let i = 0; i < 3; i++) {
        const tx = await enbBounty.connect(alice).createSoloBounty(
          `Bounty ${i}`,
          'Description',
          1,
          { value: ethers.parseEther('1') }
        );
        const receipt = await tx.wait();
        totalGasSingleWinners += receipt.gasUsed;
      }

      const multiTx = await enbBounty.connect(alice).createSoloBounty(
        'Multi Winner Bounty',
        'Description',
        3,
        { value: ethers.parseEther('3') }
      );
      const multiReceipt = await multiTx.wait();

      console.log(`Total gas for 3 single-winner bounties: ${totalGasSingleWinners.toString()}`);
      console.log(`Gas for 1 three-winner bounty: ${multiReceipt.gasUsed.toString()}`);

      expect(multiReceipt.gasUsed).to.be.lessThan(totalGasSingleWinners);
    });

    it('Should measure gas for bulk participant joining', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('0.1') }
      );

      const participants = [bob, charlie];
      let totalGas = 0n;

      for (const participant of participants) {
        const tx = await enbBounty.connect(participant).joinOpenBounty(
          0,
          { value: ethers.parseEther('0.1') }
        );
        const receipt = await tx.wait();
        totalGas += receipt.gasUsed;
      }

      console.log(`Average gas per participant join: ${(totalGas / 2n).toString()}`);
      expect(totalGas / 2n).to.be.lessThan(150000); // Updated threshold
    });
  });

  describe('Storage Optimization', function () {
    it('Should efficiently handle large participant arrays', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Large Participant Bounty',
        'Description',
        1,
        { value: ethers.parseEther('0.01') }
      );

      const gasUsages = [];
      
      for (let i = 0; i < 5; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
        await alice.sendTransaction({ to: wallet.address, value: ethers.parseEther('0.1') });
        
        const tx = await enbBounty.connect(wallet).joinOpenBounty(
          0,
          { value: ethers.parseEther('0.001') }
        );
        const receipt = await tx.wait();
        gasUsages.push(receipt.gasUsed);
      }

      const avgFirstTwo = (gasUsages[0] + gasUsages[1]) / 2n;
      const avgLastTwo = (gasUsages[3] + gasUsages[4]) / 2n;
      
      console.log(`First participants avg gas: ${avgFirstTwo.toString()}`);
      console.log(`Later participants avg gas: ${avgLastTwo.toString()}`);

      const gasIncrease = ((avgLastTwo - avgFirstTwo) * 100n) / avgFirstTwo;
      expect(gasIncrease).to.be.lessThan(50);
    });

    it('Should measure gas for getter functions with different data sizes', async function () {
      for (let i = 0; i < 15; i++) {
        await enbBounty.connect(alice).createSoloBounty(
          `Bounty ${i}`,
          `Description ${i}`,
          1,
          { value: ethers.parseEther('0.01') }
        );
      }

      const estimatedGas1 = await enbBounty.getBounties.estimateGas(0);
      const estimatedGas2 = await enbBounty.getBounties.estimateGas(10);
      
      console.log(`Gas for getBounties(0): ${estimatedGas1.toString()}`);
      console.log(`Gas for getBounties(10): ${estimatedGas2.toString()}`);

      const difference = estimatedGas2 > estimatedGas1 ? estimatedGas2 - estimatedGas1 : estimatedGas1 - estimatedGas2;
      expect(difference).to.be.lessThan(200000); // Updated threshold
    });
  });

  describe('Token Transfer Optimization', function () {
    beforeEach(async function () {
      await mockToken.transfer(alice.address, ethers.parseEther('10000'));
      await mockToken.transfer(bob.address, ethers.parseEther('10000'));
    });

    it('Should compare gas for ETH vs token bounties', async function () {
      const ethTx = await enbBounty.connect(alice).createSoloBounty(
        'ETH Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );
      const ethReceipt = await ethTx.wait();

      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));
      
      const tokenTx = await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        { value: 0 }
      );
      const tokenReceipt = await tokenTx.wait();

      console.log(`ETH bounty creation gas: ${ethReceipt.gasUsed.toString()}`);
      console.log(`Token bounty creation gas: ${tokenReceipt.gasUsed.toString()}`);

      expect(tokenReceipt.gasUsed).to.be.lessThan(ethReceipt.gasUsed * 2n);
    });

    it('Should measure gas for token bounty claim acceptance', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('100'));
      
      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        { value: 0 }
      );

      await enbBounty.connect(bob).createClaim(0, 'Claim', 'uri', 'Desc');

      const tx = await enbBounty.connect(alice).acceptClaim(0, 0);
      const receipt = await tx.wait();
      
      console.log(`Token claim acceptance gas: ${receipt.gasUsed.toString()}`);
      expect(receipt.gasUsed).to.be.lessThan(350000); // Updated threshold for coverage
    });
  });

  describe('Withdrawal Operations Efficiency', function () {
    it('Should measure gas for participant withdrawal', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });
      await enbBounty.connect(charlie).joinOpenBounty(0, { value: ethers.parseEther('0.3') });

      const tx = await enbBounty.connect(bob).withdrawFromOpenBounty(0);
      const receipt = await tx.wait();
      
      console.log(`Withdrawal gas used: ${receipt.gasUsed.toString()}`);
      expect(receipt.gasUsed).to.be.lessThan(100000);
    });

    it('Should measure gas for bounty cancellation', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      const tx = await enbBounty.connect(alice).cancelSoloBounty(0);
      const receipt = await tx.wait();
      
      console.log(`Bounty cancellation gas used: ${receipt.gasUsed.toString()}`);
      expect(receipt.gasUsed).to.be.lessThan(100000); // Updated threshold
    });

    it('Should compare gas for cancelling open bounty with multiple participants', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      await enbBounty.connect(bob).joinOpenBounty(0, { value: ethers.parseEther('0.5') });
      await enbBounty.connect(charlie).joinOpenBounty(0, { value: ethers.parseEther('0.3') });

      const tx = await enbBounty.connect(alice).cancelOpenBounty(0);
      const receipt = await tx.wait();
      
      console.log(`Open bounty cancellation with 3 participants gas: ${receipt.gasUsed.toString()}`);
      expect(receipt.gasUsed).to.be.lessThan(250000); // Updated threshold
    });
  });

  describe('Memory vs Storage Trade-offs', function () {
    it('Should analyze gas cost of reading bounty data', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Long Description '.repeat(50),
        1,
        { value: ethers.parseEther('1') }
      );

      const gasEstimate = await enbBounty.bounties.estimateGas(0);
      console.log(`Gas for reading bounty with long description: ${gasEstimate.toString()}`);
      
      expect(gasEstimate).to.be.lessThan(150000); // Updated threshold
    });

    it('Should measure gas for different getter patterns', async function () {
      await enbBounty.connect(alice).createOpenBounty(
        'Open Bounty',
        'Description',
        1,
        { value: ethers.parseEther('1') }
      );

      for (let i = 0; i < 5; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
        await alice.sendTransaction({ to: wallet.address, value: ethers.parseEther('0.1') });
        await enbBounty.connect(wallet).joinOpenBounty(0, { value: ethers.parseEther('0.01') });
      }

      const participantsGas = await enbBounty.getParticipants.estimateGas(0);
      const directAccessGas = await enbBounty.participants.estimateGas(0, 0);
      
      console.log(`Gas for getParticipants(): ${participantsGas.toString()}`);
      console.log(`Gas for direct participant access: ${directAccessGas.toString()}`);
      
      expect(directAccessGas).to.be.lessThan(participantsGas);
    });
  });
});
