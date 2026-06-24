import React, { useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { getUsers } from "src/api/usersApi.js";
import { USER_KEYS } from "src/api/query/keys.js";
import DnD5eEntityApi from "../../../../api/dnd5e/entities/dnd5eEntityApi.js";
import { updateEntityControllersCache } from "../../../../services/dnd5e/entityTemplateCache.js";
import styles from "./DnD5eEntityRow.module.css";

/**
 * Template-level choice of the player who runs this character (GM only).
 * That player can then change the character's HP, initiative and death saves and end its turn,
 * in every encounter the character is part of.
 */
export const PcControllerSelect: React.FC<{ entity: DnD5eEntity }> = ({ entity }) => {
  const selectId = useId();
  const queryClient = useQueryClient();
  const { data: users, error: usersError } = useQuery({ queryKey: USER_KEYS.list(), queryFn: getUsers });
  const mutation = useMutation({
    mutationFn: (userId: number | null) =>
      DnD5eEntityApi.setControllers(entity.templateId, userId === null ? [] : [userId]),
    onSuccess: (controllerUserIds) => updateEntityControllersCache(queryClient, entity.templateId, controllerUserIds),
  });
  const players = users?.filter((user) => !user.isGm) ?? [];
  const current = entity.controllerUserIds?.[0];
  const error = mutation.error ?? usersError;

  return (
    <div className={styles.secondaryOption}>
      <label htmlFor={selectId} className={styles.secondaryOptionLabel}>Played by</label>{" "}
      <select
        id={selectId}
        value={current ?? ""}
        disabled={!users || mutation.isPending}
        onChange={(event) => mutation.mutate(event.target.value === "" ? null : Number(event.target.value))}
      >
        <option value="">GM only</option>
        {players.map((user) => (
          <option key={user.id} value={user.id}>{user.username}</option>
        ))}
      </select>
      {error && <p role="alert" className={styles.inlineError}>{error.message}</p>}
    </div>
  );
};
