// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LaunchFactory} from "src/LaunchFactory.sol";
import {LaunchLocker} from "src/LaunchLocker.sol";

interface IERC721Full {
    function ownerOf(uint256) external view returns (address);
    function getApproved(uint256) external view returns (address);
    function transferFrom(address, address, uint256) external;
    function approve(address, uint256) external;
}

/// Same rug attempts as LaunchLockerRugFork, against the LIVE Robinhood Chain
/// deployment. There may be no launch yet, so the test launches one itself
/// (USDG-quoted, the chain's default) from a throwaway account first.
///   FORK_TESTS=true ROBINHOOD_RPC_URL=… forge test --match-contract LaunchLockerRugRobinhood -vv
contract LaunchLockerRugRobinhood is Test {
    address constant FACTORY = 0x815542E8b392389A1389E22E588E4B62A67Ade72;
    address constant LOCKER = 0xcd1680D26922fcd9CabFbb8a56bA40C333fD842a;
    address constant POSM = 0x58daec3116aae6D93017bAAea7749052E8a04fA7;
    address constant DEPLOYER = 0x63F300b7b21FbA52A8D874D90F7E1B301AE858c4;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    bool forked;
    uint256 tokenId;
    address token;
    address creator = makeAddr("openlaunch-rug-creator");
    LaunchFactory factory = LaunchFactory(FACTORY);
    IPositionManager posm = IPositionManager(POSM);
    IERC721Full nft = IERC721Full(POSM);

    function setUp() public {
        if (!vm.envOr("FORK_TESTS", false)) return;
        vm.createSelectFork(vm.envOr("ROBINHOOD_RPC_URL", string("https://rpc.mainnet.chain.robinhood.com")));
        forked = true;
        assertEq(block.chainid, 4663);
        vm.deal(creator, 1 ether);
        LaunchFactory.LaunchParams memory p;
        p.name = "Rug Test";
        p.symbol = "RUGT";
        p.quote = USDG;
        p.startTick = 391_400;
        p.lpFee = 10_000;
        (bytes32 salt,) = factory.findSalt(creator, keccak256("rug"), p.name, p.symbol, 0, "", USDG, 64);
        p.salt = salt;
        vm.prank(creator);
        (token, tokenId) = factory.launch(p);
        assertGt(tokenId, 0);
    }

    function _tryDecrease(address who) internal {
        uint128 liq = posm.getPositionLiquidity(tokenId);
        bytes memory actions = abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, liq, uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(Currency.wrap(USDG), Currency.wrap(token), who);
        bytes memory data = abi.encode(actions, params);
        uint256 deadline = block.timestamp + 1;
        vm.prank(who);
        vm.expectRevert();
        posm.modifyLiquidities(data, deadline);
    }

    function test_fork_rh_lockerOwnsIt() public view {
        if (!forked) return;
        assertEq(nft.ownerOf(tokenId), LOCKER);
        assertEq(nft.getApproved(tokenId), address(0));
        assertEq(LaunchLocker(payable(LOCKER)).factory(), FACTORY);
    }

    function test_fork_rh_nobodyCanMoveOrShrink() public {
        if (!forked) return;
        vm.prank(DEPLOYER);
        vm.expectRevert();
        nft.transferFrom(LOCKER, DEPLOYER, tokenId);
        vm.prank(creator);
        vm.expectRevert();
        nft.transferFrom(LOCKER, creator, tokenId);
        vm.prank(creator);
        vm.expectRevert();
        nft.approve(creator, tokenId);
        _tryDecrease(DEPLOYER);
        _tryDecrease(creator);
        _tryDecrease(makeAddr("stranger"));
    }

    function test_fork_rh_collectLeavesLiquidity() public {
        if (!forked) return;
        uint128 before = posm.getPositionLiquidity(tokenId);
        LaunchLocker(payable(LOCKER)).collect(tokenId);
        assertEq(posm.getPositionLiquidity(tokenId), before);
        assertEq(nft.ownerOf(tokenId), LOCKER);
    }

    function test_fork_rh_noAdminSurface() public {
        if (!forked) return;
        (bool ok,) = LOCKER.call(abi.encodeWithSignature("owner()"));
        assertFalse(ok);
        (ok,) = FACTORY.call(abi.encodeWithSignature("owner()"));
        assertFalse(ok);
        (ok,) = token.call(abi.encodeWithSignature("mint(address,uint256)", DEPLOYER, 1));
        assertFalse(ok);
    }
}
