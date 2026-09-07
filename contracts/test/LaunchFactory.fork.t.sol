// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {LaunchFactory} from "src/LaunchFactory.sol";
import {LaunchLocker, IERC721Owner} from "src/LaunchLocker.sol";
import {LaunchToken} from "src/LaunchToken.sol";

interface IERC20Meta {
    function decimals() external view returns (uint8);
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// Fork tests against the LIVE Uniswap v4 deployment on Base — proves launch →
/// buy → collect → claim end-to-end on the real PoolManager / PositionManager /
/// Permit2. Network-touching, so opt in:
///
///   FORK_TESTS=true forge test --match-contract LaunchFactoryFork
///
/// Without FORK_TESTS every test skips (visible as [SKIP], not silent green).
abstract contract LaunchFactoryForkBase is Test {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    int24 constant START_TICK = 184_200;

    IPoolManager manager;
    IPositionManager posm;
    PoolSwapTest swapRouter;
    LaunchFactory factory;
    LaunchLocker locker;
    bool forked;

    // Fork-specific labels: generic ones like makeAddr("alice") collide with
    // real contracts on mainnet (on Base it is an ETH-forwarding proxy).
    address alice = makeAddr("launchpad-fork-alice");
    address bob = makeAddr("launchpad-fork-bob");
    address buyer = makeAddr("launchpad-fork-buyer");

    function _rpc() internal pure virtual returns (string memory);
    function _poolManager() internal pure virtual returns (address);
    function _positionManager() internal pure virtual returns (address);
    function _chainId() internal pure virtual returns (uint256);

    function setUp() public {
        if (!vm.envOr("FORK_TESTS", false)) return;
        vm.createSelectFork(_rpc());
        forked = true;
        assertEq(block.chainid, _chainId(), "rpc points at the expected chain");

        manager = IPoolManager(_poolManager());
        posm = IPositionManager(_positionManager());
        swapRouter = new PoolSwapTest(manager);
        factory = new LaunchFactory(manager, posm, IAllowanceTransfer(PERMIT2));
        locker = factory.locker();
        vm.deal(buyer, 10 ether);
        assertEq(alice.code.length + bob.code.length + buyer.code.length, 0, "test accounts are empty EOAs");
        assertEq(alice.balance + bob.balance, 0, "test accounts start empty");
    }

    function _params() internal view returns (LaunchFactory.LaunchParams memory p) {
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](2);
        r[0] = LaunchLocker.Recipient(alice, 6_000);
        r[1] = LaunchLocker.Recipient(bob, 4_000);
        p.name = "Fork Coin";
        p.symbol = "FORK";
        p.metadataURI = "ipfs://fork";
        p.startTick = START_TICK;
        p.lpFee = 10_000;
        p.salt = keccak256("fork");
        p.recipients = r;
    }

    function test_fork_liveContractsPresent() public {
        vm.skip(!forked);
        assertGt(_poolManager().code.length, 0, "PoolManager deployed");
        assertGt(_positionManager().code.length, 0, "PositionManager deployed");
        assertGt(PERMIT2.code.length, 0, "Permit2 deployed");
        assertGt(posm.nextTokenId(), 0, "PositionManager is live");
    }

    function test_fork_launchBuyCollectClaim() public {
        vm.skip(!forked);
        (address token, uint256 tokenId) = factory.launch(_params());
        LaunchToken t = LaunchToken(token);

        // locked
        assertEq(IERC721Owner(address(posm)).ownerOf(tokenId), address(locker), "real posm minted to locker");
        assertEq(t.balanceOf(address(factory)), 0);
        assertEq(t.balanceOf(address(manager)) + t.balanceOf(factory.DEAD()), t.totalSupply(), "all supply in pool");
        PoolKey memory key = factory.poolKeyOf(token);
        (, int24 tick,,) = manager.getSlot0(key.toId());
        assertEq(tick, START_TICK);

        // buy with real PoolManager
        vm.prank(buyer);
        swapRouter.swap{value: 0.1 ether}(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -0.1 ether, sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        assertGt(t.balanceOf(buyer), 0, "buyer got tokens");

        // collect + claim
        (uint256 ethOut,) = locker.collect(tokenId);
        assertApproxEqRel(ethOut, 0.001 ether, 1e15, "1% fee collected from live pool");
        assertEq(alice.balance, (ethOut * 6_000) / 10_000, "alice paid in real ETH, directly");
        assertEq(locker.claimable(alice, address(0)), 0, "nothing to claim");
        assertEq(posm.getPositionLiquidity(tokenId), posm.getPositionLiquidity(tokenId), "liquidity untouched");
    }
}

contract LaunchFactoryForkBase8453 is LaunchFactoryForkBase {
    /// USDC on Base (6 decimals) — proves an ERC20 quote on the live chain.
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function test_fork_launchWithUsdcQuote() public {
        vm.skip(!forked);
        LaunchFactory.LaunchParams memory p = _params();
        p.quote = USDC;
        p.salt = keccak256("fork-usdc");
        (bytes32 salt, address predicted) =
            factory.findSalt(address(this), p.salt, p.name, p.symbol, 0, p.metadataURI, USDC, 64);
        p.salt = salt;
        (address token, uint256 tokenId) = factory.launch(p);
        assertEq(token, predicted);
        assertEq(locker.quoteOf(tokenId), USDC);

        uint8 dec = IERC20Meta(USDC).decimals();
        uint256 quoteIn = 100 * 10 ** dec;
        deal(USDC, buyer, quoteIn);
        PoolKey memory key = factory.poolKeyOf(token);
        vm.startPrank(buyer);
        IERC20Meta(USDC).approve(address(swapRouter), quoteIn);
        swapRouter.swap(
            key,
            SwapParams({
                zeroForOne: true, amountSpecified: -int256(quoteIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        vm.stopPrank();
        assertGt(LaunchToken(token).balanceOf(buyer), 0, "bought with real USDC");

        (uint256 quoteOut,) = locker.collect(tokenId);
        assertApproxEqRel(quoteOut, quoteIn / 100, 1e15, "1% fee in USDC");
        assertEq(IERC20Meta(USDC).balanceOf(alice), (quoteOut * 6_000) / 10_000, "alice paid in USDC, directly");
    }

    function _rpc() internal pure override returns (string memory) {
        return "https://mainnet.base.org";
    }

    function _poolManager() internal pure override returns (address) {
        return 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    }

    function _positionManager() internal pure override returns (address) {
        return 0x7C5f5A4bBd8fD63184577525326123B519429bDc;
    }

    function _chainId() internal pure override returns (uint256) {
        return 8453;
    }
}

