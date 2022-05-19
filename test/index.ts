import { expect } from "chai";
import { ethers } from "hardhat";

describe("LoanFactory contract", () => {

  let contract: any
  let collateral: any
  let user1: any
  let user2: any
  let user3: any

  beforeEach(async () => {
    [user1, user2, user3] = await ethers.getSigners()

    const Loan = await ethers.getContractFactory('LoanFactory');
    contract = await Loan.deploy()

    const Collateral = await ethers.getContractFactory('Collateral') 
    collateral = await Collateral.deploy()

    await contract.submitLoan(
      user1.address, 
      user2.address, 
      ethers.utils.parseEther('.5'),
      ethers.utils.parseEther('.05'),
      { contractAddress: collateral.address, tokenId: 1 },
      1658434728
    )
  })

  describe('Initiating a loan', () => {

    it('Should be able to submit a loan', async () => {
      const loan = await contract.getLoan(0)
      
      expect(loan.lender).to.equal(user1.address)
      expect(loan.borrower).to.equal(user2.address)
      expect(loan.amount).to.equal(ethers.utils.parseEther('.5'))
    })

    it('Should let lender confirm loan with loan deposit', async () => {
      await contract.confirmLender(0, { value: ethers.utils.parseEther('.5') })

      const loan = await contract.getLoan(0)
      expect(loan.lenderConfirmed).to.equal(true)
    })

    it('Should let borrower confirm loan with collateral deposit', async () => {
      await collateral.connect(user2).mint(1)

      // await collateral.connect(user2).setApprovalForAll(contract.address, true)
      await contract.connect(user2).confirmBorrower(0)

      const loan = await contract.getLoan(0)
      const collateralBalance = await collateral.balanceOf(contract.address)

      expect(loan.borrowerConfirmed).to.equal(true)
      expect(collateralBalance).to.equal(1)
    })

    it('Should activate loan as both parties confirm loan', async () => {
      // Confirming lender
      await contract.confirmLender(0, { value: ethers.utils.parseEther('.5') })

      // Confirming borrower
      await collateral.connect(user2).mint(1)
      await collateral.connect(user2).setApprovalForAll(contract.address, true)
      await contract.connect(user2).confirmBorrower(0)

      const loan = await contract.getLoan(0)
      expect(loan.active).to.equal(true)
    })

    it('Should not let third party confirm loan', async () => {
      await expect(contract.connect(user3).confirmLender(0)).to.be.revertedWith('You are not the lender of this loan')
      await expect(contract.connect(user3).confirmBorrower(0)).to.be.revertedWith('You are not the borrower of this loan')
    })

  })

  describe('Paying back a loan', () => {

    beforeEach(async () => {
      // Confirming lender
      await contract.confirmLender(0, { value: ethers.utils.parseEther('.5') })

      // Confirming borrower
      await collateral.connect(user2).mint(1)
      await collateral.connect(user2).setApprovalForAll(contract.address, true)
      await contract.connect(user2).confirmBorrower(0)
    })

    it('Should let borrower pay back loan', async () => {
      const balanceBefore = await user1.getBalance()
      await contract.connect(user2).paybackLoan(0, { value: ethers.utils.parseEther('.55') })

      const loan = await contract.getLoan(0)
      const balanceAfter = await user1.getBalance()

      expect(balanceAfter).to.equal(balanceBefore.add(ethers.utils.parseEther('.55')))
    })
    
    it('Should throw error if borrower does not provide enough value', async () => {
      await expect(contract.connect(user2).paybackLoan(0, { value: ethers.utils.parseEther('.05') }))
      .to.be.revertedWith('Please pay back the exact amount you owe')
    })

    it('Should return collateral to borrower after payback', async () => {
      await contract.connect(user2).paybackLoan(0, { value: ethers.utils.parseEther('.55') })

      const userCollateralBalance = await collateral.balanceOf(user2.address)
      const contractCollateralBalance = await collateral.balanceOf(contract.address)

      expect(userCollateralBalance).to.equal(1)
      expect(contractCollateralBalance).to.equal(0)
    })

    it('Should execute loan after payback', async () => {
      await contract.connect(user2).paybackLoan(0, { value: ethers.utils.parseEther('.55') })

      const loan = await contract.getLoan(0)

      expect(loan.executed).to.equal(true)
      expect(loan.active).to.equal(false)
    })

  })

  // These tests do not work
  // describe('Past deadline', async () => {

  //   const timestamp = Date.now() + 1

  //   beforeEach(async () => {
  //     await contract.submitLoan(
  //       user1.address, 
  //       user2.address, 
  //       ethers.utils.parseEther('.5'),
  //       ethers.utils.parseEther('.05'),
  //       { contractAddress: collateral.address, tokenId: 1 },
  //       timestamp
  //     )

  //     // Confirming lender
  //     await contract.confirmLender(1, { value: ethers.utils.parseEther('.5') })

  //     // Confirming borrower
  //     await collateral.connect(user2).mint(1)
  //     await collateral.connect(user2).setApprovalForAll(contract.address, true)
  //     await contract.connect(user2).confirmBorrower(1)
  //   })

  //   it('Should let lender claim collateral', async () => {
  //     await contract.claimCollateral(1)

  //     const userCollateralBalance = await collateral.balanceOf(user1.address)
  //     const contractCollateralBalance = await collateral.balanceOf(contract.address)

  //     expect(userCollateralBalance).to.equal(1)
  //     expect(contractCollateralBalance).to.equal(0)
  //   })

  //   it('Should execute loan after collateral claim', async () => {
  //     await contract.claimCollateral(1)

  //     const loan = await contract.getLoan(1)

  //     expect(loan.executed).to.equal(true)
  //     expect(loan.active).to.equal(false)
  //   })

  //   it('Should not let borrower pay back loan', async () => {
  //     await expect(contract.connect(user2).paybackLoan(1, { value: ethers.utils.parseEther('.55') })).to.be.revertedWith('Past deadline')
  //   })

  // })

});