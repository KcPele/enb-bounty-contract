// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IENBBounty {
    function acceptClaim(uint256 bountyId, address claimer) external;
}

contract ReentrancyAttacker {
    IENBBounty public target;
    uint256 public attackCount;
    bool public reentered;
    address public self;

    constructor(address _target) {
        target = IENBBounty(_target);
        self = address(this);
    }

    receive() external payable {
        if (attackCount < 2) {
            attackCount++;
            // Attempt reentrancy
            try target.acceptClaim(0, self) {
                reentered = true;
            } catch {}
        }
    }
}
