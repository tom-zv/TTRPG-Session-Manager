import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { endGmAudioSession } from "src/pages/SoundManager/services/AudioService/session.js";
import { useAuth } from "./contexts/AuthContext.js";

/** Audio lives outside React. End it when the GM leaves, including while logout is pending. */
export function GmSessionTeardown(): null {
  const { currentUser, isLoading } = useAuth();
  const gmUserId = !isLoading && currentUser?.isGm ? currentUser.id : null;
  const queryClient = useQueryClient();
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (previous.current !== null && previous.current !== gmUserId) endGmAudioSession(queryClient);
    previous.current = gmUserId;
  }, [gmUserId, queryClient]);

  return null;
}
