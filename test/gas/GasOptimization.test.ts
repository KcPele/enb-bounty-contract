import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';

describe('ENBBounty - Gas Optimization Tests', function () {
  let enbBounty: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy('Mock Token', 'MTK', ethers.parseEther('1000000'));

    const ENBBounty = await ethers.getContractFactory('ENBBounty');
    enbBounty = await upgrades.deployProxy(ENBBounty, [owner.address], { kind: 'uups' });

    await enbBounty.addSupportedToken(await mockToken.getAddress(), 1);
  });

  describe('Gas Usage Measurements', function () {
    it('Should measure gas for solo bounty creation', async function () {
      const tx = await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );

      const receipt = await tx.wait();
      console.log(`Solo bounty creation gas used: ${receipt.gasUsed.toString()}`);

      expect(receipt.gasUsed).to.be.lessThan(350000);
    });

    it('Should measure gas for claim acceptance', async function () {
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
      console.log(`Claim acceptance gas used: ${receipt.gasUsed.toString()}`);

      expect(receipt.gasUsed).to.be.lessThan(200000);
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
          30,
          0,
          { value: ethers.parseEther('1') }
        );
        const receipt = await tx.wait();
        totalGasSingleWinners += receipt.gasUsed;
      }

      const multiTx = await enbBounty.connect(alice).createSoloBounty(
        'Multi Winner Bounty',
        'Description',
        3,
        30,
        0,
        { value: ethers.parseEther('3') }
      );
      const multiReceipt = await multiTx.wait();

      console.log(`Total gas for 3 single-winner bounties: ${totalGasSingleWinners.toString()}`);
      console.log(`Gas for 1 three-winner bounty: ${multiReceipt.gasUsed.toString()}`);

      expect(multiReceipt.gasUsed).to.be.lessThan(totalGasSingleWinners);
    });

    it('Should measure gas savings for batchAcceptClaims vs sequential', async function () {
      const signers = await ethers.getSigners();
      const numClaims = 5;
      const bountyAmount = ethers.parseEther('5');

      // Sequential
      await enbBounty.connect(alice).createSoloBounty(
        'Seq Bounty', 'Desc', numClaims, 30, 0, { value: bountyAmount }
      );
      let seqGas = 0n;
      for (let i = 0; i < numClaims; i++) {
        const claimer = signers[i + 4];
        const tx = await enbBounty.connect(alice).acceptClaim(0, claimer.address);
        const receipt = await tx.wait();
        seqGas += receipt.gasUsed;
      }

      // Batch
      await enbBounty.connect(alice).createSoloBounty(
        'Bat Bounty', 'Desc', numClaims, 30, 0, { value: bountyAmount }
      );
      const claimerAddresses = signers.slice(4, 4 + numClaims).map((s) => s.address);
      const batchTx = await enbBounty.connect(alice).batchAcceptClaims(1, claimerAddresses);
      const batchReceipt = await batchTx.wait();

      console.log(`Sequential (${numClaims}x acceptClaim): ${seqGas}`);
      console.log(`Batch (1x batchAcceptClaims): ${batchReceipt.gasUsed}`);
      console.log(`Gas saved: ${seqGas - batchReceipt.gasUsed}`);

      expect(batchReceipt.gasUsed).to.be.lessThan(seqGas);
    });
  });

  describe('Storage Optimization', function () {
    it('Should measure gas for getter functions with different data sizes', async function () {
      for (let i = 0; i < 15; i++) {
        await enbBounty.connect(alice).createSoloBounty(
          `Bounty ${i}`,
          `Description ${i}`,
          1,
          30,
          0,
          { value: ethers.parseEther('0.01') }
        );
      }

      const estimatedGas1 = await enbBounty.getBounties.estimateGas(0);
      const estimatedGas2 = await enbBounty.getBounties.estimateGas(10);

      console.log(`Gas for getBounties(0): ${estimatedGas1.toString()}`);
      console.log(`Gas for getBounties(10): ${estimatedGas2.toString()}`);

      const difference = estimatedGas2 > estimatedGas1 ? estimatedGas2 - estimatedGas1 : estimatedGas1 - estimatedGas2;
      expect(difference).to.be.lessThan(200000);
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
        30,
        0,
        { value: ethers.parseEther('1') }
      );
      const ethReceipt = await ethTx.wait();

      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('115'));

      const tokenTx = await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        30,
        0,
        { value: 0 }
      );
      const tokenReceipt = await tokenTx.wait();

      console.log(`ETH bounty creation gas: ${ethReceipt.gasUsed.toString()}`);
      console.log(`Token bounty creation gas: ${tokenReceipt.gasUsed.toString()}`);

      expect(tokenReceipt.gasUsed).to.be.lessThan(ethReceipt.gasUsed * 2n);
    });

    it('Should measure gas for token bounty claim acceptance', async function () {
      await mockToken.connect(alice).approve(await enbBounty.getAddress(), ethers.parseEther('115'));

      await enbBounty.connect(alice).createTokenBounty(
        'Token Bounty',
        'Description',
        1,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        30,
        0,
        { value: 0 }
      );

      const tx = await enbBounty.connect(alice).acceptClaim(0, bob.address);
      const receipt = await tx.wait();

      console.log(`Token claim acceptance gas: ${receipt.gasUsed.toString()}`);
      expect(receipt.gasUsed).to.be.lessThan(200000);
    });
  });

  describe('Cancellation Efficiency', function () {
    it('Should measure gas for bounty cancellation', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Description',
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );

      const tx = await enbBounty.connect(alice).cancelSoloBounty(0);
      const receipt = await tx.wait();

      console.log(`Bounty cancellation gas used: ${receipt.gasUsed.toString()}`);
      expect(receipt.gasUsed).to.be.lessThan(100000);
    });
  });

  describe('Memory vs Storage Trade-offs', function () {
    it('Should analyze gas cost of reading bounty data', async function () {
      await enbBounty.connect(alice).createSoloBounty(
        'Test Bounty',
        'Long Description '.repeat(50),
        1,
        30,
        0,
        { value: ethers.parseEther('1') }
      );

      const gasEstimate = await enbBounty.bounties.estimateGas(0);
      console.log(`Gas for reading bounty with long description: ${gasEstimate.toString()}`);

      expect(gasEstimate).to.be.lessThan(150000);
    });
  });
});
