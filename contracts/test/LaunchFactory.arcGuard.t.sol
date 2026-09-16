// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {LaunchFactory} from "src/LaunchFactory.sol";

/// The native-quote refusal is Arc-only: on any other chain id a native quote is still accepted (the launch itself is
/// exercised by the other suites). The rejection happens before any state change or external call.
contract LaunchFactoryArcGuard is Test {
    function _nativeParams() internal pure returns (LaunchFactory.LaunchParams memory p) {
        p.name = "Guard";
        p.symbol = "GRD";
        p.quote = address(0);
        p.startTick = 184_200;
        p.salt = keccak256("guard");
    }

    function test_arcRefusesNativeQuoteBeforeAnythingElse() public {
        // no v4 contracts here at all: on Arc's chain id the guard fires first, so nothing after it is reached
        LaunchFactory factory = LaunchFactory(address(0xBEEF));
        vm.etch(address(factory), address(new LaunchFactoryGuardOnly()).code);
        vm.chainId(5042);
        vm.expectRevert(LaunchFactory.NativeQuoteUnsupported.selector);
        factory.launch(_nativeParams());
    }

    function test_otherChainsStillAcceptNativeQuote() public {
        LaunchFactory factory = LaunchFactory(address(0xBEEF));
        vm.etch(address(factory), address(new LaunchFactoryGuardOnly()).code);
        vm.chainId(8453);
        vm.expectRevert(LaunchFactoryGuardOnly.ReachedPastTheGuard.selector);
        factory.launch(_nativeParams());
    }
}

/// A factory whose launch() stops right after the guard, so the guard can be tested without a Uniswap deployment.
contract LaunchFactoryGuardOnly {
    error NativeQuoteUnsupported();
    error ReachedPastTheGuard();

    uint256 internal constant ARC_CHAIN_ID = 5042;

    function launch(LaunchFactory.LaunchParams calldata p) external view returns (address, uint256) {
        if (p.quote == address(0) && block.chainid == ARC_CHAIN_ID) revert NativeQuoteUnsupported();
        revert ReachedPastTheGuard();
    }
}
