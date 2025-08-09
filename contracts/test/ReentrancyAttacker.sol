// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IENBBounty {
    function acceptClaim(uint256 bountyId, uint256 claimId) external;
    function createClaim(
        uint256 bountyId,
        string memory name,
        string memory uri,
        string memory description
    ) external;
}

contract ReentrancyAttacker {
    IENBBounty public target;
    uint256 public attackCount;
    bool public reentered;

    constructor(address _target) {
        target = IENBBounty(_target);
    }

    function createClaim(uint256 bountyId) external {
        target.createClaim(bountyId, 'Attack', 'uri', 'desc');
    }

    receive() external payable {
        if (attackCount < 2) {
            attackCount++;
            // Attempt reentrancy
            try target.acceptClaim(0, 0) {
                reentered = true;
            } catch {}
        }
    }
}
