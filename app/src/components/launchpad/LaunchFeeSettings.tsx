"use client";

import { useId } from "react";
import { ArrowUpRight, Flame, LockKeyhole, Wallet } from "lucide-react";
import { isAddress } from "viem";
import { FEE_PRESETS } from "@/lib/launchpad/config";
import { shortAddr } from "@/lib/chainPublic";
import { card, input } from "@/components/ui";
import styles from "./LaunchFeeSettings.module.css";

export type FeeBeneficiary = "burn" | "me" | "custom";

type Props = {
  feePips: number;
  beneficiary: FeeBeneficiary;
  address?: string;
  customAddress: string;
  onFeeChange: (pips: number) => void;
  onBeneficiaryChange: (value: FeeBeneficiary) => void;
  onCustomAddressChange: (value: string) => void;
};

export default function LaunchFeeSettings({ feePips, beneficiary, address, customAddress, onFeeChange, onBeneficiaryChange, onCustomAddressChange }: Props) {
  const id = useId();
  const feePerHundred = feePips / 10_000;
  const customInvalid = Boolean(customAddress.trim()) && !isAddress(customAddress.trim());
  const recipient = beneficiary === "burn" ? "Burn address" : beneficiary === "me" ? "Your wallet" : "Recipient wallet";
  const destination = beneficiary === "burn" ? "0x…dEaD" : beneficiary === "me" ? address : customAddress.trim();
  const routes = [
    { value: "burn", title: "Burn the fees", description: "Sent to 0x…dEaD when collected. Nobody receives them.", Icon: Flame },
    { value: "me", title: "Your wallet", description: address ? shortAddr(address) : "The wallet you connect to launch.", Icon: Wallet },
    { value: "custom", title: "Another wallet", description: "Send fees to one recipient of your choice.", Icon: ArrowUpRight },
  ] as const;

  return (
    <section className={`${card} ${styles.section}`} aria-labelledby={`${id}-heading`}>
      <div className={styles.heading}>
        <h2 id={`${id}-heading`}>Trading fee</h2>
        <span className={styles.platform}>0% platform fee</span>
      </div>
      <p className={styles.intro}>Choose what traders pay on each buy and sell.</p>

      <fieldset className={styles.fieldset}>
        <legend className="sr-only">Trading fee rate</legend>
        <div className={styles.rates}>
          {FEE_PRESETS.map((fee) => (
            <label key={fee.pips} className={styles.rate} data-selected={feePips === fee.pips}>
              <input
                type="radio"
                name={`${id}-rate`}
                value={fee.pips}
                checked={feePips === fee.pips}
                onChange={() => {
                  onFeeChange(fee.pips);
                  if (fee.pips === 0) onBeneficiaryChange("burn");
                }}
                aria-label={`${fee.label} trading fee`}
              />
              <span className={styles.rateValue}>{fee.label}</span>
              <span className={styles.rateCaption}>{fee.pips === 0 ? "No trading fee" : `${fee.pips / 10_000} per 100 traded`}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {feePips > 0 ? (
        <fieldset className={`${styles.fieldset} ${styles.routing}`}>
          <legend>Where should the fees go?</legend>
          <p className={styles.routeHelp}>The full trading fee goes to this destination. Openlaunch takes none.</p>
          <div className={styles.routes}>
            {routes.map(({ value, title, description, Icon }) => (
              <label key={value} className={styles.route} data-selected={beneficiary === value}>
                <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                <span className={styles.routeCopy}>
                  <span className={styles.routeTitle}>{title}</span>
                  <span className={styles.routeDescription}>{description}</span>
                </span>
                <input type="radio" name={`${id}-recipient`} value={value} checked={beneficiary === value} onChange={() => onBeneficiaryChange(value)} aria-label={title} />
              </label>
            ))}
          </div>
          {beneficiary === "custom" ? (
            <div className={styles.custom}>
              <label htmlFor={`${id}-address`}>Recipient address</label>
              <input
                id={`${id}-address`}
                className={`${input} font-mono`}
                value={customAddress}
                onChange={(event) => onCustomAddressChange(event.target.value.trim())}
                placeholder="0x…"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={customInvalid}
                aria-describedby={`${id}-address-help`}
              />
              <p id={`${id}-address-help`} className={customInvalid ? styles.error : styles.routeHelp}>
                {customInvalid ? "Enter a valid 0x wallet address before launching." : "Check the address carefully. This recipient cannot be changed after launch."}
              </p>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <div className={styles.summary}>
        <div className={styles.summaryTitle}>
          <h3>{feePips === 0 ? "No fees to distribute" : "Your fee allocation"}</h3>
          {feePips > 0 ? <span>100% to one destination</span> : null}
        </div>
        <dl className={styles.breakdown}>
          <div>
            <dt>{feePips === 0 ? "Trading fee" : recipient}</dt>
            <dd>{feePips === 0 ? "0%" : "100% of fees"}</dd>
          </div>
          <div>
            <dt>Openlaunch</dt>
            <dd className={styles.platform}>0%</dd>
          </div>
        </dl>
        {feePips > 0 ? (
          <p className={styles.destination}>
            {beneficiary === "burn" ? "Burned at collection" : beneficiary === "me" && !address ? "Connect your wallet before launch" : beneficiary === "custom" && !isAddress(customAddress.trim()) ? "Add a valid recipient address above" : "Claimable by"}
            {destination && (beneficiary === "burn" || isAddress(destination)) ? <span title={destination}>{beneficiary === "burn" ? destination : shortAddr(destination)}</span> : null}
          </p>
        ) : null}
        <p className={styles.example}>
          {feePips === 0 ? "No trading fees are collected. " : <>For every 100 units traded, <strong>{feePerHundred} {feePerHundred === 1 ? "unit is" : "units are"} the trading fee</strong>. </>}
          Network gas and price impact still apply.
        </p>
      </div>

      <p className={styles.permanent}>
        <LockKeyhole size={14} strokeWidth={1.8} aria-hidden="true" />
        <span>Fixed at launch. The fee rate{feePips > 0 ? " and destination" : ""} cannot be changed later.</span>
      </p>
    </section>
  );
}
