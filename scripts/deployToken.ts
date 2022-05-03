import hre from "hardhat";

async function main() {
  const Loan = await hre.ethers.getContractFactory("Collateral");
  const contract = await Loan.deploy();

  await contract.deployed();

  console.log("Contract deployed to:", contract.address);
  
  await contract.mint(0)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });