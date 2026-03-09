// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title IENBBounty
 * @notice Minimal interface for ENBBounty contract — used by ENBTaskRewards
 *         to check the shared supported-token whitelist.
 */
interface IENBBounty {
    function isTokenSupported(address tokenAddress) external view returns (bool);
}
