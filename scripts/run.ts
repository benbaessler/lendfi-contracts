const hre = require("hardhat");
const { providers } = require('ethers')

async function main() {
  const Loan = await hre.ethers.getContractFactory("LoanFactory");
  const contract = await Loan.deploy();

  await contract.deployed();

  console.log("Contract deployed to:", contract.address);

  const provider = providers.getDefaultProvider()
  const [user1, user2] = await hre.ethers.getSigners()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
