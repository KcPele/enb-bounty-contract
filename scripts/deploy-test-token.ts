import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying TestToken with account:", deployer.address);

  const TestToken = await ethers.deployContract("TestToken", [
    "Test Custom Token",
    "TCT",
    ethers.parseEther("1000000"), // 1M tokens
  ]);

  await TestToken.waitForDeployment();
  const address = await TestToken.getAddress();
  console.log("TestToken deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
