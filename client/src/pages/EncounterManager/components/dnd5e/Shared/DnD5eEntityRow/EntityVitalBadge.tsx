import React from "react";
import { GiDeathSkull, GiHeartBeats } from "react-icons/gi";
import { VITAL_STATUS_LABEL, type VitalStatus } from "./vitalStatus.js";
import styles from "./DnD5eEntityRow.module.css";

const STATUS_CLASS: Record<VitalStatus, string | undefined> = {
  down: styles.vitalDown,
  dying: styles.vitalDying,
  stable: styles.vitalStable,
  dead: styles.vitalDead,
};

const STATUS_HINT: Record<VitalStatus, string> = {
  down: "0 HP — awaiting the DM's decision",
  dying: "0 HP — making death saves",
  stable: "0 HP — stable after three successful death saves",
  dead: "Three failed death saves — awaiting the DM's decision",
};

/** Small pill next to the entity name describing a 0 HP state. */
export const EntityVitalBadge: React.FC<{ status: VitalStatus }> = ({ status }) => (
  <span className={`${styles.vitalBadge} ${STATUS_CLASS[status] ?? ""}`} title={STATUS_HINT[status]}>
    {status === "stable" ? <GiHeartBeats aria-hidden="true" /> : <GiDeathSkull aria-hidden="true" />}
    {VITAL_STATUS_LABEL[status]}
  </span>
);
