// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol';

contract ENBBountyNft is
    ERC721,
    ERC721Enumerable,
    ERC721URIStorage,
    IERC721Receiver,
    ERC721Royalty
{
    address public immutable ENBBountyAuthority;
    mapping(address => bool) public ENBBountyContracts;

    constructor(
        address _treasury,
        address _ENBBountyAuthority,
        uint96 _feeNumerator
    ) ERC721('pics or it didnt happen', 'ENBBountyNft') {
        ENBBountyAuthority = _ENBBountyAuthority;
        _setDefaultRoyalty(_treasury, _feeNumerator);
    }

    function setENBBountyContract(
        address _ENBBountyContract,
        bool _hasPermission
    ) external {
        require(
            msg.sender == ENBBountyAuthority,
            'only ENBBountyAuthority can set ENBBounty contracts'
        );
        ENBBountyContracts[_ENBBountyContract] = _hasPermission;
        setApprovalForAll(_ENBBountyContract, _hasPermission);
    }

    function mint(
        address to,
        uint256 claimCounter,
        string memory uri
    ) external {
        require(
            ENBBountyContracts[msg.sender],
            'only authorized ENBBounty contracts can mint'
        );
        _safeMint(to, claimCounter);
        _setTokenURI(claimCounter, uri);
    }

    function safeTransfer(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public {
        _safeTransfer(from, to, tokenId, data);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage, ERC721Royalty)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // Override _beforeTokenTransfer function
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal virtual override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }

    // Override _burn function
    function _burn(
        uint256 tokenId
    ) internal virtual override(ERC721, ERC721URIStorage, ERC721Royalty) {
        super._burn(tokenId);
    }
}
