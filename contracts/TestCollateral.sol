// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract Collateral is ERC721URIStorage {

  constructor() ERC721("Collateral", "NFT") {}

  // Psychedelics Anonymous Genesis metadata
  string baseURI = "ipfs://QmdRAvWJa2Ck3pQPVni1DhYHc1zZNvJnZWAacS3vfWuDYA/";

  function mint(uint256 _id) public {
    _safeMint(msg.sender, _id);
    _setTokenURI(_id, string(abi.encodePacked(baseURI, _id)));
  }
}