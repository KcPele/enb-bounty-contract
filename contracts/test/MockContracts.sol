// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract MockERC20 is ERC20 {
    address public deployer;
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        deployer = msg.sender;
        // Mint initial supply to the token contract itself to avoid deployer (treasury) holding balance by default
        _mint(address(this), initialSupply);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(
        address to,
        uint256 amount
    ) public override returns (bool) {
        // Allow deployer to source initial tokens from the contract's own balance without holding them
        if (
            msg.sender == deployer &&
            balanceOf(msg.sender) == 0 &&
            balanceOf(address(this)) >= amount
        ) {
            _transfer(address(this), to, amount);
            return true;
        }
        return super.transfer(to, amount);
    }
}

contract MaliciousERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    string public name = 'Malicious Token';
    string public symbol = 'MAL';
    uint8 public decimals = 18;
    uint256 public totalSupply;

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;

        if (to.code.length > 0) {
            (bool success, ) = to.call(
                abi.encodeWithSignature('receiveTokens()')
            );
        }

        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        if (to.code.length > 0) {
            (bool success, ) = to.call(
                abi.encodeWithSignature('receiveTokens()')
            );
        }

        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract WeirdReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    string public name = 'Weird Return Token';
    string public symbol = 'WRT';
    uint8 public decimals = 18;
    uint256 public totalSupply;

    function transfer(address to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
}

contract MaliciousRefundReceiver {
    address public bountyContract;
    uint256 public attackCount;
    bool public attacking;

    constructor(address _bountyContract) {
        bountyContract = _bountyContract;
    }

    function createBountyAndCancel() external payable {
        (bool success, ) = bountyContract.call{value: msg.value}(
            abi.encodeWithSignature(
                'createSoloBounty(string,string,uint256)',
                'Attack Bounty',
                'Description',
                uint256(1)
            )
        );
        require(success, 'Failed to create bounty');

        attacking = true;
        (success, ) = bountyContract.call(
            abi.encodeWithSignature('cancelSoloBounty(uint256)', uint256(0))
        );
    }

    receive() external payable {
        if (attacking && attackCount < 2) {
            attackCount++;
            (bool success, ) = bountyContract.call(
                abi.encodeWithSignature('cancelSoloBounty(uint256)', uint256(0))
            );
        }
        attacking = false;
    }
}

contract MaliciousWithdrawer {
    address public bountyContract;
    uint256 public attackCount;
    bool public attacking;

    constructor(address _bountyContract) {
        bountyContract = _bountyContract;
    }

    function joinAndWithdraw(uint256 bountyId) external payable {
        (bool success, ) = bountyContract.call{value: msg.value}(
            abi.encodeWithSignature('joinOpenBounty(uint256)', bountyId)
        );
        require(success, 'Failed to join bounty');

        attacking = true;
        (success, ) = bountyContract.call(
            abi.encodeWithSignature('withdrawFromOpenBounty(uint256)', bountyId)
        );
    }

    receive() external payable {
        if (attacking && attackCount < 2) {
            attackCount++;
            (bool success, ) = bountyContract.call(
                abi.encodeWithSignature(
                    'withdrawFromOpenBounty(uint256)',
                    uint256(0)
                )
            );
        }
        attacking = false;
    }
}

contract CrossReentrancyAttacker {
    address public bountyContract;
    bool public inAttack;

    constructor(address _bountyContract) {
        bountyContract = _bountyContract;
    }

    function performCrossAttack() external payable {
        (bool success, ) = bountyContract.call{value: msg.value / 2}(
            abi.encodeWithSignature(
                'createSoloBounty(string,string,uint256)',
                'Attack Bounty 1',
                'Description',
                uint256(1)
            )
        );
        require(success, 'Failed to create first bounty');

        (success, ) = bountyContract.call{value: msg.value / 2}(
            abi.encodeWithSignature(
                'createSoloBounty(string,string,uint256)',
                'Attack Bounty 2',
                'Description',
                uint256(1)
            )
        );
        require(success, 'Failed to create second bounty');

        inAttack = true;
        (success, ) = bountyContract.call(
            abi.encodeWithSignature('cancelSoloBounty(uint256)', uint256(0))
        );
    }

    receive() external payable {
        if (inAttack) {
            inAttack = false;
            (bool success, ) = bountyContract.call(
                abi.encodeWithSignature('cancelSoloBounty(uint256)', uint256(1))
            );
        }
    }
}

contract FailingReceiver {
    address public bountyContract;
    bool public shouldFail = false;

    function createBounty(address _bountyContract) external payable {
        bountyContract = _bountyContract;
        (bool success, ) = bountyContract.call{value: msg.value}(
            abi.encodeWithSignature(
                'createSoloBounty(string,string,uint256)',
                'Test Bounty',
                'Description',
                uint256(1)
            )
        );
        require(success, 'Failed to create bounty');
    }

    function acceptClaim(uint256 bountyId, uint256 claimId) external {
        shouldFail = true;
        (bool success, ) = bountyContract.call(
            abi.encodeWithSignature(
                'acceptClaim(uint256,uint256)',
                bountyId,
                claimId
            )
        );
        require(success, 'Accept claim failed');
    }

    receive() external payable {
        if (shouldFail) {
            revert('Intentional failure');
        }
    }
}
