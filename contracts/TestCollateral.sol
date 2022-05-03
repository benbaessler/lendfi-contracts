// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract Collateral is ERC721URIStorage {

  constructor() ERC721("Collateral", "CLT") {}

  function mint(uint256 _id) public {
    _safeMint(msg.sender, _id);
    _setTokenURI(_id, "ipfs://QmZ8JQYzNAVfSUsqXsouj4rhT11bRKGrpxWBgrK1K9yuFr");
  }

}