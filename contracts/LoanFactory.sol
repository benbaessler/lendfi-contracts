// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "hardhat/console.sol";

contract LoanFactory {

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
    address payable lender;
    address borrower;
    uint256 amount;
    uint256 interest;
    Token collateral;
    uint256 deadline;
    bool lenderConfirmed;
    bool borrowerConfirmed;
    bool active;
    bool executed;
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

  modifier deadlineAhead(uint256 _id) {
    require(loans[_id].deadline >= block.timestamp, "This loans deadline is exceeded");
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

//   Without userLoans: 209829 gas

  function submitLoan(address payable _lender, address _borrower, uint256 _amount, uint256 _interest, Token memory _collateral, uint256 _deadline) public returns (uint256) {
    // Uncomment after tests are done
    // require(_deadline > block.timestamp, "Deadline can not be in the past");

    uint256 id = loans.length;
    Loan memory loan = Loan({
      lender: _lender,
      borrower: _borrower,
      amount: _amount,
      interest: _interest,
      collateral: _collateral,
      deadline: _deadline,
      lenderConfirmed: false,
      borrowerConfirmed: false,
      active: false,
      executed: false
    });

    loans.push(loan);

    // Add loan to participants userLoans
    userLoans[_lender].push(id);
    userLoans[_borrower].push(id);

    emit SubmitLoan(id, _lender, _borrower, _amount, _interest, _collateral, _deadline);

    return id;
  }

  function confirmLender(uint256 _id) external payable loanExists(_id) notActive(_id) notExecuted(_id) isLender(_id) deadlineAhead(_id) {
    Loan storage loan = loans[_id];

    require(!loan.lenderConfirmed, "You already confirmed this loan");
    require(msg.value == loan.amount, "Please send the amount you agreed to loaning out");

    loan.lenderConfirmed = true;

    // Activating loan
    if (loan.lenderConfirmed && loan.borrowerConfirmed) activateLoan(_id);

    emit ConfirmLender(_id, msg.sender);
  }

  function confirmBorrower(uint256 _id) public loanExists(_id) notActive(_id) notExecuted(_id) isBorrower(_id) deadlineAhead(_id) {
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

    loan.active = true;
    emit ActivateLoan(_id);
  }

  function paybackLoan(uint256 _id) public payable loanExists(_id) isActive(_id) notExecuted(_id) isBorrower(_id) deadlineAhead(_id) {
    Loan storage loan = loans[_id];
    require(msg.value == loan.amount + loan.interest, "Please pay back the exact amount you owe");

    bool loanPaid = loan.lender.send(msg.value);
    require(loanPaid, "Something went wrong with the payment");

    IERC721 collateral = IERC721(loan.collateral.contractAddress);
    collateral.transferFrom(address(this), loan.borrower, loan.collateral.tokenId);

    loan.active = false;
    loan.executed = true;

    emit ExecuteLoan(_id, true);
  }

  function claimCollateral(uint256 _id) public loanExists(_id) isActive(_id) notExecuted(_id) isLender(_id) {
    Loan storage loan = loans[_id];
    require(block.timestamp >= loan.deadline, "Deadline not reached");

    IERC721 collateral = IERC721(loan.collateral.contractAddress);
    collateral.transferFrom(address(this), loan.lender, loan.collateral.tokenId);

    loan.active = false;
    loan.executed = true;

    emit ExecuteLoan(_id, false);
  }

  function extendDeadline(uint256 _id, uint256 _newDeadline) public loanExists(_id) notExecuted(_id) isLender(_id) {
    Loan storage loan = loans[_id];
    require(_newDeadline > loan.deadline, "New deadline needs to be after current deadline");

    loan.deadline = _newDeadline;
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