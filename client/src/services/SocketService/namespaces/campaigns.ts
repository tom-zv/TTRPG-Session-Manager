import type { Socket } from "socket.io-client";
import { CampaignSocketEvents, type CurrentEncounterChanged } from "shared/sockets/campaigns/types.js";
import type { SocketAck } from "shared/sockets/types.js";
import { getSocket } from "../socket.js";

const ACK_TIMEOUT_MS = 10_000;

/**
 * Watch one campaign for changes of its current encounter on the `/encounter` socket. `onChange`
 * runs on every change signal for this campaign and after every successful watch, including the
 * one after a reconnect, so a change missed while disconnected is recovered. Returns the cleanup.
 */
export function watchCampaign(campaignId: number, onChange: () => void): () => void {
  const socket: Socket = getSocket("/encounter");
  let active = true;

  const watch = () => {
    socket.timeout(ACK_TIMEOUT_MS).emit(
      CampaignSocketEvents.WATCH,
      { campaignId },
      (error: Error | null, ack?: SocketAck) => {
        if (active && !error && ack?.success) onChange();
      },
    );
  };
  const handleChanged = (payload: CurrentEncounterChanged) => {
    if (active && payload?.campaignId === campaignId) onChange();
  };

  socket.on(CampaignSocketEvents.CURRENT_ENCOUNTER_CHANGED, handleChanged);
  socket.on("connect", watch);
  if (socket.connected) watch();

  return () => {
    active = false;
    socket.off(CampaignSocketEvents.CURRENT_ENCOUNTER_CHANGED, handleChanged);
    socket.off("connect", watch);
    if (socket.connected) socket.emit(CampaignSocketEvents.UNWATCH, { campaignId });
  };
}
