// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LaunchFactory} from "src/LaunchFactory.sol";
import {LaunchLocker, IERC721Owner} from "src/LaunchLocker.sol";

interface IERC721Full {
    function ownerOf(uint256) external view returns (address);
    function getApproved(uint256) external view returns (address);
    function isApprovedForAll(address, address) external view returns (bool);
    function transferFrom(address, address, uint256) external;
    function safeTransferFrom(address, address, uint256) external;
    function approve(address, uint256) external;
}

/// "Can the liquidity be rugged?" — asked of the LIVE Base mainnet deployment.
/// Every actor with any conceivable power (the deployer, the token's creator, a
/// random address) tries every path that could move or shrink the locked
/// position. All must revert; collect() must leave liquidity + ownership intact.
///   FORK_TESTS=true forge test --match-contract LaunchLockerRugFork -vv
contract LaunchLockerRugFork is Test {
    address constant FACTORY = 0x815542E8b392389A1389E22E588E4B62A67Ade72;
    address constant LOCKER = 0xcd1680D26922fcd9CabFbb8a56bA40C333fD842a;
    address constant POSM = 0x7C5f5A4bBd8fD63184577525326123B519429bDc;
    address constant DEPLOYER = 0x63F300b7b21FbA52A8D874D90F7E1B301AE858c4;
    address constant TOKEN = 0x2eB11Af94275abde2E4a73ea5a7EF7F84eb2384F; // first real launch (TESTING)

    bool forked;
    uint256 tokenId;
    address launcher;
    LaunchFactory factory = LaunchFactory(FACTORY);
    LaunchLocker locker = LaunchLocker(payable(LOCKER));
    IPositionManager posm = IPositionManager(POSM);
    IERC721Full nft = IERC721Full(POSM);

    function setUp() public {
        if (!vm.envOr("FORK_TESTS", false)) return;
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));
        forked = true;
        (tokenId, launcher,,,) = factory.infoOf(TOKEN);
        assertGt(tokenId, 0, "live launch exists");
    }

    // NOTE: vm.expectRevert applies to the NEXT external call, so these helpers
    // must not make any call (even a view) before the one under test.
    function _decreaseCalldata(uint128 liq, address who) internal view returns (bytes memory) {
        bytes memory actions = abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, liq, uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(Currency.wrap(address(0)), Currency.wrap(TOKEN), who);
        return abi.encode(actions, params);
    }

    function _burnCalldata(address who) internal view returns (bytes memory) {
        bytes memory actions = abi.encodePacked(uint8(Actions.BURN_POSITION), uint8(Actions.TAKE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(Currency.wrap(address(0)), Currency.wrap(TOKEN), who);
        return abi.encode(actions, params);
    }

    function _tryDecrease(address who) internal {
        uint128 liq = posm.getPositionLiquidity(tokenId);
        bytes memory data = _decreaseCalldata(liq, who);
        uint256 deadline = block.timestamp + 1;
        vm.prank(who);
        vm.expectRevert();
        posm.modifyLiquidities(data, deadline);
    }

    function _tryBurn(address who) internal {
        bytes memory data = _burnCalldata(who);
        uint256 deadline = block.timestamp + 1;
        vm.prank(who);
        vm.expectRevert();
        posm.modifyLiquidities(data, deadline);
    }

    function test_fork_lockerOwnsIt_nobodyApproved() public view {
        if (!forked) return;
        assertEq(nft.ownerOf(tokenId), LOCKER, "locker owns the position NFT");
        assertEq(nft.getApproved(tokenId), address(0), "no approved operator");
        assertFalse(nft.isApprovedForAll(LOCKER, DEPLOYER), "deployer not an operator");
        assertFalse(nft.isApprovedForAll(LOCKER, launcher), "creator not an operator");
        assertFalse(nft.isApprovedForAll(LOCKER, FACTORY), "factory not an operator");
    }

    function test_fork_deployerCannotMoveOrShrink() public {
        if (!forked) return;
        vm.startPrank(DEPLOYER);
        vm.expectRevert();
        nft.transferFrom(LOCKER, DEPLOYER, tokenId);
        vm.expectRevert();
        nft.safeTransferFrom(LOCKER, DEPLOYER, tokenId);
        vm.expectRevert();
        nft.approve(DEPLOYER, tokenId);
        vm.stopPrank();
        _tryDecrease(DEPLOYER);
        _tryBurn(DEPLOYER);
    }

    function test_fork_creatorCannotMoveOrShrink() public {
        if (!forked) return;
        vm.prank(launcher);
        vm.expectRevert();
        nft.transferFrom(LOCKER, launcher, tokenId);
        _tryDecrease(launcher);
        _tryBurn(launcher);
    }

    function test_fork_strangerCannotEither() public {
        if (!forked) return;
        address rando = makeAddr("launchpad-rug-rando");
        vm.prank(rando);
        vm.expectRevert();
        nft.transferFrom(LOCKER, rando, tokenId);
        _tryDecrease(rando);
    }

    function test_fork_collectLeavesLiquidityAndOwnershipIntact() public {
        if (!forked) return;
        uint128 before = posm.getPositionLiquidity(tokenId);
        assertGt(before, 0);
        locker.collect(tokenId); // anyone
        assertEq(posm.getPositionLiquidity(tokenId), before, "collect removes zero liquidity");
        assertEq(nft.ownerOf(tokenId), LOCKER, "still locked");
        assertEq(IERC721Owner(POSM).ownerOf(tokenId), LOCKER);
    }

    function test_fork_lockerHasNoOwnerOrAdmin() public {
        if (!forked) return;
        // no owner()/transferOwnership/pause/upgrade surface on either contract
        (bool ok,) = LOCKER.call(abi.encodeWithSignature("owner()"));
        assertFalse(ok, "locker has no owner()");
        (ok,) = FACTORY.call(abi.encodeWithSignature("owner()"));
        assertFalse(ok, "factory has no owner()");
        (ok,) = LOCKER.call(abi.encodeWithSignature("pause()"));
        assertFalse(ok);
        (ok,) = LOCKER.call(abi.encodeWithSignature("upgradeTo(address)", address(1)));
        assertFalse(ok);
        (ok,) = TOKEN.call(abi.encodeWithSignature("mint(address,uint256)", DEPLOYER, 1));
        assertFalse(ok, "token has no mint()");
        (ok,) = TOKEN.call(abi.encodeWithSignature("owner()"));
        assertFalse(ok, "token has no owner()");
    }
}
