// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {LaunchFactory} from "src/LaunchFactory.sol";
import {LaunchLocker} from "src/LaunchLocker.sol";
import {LaunchToken} from "src/LaunchToken.sol";

interface IERC20Meta {
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

/// Can a launch be quoted in a Robinhood Stock Token? Against the LIVE Robinhood
/// Chain factory: launch a token priced in AAPL, buy it with AAPL, sell it back,
/// collect the AAPL fees. AAPL is borrowed from the Uniswap PoolManager (an
/// address that provably holds it) via prank — no mocks anywhere.
///   FORK_TESTS=true ROBINHOOD_RPC_URL=… forge test --match-contract LaunchStockQuote -vv
contract LaunchStockQuote is Test {
    address constant FACTORY = 0x815542E8b392389A1389E22E588E4B62A67Ade72;
    address constant LOCKER = 0xcd1680D26922fcd9CabFbb8a56bA40C333fD842a;
    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9; // Apple • Robinhood Token (18 dec)

    bool forked;
    LaunchFactory factory = LaunchFactory(FACTORY);
    PoolSwapTest router;
    address creator = makeAddr("stock-creator");
    address buyer = makeAddr("stock-buyer");

    function setUp() public {
        if (!vm.envOr("FORK_TESTS", false)) return;
        vm.createSelectFork(vm.envOr("ROBINHOOD_RPC_URL", string("https://rpc.mainnet.chain.robinhood.com")));
        forked = true;
        router = new PoolSwapTest(IPoolManager(PM));
        vm.deal(creator, 1 ether);
        vm.deal(buyer, 1 ether);
        // borrow 2 AAPL from the PoolManager's balance for the buyer
        uint256 pmBal = IERC20Meta(AAPL).balanceOf(PM);
        assertGt(pmBal, 2e18, "PoolManager holds AAPL (stock tokens already flow through Uniswap v4)");
        vm.prank(PM);
        IERC20Meta(AAPL).transfer(buyer, 2e18);
    }

    function test_fork_launchQuotedInAAPL_buySellCollect() public {
        if (!forked) return;
        assertEq(IERC20Meta(AAPL).decimals(), 18);
        LaunchFactory.LaunchParams memory p;
        p.name = "Apple Fan Token";
        p.symbol = "AFAN";
        p.quote = AAPL;
        p.lpFee = 10_000;
        // 1B supply at an FDV of 100 AAPL (≈ $25k): tokens per AAPL = 1e7 → tick ≈ ln(1e7)/ln(1.0001) ≈ 161,180 → 161,200
        p.startTick = 161_200;
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](1);
        r[0] = LaunchLocker.Recipient(creator, 10_000);
        p.recipients = r;
        (bytes32 salt,) = factory.findSalt(creator, keccak256("afan"), p.name, p.symbol, 0, "", AAPL, 64);
        p.salt = salt;
        vm.prank(creator);
        (address token, uint256 tokenId) = factory.launch(p);
        PoolKey memory key = factory.poolKeyOf(token);

        // buy with 1 AAPL
        vm.startPrank(buyer);
        IERC20Meta(AAPL).approve(address(router), 1e18);
        router.swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -1e18, sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        uint256 got = LaunchToken(token).balanceOf(buyer);
        assertGt(got, 9_000_000e18, "about 10M tokens for 1 AAPL at the start price");
        // sell half back for AAPL
        LaunchToken(token).approve(address(router), got / 2);
        uint256 aaplBefore = IERC20Meta(AAPL).balanceOf(buyer);
        router.swap(
            key,
            SwapParams({
                zeroForOne: false, amountSpecified: -int256(got / 2), sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        vm.stopPrank();
        assertGt(IERC20Meta(AAPL).balanceOf(buyer), aaplBefore, "got AAPL back");

        // fees: 1% of the AAPL that came in, paid straight to the creator in AAPL
        (uint256 quoteOut,) = LaunchLocker(payable(LOCKER)).collect(tokenId);
        assertApproxEqRel(quoteOut, 0.01e18, 2e15, "1% of 1 AAPL collected");
        assertEq(IERC20Meta(AAPL).balanceOf(creator), quoteOut, "creator paid in AAPL, directly");
    }
}
