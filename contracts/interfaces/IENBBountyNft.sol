// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IENBBountyNft is IERC721 {
    function mint(address to, uint256 claimCounter, string memory uri) external;
    function safeTransfer(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) external;
}