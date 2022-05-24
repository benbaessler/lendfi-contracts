import { expect } from "chai";
import { ethers } from "hardhat";
import { describe } from "mocha";

describe("LendFi contract", () => {

  let contract: any
  let collateral: any
  let user1: any
  let user2: any
  let user3: any
  let snapshot: any

  beforeEach(async () => {
    [user1, user2, user3] = await ethers.getSigners()

    // Initializing LendFi contract
    const LendFi = await ethers.getContractFactory('LendFi');
    contract = await LendFi.deploy()

    // Initializing Test Collateral NFT (ERC-721)
    const Collateral = await ethers.getContractFactory('Collateral') 
    collateral = await Collateral.deploy() 
    
    // Submitting a test loan
    await contract.submitLoan(
      user1.address, 
      user2.address, 
      ethers.utils.parseEther('.5'),
      ethers.utils.parseEther('.05'),
      { contractAddress: collateral.address, tokenId: 1 },
      Math.floor(Date.now() / 1000 + 1000)
    )
  })

  describe('Initializing a loan', () => {
    it('Should be able to submit a loan', async () => {
      await contract.submitLoan(
        user1.address, 
        user2.address, 
        ethers.utils.parseEther('.5'),
        ethers.utils.parseEther('.05'),
        { contractAddress: collateral.address, tokenId: 1 },
        Math.floor(Date.now() / 1000 + 1000)
      )

      const loan = await contract.getLoan(0)
      
      // Checking loan details
      expect(loan.lender).to.equal(user1.address)
      expect(loan.borrower).to.equal(user2.address)
      expect(loan.amount).to.equal(ethers.utils.parseEther('.5'))
    })

    it('Should not be able to submit a loan with a deadline in the past', async () => {
      await expect(contract.submitLoan(
        user1.address, 
        user2.address, 
        ethers.utils.parseEther('.5'),
        ethers.utils.parseEther('.05'),
        { contractAddress: collateral.address, tokenId: 1 },
        Math.floor(Date.now() / 1000 - 1000)
      )).to.be.revertedWith('Deadline can not be in the past')
    })

    it('Should not be able to submit a loan if the lender has insufficient funds', async () => {
      const balance = await user1.getBalance()
      await user1.sendTransaction({ to: user2.address, value: balance.sub(ethers.utils.parseEther('.5'))})

      await expect(contract.submitLoan(
        user1.address, 
        user2.address, 
        ethers.utils.parseEther('1'),
        ethers.utils.parseEther('.05'),
        { contractAddress: collateral.address, tokenId: 1 },
        Math.floor(Date.now() / 1000 + 1000)
      )).to.be.reverted

      await user2.sendTransaction({ to: user1.address, value: balance.sub(ethers.utils.parseEther('.5'))})
    })

    it('Should not be able to submit a loan if both parties are the same', async () => {
      await expect(contract.submitLoan(
        user1.address, 
        user1.address, 
        ethers.utils.parseEther('.5'),
        ethers.utils.parseEther('.05'),
        { contractAddress: collateral.address, tokenId: 1 },
        Math.floor(Date.now() / 1000 + 1000)
      )).to.be.revertedWith('The lender and borrower can not be the same')
    })
  })

  describe('Confirming a loan', async () => {
    beforeEach(async () => {
      await contract.submitLoan(
        user1.address, 
        user2.address, 
        ethers.utils.parseEther('.5'),
        ethers.utils.parseEther('.05'),
        { contractAddress: collateral.address, tokenId: 1 },
        Math.floor(Date.now() / 1000 + 1000)
      )
    })

    it('Should let lender confirm loan with loan deposit', async () => {
      await contract.confirmLender(0, { value: ethers.utils.parseEther('.5') })

      const loan = await contract.getLoan(0)
      expect(loan.lenderConfirmed).to.equal(true)
    })

    it('Should not let lender confirm loan if they do not send enough ETH', async () => {
      await expect(
        contract.confirmLender(0, { value: ethers.utils.parseEther('.25') })
      ).to.be.revertedWith('Please send the amount you agreed to loaning out')
    })

    it('Should let borrower confirm loan with collateral deposit', async () => {
      // Minting test collateral NFT
      await collateral.connect(user2).mint(1)

      // Approving & confirming transfer of collateral
      await collateral.connect(user2).setApprovalForAll(contract.address, true)
      await contract.connect(user2).confirmBorrower(0)

      const loan = await contract.getLoan(0)
      const collateralBalance = await collateral.balanceOf(contract.address)

      expect(loan.borrowerConfirmed).to.equal(true)
      expect(collateralBalance).to.equal(1)
    })

    it('Should revert borrower confirmation if collateral is not approved for the contract', async () => {
      await collateral.connect(user2).mint(1)

      await expect(
        contract.connect(user2).confirmBorrower(0)
      ).to.be.revertedWith('Token is not approved for this contract')
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

    it('Should transfer assets to borrower on activate loan', async () => {
      const balanceBefore = await user2.getBalance()

      await contract.confirmLender(0, { value: ethers.utils.parseEther('.5') })
      await collateral.connect(user2).mint(1)
      await collateral.connect(user2).setApprovalForAll(contract.address, true)
      await contract.connect(user2).confirmBorrower(0)

      const balanceAfter = await user2.getBalance()
      expect(Number(balanceAfter)).to.be.greaterThan(Number(balanceBefore.add(ethers.utils.parseEther('.499'))))
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

      const balanceAfter = await user1.getBalance()
      expect(balanceAfter).to.equal(balanceBefore.add(ethers.utils.parseEther('.55')))
    })

    it('Should execute loan when it is paid', async () => {
      await contract.connect(user2).paybackLoan(0, { value: ethers.utils.parseEther('.55') })
      const loan = await contract.getLoan(0)

      expect(loan.active).to.equal(false)
      expect(loan.executed).to.equal(true)
      expect(loan.loanPaid).to.equal(true)
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

  describe('Claiming collateral', async () => {
    it('Should let lender claim the collateral', async () => {
      // Activating loan
      await contract.confirmLender(0, { value: ethers.utils.parseEther('.5') })
      await collateral.connect(user2).mint(1)
      await collateral.connect(user2).setApprovalForAll(contract.address, true)
      await contract.connect(user2).confirmBorrower(0)      

      snapshot = await ethers.provider.send('evm_snapshot', [])
      await ethers.provider.send('evm_increaseTime', [2000])
      await contract.claimCollateral(0)

      const loan = await contract.getLoan(0)
      const collateralBalance = await collateral.balanceOf(user1.address)

      expect(loan.collateralClaimed).to.equal(true)
      expect(collateralBalance).to.equal(1)

      await ethers.provider.send('evm_revert', [snapshot])
    })

    it('Should not let lender claim collateral if the loan is not expired', async () => {
      await contract.confirmLender(0, { value: ethers.utils.parseEther('.5') })
      await collateral.connect(user2).mint(1)
      await collateral.connect(user2).setApprovalForAll(contract.address, true)
      await contract.connect(user2).confirmBorrower(0)

      await expect(
        contract.claimCollateral(0)
      ).to.be.revertedWith('This loan is not expired')
    })

    it('Should not let lender claim collateral if the loan is not active', async () => {
      snapshot = await ethers.provider.send('evm_snapshot', [])
      await ethers.provider.send('evm_increaseTime', [2000])

      await expect(
        contract.claimCollateral(0)
      ).to.be.revertedWith('This loan is not active')

      await ethers.provider.send('evm_revert', [snapshot])
    })
  })

  describe('Extending the deadline', async () => {
    beforeEach(async () => {
      // Activating loan
      await contract.confirmLender(0, { value: ethers.utils.parseEther('.5') })
      await collateral.connect(user2).mint(1)
      await collateral.connect(user2).setApprovalForAll(contract.address, true)
      await contract.connect(user2).confirmBorrower(0)
    })

    it('Should let lender extend the deadline', async () => {
      await contract.extendDeadline(0, Math.floor(Date.now() / 1000 + 2000))

      const loan = await contract.getLoan(0)
      expect(loan.deadline).to.equal(Math.floor(Date.now() / 1000 + 2000))
    })

    it('Should not let borrower extend the deadline', async () => {
      await expect(
        contract.connect(user2).extendDeadline(0, Math.floor(Date.now() / 1000 + 2000))
      ).to.be.revertedWith('You are not the lender of this loan')
    })

    it('Should not let third party extend the deadline', async () => {
      await expect(
        contract.connect(user3).extendDeadline(0, Math.floor(Date.now() / 1000 + 2000))
      ).to.be.revertedWith('You are not the lender of this loan')
    })

    it('Should not let lender shorten the deadline', async () => {
      await expect(
        contract.extendDeadline(0, Math.floor(Date.now() / 1000 + 500))
      ).to.be.revertedWith('You can not shorten the deadline')
    })

    it('Should not let lender extend the deadline if the loan is executed', async () => {
      await contract.connect(user2).paybackLoan(0, { value: ethers.utils.parseEther('.55')})
      await expect(
        contract.extendDeadline(0, Math.floor(Date.now() / 1000 + 2000))
      ).to.be.revertedWith('This loan was already executed')
    })
  })

  describe('Unconfirmed expired loan', async () => {
    it('Should let the lender claim their assets', async () => {
      await contract.confirmLender(0, { value: ethers.utils.parseEther('.5') })

      snapshot = await ethers.provider.send('evm_snapshot', [])
      await ethers.provider.send('evm_increaseTime', [2000])

      const balanceBefore = await user1.getBalance()
      await contract.revokeConfirmation(0)

      const loan = await contract.getLoan(0)
      const balanceAfter = await user1.getBalance()

      expect(loan.lenderConfirmed).to.be.false
      expect(Number(balanceAfter)).to.be.greaterThan(Number(balanceBefore.add(ethers.utils.parseEther('.499'))))

      await ethers.provider.send('evm_revert', [snapshot])
    })

    it('Should let borrower claim their assets', async () => {
      // Confirming borrower
      await collateral.connect(user2).mint(1)
      await collateral.connect(user2).setApprovalForAll(contract.address, true)
      await contract.connect(user2).confirmBorrower(0)
  
      snapshot = await ethers.provider.send('evm_snapshot', [])
      await ethers.provider.send('evm_increaseTime', [2000])
  
      await contract.connect(user2).revokeConfirmation(0)
      const loan = await contract.getLoan(0)
      const collateralBalance = await collateral.balanceOf(user2.address)
  
      expect(loan.borrowerConfirmed).to.be.false
      expect(collateralBalance).to.equal(1)

      await ethers.provider.send('evm_revert', [snapshot])
    })

    it('Should revert if the loan is not expired', async () => {
      await contract.confirmLender(0, { value: ethers.utils.parseEther('.5') })
      await expect(
        contract.revokeConfirmation(0)
      ).to.be.revertedWith('This loan is not expired')
    })

    it('Should revert if the loan is active', async () => {
      await contract.confirmLender(0, { value: ethers.utils.parseEther('.5') })
      await collateral.connect(user2).mint(1)
      await collateral.connect(user2).setApprovalForAll(contract.address, true)
      await contract.connect(user2).confirmBorrower(0)

      snapshot = await ethers.provider.send('evm_snapshot', [])
      await ethers.provider.send('evm_increaseTime', [2000])

      await expect(
        contract.revokeConfirmation(0)
      ).to.be.revertedWith('This loan is already active')

      await ethers.provider.send('evm_revert', [snapshot])
    })
  })  
});