// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PositionManager} from "@uniswap/v4-periphery/src/PositionManager.sol";
import {IPositionDescriptor} from "@uniswap/v4-periphery/src/interfaces/IPositionDescriptor.sol";
import {IWETH9} from "@uniswap/v4-periphery/src/interfaces/external/IWETH9.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {DeployPermit2} from "permit2/test/utils/DeployPermit2.sol";

import {LaunchFactory} from "src/LaunchFactory.sol";
import {LaunchLocker} from "src/LaunchLocker.sol";
import {LaunchToken} from "src/LaunchToken.sol";

/// A recipient with no payable path at all (push always fails → credited).
contract NoReceive {}

/// A recipient that rejects pushes until `accept` is flipped, so a credited
/// share can later be pulled with a successful `claim`.
contract ToggleRecipient {
    bool public accept;

    function setAccept(bool a) external {
        accept = a;
    }

    receive() external payable {
        require(accept, "not accepting");
    }
}

/// Event-emission coverage for the indexer.
///
/// Only `Burned` had an `expectEmit` assertion before
/// (`LaunchFactory.t.sol:test_launch_emptyRecipientsBurnsFees`); `Launched`,
/// `Registered`, `Collected`, `Paid`, `Credited` and `Claimed` were observed
/// only indirectly. Every test here pins the exact event the off-chain
/// indexer (`db/schema.sql: bb_launches`, `bb_launch_fee_events`) relies on.
/// No contract change — tests + docs only.
contract LaunchEventsTest is Test, DeployPermit2 {
    using PoolIdLibrary for PoolKey;

    IPoolManager manager;
    IAllowanceTransfer permit2;
    PositionManager posm;
    PoolSwapTest swapRouter;
    LaunchFactory factory;
    LaunchLocker locker;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address buyer = makeAddr("buyer");

    int24 constant START_TICK = 184_200;
    uint24 constant LP_FEE = 10_000; // 1%

    function setUp() public {
        manager = IPoolManager(address(new PoolManager(address(this))));
        permit2 = IAllowanceTransfer(deployPermit2());
        posm = new PositionManager(manager, permit2, 50_000, IPositionDescriptor(address(0)), IWETH9(address(0)));
        swapRouter = new PoolSwapTest(manager);
        factory = new LaunchFactory(manager, posm, permit2);
        locker = factory.locker();
        vm.deal(buyer, 100 ether);
    }

    function _recipients() internal view returns (LaunchLocker.Recipient[] memory r) {
        r = new LaunchLocker.Recipient[](2);
        r[0] = LaunchLocker.Recipient(alice, 6_000);
        r[1] = LaunchLocker.Recipient(bob, 4_000);
    }

    function _params(bytes32 salt, LaunchLocker.Recipient[] memory r)
        internal
        pure
        returns (LaunchFactory.LaunchParams memory p)
    {
        p.name = "Trend Coin";
        p.symbol = "TREND";
        p.metadataURI = "ipfs://meta";
        p.supply = 0;
        p.startTick = START_TICK;
        p.lpFee = LP_FEE;
        p.salt = salt;
        p.recipients = r;
    }

    function _buy(address token, uint256 ethIn) internal {
        PoolKey memory key = factory.poolKeyOf(token);
        vm.prank(buyer);
        swapRouter.swap{value: ethIn}(
            key,
            SwapParams({
                zeroForOne: true, amountSpecified: -int256(ethIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    // ── Launched ─────────────────────────────────────────────────────────────

    function test_emit_Launched() public {
        bytes32 salt = "emit-launched";
        LaunchLocker.Recipient[] memory r = _recipients();
        address predicted = factory.predictToken(address(this), salt, "Trend Coin", "TREND", 0, "ipfs://meta");
        uint256 tokenId = posm.nextTokenId();
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(predicted),
            fee: LP_FEE,
            tickSpacing: factory.TICK_SPACING(),
            hooks: IHooks(address(0))
        });

        vm.expectEmit(true, true, true, true, address(factory));
        emit LaunchFactory.Launched(
            predicted, tokenId, address(this), address(0), key.toId(), START_TICK, LP_FEE, factory.DEFAULT_SUPPLY(), "ipfs://meta"
        );
        (address token,) = factory.launch(_params(salt, r));
        assertEq(token, predicted, "prediction matches the launch");
    }

    // ── Registered ───────────────────────────────────────────────────────────

    function test_emit_Registered() public {
        bytes32 salt = "emit-registered";
        LaunchLocker.Recipient[] memory r = _recipients();
        address predicted = factory.predictToken(address(this), salt, "Trend Coin", "TREND", 0, "ipfs://meta");
        uint256 tokenId = posm.nextTokenId();

        vm.expectEmit(true, true, true, true, address(locker));
        emit LaunchLocker.Registered(tokenId, predicted, address(0), r);
        factory.launch(_params(salt, r));
    }

    // ── Collected + Paid ─────────────────────────────────────────────────────

    function test_emit_Collected_and_Paid() public {
        (address token, uint256 tokenId) = factory.launch(_params("emit-collected", _recipients()));
        _buy(token, 1 ether);

        vm.recordLogs();
        (uint256 ethOut, uint256 tokenOut) = locker.collect(tokenId);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 collected = keccak256("Collected(uint256,address,uint256,uint256)");
        bytes32 paid = keccak256("Paid(uint256,address,address,uint256)");
        bool sawCollected;
        uint256 paidSum;
        uint256 paidCount;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == collected) {
                assertEq(logs[i].topics[1], bytes32(tokenId), "Collected.tokenId");
                assertEq(address(uint160(uint256(logs[i].topics[2]))), token, "Collected.token");
                (uint256 q, uint256 t) = abi.decode(logs[i].data, (uint256, uint256));
                assertEq(q, ethOut, "Collected.quoteAmount matches return");
                assertEq(t, tokenOut, "Collected.tokenAmount matches return");
                sawCollected = true;
            } else if (logs[i].topics[0] == paid) {
                assertEq(logs[i].topics[1], bytes32(tokenId), "Paid.tokenId");
                address account = address(uint160(uint256(logs[i].topics[2])));
                address currency = address(uint160(uint256(logs[i].topics[3])));
                uint256 amount = abi.decode(logs[i].data, (uint256));
                assertTrue(account == alice || account == bob, "only named recipients are paid");
                assertEq(currency, address(0), "buy-only fees are native ETH");
                paidSum += amount;
                paidCount += 1;
            }
        }
        assertTrue(sawCollected, "Collected emitted");
        assertGt(ethOut, 0, "buy-only collect has quote fees");
        assertEq(tokenOut, 0, "buy-only collect has no token fees");
        assertEq(paidCount, 2, "one Paid per recipient");
        assertEq(paidSum, ethOut, "Paid sums exactly to Collected");
    }

    // ── Credited ─────────────────────────────────────────────────────────────

    function test_emit_Credited_onPushFail() public {
        NoReceive stuck = new NoReceive();
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](2);
        r[0] = LaunchLocker.Recipient(address(stuck), 5_000);
        r[1] = LaunchLocker.Recipient(bob, 5_000);
        (address token, uint256 tokenId) = factory.launch(_params("emit-credited", r));
        _buy(token, 2 ether);

        vm.recordLogs();
        (uint256 ethOut,) = locker.collect(tokenId);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 credited = keccak256("Credited(address,address,uint256)");
        bytes32 paid = keccak256("Paid(uint256,address,address,uint256)");
        bool sawCredited;
        bool sawPaidBob;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == credited) {
                address account = address(uint160(uint256(logs[i].topics[1])));
                address currency = address(uint160(uint256(logs[i].topics[2])));
                uint256 amount = abi.decode(logs[i].data, (uint256));
                assertEq(account, address(stuck), "Credited.account");
                assertEq(currency, address(0), "Credited.currency");
                assertEq(amount, locker.claimable(address(stuck), address(0)), "credited amount is claimable");
                sawCredited = true;
            } else if (logs[i].topics[0] == paid) {
                address account = address(uint160(uint256(logs[i].topics[2])));
                if (account == bob) sawPaidBob = true;
            }
        }
        assertTrue(sawCredited, "Credited emitted for the failing recipient");
        assertTrue(sawPaidBob, "the healthy recipient is still Paid in the same collect");
        assertEq(locker.reserved(address(0)), (ethOut * 5_000) / 10_000, "only the credited share is reserved");
    }

    // ── Claimed ──────────────────────────────────────────────────────────────

    function test_emit_Claimed_onPull() public {
        ToggleRecipient toggle = new ToggleRecipient();
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](1);
        r[0] = LaunchLocker.Recipient(address(toggle), 10_000);
        (address token, uint256 tokenId) = factory.launch(_params("emit-claimed", r));
        _buy(token, 1 ether);
        (uint256 ethOut,) = locker.collect(tokenId);
        assertGt(ethOut, 0);
        assertEq(locker.claimable(address(toggle), address(0)), ethOut, "push failed while closed, so credited");

        toggle.setAccept(true);
        vm.expectEmit(true, true, false, true, address(locker));
        emit LaunchLocker.Claimed(address(toggle), address(0), ethOut);
        uint256 claimed = locker.claimFor(address(toggle), address(0));
        assertEq(claimed, ethOut, "full credited share pulled");
        assertEq(locker.claimable(address(toggle), address(0)), 0, "nothing left to claim");
        assertEq(locker.reserved(address(0)), 0, "reserve released on claim");
    }

    // ── Burned ───────────────────────────────────────────────────────────────

    function test_emit_Burned_emptyRecipients() public {
        LaunchLocker.Recipient[] memory none = new LaunchLocker.Recipient[](0);
        (address token, uint256 tokenId) = factory.launch(_params("emit-burned", none));
        _buy(token, 1 ether);

        vm.recordLogs();
        (uint256 ethOut,) = locker.collect(tokenId);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 burned = keccak256("Burned(uint256,address,uint256)");
        bool sawBurned;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == burned) {
                assertEq(logs[i].topics[1], bytes32(tokenId), "Burned.tokenId");
                assertEq(address(uint160(uint256(logs[i].topics[2]))), address(0), "Burned.currency");
                (uint256 amount) = abi.decode(logs[i].data, (uint256));
                assertEq(amount, ethOut, "Burned.amount matches collect return");
                sawBurned = true;
            }
        }
        assertTrue(sawBurned, "Burned emitted");
        assertGt(ethOut, 0);
        assertEq(locker.reserved(address(0)), 0, "burned shares are never reserved");
        assertEq(locker.claimable(locker.DEAD(), address(0)), 0, "burn is immediate, not a credit");
    }

    // ── Indexer invariant: every collected wei is accounted ──────────────────

    function test_events_accountForEveryWei() public {
        NoReceive stuck = new NoReceive();
        LaunchLocker.Recipient[] memory r = new LaunchLocker.Recipient[](2);
        r[0] = LaunchLocker.Recipient(alice, 5_000);
        r[1] = LaunchLocker.Recipient(address(stuck), 5_000);
        (address token, uint256 tokenId) = factory.launch(_params("emit-accounted", r));
        _buy(token, 2 ether);

        vm.recordLogs();
        (uint256 ethOut,) = locker.collect(tokenId);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 paid = keccak256("Paid(uint256,address,address,uint256)");
        bytes32 credited = keccak256("Credited(address,address,uint256)");
        bytes32 burned = keccak256("Burned(uint256,address,uint256)");
        uint256 accounted;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == paid || logs[i].topics[0] == credited) {
                accounted += abi.decode(logs[i].data, (uint256));
            } else if (logs[i].topics[0] == burned) {
                accounted += abi.decode(logs[i].data, (uint256));
            }
        }
        assertEq(accounted, ethOut, "Paid + Credited + Burned == Collected (native leg)");
    }
}
