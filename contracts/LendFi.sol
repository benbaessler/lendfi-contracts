// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "hardhat/console.sol";

contract LendFi {

  event SubmitLoan(
    uint256 indexed id,
    address indexed lender,
    address indexed borrower,
    uint256 amount,
    uint256 interest,
    Token collateral,
    uint256 deadline
  );

  event ConfirmLender(uint256 indexed id, address indexed lender);
  event ConfirmBorrower(uint256 indexed id, address indexed borrower);

  event ActivateLoan(uint256 indexed id);

  event RevokeConfirmation(uint256 indexed id, address indexed revoker);

  event ExecuteLoan(uint256 indexed id, bool paidBack);

  struct Token {
    address contractAddress;
    uint256 tokenId;
  } 

  struct Loan {
    uint256 id;
    address payable lender;
    address payable borrower;
    uint256 amount;
    uint256 interest;
    Token collateral;
    uint256 deadline;
    bool lenderConfirmed;
    bool borrowerConfirmed;
    bool active;
    bool executed;
    bool loanPaid;
    bool collateralClaimed;
  }

  Loan[] private loans;

  mapping(address => uint256[]) public userLoans;

  modifier loanExists(uint256 _id) {
    require(_id < loans.length, "This loan does not exist");
    _;
  }

  modifier notActive(uint256 _id) {
    require(!loans[_id].active, "This loan is already active");
    _;
  }

  modifier notExecuted(uint256 _id) {
    require(!loans[_id].executed, "This loan was already executed");
    _;
  }

  modifier notExpired(uint256 _id) {
    require(loans[_id].deadline >= block.timestamp, "This loans deadline is exceeded");
    _;
  }

  modifier isExpired(uint256 _id) {
    require(loans[_id].deadline <= block.timestamp, "This loans is not expired");
    _;
  }

  modifier isActive(uint256 _id) {
    require(loans[_id].active, "This loan is not active");
    _;
  }

  modifier isLender(uint256 _id) {
    require(loans[_id].lender == msg.sender, "You are not the lender of this loan");
    _;
  }


  modifier isBorrower(uint256 _id) {
    require(loans[_id].borrower == msg.sender, "You are not the borrower of this loan");
    _;
  }

  modifier isParticipant(uint256 _id) {
    require(loans[_id].lender == msg.sender || loans[_id].borrower == msg.sender, "You are not participating in this loan");
    _;
  }

  function submitLoan(address payable _lender, address payable _borrower, uint256 _amount, uint256 _interest, Token memory _collateral, uint256 _deadline) public {
    require(_deadline > block.timestamp, "Deadline can not be in the past");
    require(_lender.balance > _amount, "Lender has insufficient funds");
    require(_lender != _borrower, "The lender and borrower can not be the same");

    uint256 _id = loans.length;
    Loan memory loan = Loan({
      id: _id,
      lender: _lender,
      borrower: _borrower,
      amount: _amount,
      interest: _interest,
      collateral: _collateral,
      deadline: _deadline,
      lenderConfirmed: false,
      borrowerConfirmed: false,
      active: false,
      executed: false,
      loanPaid: false,
      collateralClaimed: false
    });

    loans.push(loan);

    // Add loan to participants userLoans
    userLoans[_lender].push(_id);
    userLoans[_borrower].push(_id);

    emit SubmitLoan(_id, _lender, _borrower, _amount, _interest, _collateral, _deadline);
  }

  function confirmLender(uint256 _id) external payable loanExists(_id) notActive(_id) notExecuted(_id) isLender(_id) notExpired(_id) {
    Loan storage loan = loans[_id];
    require(!loan.lenderConfirmed, "You already confirmed this loan");
    require(msg.value == loan.amount, "Please send the amount you agreed to loaning out");

    loan.lenderConfirmed = true;

    // Activating loan
    if (loan.lenderConfirmed && loan.borrowerConfirmed) activateLoan(_id);

    emit ConfirmLender(_id, msg.sender);
  }

  function confirmBorrower(uint256 _id) public loanExists(_id) notActive(_id) notExecuted(_id) isBorrower(_id) notExpired(_id) {
    Loan storage loan = loans[_id];
    require(!loan.borrowerConfirmed, "You already confirmed this loan");
    
    IERC721 collateral = IERC721(loan.collateral.contractAddress);
    require(collateral.isApprovedForAll(msg.sender, address(this)), "Token is not approved for this contract");

    collateral.transferFrom(msg.sender, address(this), loan.collateral.tokenId);

    loan.borrowerConfirmed = true;

    // Activating loan
    if (loan.lenderConfirmed && loan.borrowerConfirmed) activateLoan(_id);

    emit ConfirmBorrower(_id, msg.sender);
  }

  function activateLoan(uint256 _id) private loanExists(_id) notExecuted(_id) notActive(_id) {
    Loan storage loan = loans[_id];
    require(loan.lenderConfirmed && loan.borrowerConfirmed, "Loan is unconfirmed");

    bool transfer = loan.borrower.send(loan.amount);
    require(transfer, "Something went wrong with the payment");

    loan.active = true;
    emit ActivateLoan(_id);
  }

  function paybackLoan(uint256 _id) public payable loanExists(_id) isActive(_id) notExecuted(_id) isBorrower(_id) notExpired(_id) {
    Loan storage loan = loans[_id];
    // Adding interest + 0.05% fee
    uint256 paybackAmount = loan.amount + loan.interest;

    require(msg.value == paybackAmount, "Please pay back the exact amount you owe");

    bool loanPaid = loan.lender.send(paybackAmount);
    require(loanPaid, "Something went wrong with the payment");

    IERC721 collateral = IERC721(loan.collateral.contractAddress);
    collateral.transferFrom(address(this), loan.borrower, loan.collateral.tokenId);

    loan.active = false;
    loan.executed = true;
    loan.loanPaid = true;

    emit ExecuteLoan(_id, true);
  }

  function claimCollateral(uint256 _id) public loanExists(_id) isActive(_id) notExecuted(_id) isLender(_id) {
    Loan storage loan = loans[_id];
    require(block.timestamp >= loan.deadline, "Deadline not reached");

    IERC721 collateral = IERC721(loan.collateral.contractAddress);
    collateral.transferFrom(address(this), loan.lender, loan.collateral.tokenId);

    loan.active = false;
    loan.executed = true;
    loan.collateralClaimed = true;

    emit ExecuteLoan(_id, false);
  }

  function extendDeadline(uint256 _id, uint256 _newDeadline) public loanExists(_id) notExecuted(_id) isLender(_id) {
    Loan storage loan = loans[_id];
    require(_newDeadline > loan.deadline, "You can not shorten the deadline");

    loan.deadline = _newDeadline;
  }

  // If the loan expires with only one confirmation, the confirmer can claim the assets they transferred
  function loanExpired(uint256 _id) public loanExists(_id) isParticipant(_id) notActive(_id) notExecuted(_id) isExpired(_id) {
    Loan storage loan = loans[_id];
    require(loan.lender == msg.sender && loan.lenderConfirmed || loan.borrower == msg.sender && loan.borrowerConfirmed, "You have not confirmed this loan");

    // If the caller is the lender, they will get their loan deposit back
    if (loan.lender == msg.sender && loan.lenderConfirmed) {
      bool transfer = loan.lender.send(loan.amount + loan.amount / 100);
      require(transfer, "Something went wrong with the transfer");
      loan.lenderConfirmed = false;
    }

    // If the caller is the borrower, they will get their Collateral NFT back
    if (loan.borrower == msg.sender && loan.borrowerConfirmed) {
      IERC721 collateral = IERC721(loan.collateral.contractAddress);
      collateral.transferFrom(address(this), loan.borrower, loan.collateral.tokenId);
      loan.borrowerConfirmed = false;
    }
  }

  // Getters
  function getLoan(uint256 _id) public view loanExists(_id) returns (Loan memory) {
    return loans[_id];
  }

  function getSenderLoans() public view returns(Loan[] memory) {
    uint256[] memory loanIds = userLoans[msg.sender];
    Loan[] memory result = new Loan[](loanIds.length);

    for (uint256 i = 0; i < loanIds.length; i++) {
      result[i] = loans[loanIds[i]];
    }

    return result;
  }

}